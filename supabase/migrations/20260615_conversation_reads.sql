-- Rastreia quando cada usuário leu cada conversa (para badge de não lidos)
CREATE TABLE IF NOT EXISTS public.conversation_reads (
  instancia    text NOT NULL,
  session_id   text NOT NULL,
  user_email   text NOT NULL,
  last_read_at timestamptz DEFAULT NOW(),
  PRIMARY KEY (instancia, session_id, user_email)
);

ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_conversation_reads"
    ON public.conversation_reads FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
