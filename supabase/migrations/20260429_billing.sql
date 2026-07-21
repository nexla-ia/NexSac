-- ────────────────────────────────────────────────────────────────────────────
-- Migration: sistema de cobrança/mensalidade
--
-- Adiciona em companies:
--   billing_day              — dia do mês de vencimento (1-31)
--   next_due_date            — próxima data de vencimento (avança ao marcar pago)
--   billing_amount           — valor mensal (R$)
--   billing_grace_days       — dias de carência após vencimento antes de bloquear (default 1)
--   billing_reminder_days    — quantos dias antes do vencimento começa o aviso (default 3)
--   billing_blocked          — bloqueio manual (override)
--
-- Cria tabela invoices: histórico de mensalidades
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_day            integer,
  ADD COLUMN IF NOT EXISTS next_due_date          date,
  ADD COLUMN IF NOT EXISTS billing_amount         numeric(10,2),
  ADD COLUMN IF NOT EXISTS billing_grace_days     integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_reminder_days  integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS billing_blocked        boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount          numeric(10,2) NOT NULL,
  due_date        date NOT NULL,
  paid_at         timestamptz,
  payment_method  text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date   ON public.invoices(due_date);

-- RPC: marca empresa como paga (cria invoice + avança next_due_date 1 mês)
-- Security definer pra bypassar RLS — só o ADM chama isso
CREATE OR REPLACE FUNCTION public.mark_company_paid(
  p_company_id uuid,
  p_amount numeric DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_amount numeric;
  v_due date;
  v_next date;
BEGIN
  SELECT * INTO v_company FROM companies WHERE id = p_company_id;
  IF v_company IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Empresa não encontrada');
  END IF;

  v_amount := COALESCE(p_amount, v_company.billing_amount);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'Valor da mensalidade não definido');
  END IF;

  -- Vencimento sendo pago: usa next_due_date se setado, senão calcula deste mês
  v_due := COALESCE(
    v_company.next_due_date,
    date_trunc('month', CURRENT_DATE)::date + (COALESCE(v_company.billing_day, 5) - 1)
  );

  -- Próximo vencimento: 1 mês depois
  v_next := (v_due + INTERVAL '1 month')::date;

  -- Insere invoice paga
  INSERT INTO invoices (company_id, amount, due_date, paid_at, payment_method, notes)
  VALUES (p_company_id, v_amount, v_due, now(), p_payment_method, p_notes);

  -- Avança next_due_date e desbloqueia (caso estivesse bloqueado)
  UPDATE companies
     SET next_due_date = v_next,
         billing_blocked = false
   WHERE id = p_company_id;

  RETURN json_build_object('ok', true, 'next_due_date', v_next);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_company_paid(uuid, numeric, text, text) TO anon, authenticated;

-- RLS: invoices acessível pra service_role livremente; anon só pode ler do próprio (não usado por enquanto)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_full_access" ON public.invoices;
CREATE POLICY "invoices_full_access" ON public.invoices
  FOR ALL USING (true) WITH CHECK (true);
