-- Atomic and guarded deletion of an empenho that has no financial entries.
-- Apply this migration in the Supabase SQL Editor before using the new UI action.
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

  -- Never erase financial/fiscal history.
  if exists (
    select 1 from public.payment_entries
    where empenho_id = p_empenho_id
  ) then
    raise exception 'Este empenho possui lançamentos financeiros vinculados. Use Inativar para preservar o histórico.';
  end if;

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
