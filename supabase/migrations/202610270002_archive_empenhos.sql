-- Archive support for empenhos: keeps all financial history intact.
alter table public.empenhos
  add column if not exists archived_at timestamptz;

create index if not exists empenhos_org_archived_idx
  on public.empenhos (organization_id, archived_at);
