-- ────────────────────────────────────────────────────────────────────────────
-- Migration: Lembretes automáticos de agendamento
--
-- Permite que cada empresa configure UM lembrete que dispara X horas antes
-- de cada agendamento. Disparo via pg_cron (a cada 5 minutos) que insere em
-- mensagens_geral — o n8n já consome essa tabela e despacha pela Evolution.
--
-- Colunas adicionadas:
--   companies.reminder_enabled        — liga/desliga o lembrete
--   companies.reminder_offset_minutes — quantos minutos antes do agendamento
--   appointments.reminder_sent_at     — marca quando o lembrete foi enfileirado
--                                       (evita reenvio)
--
-- Função:
--   process_appointment_reminders() — varre appointments futuros, monta a
--                                     mensagem e enfileira. Retorna a
--                                     quantidade de lembretes enfileirados.
--
-- Cron:
--   process-appointment-reminders — a cada 5 minutos
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_offset_minutes integer NOT NULL DEFAULT 1440;

COMMENT ON COLUMN public.companies.reminder_offset_minutes IS
  'Minutos antes do agendamento que o lembrete deve disparar. Valores comuns: 30 (30 min), 60 (1h), 1440 (24h), 2880 (48h), 10080 (7 dias).';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS appointments_reminder_lookup_idx
  ON public.appointments (starts_at)
  WHERE reminder_sent_at IS NULL;

-- ─── Função: processa lembretes pendentes ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  cnt integer := 0;
  msg text;
  appt_local timestamptz;
BEGIN
  FOR r IN
    SELECT
      a.id,
      a.contact_numero,
      a.contact_nome,
      a.starts_at,
      a.instancia,
      c.reminder_offset_minutes,
      p.name AS prof_name
    FROM public.appointments a
    JOIN public.companies c ON c.instance = a.instancia
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

    INSERT INTO public.mensagens_geral
      (instancia, numero, mensagem, type, "horaLastMessage", created_at)
    VALUES
      (r.instancia, r.contact_numero, msg, 'text',
       to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), now());

    UPDATE public.appointments
       SET reminder_sent_at = now()
     WHERE id = r.id;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_appointment_reminders() TO service_role;

-- ─── pg_cron: roda a cada 5 minutos ────────────────────────────────────────
-- Idempotente: remove schedule antigo (se houver) antes de criar.
-- Se pg_cron não estiver habilitado, este bloco é ignorado silenciosamente.

DO $$
BEGIN
  -- Tenta habilitar a extensão (pode falhar se não tiver permissão)
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove agendamento antigo (se já existir)
    PERFORM cron.unschedule(jobid)
       FROM cron.job
      WHERE jobname = 'process-appointment-reminders';

    -- Cria o novo agendamento (a cada 5 minutos)
    PERFORM cron.schedule(
      'process-appointment-reminders',
      '*/5 * * * *',
      $cron$SELECT public.process_appointment_reminders();$cron$
    );
  END IF;
END;
$$;
