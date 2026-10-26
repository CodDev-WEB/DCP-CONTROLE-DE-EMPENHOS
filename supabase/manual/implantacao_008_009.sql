-- DCP CONTROLE DE EMPENHOS: implantação consolidada das migrações 008 e 009.
-- Arquivo operacional/manual; NÃO é uma migração automática do Supabase.
-- Executar no SQL Editor do projeto correto após backup.
-- Tudo ocorre em uma transação; qualquer erro antes de COMMIT reverte as alterações.

BEGIN;

DO $$
BEGIN
 IF to_regclass('public.empenhos') IS NULL OR to_regclass('public.payment_entries') IS NULL
 THEN RAISE EXCEPTION 'Tabelas-base ausentes; implantação cancelada.'; END IF;
 IF to_regclass('public.empenho_rules') IS NULL
 THEN RAISE EXCEPTION 'public.empenho_rules ausente; implantação cancelada.'; END IF;
 IF to_regprocedure('public.set_updated_at()') IS NULL OR to_regprocedure('public.log_audit_change()') IS NULL
 THEN RAISE EXCEPTION 'Funções de auditoria/updated_at ausentes; implantação cancelada.'; END IF;
END $$;

-- Migração 008: colunas e restrições idempotentes.
ALTER TABLE public.payment_entries
 ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'pedido',
 ADD COLUMN IF NOT EXISTS order_amount numeric(14,2),
 ADD COLUMN IF NOT EXISTS markup_percentage numeric(5,2) NOT NULL DEFAULT 20,
 ADD COLUMN IF NOT EXISTS invoice_amount numeric(14,2),
 ADD COLUMN IF NOT EXISTS related_order_id uuid;

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_entries'::regclass AND conname='payment_entries_entry_type_check') THEN
  ALTER TABLE public.payment_entries ADD CONSTRAINT payment_entries_entry_type_check CHECK(entry_type IN ('pedido','pagamento'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_entries'::regclass AND conname='payment_entries_order_amount_check') THEN
  ALTER TABLE public.payment_entries ADD CONSTRAINT payment_entries_order_amount_check CHECK(order_amount IS NULL OR order_amount>=0);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_entries'::regclass AND conname='payment_entries_markup_percentage_check') THEN
  ALTER TABLE public.payment_entries ADD CONSTRAINT payment_entries_markup_percentage_check CHECK(markup_percentage BETWEEN 0 AND 100);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_entries'::regclass AND conname='payment_entries_invoice_amount_check') THEN
  ALTER TABLE public.payment_entries ADD CONSTRAINT payment_entries_invoice_amount_check CHECK(invoice_amount IS NULL OR invoice_amount>=0);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_entries'::regclass AND conname='payment_entries_related_order_id_fkey') THEN
  ALTER TABLE public.payment_entries ADD CONSTRAINT payment_entries_related_order_id_fkey FOREIGN KEY(related_order_id) REFERENCES public.payment_entries(id) ON DELETE RESTRICT;
 END IF;
END $$;

UPDATE public.payment_entries
 SET order_amount=COALESCE(order_amount,requested_amount), invoice_amount=COALESCE(invoice_amount,requested_amount)
 WHERE order_amount IS NULL OR invoice_amount IS NULL;
CREATE INDEX IF NOT EXISTS payment_entries_related_order_idx ON public.payment_entries(related_order_id);

-- Migração 009: criar itens sem apagar empenhos antigos.
CREATE TABLE IF NOT EXISTS public.empenho_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empenho_id uuid NOT NULL REFERENCES public.empenhos(id) ON DELETE RESTRICT,
 description text NOT NULL,
 original_amount numeric(14,2) NOT NULL CHECK(original_amount>0),
 discount_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK(discount_percentage BETWEEN 0 AND 100),
 sort_order integer NOT NULL DEFAULT 0,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empenho_items_empenho_idx ON public.empenho_items(empenho_id,sort_order,created_at);
ALTER TABLE public.empenho_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='empenho_items' AND policyname='authenticated can read items') THEN
  CREATE POLICY "authenticated can read items" ON public.empenho_items FOR SELECT TO authenticated USING(true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='empenho_items' AND policyname='authenticated can insert items') THEN
  CREATE POLICY "authenticated can insert items" ON public.empenho_items FOR INSERT TO authenticated WITH CHECK(true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='empenho_items' AND policyname='authenticated can update items') THEN
  CREATE POLICY "authenticated can update items" ON public.empenho_items FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
 END IF;
END $$;

DROP TRIGGER IF EXISTS empenho_items_set_updated_at ON public.empenho_items;
CREATE TRIGGER empenho_items_set_updated_at BEFORE UPDATE ON public.empenho_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS audit_empenho_items ON public.empenho_items;
CREATE TRIGGER audit_empenho_items AFTER INSERT OR UPDATE OR DELETE ON public.empenho_items FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

INSERT INTO public.empenho_items(empenho_id,description,original_amount,discount_percentage)
SELECT e.id,COALESCE(NULLIF(trim(e.description),''),'Item legado do empenho'),e.original_amount,0
FROM public.empenhos e
WHERE e.original_amount>0 AND NOT EXISTS(SELECT 1 FROM public.empenho_items i WHERE i.empenho_id=e.id);

ALTER TABLE public.payment_entries ADD COLUMN IF NOT EXISTS empenho_item_id uuid;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_entries'::regclass AND conname='payment_entries_empenho_item_id_fkey') THEN
  ALTER TABLE public.payment_entries ADD CONSTRAINT payment_entries_empenho_item_id_fkey FOREIGN KEY(empenho_item_id) REFERENCES public.empenho_items(id) ON DELETE RESTRICT;
 END IF;
END $$;
UPDATE public.payment_entries p SET empenho_item_id=i.id FROM public.empenho_items i
WHERE i.empenho_id=p.empenho_id AND p.empenho_item_id IS NULL;
CREATE INDEX IF NOT EXISTS payment_entries_item_date_idx ON public.payment_entries(empenho_item_id,request_date DESC);

CREATE OR REPLACE VIEW public.empenho_item_balances WITH(security_invoker=true) AS
WITH usage AS(
 SELECT p.empenho_item_id,
 COALESCE(SUM(p.balance_deduction_snapshot) FILTER(WHERE p.status<>'cancelado' AND (p.entry_type='pedido' OR (p.entry_type='pagamento' AND p.related_order_id IS NULL))),0)::numeric(14,2) used_balance,
 COALESCE(SUM(p.paid_amount) FILTER(WHERE p.status='pago'),0)::numeric(14,2) confirmed_paid_amount,
 COUNT(*) FILTER(WHERE p.status='solicitado' AND p.entry_type='pedido')::integer pending_count,
 COALESCE(SUM(p.requested_amount) FILTER(WHERE p.status='solicitado' AND p.entry_type='pedido'),0)::numeric(14,2) pending_amount
 FROM public.payment_entries p WHERE p.empenho_item_id IS NOT NULL GROUP BY p.empenho_item_id
)
SELECT i.id empenho_item_id,i.empenho_id,e.organization_id,e.number empenho_number,e.description empenho_description,
 i.description item_description,i.original_amount,i.discount_percentage,
 ROUND(i.original_amount*(1-i.discount_percentage/100),2)::numeric(14,2) operational_limit,
 COALESCE(u.used_balance,0)::numeric(14,2) used_balance,
 (ROUND(i.original_amount*(1-i.discount_percentage/100),2)-COALESCE(u.used_balance,0))::numeric(14,2) operational_balance,
 COALESCE(u.confirmed_paid_amount,0)::numeric(14,2) confirmed_paid_amount,
 COALESCE(u.pending_count,0)::integer pending_count,COALESCE(u.pending_amount,0)::numeric(14,2) pending_amount
FROM public.empenho_items i JOIN public.empenhos e ON e.id=i.empenho_id LEFT JOIN usage u ON u.empenho_item_id=i.id;
GRANT SELECT ON public.empenho_item_balances TO authenticated;

CREATE OR REPLACE VIEW public.empenho_balances WITH(security_invoker=true) AS
WITH totals AS(
 SELECT i.empenho_id,SUM(i.original_amount)::numeric(14,2) original_amount,
 SUM(ROUND(i.original_amount*(1-i.discount_percentage/100),2))::numeric(14,2) initial_operational_limit,
 SUM(b.used_balance)::numeric(14,2) used_balance,SUM(b.operational_balance)::numeric(14,2) operational_balance,
 SUM(b.confirmed_paid_amount)::numeric(14,2) confirmed_paid_amount,SUM(b.pending_count)::integer pending_count,
 SUM(b.pending_amount)::numeric(14,2) pending_amount
 FROM public.empenho_items i JOIN public.empenho_item_balances b ON b.empenho_item_id=i.id GROUP BY i.empenho_id
), rules AS(
 SELECT DISTINCT ON(r.empenho_id) r.empenho_id,r.id rule_id,r.percentage current_percentage,
 r.calculation_base current_calculation_base,r.deduction_mode current_deduction_mode,r.effective_from rule_effective_from
 FROM public.empenho_rules r WHERE r.effective_from<=now() ORDER BY r.empenho_id,r.effective_from DESC,r.created_at DESC
)
SELECT e.id empenho_id,e.organization_id,e.number,e.description,e.issued_on,
 COALESCE(t.original_amount,0)::numeric(14,2) original_amount,r.rule_id,r.current_percentage,r.current_calculation_base,
 r.current_deduction_mode,r.rule_effective_from,COALESCE(t.initial_operational_limit,0)::numeric(14,2) initial_operational_limit,
 COALESCE(t.used_balance,0)::numeric(14,2) used_balance,COALESCE(t.operational_balance,0)::numeric(14,2) operational_balance,
 COALESCE(t.confirmed_paid_amount,0)::numeric(14,2) confirmed_paid_amount,COALESCE(t.pending_count,0)::integer pending_count,
 COALESCE(t.pending_amount,0)::numeric(14,2) pending_amount
FROM public.empenhos e LEFT JOIN totals t ON t.empenho_id=e.id LEFT JOIN rules r ON r.empenho_id=e.id;
GRANT SELECT ON public.empenho_balances TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_payment(p_payment_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_entry public.payment_entries%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'É necessário estar autenticado.'; END IF;
 SELECT * INTO v_entry FROM public.payment_entries WHERE id=p_payment_entry_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 IF v_entry.status<>'solicitado' THEN RAISE EXCEPTION 'Somente solicitações pendentes podem ser confirmadas.'; END IF;
 IF v_entry.entry_type<>'pedido' THEN RAISE EXCEPTION 'Somente pedidos pendentes podem ser confirmados.'; END IF;
 PERFORM 1 FROM public.empenhos WHERE id=v_entry.empenho_id FOR UPDATE;
 UPDATE public.payment_entries SET status='pago',paid_date=current_date,paid_amount=requested_amount WHERE id=p_payment_entry_id;
END; $$;

COMMIT;

-- Verificação pós-execução:
SELECT to_regclass('public.empenho_items') tabela_itens,
 to_regclass('public.empenho_item_balances') view_saldos_itens,
 to_regclass('public.empenho_balances') view_saldos_empenho,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_entries'
 AND column_name IN('entry_type','order_amount','markup_percentage','invoice_amount','related_order_id')) total_campos_008,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_entries' AND column_name='empenho_item_id') campo_item,
 (SELECT count(*) FROM public.empenho_items) quantidade_itens;
