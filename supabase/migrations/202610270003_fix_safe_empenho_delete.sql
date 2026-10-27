-- Fix safe deletion: allow immutable rules to be removed only inside the guarded delete RPC.
-- Normal UPDATE/DELETE operations on historical rules remain blocked.
create or replace function public.prevent_rule_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_empenho_delete', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  raise exception 'As regras financeiras são históricas e não podem ser alteradas ou excluídas. Registre uma nova versão com nova data de vigência.';
end;
$$;

create or replace function public.delete_empenho_safely(p_empenho_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empenho public.empenhos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária para excluir empenho.';
  end if;

  select * into v_empenho
  from public.empenhos
  where id = p_empenho_id
  for update;

  if not found then
    return jsonb_build_object('success', true, 'message', 'O empenho já não existe.');
  end if;

  -- Financial records must never be physically deleted.
  if exists (
    select 1 from public.payment_entries
    where empenho_id = p_empenho_id
  ) then
    raise exception 'Este empenho possui lançamentos financeiros vinculados. Use Inativar ou Arquivar para preservar o histórico.';
  end if;

  -- A transaction-local flag permits the historical-rule trigger to pass only
  -- during this guarded operation. It resets automatically at transaction end.
  perform set_config('app.allow_empenho_delete', 'on', true);

  delete from public.empenho_items where empenho_id = p_empenho_id;
  delete from public.empenho_rules where empenho_id = p_empenho_id;
  delete from public.empenhos where id = p_empenho_id;

  if exists (select 1 from public.empenhos where id = p_empenho_id) then
    raise exception 'O banco não confirmou a exclusão do empenho.';
  end if;

  return jsonb_build_object('success', true, 'message', 'Empenho e itens excluídos.');
end;
$$;

revoke all on function public.delete_empenho_safely(uuid) from public;
grant execute on function public.delete_empenho_safely(uuid) to authenticated;
