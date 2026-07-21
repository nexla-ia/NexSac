-- Orçamentos / planos de tratamento
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id             uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia      text NOT NULL,
  contact_id     uuid REFERENCES public.saved_contacts(id) ON DELETE CASCADE,
  contact_numero text,
  status         text DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  desconto       numeric DEFAULT 0,
  entrada        numeric DEFAULT 0,
  parcelas       integer DEFAULT 1,
  notes          text,
  created_by     text,
  created_at     timestamptz DEFAULT NOW(),
  approved_at    timestamptz
);

CREATE INDEX IF NOT EXISTS orcamentos_contact_idx
  ON public.orcamentos (instancia, contact_id);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_orcamentos"
    ON public.orcamentos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Itens do orçamento (procedimentos)
CREATE TABLE IF NOT EXISTS public.orcamento_items (
  id           uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  orcamento_id uuid REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  procedimento text NOT NULL,
  dente        text,
  faces        text,
  valor        numeric NOT NULL DEFAULT 0,
  ordem        integer DEFAULT 0
);

ALTER TABLE public.orcamento_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_orcamento_items"
    ON public.orcamento_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
