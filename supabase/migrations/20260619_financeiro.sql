-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo Financeiro: contas a pagar / receber / fluxo de caixa
-- ─────────────────────────────────────────────────────────────────────────────

-- Categorias financeiras por empresa
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  nome       text        NOT NULL,
  tipo       text        NOT NULL CHECK (tipo IN ('receita', 'despesa', 'ambos')),
  cor        text        DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "fin_categories_all" ON public.financial_categories
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS fin_categories_instancia_idx ON public.financial_categories (instancia);

-- Lançamentos financeiros
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia       text        NOT NULL,
  tipo            text        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao       text        NOT NULL,
  valor           numeric     NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  categoria_id    uuid        REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  vencimento      date        NOT NULL,
  pagamento_at    date,                          -- data real de pagamento/recebimento
  parcela_atual   integer     DEFAULT 1,
  total_parcelas  integer     DEFAULT 1,
  grupo_parcelas  uuid,                          -- UUID compartilhado entre parcelas do mesmo lançamento
  contact_id      uuid,
  contact_nome    text,
  appointment_id  uuid,
  orcamento_id    uuid,
  centro_custo    text,
  observacoes     text,
  created_by      text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "fin_transactions_all" ON public.financial_transactions
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS fin_transactions_instancia_idx   ON public.financial_transactions (instancia);
CREATE INDEX IF NOT EXISTS fin_transactions_vencimento_idx  ON public.financial_transactions (instancia, vencimento);
CREATE INDEX IF NOT EXISTS fin_transactions_status_idx      ON public.financial_transactions (instancia, tipo, status);
CREATE INDEX IF NOT EXISTS fin_transactions_grupo_idx       ON public.financial_transactions (grupo_parcelas);

-- Categorias padrão (inseridas para cada nova empresa via trigger ou manualmente)
-- Receitas
INSERT INTO public.financial_categories (instancia, nome, tipo, cor)
  SELECT '_default_', nome, tipo, cor FROM (VALUES
    ('Consulta',             'receita', '#16A34A'),
    ('Procedimento',         'receita', '#0284C7'),
    ('Exame',                'receita', '#7C3AED'),
    ('Produto/Material',     'receita', '#EA580C'),
    ('Outro (receita)',      'receita', '#6B7280'),
    ('Aluguel',              'despesa', '#DC2626'),
    ('Material clínico',     'despesa', '#B45309'),
    ('Salário / Pró-labore', 'despesa', '#7C3AED'),
    ('Serviços (água/luz/internet)', 'despesa', '#0369A1'),
    ('Marketing',            'despesa', '#DB2777'),
    ('Equipamento',          'despesa', '#6B7280'),
    ('Imposto / Taxa',       'despesa', '#92400E'),
    ('Outro (despesa)',      'despesa', '#374151')
  ) AS t(nome, tipo, cor)
ON CONFLICT DO NOTHING;
