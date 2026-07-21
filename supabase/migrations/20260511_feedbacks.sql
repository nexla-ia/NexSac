-- ────────────────────────────────────────────────────────────────────────────
-- Migration: tabela feedbacks
--
-- Cada empresa pode submeter sugestões, bugs, elogios e dúvidas com nota
-- de 1-5. O ADM Global lê tudo numa tela de moderação separada (futuro).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedbacks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_name    text NOT NULL,
  user_email   text NOT NULL,
  category     text NOT NULL CHECK (category IN ('sugestao','bug','elogio','duvida','outro')),
  rating       smallint CHECK (rating BETWEEN 1 AND 5),
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_analise','planejado','feito','recusado')),
  adm_response text,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedbacks_company_id_idx ON public.feedbacks (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedbacks_status_idx     ON public.feedbacks (status, created_at DESC);

-- RLS no padrão permissive do projeto (segurança via anon key + auth no app)
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read feedbacks"   ON public.feedbacks;
DROP POLICY IF EXISTS "allow_insert feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "allow_update feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "allow_delete feedbacks" ON public.feedbacks;

CREATE POLICY "allow_read feedbacks"   ON public.feedbacks FOR SELECT USING (true);
CREATE POLICY "allow_insert feedbacks" ON public.feedbacks FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update feedbacks" ON public.feedbacks FOR UPDATE USING (true);
CREATE POLICY "allow_delete feedbacks" ON public.feedbacks FOR DELETE USING (true);

-- Adiciona à publication supabase_realtime (pra notificações live no ADM)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='feedbacks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedbacks;
  END IF;
END;
$$;

-- Trigger pra updated_at automático
CREATE OR REPLACE FUNCTION public.feedbacks_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS feedbacks_updated_at ON public.feedbacks;
CREATE TRIGGER feedbacks_updated_at
  BEFORE UPDATE ON public.feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.feedbacks_set_updated_at();
