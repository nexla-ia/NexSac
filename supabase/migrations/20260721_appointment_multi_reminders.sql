-- Múltiplos lembretes por agendamento (em vez de só 1 offset global por empresa).
-- appointments.reminders: [{"offset_minutes":10080,"sent_at":null},{"offset_minutes":1440,"sent_at":null}]
-- Vazio/nulo → mantém o comportamento antigo (1 lembrete via companies.reminder_offset_minutes),
-- garantindo que agendamentos já existentes continuem recebendo lembrete normalmente.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminders jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Combos reutilizáveis de lembrete ("padrão"), ex.: "7 dias e 1 dia antes" → [10080, 1440]
CREATE TABLE IF NOT EXISTS public.reminder_presets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia  text NOT NULL,
  name       text NOT NULL,
  offsets    jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reminder_presets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_reminder_presets"
    ON public.reminder_presets FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Processa lembretes pendentes: agendamentos com reminders[] próprios usam esses
-- offsets (múltiplos avisos); os demais caem no fallback antigo (1 offset da empresa).
-- pg_try_advisory_xact_lock evita disparo duplicado se o cron rodar em paralelo
-- (dois jobs, ou um job "atrasado" ainda rodando quando o próximo dispara).
CREATE OR REPLACE FUNCTION public.process_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r              record;
  rem            jsonb;
  recip          jsonb;
  cnt            integer := 0;
  msg            text;
  group_msg      text;
  recip_msg      text;
  appt_local     timestamptz;
  session_id     text;
  payload        jsonb;
  group_payload  jsonb;
  recip_payload  jsonb;
  recip_nome     text;
  recip_numero   text;
  recip_idgrupo  text;
  offset_min     integer;
  already_sent   text;
  new_reminders  jsonb;
  any_due        boolean;
BEGIN
  IF NOT pg_try_advisory_xact_lock(778899) THEN
    RETURN 0;
  END IF;

  -- ── Caminho novo: agendamentos com lista própria de lembretes (múltiplos avisos) ──
  FOR r IN
    SELECT
      a.id, a.contact_numero, a.contact_nome, a.starts_at, a.instancia, a.reminders,
      COALESCE(a.extra_recipients, '[]'::jsonb) AS extra_recipients,
      c.name AS company_name, c.api_instancia, c.reminder_group_id,
      p.name AS prof_name
    FROM public.appointments a
    JOIN public.companies c ON c.instance = a.instancia
    LEFT JOIN public.professionals p ON p.id = a.professional_id
    WHERE jsonb_array_length(a.reminders) > 0
      AND a.contact_numero IS NOT NULL
      AND a.contact_numero <> ''
      AND a.status IN ('agendado', 'confirmado')
      AND a.starts_at > now()
  LOOP
    appt_local := r.starts_at AT TIME ZONE 'America/Sao_Paulo';
    new_reminders := '[]'::jsonb;
    any_due := false;

    FOR rem IN SELECT * FROM jsonb_array_elements(r.reminders)
    LOOP
      offset_min   := (rem->>'offset_minutes')::integer;
      already_sent := rem->>'sent_at';

      IF already_sent IS NULL
         AND offset_min IS NOT NULL
         AND r.starts_at - make_interval(mins => offset_min) <= now()
      THEN
        any_due := true;
        msg := format(
          'Olá %s! 👋 Passando pra lembrar da sua consulta no dia %s às %s%s. Até lá! 🩺',
          r.contact_nome, to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
          CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
            THEN ' com ' || r.prof_name ELSE '' END
        );
        session_id := r.contact_numero || '@s.whatsapp.net';

        INSERT INTO public.mensagens_geral
          (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
        VALUES
          (r.instancia, session_id, msg, 'atendente',
           to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');

        payload := jsonb_build_object(
          'message', msg, 'session_id', session_id, 'phone', r.contact_numero,
          'instancia', r.instancia, 'api_instancia', r.api_instancia,
          'company', r.company_name,
          'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac'
        );
        BEGIN
          PERFORM net.http_post(
            url := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
            body := payload, headers := '{"Content-Type": "application/json"}'::jsonb
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'webhook multi-lembrete fail for appt %: %', r.id, SQLERRM;
        END;

        -- Grupo global + destinatários extras, mesma mensagem do aviso individual
        IF r.reminder_group_id IS NOT NULL AND r.reminder_group_id <> '' THEN
          group_msg := format(
            '📅 Lembrete: *%s* tem consulta no dia *%s* às *%s*%s. 🩺',
            r.contact_nome, to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
            CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
              THEN ' com *' || r.prof_name || '*' ELSE '' END
          );
          INSERT INTO public.mensagens_geral
            (instancia, numero, idgrupo, mensagem, type, "horaLastMessage", created_at, aplicativo)
          VALUES
            (r.instancia, r.instancia, r.reminder_group_id, group_msg, 'atendente',
             to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');
          group_payload := jsonb_build_object(
            'message', group_msg, 'mensagem', group_msg,
            'session_id', r.reminder_group_id, 'number', r.reminder_group_id,
            'idgrupo', r.reminder_group_id,
            'instancia', r.instancia, 'api_instancia', r.api_instancia,
            'company', r.company_name,
            'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac',
            'ai_enabled', false
          );
          BEGIN
            PERFORM net.http_post(
              url := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
              body := group_payload, headers := '{"Content-Type": "application/json"}'::jsonb
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'webhook multi-lembrete grupo fail for appt %: %', r.id, SQLERRM;
          END;
        END IF;

        FOR recip IN SELECT * FROM jsonb_array_elements(r.extra_recipients)
        LOOP
          recip_nome    := recip->>'nome';
          recip_numero  := recip->>'numero';
          recip_idgrupo := recip->>'idgrupo';

          IF recip_idgrupo IS NOT NULL AND recip_idgrupo <> '' THEN
            recip_msg := format(
              '📅 Lembrete: *%s* tem consulta no dia *%s* às *%s*%s. 🩺',
              r.contact_nome, to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
              CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
                THEN ' com *' || r.prof_name || '*' ELSE '' END
            );
            INSERT INTO public.mensagens_geral
              (instancia, numero, idgrupo, mensagem, type, "horaLastMessage", created_at, aplicativo)
            VALUES
              (r.instancia, r.instancia, recip_idgrupo, recip_msg, 'atendente',
               to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');
            recip_payload := jsonb_build_object(
              'message', recip_msg, 'mensagem', recip_msg,
              'session_id', recip_idgrupo, 'number', recip_idgrupo, 'idgrupo', recip_idgrupo,
              'instancia', r.instancia, 'api_instancia', r.api_instancia,
              'company', r.company_name,
              'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac',
              'ai_enabled', false
            );
          ELSIF recip_numero IS NOT NULL AND recip_numero <> '' THEN
            recip_msg := format(
              'Olá %s! 👋 Passando pra lembrar da consulta de %s no dia %s às %s%s. 🩺',
              COALESCE(recip_nome, 'tudo bem'), r.contact_nome,
              to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
              CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
                THEN ' com ' || r.prof_name ELSE '' END
            );
            session_id := recip_numero || '@s.whatsapp.net';
            INSERT INTO public.mensagens_geral
              (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
            VALUES
              (r.instancia, session_id, recip_msg, 'atendente',
               to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');
            recip_payload := jsonb_build_object(
              'message', recip_msg, 'session_id', session_id, 'phone', recip_numero,
              'instancia', r.instancia, 'api_instancia', r.api_instancia,
              'company', r.company_name,
              'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac'
            );
          ELSE
            CONTINUE;
          END IF;

          BEGIN
            PERFORM net.http_post(
              url := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
              body := recip_payload, headers := '{"Content-Type": "application/json"}'::jsonb
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'webhook multi-lembrete recip fail for appt %: %', r.id, SQLERRM;
          END;
        END LOOP;

        new_reminders := new_reminders || jsonb_build_object(
          'offset_minutes', offset_min,
          'sent_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        );
        cnt := cnt + 1;
      ELSE
        new_reminders := new_reminders || rem;
      END IF;
    END LOOP;

    IF any_due THEN
      UPDATE public.appointments SET reminders = new_reminders WHERE id = r.id;
    END IF;
  END LOOP;

  -- ── Caminho antigo: agendamentos sem reminders[] próprios usam o offset único da empresa ──
  FOR r IN
    SELECT
      a.id, a.contact_numero, a.contact_nome, a.starts_at, a.instancia,
      COALESCE(a.extra_recipients, '[]'::jsonb) AS extra_recipients,
      c.name AS company_name, c.api_instancia, c.reminder_offset_minutes, c.reminder_group_id,
      p.name AS prof_name
    FROM public.appointments a
    JOIN public.companies c ON c.instance = a.instancia
    LEFT JOIN public.professionals p ON p.id = a.professional_id
    WHERE c.reminder_enabled = true
      AND c.reminder_offset_minutes IS NOT NULL
      AND jsonb_array_length(a.reminders) = 0
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
      r.contact_nome, to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
      CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
        THEN ' com ' || r.prof_name ELSE '' END
    );

    session_id := r.contact_numero || '@s.whatsapp.net';

    INSERT INTO public.mensagens_geral
      (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
    VALUES
      (r.instancia, session_id, msg, 'atendente',
       to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');

    payload := jsonb_build_object(
      'message', msg, 'session_id', session_id, 'phone', r.contact_numero,
      'instancia', r.instancia, 'api_instancia', r.api_instancia,
      'company', r.company_name,
      'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac'
    );
    BEGIN
      PERFORM net.http_post(
        url := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
        body := payload, headers := '{"Content-Type": "application/json"}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'webhook individual fail for appt %: %', r.id, SQLERRM;
    END;

    IF r.reminder_group_id IS NOT NULL AND r.reminder_group_id <> '' THEN
      group_msg := format(
        '📅 Lembrete: *%s* tem consulta no dia *%s* às *%s*%s. 🩺',
        r.contact_nome, to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
        CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
          THEN ' com *' || r.prof_name || '*' ELSE '' END
      );
      INSERT INTO public.mensagens_geral
        (instancia, numero, idgrupo, mensagem, type, "horaLastMessage", created_at, aplicativo)
      VALUES
        (r.instancia, r.instancia, r.reminder_group_id, group_msg, 'atendente',
         to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');
      group_payload := jsonb_build_object(
        'message', group_msg, 'mensagem', group_msg,
        'session_id', r.reminder_group_id, 'number', r.reminder_group_id,
        'idgrupo', r.reminder_group_id,
        'instancia', r.instancia, 'api_instancia', r.api_instancia,
        'company', r.company_name,
        'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac',
        'ai_enabled', false
      );
      BEGIN
        PERFORM net.http_post(
          url := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
          body := group_payload, headers := '{"Content-Type": "application/json"}'::jsonb
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'webhook grupo global fail for appt %: %', r.id, SQLERRM;
      END;
    END IF;

    FOR recip IN SELECT * FROM jsonb_array_elements(r.extra_recipients)
    LOOP
      recip_nome    := recip->>'nome';
      recip_numero  := recip->>'numero';
      recip_idgrupo := recip->>'idgrupo';

      IF recip_idgrupo IS NOT NULL AND recip_idgrupo <> '' THEN
        recip_msg := format(
          '📅 Lembrete: *%s* tem consulta no dia *%s* às *%s*%s. 🩺',
          r.contact_nome, to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
          CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
            THEN ' com *' || r.prof_name || '*' ELSE '' END
        );
        INSERT INTO public.mensagens_geral
          (instancia, numero, idgrupo, mensagem, type, "horaLastMessage", created_at, aplicativo)
        VALUES
          (r.instancia, r.instancia, recip_idgrupo, recip_msg, 'atendente',
           to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');
        recip_payload := jsonb_build_object(
          'message', recip_msg, 'mensagem', recip_msg,
          'session_id', recip_idgrupo, 'number', recip_idgrupo, 'idgrupo', recip_idgrupo,
          'instancia', r.instancia, 'api_instancia', r.api_instancia,
          'company', r.company_name,
          'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac',
          'ai_enabled', false
        );
      ELSIF recip_numero IS NOT NULL AND recip_numero <> '' THEN
        recip_msg := format(
          'Olá %s! 👋 Passando pra lembrar da consulta de %s no dia %s às %s%s. 🩺',
          COALESCE(recip_nome, 'tudo bem'), r.contact_nome,
          to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
          CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
            THEN ' com ' || r.prof_name ELSE '' END
        );
        session_id := recip_numero || '@s.whatsapp.net';
        INSERT INTO public.mensagens_geral
          (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
        VALUES
          (r.instancia, session_id, recip_msg, 'atendente',
           to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now(), 'whatsapp');
        recip_payload := jsonb_build_object(
          'message', recip_msg, 'session_id', session_id, 'phone', recip_numero,
          'instancia', r.instancia, 'api_instancia', r.api_instancia,
          'company', r.company_name,
          'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac'
        );
      ELSE
        CONTINUE;
      END IF;

      BEGIN
        PERFORM net.http_post(
          url := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
          body := recip_payload, headers := '{"Content-Type": "application/json"}'::jsonb
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'webhook recip extra fail for appt %: %', r.id, SQLERRM;
      END;
    END LOOP;

    UPDATE public.appointments SET reminder_sent_at = now() WHERE id = r.id;
    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_appointment_reminders() TO service_role;
