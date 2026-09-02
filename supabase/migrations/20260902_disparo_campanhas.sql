CREATE TABLE IF NOT EXISTS public.disparo_campanhas (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia           text        NOT NULL,
  nome                text        NOT NULL,
  itens               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  destinatarios       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by_email    text,
  created_at          timestamptz DEFAULT now(),
  last_disparo_at     timestamptz,
  last_disparo_total  integer
);

ALTER TABLE public.disparo_campanhas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_disparo_campanhas"
    ON public.disparo_campanhas FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_disparo_campanhas_instancia ON public.disparo_campanhas(instancia);

CREATE TABLE IF NOT EXISTS public.disparo_envios (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id uuid        NOT NULL REFERENCES public.disparo_campanhas(id) ON DELETE CASCADE,
  instancia   text        NOT NULL,
  tipo        text        NOT NULL CHECK (tipo IN ('contato','grupo')),
  destino     text        NOT NULL,
  nome        text,
  status      text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','erro')),
  erro_msg    text,
  enviado_em  timestamptz,
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (campanha_id, tipo, destino)
);

ALTER TABLE public.disparo_envios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_disparo_envios"
    ON public.disparo_envios FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_disparo_envios_campanha ON public.disparo_envios(campanha_id);
CREATE INDEX IF NOT EXISTS idx_disparo_envios_instancia ON public.disparo_envios(instancia);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.disparo_envios;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
