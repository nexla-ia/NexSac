-- ============================================================
-- COLE ESTE ARQUIVO INTEIRO NO SQL EDITOR DO SUPABASE E RODE.
-- (Só as migrations novas de hoje — seguro rodar num banco que já existe.)
-- NAO cole o schema_consolidado.sql, esse aqui e so pra bancos novos/vazios.
-- ============================================================

-- ── 20260721_mensagens_quoted.sql ─────────────────────────────────────────────────────────

-- Suporte a responder/citar mensagem (estilo WhatsApp).
-- quoted_id_mensagem: id_mensagem (WhatsApp) da mensagem citada, usado ao ENVIAR uma resposta.
-- quoted_text: trecho da mensagem citada, usado quando o CLIENTE responde algo (contextInfo do n8n).
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS quoted_id_mensagem text;
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS quoted_text text;

CREATE OR REPLACE FUNCTION public.send_mensagem_geral(
  p_instancia text,
  p_numero    text,
  p_mensagem  text,
  p_type      text,
  p_hora      text,
  p_base64    text DEFAULT NULL,
  p_nome      text DEFAULT NULL,
  p_quoted    text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.mensagens_geral
    (instancia, numero, mensagem, type, "horaLastMessage", base64, nome, quoted_id_mensagem, created_at)
  VALUES
    (p_instancia, p_numero, p_mensagem, p_type, p_hora, p_base64, p_nome, p_quoted, NOW());
END;
$$;

-- ── 20260721_close_reasons.sql ─────────────────────────────────────────────────────────

-- Motivos de encerramento de conversa editáveis por empresa (em vez de hardcoded no front).
CREATE TABLE IF NOT EXISTS public.conversation_close_reasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia  text NOT NULL,
  value      text NOT NULL,
  label      text NOT NULL,
  color      text DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now(),
  UNIQUE (instancia, value)
);

ALTER TABLE public.conversation_close_reasons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_conversation_close_reasons"
    ON public.conversation_close_reasons FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 20260721_appointment_multi_reminders.sql ─────────────────────────────────────────────────────────

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

-- ── 20260721_agenda_blocks.sql ─────────────────────────────────────────────────────────

-- Bloqueio de horário na agenda (ausência/almoço/férias). O intervalo bloqueado
-- aparece listrado na grade e não aceita agendamento (clique abre desbloquear,
-- drag-and-drop de agendamento existente é recusado).
CREATE TABLE IF NOT EXISTS public.agenda_blocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia        text NOT NULL,
  agenda_id        uuid NOT NULL REFERENCES public.agendas(id) ON DELETE CASCADE,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  reason           text,
  created_by_email text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_blocks_lookup_idx
  ON public.agenda_blocks (agenda_id, starts_at, ends_at);

ALTER TABLE public.agenda_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_agenda_blocks"
    ON public.agenda_blocks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 20260721_attendances_awaiting_client.sql ─────────────────────────────────────────────────────────

-- Status manual "aguardando paciente": atendente marca que já respondeu e está
-- esperando o cliente responder de volta. Some sozinho quando o cliente manda
-- mensagem nova (limpo no front ao receber o realtime).
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS awaiting_client boolean NOT NULL DEFAULT false;

-- ── 20260721_group_custom_names.sql ─────────────────────────────────────────────────────────

-- Nome customizado por grupo (renomear na plataforma sem mudar o nome real do WhatsApp).
CREATE TABLE IF NOT EXISTS public.group_custom_names (
  instancia   text NOT NULL,
  idgrupo     text NOT NULL,
  custom_name text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (instancia, idgrupo)
);

ALTER TABLE public.group_custom_names ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_group_custom_names"
    ON public.group_custom_names FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 20260721_mensagens_transcript_summary.sql ─────────────────────────────────────────────────────────

-- Transcrição de áudio e resumo de PDF, gerados sob demanda (botão na bolha) e
-- persistidos aqui pra não precisar reprocessar toda vez que a conversa recarrega.
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS summary text;

