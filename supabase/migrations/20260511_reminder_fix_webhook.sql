-- ────────────────────────────────────────────────────────────────────────────
-- Migration: corrige process_appointment_reminders()
--   1. numero com sufixo @s.whatsapp.net (pra agrupar no mesmo ticket
--      do paciente — antes duplicava o card no painel de Conversas)
--   2. Dispara o webhook n8n via pg_net pra mensagem chegar no WhatsApp
--      (antes ficava só no banco como log, sem envio real)
-- ────────────────────────────────────────────────────────────────────────────

-- Habilita pg_net pra fazer HTTP POST de dentro do Postgres
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.process_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r           record;
  cnt         integer := 0;
  msg         text;
  appt_local  timestamptz;
  session_id  text;
  payload     jsonb;
BEGIN
  FOR r IN
    SELECT
      a.id,
      a.contact_numero,
      a.contact_nome,
      a.starts_at,
      a.instancia,
      c.name AS company_name,
      c.api_instancia,
      c.reminder_offset_minutes,
      p.name AS prof_name
    FROM public.appointments a
    JOIN public.companies c   ON c.instance = a.instancia
    LEFT JOIN public.professionals p ON p.id = a.professional_id
    WHERE c.reminder_enabled = true
      AND c.reminder_offset_minutes IS NOT NULL
      AND a.reminder_sent_at IS NULL
      AND a.contact_numero IS NOT NULL
      AND a.contact_numero <> ''
      AND a.status IN ('agendado', 'confirmado')
      AND a.starts_at > now()
      AND a.starts_at - make_interval(mins => c.reminder_offset_minutes) <= now()
  LOOP
    appt_local := r.starts_at AT TIME ZONE 'America/Sao_Paulo';

    msg := format(
      'Olá %s! 👋 Passando pra lembrar da sua consulta no dia %s às %s%s. Até lá! 🩺',
      r.contact_nome,
      to_char(appt_local, 'DD/MM'),
      to_char(appt_local, 'HH24:MI'),
      CASE
        WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
          THEN ' com ' || r.prof_name
        ELSE ''
      END
    );

    -- Session ID no formato Evolution (agrupa no mesmo ticket que as
    -- outras mensagens do paciente)
    session_id := r.contact_numero || '@s.whatsapp.net';

    -- 1) Loga no chat interno (aparece na thread de Conversas do painel)
    INSERT INTO public.mensagens_geral
      (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
    VALUES
      (r.instancia, session_id, msg, 'atendente',
       to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
       now(), 'whatsapp');

    -- 2) Dispara o webhook do n8n pra Evolution mandar no WhatsApp
    payload := jsonb_build_object(
      'message',       msg,
      'session_id',    session_id,
      'phone',         r.contact_numero,
      'instancia',     r.instancia,
      'api_instancia', r.api_instancia,
      'company',       r.company_name,
      'sender_name',   'Sistema (Lembrete automático)',
      'sender_email',  'sistema@clinisac'
    );

    BEGIN
      PERFORM net.http_post(
        url     := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
        body    := payload,
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      -- Não falha o lembrete se o webhook der erro — pelo menos o log
      -- ficou na conversa pra o operador saber que aconteceu
      RAISE NOTICE 'webhook fail for appt %: %', r.id, SQLERRM;
    END;

    UPDATE public.appointments
       SET reminder_sent_at = now()
     WHERE id = r.id;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_appointment_reminders() TO service_role;

-- ─── Corrige a linha duplicada que foi inserida com numero errado ──────────
-- (cleanup do bug anterior — atualiza o numero pra ter o sufixo, assim
-- o painel agrupa com as outras mensagens do mesmo paciente)
UPDATE public.mensagens_geral
   SET numero = numero || '@s.whatsapp.net'
 WHERE numero NOT LIKE '%@%'
   AND numero ~ '^[0-9]+$';
