-- ==============================================================
-- CRM — lead em vários funis (N-para-N)
-- Cada lead continua com um funil PRINCIPAL em crm_contacts.funil_id/stage_id.
-- Esta tabela guarda os funis ADICIONAIS em que o mesmo lead também aparece,
-- cada um com sua própria etapa. É o MESMO lead (mesmo crm_contacts.id).
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase.
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.crm_contact_funnels (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia          text        NOT NULL,
  contact_id         uuid        NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  funil_id           uuid        NOT NULL REFERENCES public.crm_funnels(id)  ON DELETE CASCADE,
  stage_id           uuid        REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  data_entrada_etapa timestamptz DEFAULT now(),
  created_at         timestamptz DEFAULT now(),
  UNIQUE(contact_id, funil_id)
);

ALTER TABLE public.crm_contact_funnels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_contact_funnels_all" ON public.crm_contact_funnels
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS crm_contact_funnels_funil_idx   ON public.crm_contact_funnels(funil_id);
CREATE INDEX IF NOT EXISTS crm_contact_funnels_contact_idx ON public.crm_contact_funnels(contact_id);
CREATE INDEX IF NOT EXISTS crm_contact_funnels_inst_idx    ON public.crm_contact_funnels(instancia);
