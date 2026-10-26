-- Add selectable balance policy and retain the original calculation base for history.
drop function if exists public.create_empenho_with_rule(uuid, text, text, numeric, numeric, public.calculation_base, public.deduction_mode, date, text);

create or replace function public.create_empenho_with_rule(
  p_organization_id uuid,
  p_number text,
  p_description text,
  p_original_amount numeric,
  p_percentage numeric,
  p_calculation_base public.calculation_base,
  p_deduction_mode public.deduction_mode,
  p_issued_on date default null,
  p_reason text default 'Regra inicial',
  p_current_balance_policy text default 'recalcular_limite_com_taxa_vigente'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empenho_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.';
  end if;
  if p_original_amount <= 0 then
    raise exception 'O valor do empenho deve ser maior que zero.';
  end if;
  if p_percentage < 0 or p_percentage > 100 then
    raise exception 'O percentual deve estar entre 0 e 100.';
  end if;
  if p_current_balance_policy not in ('preservar_limite_original', 'recalcular_limite_com_taxa_vigente') then
    raise exception 'Política de saldo inválida.';
  end if;

  insert into public.empenhos (
    organization_id, number, description, issued_on, original_amount, current_balance_policy
  ) values (
    p_organization_id, trim(p_number), trim(p_description), p_issued_on,
    p_original_amount, p_current_balance_policy
  ) returning id into v_empenho_id;

  insert into public.empenho_rules (
    empenho_id, percentage, calculation_base, deduction_mode, effective_from, reason
  ) values (
    v_empenho_id, p_percentage, p_calculation_base, p_deduction_mode, now(), p_reason
  );

  return v_empenho_id;
end;
$$;

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
