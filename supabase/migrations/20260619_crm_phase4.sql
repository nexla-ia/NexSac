-- ─────────────────────────────────────────────────────────────────────────────
-- CRM Fase 4: listas dinâmicas + auto-avançar etapa ao agendar
-- ─────────────────────────────────────────────────────────────────────────────

-- Listas dinâmicas (filtros salvos)
CREATE TABLE IF NOT EXISTS public.crm_lists (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  nome       text        NOT NULL,
  filtros    jsonb       DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.crm_lists ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_lists_all" ON public.crm_lists FOR ALL TO authenticated,anon USING(true) WITH CHECK(true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS crm_lists_inst_idx ON public.crm_lists(instancia);

-- ─── Trigger: avança etapa CRM ao criar agendamento ──────────────────────────

CREATE OR REPLACE FUNCTION public.crm_advance_on_appointment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_phone    text;
  v_contact  public.crm_contacts%ROWTYPE;
  v_stage_id uuid;
  v_stage_pos integer;
  v_cur_pos   integer;
BEGIN
  v_phone := regexp_replace(COALESCE(NEW.contact_numero,''), '[^0-9]', '', 'g');
  IF v_phone = '' THEN RETURN NEW; END IF;

  SELECT * INTO v_contact
  FROM public.crm_contacts
  WHERE instancia = NEW.instancia
    AND regexp_replace(phone, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Etapa com 'agend' no nome dentro do mesmo funil
  SELECT id, posicao INTO v_stage_id, v_stage_pos
  FROM public.crm_stages
  WHERE funil_id = v_contact.funil_id
    AND lower(nome) LIKE '%agend%'
  ORDER BY posicao ASC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Só avança se o contato estiver em etapa anterior (não regride)
  SELECT posicao INTO v_cur_pos
  FROM public.crm_stages WHERE id = v_contact.stage_id;

  IF v_cur_pos IS NULL OR v_cur_pos < v_stage_pos THEN
    UPDATE public.crm_contacts
    SET stage_id = v_stage_id, data_entrada_etapa = now()
    WHERE id = v_contact.id;

    INSERT INTO public.crm_interactions(instancia, phone, tipo, conteudo, autor_nome)
    VALUES (
      NEW.instancia, v_phone, 'agendamento',
      'Agendamento criado — etapa avançada automaticamente para "Agendou"',
      'Sistema'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_advance_appt ON public.appointments;
CREATE TRIGGER crm_advance_appt
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.crm_advance_on_appointment();
