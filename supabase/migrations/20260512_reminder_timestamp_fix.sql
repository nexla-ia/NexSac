-- ────────────────────────────────────────────────────────────────────────────
-- Migration: corrige horaLastMessage do process_appointment_reminders()
--
-- Antes: inseria só 'HH24:MI' (ex: '09:11') — o frontend tentava new Date('09:11')
--        e dava 'Invalid Date' no display da conversa.
-- Depois: usa 'DD/MM/YYYY HH24:MI:SS' (mesmo formato dos messages da IA),
--        que o parseTimestamp() do CompanyConversations já trata.
-- ────────────────────────────────────────────────────────────────────────────

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

    session_id := r.contact_numero || '@s.whatsapp.net';

    -- 1) Loga no chat interno com timestamp completo (DD/MM/YYYY HH:MM:SS)
    --    pra o parseTimestamp do frontend conseguir parsear
    INSERT INTO public.mensagens_geral
      (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
    VALUES
      (r.instancia, session_id, msg, 'atendente',
       to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'),
       now(), 'whatsapp');

    -- 2) Webhook pro n8n → Evolution → WhatsApp
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

-- Cleanup retroativo: corrige mensagens existentes que ficaram com formato
-- só 'HH:MM' (sem data) — pega created_at e formata corretamente.
UPDATE public.mensagens_geral
   SET "horaLastMessage" = to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS')
 WHERE "horaLastMessage" ~ '^[0-9]{2}:[0-9]{2}$';
