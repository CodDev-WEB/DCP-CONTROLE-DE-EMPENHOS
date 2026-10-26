-- Correct balance aggregation and enforce balance validation when confirming payment.

create or replace view public.empenho_balances
with (security_invoker = true)
as
with rule_stats as (
  select
    r.empenho_id,
    (array_agg(r.percentage order by r.effective_from asc, r.created_at asc))[1] as initial_percentage
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
    coalesce(sum(p.balance_deduction_snapshot) filter (where p.status = 'pago'), 0)::numeric(14,2) as used_balance,
    coalesce(sum(p.paid_amount) filter (where p.status = 'pago'), 0)::numeric(14,2) as paid_amount,
    count(*) filter (where p.status = 'solicitado')::integer as pending_count,
    coalesce(sum(p.requested_amount) filter (where p.status = 'solicitado'), 0)::numeric(14,2) as pending_amount
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
      when r.calculation_base = 'valor_pedido' then e.original_amount
      when e.current_balance_policy = 'preservar_limite_original'
        then round(e.original_amount * (1 - coalesce(rs.initial_percentage, r.percentage) / 100), 2)
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

create or replace function public.confirm_payment(p_payment_entry_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.payment_entries%rowtype;
  v_balance numeric(14,2);
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

  select operational_balance into v_balance
  from public.empenho_balances
  where empenho_id = v_entry.empenho_id;

  if v_balance is null then
    raise exception 'Não foi possível calcular o saldo deste empenho.';
  end if;
  if v_entry.balance_deduction_snapshot > v_balance then
    raise exception 'Saldo insuficiente. Saldo atual: R$ %; abatimento previsto: R$ %.',
      to_char(v_balance, 'FM999G999G990D00'),
      to_char(v_entry.balance_deduction_snapshot, 'FM999G999G990D00');
  end if;

  update public.payment_entries
  set status = 'pago',
      paid_date = current_date,
      paid_amount = requested_amount
  where id = p_payment_entry_id;
end;
$$;
