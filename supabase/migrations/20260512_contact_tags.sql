-- ────────────────────────────────────────────────────────────────────────────
-- Migration: tags de contato (etiquetas)
--
-- Permite a clínica criar etiquetas coloridas e atribuí-las aos
-- pacientes/contatos. Funciona por telefone (numero), não exige cadastro
-- completo do paciente — qualquer número que apareceu no chat pode receber tag.
--
-- Filtros nas telas de Conversas / Finalizados / Pacientes usam essas tags.
-- ────────────────────────────────────────────────────────────────────────────

-- 1) Definições das tags (uma por empresa/instância)
CREATE TABLE IF NOT EXISTS public.contact_tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia  text        NOT NULL,
  name       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#2563EB',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instancia, name)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_instancia
  ON public.contact_tags (instancia);

-- 2) Atribuições (many-to-many entre número e tag)
CREATE TABLE IF NOT EXISTS public.contact_tag_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia        text        NOT NULL,
  numero           text        NOT NULL,   -- telefone bruto, sem sufixo @
  tag_id           uuid        NOT NULL REFERENCES public.contact_tags(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  UNIQUE (instancia, numero, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tag_assignments_lookup
  ON public.contact_tag_assignments (instancia, numero);

CREATE INDEX IF NOT EXISTS idx_contact_tag_assignments_tag
  ON public.contact_tag_assignments (tag_id);

-- 3) RLS — modelo permissive (seg. é no app)
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_tags_all ON public.contact_tags;
CREATE POLICY contact_tags_all ON public.contact_tags
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS contact_tag_assignments_all ON public.contact_tag_assignments;
CREATE POLICY contact_tag_assignments_all ON public.contact_tag_assignments
  FOR ALL USING (true) WITH CHECK (true);

-- 4) Realtime — pra picker/lista atualizarem ao vivo entre abas
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_tag_assignments;
