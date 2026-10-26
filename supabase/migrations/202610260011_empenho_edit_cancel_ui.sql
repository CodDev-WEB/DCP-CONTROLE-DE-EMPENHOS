-- Expose the active flag in the balances view so the UI can distinguish inactive empenhos.
create or replace view public.empenho_balances with (security_invoker=true) as
with totals as (
 select i.empenho_id,sum(i.original_amount)::numeric(14,2) original_amount,
 sum(round(i.original_amount*(1-i.discount_percentage/100),2))::numeric(14,2) initial_operational_limit,
 sum(b.used_balance)::numeric(14,2) used_balance,sum(b.operational_balance)::numeric(14,2) operational_balance,
 sum(b.confirmed_paid_amount)::numeric(14,2) confirmed_paid_amount,sum(b.pending_count)::integer pending_count,
 sum(b.pending_amount)::numeric(14,2) pending_amount
 from public.empenho_items i join public.empenho_item_balances b on b.empenho_item_id=i.id group by i.empenho_id
), rules as (
 select distinct on(r.empenho_id) r.empenho_id,r.id rule_id,r.percentage current_percentage,r.calculation_base current_calculation_base,
 r.deduction_mode current_deduction_mode,r.effective_from rule_effective_from
 from public.empenho_rules r where r.effective_from<=now() order by r.empenho_id,r.effective_from desc,r.created_at desc
)
select e.id empenho_id,e.organization_id,e.number,e.description,e.issued_on,e.is_active,
 coalesce(t.original_amount,0)::numeric(14,2) original_amount,
 r.rule_id,r.current_percentage,r.current_calculation_base,r.current_deduction_mode,r.rule_effective_from,
 coalesce(t.initial_operational_limit,0)::numeric(14,2) initial_operational_limit,coalesce(t.used_balance,0)::numeric(14,2) used_balance,
 coalesce(t.operational_balance,0)::numeric(14,2) operational_balance,coalesce(t.confirmed_paid_amount,0)::numeric(14,2) confirmed_paid_amount,
 coalesce(t.pending_count,0)::integer pending_count,coalesce(t.pending_amount,0)::numeric(14,2) pending_amount
from public.empenhos e left join totals t on t.empenho_id=e.id left join rules r on r.empenho_id=e.id;
grant select on public.empenho_balances to authenticated;
