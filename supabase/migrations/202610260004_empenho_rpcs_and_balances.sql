-- DCP: atomic creation helpers and read-only financial summary.
-- These functions run with caller permissions; RLS remains in force.

create or replace function public.create_empenho_with_rule(
  p_organization_id uuid,
  p_number text,
  p_description text,
  p_original_amount numeric,
  p_percentage numeric,
  p_calculation_base public.calculation_base,
  p_deduction_mode public.deduction_mode,
  p_issued_on date default null,
  p_reason text default 'Regra inicial'
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

  insert into public.empenhos (
    organization_id, number, description, issued_on, original_amount
  ) values (
    p_organization_id, trim(p_number), trim(p_description), p_issued_on, p_original_amount
  ) returning id into v_empenho_id;

  insert into public.empenho_rules (
    empenho_id, percentage, calculation_base, deduction_mode, effective_from, reason
  ) values (
    v_empenho_id, p_percentage, p_calculation_base, p_deduction_mode, now(), p_reason
  );

  return v_empenho_id;
end;
$$;

create or replace function public.change_empenho_rule(
  p_empenho_id uuid,
  p_percentage numeric,
  p_calculation_base public.calculation_base,
  p_deduction_mode public.deduction_mode,
  p_effective_from timestamptz default now(),
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rule_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.';
  end if;
  if p_percentage < 0 or p_percentage > 100 then
    raise exception 'O percentual deve estar entre 0 e 100.';
  end if;
  if not exists (select 1 from public.empenhos where id = p_empenho_id) then
    raise exception 'Empenho não encontrado.';
  end if;

  insert into public.empenho_rules (
    empenho_id, percentage, calculation_base, deduction_mode, effective_from, reason
  ) values (
    p_empenho_id, p_percentage, p_calculation_base, p_deduction_mode,
    p_effective_from, coalesce(nullif(trim(p_reason), ''), 'Alteração de regra')
  ) returning id into v_rule_id;

  return v_rule_id;
end;
$$;

-- Current balance is calculated from the current rule and confirmed payments.
-- Historical request snapshots remain unchanged when a future rule is added.
create or replace view public.empenho_balances
with (security_invoker = true)
as
with current_rules as (
  select distinct on (r.empenho_id)
    r.empenho_id, r.id as rule_id, r.percentage,
    r.calculation_base, r.deduction_mode, r.effective_from
  from public.empenho_rules r
  where r.effective_from <= now()
  order by r.empenho_id, r.effective_from desc, r.created_at desc
),
paid_totals as (
  select p.empenho_id,
    coalesce(sum(p.balance_deduction_snapshot), 0)::numeric(14,2) as used_balance,
    coalesce(sum(p.paid_amount), 0)::numeric(14,2) as paid_amount,
    count(*) filter (where p.status = 'solicitado')::integer as pending_count,
    coalesce(sum(p.requested_amount) filter (where p.status = 'solicitado'), 0)::numeric(14,2) as pending_amount
  from public.payment_entries p
  where p.status = 'pago'
  group by p.empenho_id
)
select
  e.id as empenho_id,
  e.organization_id,
  e.number,
  e.description,
  e.issued_on,
  e.original_amount,
  r.rule_id,
  r.percentage as current_percentage,
  r.calculation_base as current_calculation_base,
  r.deduction_mode as current_deduction_mode,
  r.effective_from as rule_effective_from,
  case
    when r.calculation_base = 'valor_empenho'
      then round(e.original_amount * (1 - r.percentage / 100), 2)
    else e.original_amount
  end::numeric(14,2) as initial_operational_limit,
  coalesce(p.used_balance, 0)::numeric(14,2) as used_balance,
  greatest(
    case
      when r.calculation_base = 'valor_empenho'
        then round(e.original_amount * (1 - r.percentage / 100), 2)
      else e.original_amount
    end - coalesce(p.used_balance, 0), 0
  )::numeric(14,2) as operational_balance,
  coalesce(p.paid_amount, 0)::numeric(14,2) as confirmed_paid_amount,
  coalesce(p.pending_count, 0)::integer as pending_count,
  coalesce(p.pending_amount, 0)::numeric(14,2) as pending_amount
from public.empenhos e
left join current_rules r on r.empenho_id = e.id
left join paid_totals p on p.empenho_id = e.id;

grant select on public.empenho_balances to authenticated;
