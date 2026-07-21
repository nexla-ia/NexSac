-- Motivos de encerramento de conversa editáveis por empresa (em vez de hardcoded no front).
CREATE TABLE IF NOT EXISTS public.conversation_close_reasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia  text NOT NULL,
  value      text NOT NULL,
  label      text NOT NULL,
  color      text DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now(),
  UNIQUE (instancia, value)
);

ALTER TABLE public.conversation_close_reasons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_conversation_close_reasons"
    ON public.conversation_close_reasons FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
