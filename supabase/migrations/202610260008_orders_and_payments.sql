-- DCP: explicit order vs payment records, order markup, and balance deduction semantics.
alter table public.payment_entries
  add column if not exists entry_type text not null default 'pedido'
    check (entry_type in ('pedido', 'pagamento')),
  add column if not exists order_amount numeric(14,2)
    check (order_amount is null or order_amount >= 0),
  add column if not exists markup_percentage numeric(5,2) not null default 20
    check (markup_percentage >= 0 and markup_percentage <= 100),
  add column if not exists invoice_amount numeric(14,2)
    check (invoice_amount is null or invoice_amount >= 0),
  add column if not exists related_order_id uuid
    references public.payment_entries(id) on delete restrict;

-- Backfill legacy records as orders, preserving their existing financial amount.
update public.payment_entries
set order_amount = coalesce(order_amount, requested_amount),
    invoice_amount = coalesce(invoice_amount, requested_amount)
where order_amount is null or invoice_amount is null;

create index if not exists payment_entries_related_order_idx
  on public.payment_entries (related_order_id);

-- Orders commit the invoiced amount to the empenho balance when registered.
-- Standalone payments debit their amount. Payments linked to an existing order
-- settle that order and must not debit the same amount a second time.
create or replace view public.empenho_balances
with (security_invoker = true)
as
with rule_stats as (
  select
    r.empenho_id,
    (array_agg(r.percentage order by r.effective_from asc, r.created_at asc))[1] as initial_percentage,
    (array_agg(r.calculation_base order by r.effective_from asc, r.created_at asc))[1] as initial_calculation_base
  from public.empenho_rules r
  group by r.empenho_id
),
current_rules as (
  select distinct on (r.empenho_id)
    r.empenho_id, r.id as rule_id, r.percentage,
    r.calculation_base, r.deduction_mode, r.effective_from
  from public.empenho_rules r
  where r.effective_from <= now()
  order by r.empenho_id, r.effective_from desc, r.created_at desc
),
payment_totals as (
  select p.empenho_id,
    coalesce(sum(p.balance_deduction_snapshot) filter (
      where p.status <> 'cancelado'
        and (p.entry_type = 'pedido' or (p.entry_type = 'pagamento' and p.related_order_id is null))
    ), 0)::numeric(14,2) as used_balance,
    coalesce(sum(p.paid_amount) filter (where p.status = 'pago'), 0)::numeric(14,2) as paid_amount,
    count(*) filter (where p.status = 'solicitado' and p.entry_type = 'pedido')::integer as pending_count,
    coalesce(sum(p.requested_amount) filter (where p.status = 'solicitado' and p.entry_type = 'pedido'), 0)::numeric(14,2) as pending_amount
  from public.payment_entries p
  group by p.empenho_id
),
limits as (
  select e.*,
    r.rule_id, r.percentage as current_percentage,
    r.calculation_base as current_calculation_base,
    r.deduction_mode as current_deduction_mode,
    r.effective_from as rule_effective_from,
    case
      when e.current_balance_policy = 'preservar_limite_original'
        and rs.initial_calculation_base = 'valor_pedido' then e.original_amount
      when e.current_balance_policy = 'preservar_limite_original'
        then round(e.original_amount * (1 - coalesce(rs.initial_percentage, r.percentage) / 100), 2)
      when r.calculation_base = 'valor_pedido' then e.original_amount
      else round(e.original_amount * (1 - r.percentage / 100), 2)
    end::numeric(14,2) as initial_operational_limit
  from public.empenhos e
  left join current_rules r on r.empenho_id = e.id
  left join rule_stats rs on rs.empenho_id = e.id
)
select
  l.id as empenho_id, l.organization_id, l.number, l.description, l.issued_on,
  l.original_amount, l.rule_id, l.current_percentage, l.current_calculation_base,
  l.current_deduction_mode, l.rule_effective_from, l.initial_operational_limit,
  coalesce(p.used_balance, 0)::numeric(14,2) as used_balance,
  greatest(l.initial_operational_limit - coalesce(p.used_balance, 0), 0)::numeric(14,2) as operational_balance,
  coalesce(p.paid_amount, 0)::numeric(14,2) as confirmed_paid_amount,
  coalesce(p.pending_count, 0)::integer as pending_count,
  coalesce(p.pending_amount, 0)::numeric(14,2) as pending_amount
from limits l
left join payment_totals p on p.empenho_id = l.id;

grant select on public.empenho_balances to authenticated;

-- A pedido is already reflected in the balance when created, so confirming it
-- only changes its status. Standalone payment rows are created as paid by UI.
create or replace function public.confirm_payment(p_payment_entry_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.payment_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.';
  end if;

  select * into v_entry
  from public.payment_entries
  where id = p_payment_entry_id
  for update;

  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  if v_entry.status <> 'solicitado' then
    raise exception 'Somente solicitações pendentes podem ser confirmadas.';
  end if;
  if v_entry.entry_type <> 'pedido' then
    raise exception 'Somente pedidos pendentes podem ser confirmados.';
  end if;

  perform 1 from public.empenhos where id = v_entry.empenho_id for update;

  update public.payment_entries
  set status = 'pago',
      paid_date = current_date,
      paid_amount = requested_amount
  where id = p_payment_entry_id;
end;
$$;
