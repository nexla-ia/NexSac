-- Tabela de anexos do prontuário (fotos de evolução, documentos, laudos)
CREATE TABLE IF NOT EXISTS public.prontuario_attachments (
  id           uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia    text NOT NULL,
  contact_numero text NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_type    text,
  file_size    integer,
  uploaded_by  text,
  uploaded_at  timestamptz DEFAULT NOW(),
  caption      text
);

CREATE INDEX IF NOT EXISTS prontuario_attachments_instancia_numero_idx
  ON public.prontuario_attachments (instancia, contact_numero);

ALTER TABLE public.prontuario_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_prontuario_attachments"
  ON public.prontuario_attachments FOR ALL USING (true) WITH CHECK (true);

-- Bucket de storage para arquivos do prontuário
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prontuario',
  'prontuario',
  true,
  20971520, -- 20MB max por arquivo
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/heic',
    'application/pdf',
    'video/mp4','video/quicktime',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Política de storage: acesso público para leitura, qualquer um pode fazer upload (auth via DB)
DO $$ BEGIN
  CREATE POLICY "prontuario_public_read"
    ON storage.objects FOR SELECT USING (bucket_id = 'prontuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "prontuario_upload"
    ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'prontuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "prontuario_delete"
    ON storage.objects FOR DELETE USING (bucket_id = 'prontuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
