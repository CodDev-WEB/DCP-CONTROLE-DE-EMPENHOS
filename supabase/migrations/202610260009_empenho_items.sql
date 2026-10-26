-- Multiple items per empenho. Existing records are retained as a single legacy item.
create table public.empenho_items (
 id uuid primary key default gen_random_uuid(),
 empenho_id uuid not null references public.empenhos(id) on delete restrict,
 description text not null,
 original_amount numeric(14,2) not null check (original_amount > 0),
 discount_percentage numeric(5,2) not null default 0 check (discount_percentage between 0 and 100),
 sort_order integer not null default 0,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index empenho_items_empenho_idx on public.empenho_items(empenho_id, sort_order, created_at);
alter table public.empenho_items enable row level security;
create policy "authenticated can read items" on public.empenho_items for select to authenticated using (true);
create policy "authenticated can insert items" on public.empenho_items for insert to authenticated with check (true);
create policy "authenticated can update items" on public.empenho_items for update to authenticated using (true) with check (true);
create trigger empenho_items_set_updated_at before update on public.empenho_items for each row execute function public.set_updated_at();
create trigger audit_empenho_items after insert or update or delete on public.empenho_items for each row execute function public.log_audit_change();

insert into public.empenho_items(empenho_id,description,original_amount,discount_percentage)
select e.id,coalesce(nullif(trim(e.description),''),'Item legado do empenho'),e.original_amount,0
from public.empenhos e
where not exists(select 1 from public.empenho_items i where i.empenho_id=e.id);

alter table public.payment_entries add column if not exists empenho_item_id uuid references public.empenho_items(id) on delete restrict;
update public.payment_entries p set empenho_item_id=i.id
from public.empenho_items i where i.empenho_id=p.empenho_id and p.empenho_item_id is null;
create index payment_entries_item_date_idx on public.payment_entries(empenho_item_id,request_date desc);

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
 coalesce(u.pending_count,0)::integer pending_count,coalesce(u.pending_amount,0)::numeric(14,2) pending_amount
from public.empenho_items i join public.empenhos e on e.id=i.empenho_id left join usage u on u.empenho_item_id=i.id;
grant select on public.empenho_item_balances to authenticated;

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
select e.id empenho_id,e.organization_id,e.number,e.description,e.issued_on,coalesce(t.original_amount,0)::numeric(14,2) original_amount,
 r.rule_id,r.current_percentage,r.current_calculation_base,r.current_deduction_mode,r.rule_effective_from,
 coalesce(t.initial_operational_limit,0)::numeric(14,2) initial_operational_limit,coalesce(t.used_balance,0)::numeric(14,2) used_balance,
 coalesce(t.operational_balance,0)::numeric(14,2) operational_balance,coalesce(t.confirmed_paid_amount,0)::numeric(14,2) confirmed_paid_amount,
 coalesce(t.pending_count,0)::integer pending_count,coalesce(t.pending_amount,0)::numeric(14,2) pending_amount
from public.empenhos e left join totals t on t.empenho_id=e.id left join rules r on r.empenho_id=e.id;
grant select on public.empenho_balances to authenticated;
