-- Serialize confirmations by empenho so two concurrent confirmations cannot overspend the same balance.
create or replace function public.confirm_payment(p_payment_entry_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.payment_entries%rowtype;
  v_balance numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.';
  end if;

  select * into v_entry
  from public.payment_entries
  where id = p_payment_entry_id
  for update;

  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  if v_entry.status <> 'solicitado' then
    raise exception 'Somente solicitações pendentes podem ser confirmadas.';
  end if;

  -- Lock the parent empenho row, serializing balance checks for its payments.
  perform 1
  from public.empenhos
  where id = v_entry.empenho_id
  for update;

  select operational_balance into v_balance
  from public.empenho_balances
  where empenho_id = v_entry.empenho_id;

  if v_balance is null then
    raise exception 'Não foi possível calcular o saldo deste empenho.';
  end if;
  if v_entry.balance_deduction_snapshot > v_balance then
    raise exception 'Saldo insuficiente. Saldo atual: R$ %; abatimento previsto: R$ %.',
      to_char(v_balance, 'FM999G999G990D00'),
      to_char(v_entry.balance_deduction_snapshot, 'FM999G999G990D00');
  end if;

  update public.payment_entries
  set status = 'pago',
      paid_date = current_date,
      paid_amount = requested_amount
  where id = p_payment_entry_id;
end;
$$;
