-- DCP — Controle de Empresas
-- Supabase migration: schema inicial
-- Aplicar no SQL Editor do projeto Supabase após revisar as políticas de acesso.

create extension if not exists pgcrypto;

create type public.payment_status as enum ('solicitado', 'parcialmente_pago', 'pago', 'cancelado');
create type public.calculation_base as enum ('valor_empenho', 'valor_pedido');
create type public.deduction_mode as enum ('valor_integral', 'valor_liquido');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  government_level text,
  registration_number text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.empenhos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  number text not null,
  description text not null,
  issued_on date,
  original_amount numeric(14,2) not null check (original_amount > 0),
  current_balance_policy text not null default 'recalcular_limite_com_taxa_vigente'
    check (current_balance_policy in ('preservar_limite_original', 'recalcular_limite_com_taxa_vigente')),
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

-- A taxa e os parâmetros são versionados. Uma alteração cria uma nova linha;
-- lançamentos antigos mantêm os snapshots dos parâmetros usados.
create table public.empenho_rules (
  id uuid primary key default gen_random_uuid(),
  empenho_id uuid not null references public.empenhos(id) on delete restrict,
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  calculation_base public.calculation_base not null,
  deduction_mode public.deduction_mode not null,
  effective_from timestamptz not null default now(),
  reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (empenho_id, effective_from)
);

create index empenho_rules_current_idx
  on public.empenho_rules (empenho_id, effective_from desc);

create table public.payment_entries (
  id uuid primary key default gen_random_uuid(),
  empenho_id uuid not null references public.empenhos(id) on delete restrict,
  request_date date not null,
  paid_date date,
  description text not null,
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  status public.payment_status not null default 'solicitado',
  -- Snapshot da regra vigente no momento em que o lançamento é criado.
  rule_id uuid references public.empenho_rules(id) on delete set null,
  percentage_snapshot numeric(5,2) not null check (percentage_snapshot >= 0 and percentage_snapshot <= 100),
  calculation_base_snapshot public.calculation_base not null,
  deduction_mode_snapshot public.deduction_mode not null,
  percentage_amount_snapshot numeric(14,2) not null check (percentage_amount_snapshot >= 0),
  balance_deduction_snapshot numeric(14,2) not null check (balance_deduction_snapshot >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_amount <= requested_amount),
  check ((status <> 'pago') or paid_date is not null)
);

create index payment_entries_empenho_date_idx
  on public.payment_entries (empenho_id, request_date desc);
create index payment_entries_status_idx
  on public.payment_entries (status);

create table public.payment_attachments (
  id uuid primary key default gen_random_uuid(),
  payment_entry_id uuid not null references public.payment_entries(id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null check (
    content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  ),
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger empenhos_set_updated_at
before update on public.empenhos
for each row execute function public.set_updated_at();

create trigger payment_entries_set_updated_at
before update on public.payment_entries
for each row execute function public.set_updated_at();

-- Auditoria das alterações relevantes. Não registrar exclusões em cascata;
-- registros financeiros devem ser cancelados em vez de apagados.
create or replace function public.log_audit_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if tg_op = 'DELETE' then
    rid := old.id;
    insert into public.audit_log(table_name, record_id, action, old_data, changed_by)
    values (tg_table_name, rid, tg_op, to_jsonb(old), auth.uid());
    return old;
  elsif tg_op = 'UPDATE' then
    rid := new.id;
    insert into public.audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, rid, tg_op, to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    rid := new.id;
    insert into public.audit_log(table_name, record_id, action, new_data, changed_by)
    values (tg_table_name, rid, tg_op, to_jsonb(new), auth.uid());
    return new;
  end if;
end;
$$;

create trigger audit_organizations
after insert or update or delete on public.organizations
for each row execute function public.log_audit_change();

create trigger audit_empenhos
after insert or update or delete on public.empenhos
for each row execute function public.log_audit_change();

create trigger audit_empenho_rules
after insert or update or delete on public.empenho_rules
for each row execute function public.log_audit_change();

create trigger audit_payment_entries
after insert or update or delete on public.payment_entries
for each row execute function public.log_audit_change();

-- RLS: versão inicial para equipe autenticada. Antes de produção,
-- restringir por usuário/perfil se houver diferentes níveis de acesso.
alter table public.organizations enable row level security;
alter table public.empenhos enable row level security;
alter table public.empenho_rules enable row level security;
alter table public.payment_entries enable row level security;
alter table public.payment_attachments enable row level security;
alter table public.audit_log enable row level security;

create policy "authenticated users can read organizations"
on public.organizations for select to authenticated using (true);
create policy "authenticated users can create organizations"
on public.organizations for insert to authenticated with check (true);
create policy "authenticated users can update organizations"
on public.organizations for update to authenticated using (true) with check (true);

create policy "authenticated users can read empenhos"
on public.empenhos for select to authenticated using (true);
create policy "authenticated users can create empenhos"
on public.empenhos for insert to authenticated with check (true);
create policy "authenticated users can update empenhos"
on public.empenhos for update to authenticated using (true) with check (true);

create policy "authenticated users can read rules"
on public.empenho_rules for select to authenticated using (true);
create policy "authenticated users can create rules"
on public.empenho_rules for insert to authenticated with check (true);
create policy "authenticated users can update rules"
on public.empenho_rules for update to authenticated using (true) with check (true);

create policy "authenticated users can read payment entries"
on public.payment_entries for select to authenticated using (true);
create policy "authenticated users can create payment entries"
on public.payment_entries for insert to authenticated with check (true);
create policy "authenticated users can update payment entries"
on public.payment_entries for update to authenticated using (true) with check (true);

create policy "authenticated users can read attachment metadata"
on public.payment_attachments for select to authenticated using (true);
create policy "authenticated users can add attachment metadata"
on public.payment_attachments for insert to authenticated with check (true);

create policy "authenticated users can read audit log"
on public.audit_log for select to authenticated using (true);

-- Criar bucket privado 'dcp-payment-attachments' no Supabase Storage.
-- Configure políticas de storage.objects para permitir acesso apenas a usuários
-- autenticados; os arquivos devem ser acessados por URLs assinadas de curta duração.
-- Não habilite acesso público ao bucket.
