-- ────────────────────────────────────────────────────────────────────────────
-- Migration: permite enviar lembrete de agendamento para um grupo WhatsApp
--
-- companies.reminder_group_id — idgrupo do grupo (ex: 120363@g.us)
--                               NULL = não envia pro grupo
--
-- A função process_appointment_reminders() é atualizada para, quando
-- reminder_group_id estiver preenchido, disparar TAMBÉM uma mensagem pro
-- grupo com os dados do agendamento.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reminder_group_id text;

COMMENT ON COLUMN public.companies.reminder_group_id IS
  'idgrupo do grupo WhatsApp (ex: 120363123456@g.us) para receber cópia do lembrete. NULL = só envia pro contato individual.';

-- ─── Função atualizada ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r             record;
  cnt           integer := 0;
  msg           text;
  group_msg     text;
  appt_local    timestamptz;
  session_id    text;
  payload       jsonb;
  group_payload jsonb;
BEGIN
  FOR r IN
    SELECT
      a.id,
      a.contact_numero,
      a.contact_nome,
      a.starts_at,
      a.instancia,
      c.name            AS company_name,
      c.api_instancia,
      c.reminder_offset_minutes,
      c.reminder_group_id,
      p.name            AS prof_name
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

    -- Mensagem individual (para o paciente)
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

    -- 1) Loga no chat interno do paciente
    INSERT INTO public.mensagens_geral
      (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
    VALUES
      (r.instancia, session_id, msg, 'atendente',
       to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
       now(), 'whatsapp');

    -- 2) Dispara webhook individual
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
      RAISE NOTICE 'webhook individual fail for appt %: %', r.id, SQLERRM;
    END;

    -- 3) Envia para o grupo (se configurado)
    IF r.reminder_group_id IS NOT NULL AND r.reminder_group_id <> '' THEN
      group_msg := format(
        '📅 Lembrete: *%s* tem consulta no dia *%s* às *%s*%s. 🩺',
        r.contact_nome,
        to_char(appt_local, 'DD/MM'),
        to_char(appt_local, 'HH24:MI'),
        CASE
          WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
            THEN ' com *' || r.prof_name || '*'
          ELSE ''
        END
      );

      -- Loga no chat do grupo
      INSERT INTO public.mensagens_geral
        (instancia, numero, idgrupo, mensagem, type, "horaLastMessage", created_at, aplicativo)
      VALUES
        (r.instancia, r.instancia, r.reminder_group_id, group_msg, 'atendente',
         to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
         now(), 'whatsapp');

      -- Dispara webhook para o grupo
      group_payload := jsonb_build_object(
        'message',       group_msg,
        'mensagem',      group_msg,
        'session_id',    r.reminder_group_id,
        'number',        r.reminder_group_id,
        'idgrupo',       r.reminder_group_id,
        'instancia',     r.instancia,
        'api_instancia', r.api_instancia,
        'company',       r.company_name,
        'sender_name',   'Sistema (Lembrete automático)',
        'sender_email',  'sistema@clinisac',
        'ai_enabled',    false
      );

      BEGIN
        PERFORM net.http_post(
          url     := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
          body    := group_payload,
          headers := '{"Content-Type": "application/json"}'::jsonb
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'webhook grupo fail for appt %: %', r.id, SQLERRM;
      END;
    END IF;

    UPDATE public.appointments
       SET reminder_sent_at = now()
     WHERE id = r.id;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_appointment_reminders() TO service_role;
