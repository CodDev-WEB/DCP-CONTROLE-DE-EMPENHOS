-- Store the official identifiers and commercial quantities printed on each empenho item.
alter table public.empenho_items
  add column if not exists item_number text,
  add column if not exists purchase_code text,
  add column if not exists quantity numeric(18,4) check (quantity is null or quantity > 0),
  add column if not exists unit text,
  add column if not exists unit_price numeric(18,4) check (unit_price is null or unit_price >= 0);

create or replace view public.empenho_item_balances with (security_invoker=true) as
with usage as (
 select p.empenho_item_id,
 coalesce(sum(p.balance_deduction_snapshot) filter(where p.status<>'cancelado' and (p.entry_type='pedido' or (p.entry_type='pagamento' and p.related_order_id is null))),0)::numeric(14,2) used_balance,
 coalesce(sum(p.paid_amount) filter(where p.status='pago'),0)::numeric(14,2) confirmed_paid_amount,
 count(*) filter(where p.status='solicitado' and p.entry_type='pedido')::integer pending_count,
 coalesce(sum(p.requested_amount) filter(where p.status='solicitado' and p.entry_type='pedido'),0)::numeric(14,2) pending_amount
 from public.payment_entries p where p.empenho_item_id is not null group by p.empenho_item_id
)
select i.id empenho_item_id,i.empenho_id,e.organization_id,e.number empenho_number,e.description empenho_description,
 i.description item_description,i.original_amount,i.discount_percentage,
 round(i.original_amount*(1-i.discount_percentage/100),2)::numeric(14,2) operational_limit,
 coalesce(u.used_balance,0)::numeric(14,2) used_balance,
 (round(i.original_amount*(1-i.discount_percentage/100),2)-coalesce(u.used_balance,0))::numeric(14,2) operational_balance,
 coalesce(u.confirmed_paid_amount,0)::numeric(14,2) confirmed_paid_amount,
 coalesce(u.pending_count,0)::integer pending_count,coalesce(u.pending_amount,0)::numeric(14,2) pending_amount,
 i.item_number,i.purchase_code,i.quantity,i.unit,i.unit_price
from public.empenho_items i join public.empenhos e on e.id=i.empenho_id left join usage u on u.empenho_item_id=i.id;
grant select on public.empenho_item_balances to authenticated;
