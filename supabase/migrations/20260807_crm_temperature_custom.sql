-- ==============================================================
-- CRM — temperatura personalizável
-- Antes crm_contacts.temperatura só aceitava 'frio'/'morno'/'quente' (CHECK).
-- Agora a empresa pode criar as suas (crm_temperatures). O campo passa a
-- guardar a key: 'frio'/'morno'/'quente' (padrões) ou o id da personalizada.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase.
-- ==============================================================

-- Libera o CHECK pra aceitar valores personalizados
ALTER TABLE public.crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_temperatura_check;

CREATE TABLE IF NOT EXISTS public.crm_temperatures (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  nome       text        NOT NULL,
  cor        text        DEFAULT '#64748B',
  posicao    integer     DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.crm_temperatures ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_temperatures_all" ON public.crm_temperatures
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS crm_temperatures_inst_idx ON public.crm_temperatures(instancia);
