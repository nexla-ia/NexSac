-- Modelos de anamnese (por clínica)
CREATE TABLE IF NOT EXISTS public.anamnese_templates (
  id         uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia  text NOT NULL,
  nome       text NOT NULL,
  is_default boolean DEFAULT false,
  questions  jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT NOW(),
  created_by text
);

CREATE INDEX IF NOT EXISTS anamnese_templates_instancia_idx
  ON public.anamnese_templates (instancia);

ALTER TABLE public.anamnese_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_anamnese_templates"
    ON public.anamnese_templates FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Respostas de anamnese por paciente
CREATE TABLE IF NOT EXISTS public.anamnese_responses (
  id             uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia      text NOT NULL,
  contact_id     uuid REFERENCES public.saved_contacts(id) ON DELETE CASCADE,
  contact_numero text,
  template_id    uuid REFERENCES public.anamnese_templates(id) ON DELETE SET NULL,
  template_name  text,
  questions      jsonb NOT NULL DEFAULT '[]',
  answers        jsonb NOT NULL DEFAULT '{}',
  filled_by      text,
  filled_at      timestamptz DEFAULT NOW(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS anamnese_responses_contact_idx
  ON public.anamnese_responses (instancia, contact_id);

ALTER TABLE public.anamnese_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_anamnese_responses"
    ON public.anamnese_responses FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
