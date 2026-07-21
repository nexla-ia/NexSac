-- Nome customizado por grupo (renomear na plataforma sem mudar o nome real do WhatsApp).
CREATE TABLE IF NOT EXISTS public.group_custom_names (
  instancia   text NOT NULL,
  idgrupo     text NOT NULL,
  custom_name text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (instancia, idgrupo)
);

ALTER TABLE public.group_custom_names ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_group_custom_names"
    ON public.group_custom_names FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
