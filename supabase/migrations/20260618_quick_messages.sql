-- Mensagens rápidas por instância (respostas prontas no chat)
CREATE TABLE IF NOT EXISTS public.quick_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  titulo     text        NOT NULL,
  mensagem   text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.quick_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "quick_messages_all" ON public.quick_messages
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS quick_messages_instancia_idx ON public.quick_messages (instancia);
