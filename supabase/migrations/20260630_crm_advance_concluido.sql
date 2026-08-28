-- ==============================================================
-- CRM — avança o lead para "Compareceu" quando o agendamento é concluído
-- Complementa o trigger de INSERT (que já avança para "Agendou" ao criar
-- o agendamento). Aqui: ao marcar o agendamento como 'concluido', o lead
-- do mesmo número sobe para a etapa "Compareceu" (nome contém "compare").
--
-- Blindado com EXCEPTION: nunca bloqueia o update do agendamento.
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================
--
-- ##############################################################
-- COMO RODAR — em DUAS execuções separadas (PASSO 1, depois PASSO 2).
-- O PASSO 2 cria trigger em appointments, e CREATE TRIGGER exige
-- AccessExclusiveLock na tabela. Rodar tudo numa transação só arrisca
-- deadlock com quem estiver gravando agendamento no mesmo instante.
-- ##############################################################
--
-- ══════════════════════════════════════════════════════════════
-- PASSO 1 — a função (não trava tabela nenhuma)
-- ══════════════════════════════════════════════════════════════

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.crm_advance_on_appointment_concluido()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_phone    text;
  v_contact  public.crm_contacts%ROWTYPE;
  v_stage_id uuid;
  v_stage_pos integer;
  v_cur_pos   integer;
BEGIN
  -- Só na transição para 'concluido'
  IF lower(COALESCE(NEW.status, '')) <> 'concluido' THEN RETURN NEW; END IF;
  IF lower(COALESCE(OLD.status, '')) = 'concluido' THEN RETURN NEW; END IF;

  v_phone := regexp_replace(COALESCE(NEW.contact_numero, ''), '[^0-9]', '', 'g');
  IF v_phone = '' THEN RETURN NEW; END IF;

  SELECT * INTO v_contact
  FROM public.crm_contacts
  WHERE instancia = NEW.instancia
    AND regexp_replace(phone, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Etapa "Compareceu" (nome contém 'compare') do mesmo funil
  SELECT id, posicao INTO v_stage_id, v_stage_pos
  FROM public.crm_stages
  WHERE funil_id = v_contact.funil_id
    AND lower(nome) LIKE '%compare%'
  ORDER BY posicao ASC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Só avança (não regride)
  SELECT posicao INTO v_cur_pos FROM public.crm_stages WHERE id = v_contact.stage_id;
  IF v_cur_pos IS NULL OR v_cur_pos < v_stage_pos THEN
    UPDATE public.crm_contacts
    SET stage_id = v_stage_id, data_entrada_etapa = now()
    WHERE id = v_contact.id;

    INSERT INTO public.crm_interactions(instancia, phone, tipo, conteudo, autor_nome)
    VALUES (
      NEW.instancia, v_phone, 'agendamento',
      'Agendamento concluído — etapa avançada automaticamente para "Compareceu"',
      'Sistema'
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- PASSO 2 — o trigger (precisa do lock exclusivo; rode SEPARADO)
-- lock_timeout: falha rápido e limpo em vez de deadlock. Se falhar,
-- rode de novo — o lock é instantâneo, o difícil é conseguir a vez.
-- ══════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS crm_advance_concluido ON public.appointments;
CREATE TRIGGER crm_advance_concluido
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.crm_advance_on_appointment_concluido();

RESET lock_timeout;
