ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS poll_name             text,
  ADD COLUMN IF NOT EXISTS poll_options           jsonb,
  ADD COLUMN IF NOT EXISTS poll_votes             jsonb,
  ADD COLUMN IF NOT EXISTS poll_selectable_count  integer,
  ADD COLUMN IF NOT EXISTS poll_appointment_id    uuid;

DO $$ BEGIN
  ALTER TABLE public.mensagens_geral
    ADD CONSTRAINT mensagens_geral_poll_appointment_id_fkey
    FOREIGN KEY (poll_appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.apply_poll_vote_to_appointment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_source    jsonb;
  v_item      jsonb;
  v_key       text;
  v_count     integer;
  v_confirmar integer := 0;
  v_cancelar  integer := 0;
BEGIN
  v_source := COALESCE(NEW.poll_votes, '[]'::jsonb) || COALESCE(NEW.poll_options, '[]'::jsonb);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_source)
  LOOP
    v_key := COALESCE(v_item->>'option', v_item->>'optionName', v_item->>'name');
    IF v_key IS NULL THEN CONTINUE; END IF;

    v_count := CASE
      WHEN jsonb_typeof(v_item->'voters') = 'array' THEN jsonb_array_length(v_item->'voters')
      WHEN v_item ? 'votes' THEN COALESCE((v_item->>'votes')::integer, 0)
      ELSE 0
    END;

    IF lower(v_key) = 'confirmar' THEN v_confirmar := v_count;
    ELSIF lower(v_key) = 'cancelar' THEN v_cancelar := v_count;
    END IF;
  END LOOP;

  IF v_confirmar > v_cancelar AND v_confirmar > 0 THEN
    UPDATE public.appointments SET status = 'confirmado'
      WHERE id = NEW.poll_appointment_id AND status <> 'confirmado';

  ELSIF v_cancelar > v_confirmar AND v_cancelar > 0 THEN
    UPDATE public.appointments SET status = 'cancelado'
      WHERE id = NEW.poll_appointment_id AND status <> 'cancelado';

    IF FOUND THEN
      INSERT INTO public.alerts (instancia, numero, mensagem)
      SELECT a.instancia, a.contact_numero,
             'Agendamento cancelado pelo cliente via enquete: ' || a.contact_nome
               || ' — ' || to_char(a.starts_at, 'DD/MM/YYYY HH24:MI')
      FROM public.appointments a
      WHERE a.id = NEW.poll_appointment_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poll_vote_to_appointment ON public.mensagens_geral;
CREATE TRIGGER trg_poll_vote_to_appointment
  AFTER UPDATE OF poll_votes, poll_options ON public.mensagens_geral
  FOR EACH ROW
  WHEN (NEW.poll_appointment_id IS NOT NULL)
  EXECUTE FUNCTION public.apply_poll_vote_to_appointment();
