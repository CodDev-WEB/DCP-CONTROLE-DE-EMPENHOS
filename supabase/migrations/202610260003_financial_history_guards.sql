-- DCP — proteção de histórico financeiro e snapshot dos cálculos.

alter table public.payment_entries
  add column if not exists calculation_base_amount_snapshot numeric(14,2)
  check (calculation_base_amount_snapshot is null or calculation_base_amount_snapshot >= 0);

-- As regras são versionadas: correções devem ser registradas como nova regra,
-- nunca sobrescrever ou apagar a regra que já foi usada em lançamentos.
create or replace function public.prevent_rule_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'As regras financeiras são históricas e não podem ser alteradas ou excluídas. Registre uma nova versão com nova data de vigência.';
end;
$$;

create trigger prevent_empenho_rule_mutation
before update or delete on public.empenho_rules
for each row execute function public.prevent_rule_mutation();

-- Depois de criado, o snapshot de cálculo de um lançamento é imutável.
-- Campos operacionais como status, data de pagamento, valor pago e observações
-- podem mudar; as mudanças ficam registradas na trilha de auditoria.
create or replace function public.protect_payment_calculation_snapshot()
returns trigger language plpgsql as $$
begin
  if new.empenho_id is distinct from old.empenho_id
    or new.request_date is distinct from old.request_date
    or new.description is distinct from old.description
    or new.requested_amount is distinct from old.requested_amount
    or new.rule_id is distinct from old.rule_id
    or new.percentage_snapshot is distinct from old.percentage_snapshot
    or new.calculation_base_snapshot is distinct from old.calculation_base_snapshot
    or new.deduction_mode_snapshot is distinct from old.deduction_mode_snapshot
    or new.percentage_amount_snapshot is distinct from old.percentage_amount_snapshot
    or new.balance_deduction_snapshot is distinct from old.balance_deduction_snapshot
    or new.calculation_base_amount_snapshot is distinct from old.calculation_base_amount_snapshot
  then
    raise exception 'Os dados originais e o cálculo deste lançamento são imutáveis. Registre um ajuste auditável em vez de alterar o histórico.';
  end if;
  return new;
end;
$$;

create trigger protect_payment_entry_snapshot
before update on public.payment_entries
for each row execute function public.protect_payment_calculation_snapshot();

-- Lançamentos não devem ser apagados fisicamente; use status = 'cancelado'.
create or replace function public.prevent_payment_entry_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Lançamentos financeiros não podem ser excluídos. Altere o status para cancelado para preservar o histórico.';
end;
$$;

create trigger prevent_payment_entry_delete
before delete on public.payment_entries
for each row execute function public.prevent_payment_entry_delete();
