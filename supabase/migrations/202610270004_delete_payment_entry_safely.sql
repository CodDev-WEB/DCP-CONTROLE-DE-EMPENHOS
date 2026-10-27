-- DCP: guarded deletion of an individual payment/order entry.
-- Keeps audit_log history; only bypasses the normal delete guard inside this RPC.
create or replace function public.prevent_payment_entry_delete()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_payment_entry_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'Lançamentos financeiros não podem ser excluídos diretamente. Use a ação de exclusão segura para preservar a auditoria.';
end;
$$;

create or replace function public.delete_payment_entry_safely(p_payment_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.payment_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária para excluir lançamento.';
  end if;

  select * into v_entry
  from public.payment_entries
  where id = p_payment_entry_id
  for update;

  if not found then
    return jsonb_build_object('success', true, 'message', 'O lançamento já não existe.');
  end if;

  if exists (
    select 1 from public.payment_entries child
    where child.related_order_id = p_payment_entry_id
  ) then
    raise exception 'Este lançamento possui pagamentos vinculados. Exclua primeiro os pagamentos dependentes.';
  end if;

  -- FK payment_attachments.payment_entry_id uses RESTRICT, so remove metadata
  -- inside the same transaction. Storage objects are removed by the UI first.
  delete from public.payment_attachments where payment_entry_id = p_payment_entry_id;

  perform set_config('app.allow_payment_entry_delete', 'on', true);
  delete from public.payment_entries where id = p_payment_entry_id;

  if exists (select 1 from public.payment_entries where id = p_payment_entry_id) then
    raise exception 'O banco não confirmou a exclusão do lançamento.';
  end if;

  return jsonb_build_object('success', true, 'message', 'Lançamento excluído e auditoria preservada.');
end;
$$;

revoke all on function public.delete_payment_entry_safely(uuid) from public;
grant execute on function public.delete_payment_entry_safely(uuid) to authenticated;
