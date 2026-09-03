-- Alerta de cancelamento mais completo: menciona a data/hora da consulta
-- cancelada, não só o nome (o número já aparece separado na tela de
-- Avisos, com botão de copiar/WhatsApp — não precisa repetir no texto).
CREATE OR REPLACE FUNCTION public.apply_poll_vote_to_appointment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  confirm_votes integer;
  cancel_votes  integer;
  appt          record;
BEGIN
  IF NEW.poll_appointment_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.poll_votes IS NOT DISTINCT FROM OLD.poll_votes
     AND NEW.poll_options IS NOT DISTINCT FROM OLD.poll_options THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN lower(btrim(COALESCE(x ->> 'option', x ->> 'optionName', x ->> 'name', ''))) = 'confirmar'
      THEN (CASE WHEN jsonb_typeof(x -> 'voters') = 'array' THEN jsonb_array_length(x -> 'voters')
                 WHEN (x ->> 'votes') ~ '^\d+$' THEN (x ->> 'votes')::int ELSE 0 END)
      ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN lower(btrim(COALESCE(x ->> 'option', x ->> 'optionName', x ->> 'name', ''))) = 'cancelar'
      THEN (CASE WHEN jsonb_typeof(x -> 'voters') = 'array' THEN jsonb_array_length(x -> 'voters')
                 WHEN (x ->> 'votes') ~ '^\d+$' THEN (x ->> 'votes')::int ELSE 0 END)
      ELSE 0 END), 0)
  INTO confirm_votes, cancel_votes
  FROM jsonb_array_elements(
    COALESCE(NEW.poll_votes, '[]'::jsonb) || COALESCE(NEW.poll_options, '[]'::jsonb)
  ) x;

  IF cancel_votes > 0 AND confirm_votes = 0 THEN
    UPDATE public.appointments
       SET status = 'cancelado'
     WHERE id = NEW.poll_appointment_id
       AND status <> 'cancelado'
       AND status IN ('agendado', 'confirmado')
    RETURNING id, instancia, contact_nome, contact_numero, starts_at INTO appt;

    IF FOUND THEN
      INSERT INTO public.alerts (instancia, mensagem, numero)
      VALUES (
        appt.instancia,
        'Cancelamento de consulta: ' || COALESCE(NULLIF(btrim(appt.contact_nome), ''), 'paciente sem nome cadastrado')
          || ' cancelou a consulta marcada para ' || to_char(appt.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || ' às '
          || to_char(appt.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || ' ao responder a enquete de confirmação. '
          || 'Entre em contato para entender o motivo e, se for o caso, reagendar.',
        appt.contact_numero || '@s.whatsapp.net'
      );
    END IF;

  ELSIF confirm_votes > 0 AND cancel_votes = 0 THEN
    UPDATE public.appointments
       SET status = 'confirmado'
     WHERE id = NEW.poll_appointment_id
       AND status <> 'confirmado'
       AND status IN ('agendado', 'cancelado');
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
