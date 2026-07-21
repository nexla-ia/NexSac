-- ─────────────────────────────────────────────────────────────────────────────
-- CRM: funis, etapas, contatos, histórico de interações
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_funnels (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  nome       text        NOT NULL,
  posicao    integer     DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_stages (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  funil_id    uuid        REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
  instancia   text        NOT NULL,
  nome        text        NOT NULL,
  cor         text        DEFAULT '#6B7280',
  posicao     integer     DEFAULT 0,
  alerta_dias integer     DEFAULT 7,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia           text        NOT NULL,
  phone               text        NOT NULL,
  nome                text,
  email               text,
  stage_id            uuid        REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  funil_id            uuid        REFERENCES public.crm_funnels(id) ON DELETE SET NULL,
  temperatura         text        DEFAULT 'frio' CHECK (temperatura IN ('frio','morno','quente')),
  tags                text[]      DEFAULT '{}',
  responsavel_id      uuid,
  responsavel_nome    text,
  origem              text,
  observacoes         text,
  motivo_perda        text,
  data_ult_contato    timestamptz,
  data_entrada_etapa  timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  UNIQUE(instancia, phone)
);

CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  phone      text        NOT NULL,
  tipo       text        NOT NULL CHECK (tipo IN ('nota','etapa','mensagem','agendamento','tarefa')),
  conteudo   text,
  metadata   jsonb,
  autor_nome text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.crm_funnels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "crm_funnels_all"      ON public.crm_funnels      FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "crm_stages_all"       ON public.crm_stages       FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "crm_contacts_all"     ON public.crm_contacts     FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "crm_interactions_all" ON public.crm_interactions FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS crm_funnels_inst_idx      ON public.crm_funnels(instancia);
CREATE INDEX IF NOT EXISTS crm_stages_funil_idx      ON public.crm_stages(funil_id);
CREATE INDEX IF NOT EXISTS crm_contacts_inst_idx     ON public.crm_contacts(instancia);
CREATE INDEX IF NOT EXISTS crm_contacts_stage_idx    ON public.crm_contacts(stage_id);
CREATE INDEX IF NOT EXISTS crm_interactions_phone_idx ON public.crm_interactions(instancia, phone);
