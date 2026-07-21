-- ────────────────────────────────────────────────────────────────────────────
-- API RPCs — todas as operações disponíveis via POST com body JSON
-- (em vez de GET com query string, pra não expor parâmetros na URL)
--
-- Uso: POST /rest/v1/rpc/{nome_funcao}
-- Body: { "param1": "valor1", ... }
--
-- v2: nomes de coluna corrigidos pra bater com schema real.
--   procedures.price_particular   (não default_price)
--   procedures.duration_minutes   (não duration_min)
--   saved_contacts.birth_date     (não birthdate)
--   saved_contacts.insurance_card (não card_number)
--   saved_contacts.nome_social    (não social_name)
--   saved_contacts.referral_source (não origem)
--   saved_contacts.guardian_name  (não legal_guardian)
--   appointments.contact_numero / contact_nome / duration_minutes (não patient_*/ends_at)
--   alerts.mensagem / alerts.numero (não message / phone) — sem coluna 'type'
--   kanban_cards.assigned_user_id / assigned_user_name (não assignee_id)
-- ────────────────────────────────────────────────────────────────────────────

-- Drop antigas se vieram da v1 com assinatura diferente (idempotente)
DROP FUNCTION IF EXISTS public.api_pacientes_list(text, text, int, int);
DROP FUNCTION IF EXISTS public.api_paciente_by_phone(text, text);
DROP FUNCTION IF EXISTS public.api_paciente_create(jsonb);
DROP FUNCTION IF EXISTS public.api_paciente_update(uuid, jsonb);
DROP FUNCTION IF EXISTS public.api_paciente_delete(uuid);
DROP FUNCTION IF EXISTS public.api_messages_by_phone(text, text, int, boolean);
DROP FUNCTION IF EXISTS public.api_message_create(jsonb);
DROP FUNCTION IF EXISTS public.api_conversation_close(text, text, text);
DROP FUNCTION IF EXISTS public.api_conversation_status(text, text);
DROP FUNCTION IF EXISTS public.api_professionals_list(text, boolean);
DROP FUNCTION IF EXISTS public.api_procedures_list(text, boolean);
DROP FUNCTION IF EXISTS public.api_insurance_plans_list(text, boolean);
DROP FUNCTION IF EXISTS public.api_procedure_price(uuid, uuid);
DROP FUNCTION IF EXISTS public.api_agendas_list(text);
DROP FUNCTION IF EXISTS public.api_appointments_by_date(text, date);
DROP FUNCTION IF EXISTS public.api_appointments_by_phone(text, text, int);
DROP FUNCTION IF EXISTS public.api_appointments_busy_slots(text, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.api_appointment_create(jsonb);
DROP FUNCTION IF EXISTS public.api_appointment_update_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.api_alert_create(jsonb);
DROP FUNCTION IF EXISTS public.api_alerts_pending(text);
DROP FUNCTION IF EXISTS public.api_alert_resolve(uuid);
DROP FUNCTION IF EXISTS public.api_kanban_columns(text);
DROP FUNCTION IF EXISTS public.api_kanban_cards(text);
DROP FUNCTION IF EXISTS public.api_kanban_card_create(jsonb);

-- ─── PACIENTES (saved_contacts) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_pacientes_list(
  p_instancia text,
  p_search    text DEFAULT NULL,
  p_limit     int DEFAULT 100,
  p_offset    int DEFAULT 0
)
RETURNS SETOF saved_contacts
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM saved_contacts
   WHERE instancia = p_instancia
     AND (p_search IS NULL
          OR nome ILIKE '%' || p_search || '%'
          OR numero ILIKE '%' || p_search || '%'
          OR cpf ILIKE '%' || p_search || '%')
   ORDER BY nome ASC
   LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.api_paciente_by_phone(
  p_instancia text,
  p_numero    text
)
RETURNS SETOF saved_contacts
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM saved_contacts
   WHERE instancia = p_instancia AND numero = p_numero
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.api_paciente_create(p_data jsonb)
RETURNS saved_contacts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row saved_contacts;
BEGIN
  INSERT INTO saved_contacts (
    instancia, nome, numero, birth_date, gender, email, phone_secondary,
    address, cpf, rg, profession, nome_social, marital_status, blood_type,
    weight, height, guardian_name, guardian_phone, insurance_plan_id,
    insurance_card, allergies, chronic_conditions, medications, clinical_notes,
    referral_source, photo, emergency_contact, emergency_phone, notes
  ) VALUES (
    p_data->>'instancia', p_data->>'nome', p_data->>'numero',
    NULLIF(p_data->>'birth_date','')::date, p_data->>'gender', p_data->>'email',
    p_data->>'phone_secondary', p_data->>'address', p_data->>'cpf',
    p_data->>'rg', p_data->>'profession', p_data->>'nome_social',
    p_data->>'marital_status', p_data->>'blood_type',
    NULLIF(p_data->>'weight','')::numeric, NULLIF(p_data->>'height','')::numeric,
    p_data->>'guardian_name', p_data->>'guardian_phone',
    NULLIF(p_data->>'insurance_plan_id','')::uuid, p_data->>'insurance_card',
    p_data->>'allergies', p_data->>'chronic_conditions', p_data->>'medications',
    p_data->>'clinical_notes', p_data->>'referral_source', p_data->>'photo',
    p_data->>'emergency_contact', p_data->>'emergency_phone', p_data->>'notes'
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.api_paciente_update(
  p_id   uuid,
  p_data jsonb
)
RETURNS saved_contacts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row saved_contacts;
BEGIN
  UPDATE saved_contacts SET
    nome              = COALESCE(p_data->>'nome', nome),
    birth_date        = COALESCE(NULLIF(p_data->>'birth_date','')::date, birth_date),
    gender            = COALESCE(p_data->>'gender', gender),
    email             = COALESCE(p_data->>'email', email),
    phone_secondary   = COALESCE(p_data->>'phone_secondary', phone_secondary),
    address           = COALESCE(p_data->>'address', address),
    cpf               = COALESCE(p_data->>'cpf', cpf),
    rg                = COALESCE(p_data->>'rg', rg),
    profession        = COALESCE(p_data->>'profession', profession),
    nome_social       = COALESCE(p_data->>'nome_social', nome_social),
    marital_status    = COALESCE(p_data->>'marital_status', marital_status),
    blood_type        = COALESCE(p_data->>'blood_type', blood_type),
    weight            = COALESCE(NULLIF(p_data->>'weight','')::numeric, weight),
    height            = COALESCE(NULLIF(p_data->>'height','')::numeric, height),
    guardian_name     = COALESCE(p_data->>'guardian_name', guardian_name),
    guardian_phone    = COALESCE(p_data->>'guardian_phone', guardian_phone),
    insurance_plan_id = COALESCE(NULLIF(p_data->>'insurance_plan_id','')::uuid, insurance_plan_id),
    insurance_card    = COALESCE(p_data->>'insurance_card', insurance_card),
    allergies         = COALESCE(p_data->>'allergies', allergies),
    chronic_conditions = COALESCE(p_data->>'chronic_conditions', chronic_conditions),
    medications       = COALESCE(p_data->>'medications', medications),
    clinical_notes    = COALESCE(p_data->>'clinical_notes', clinical_notes),
    referral_source   = COALESCE(p_data->>'referral_source', referral_source),
    photo             = COALESCE(p_data->>'photo', photo),
    emergency_contact = COALESCE(p_data->>'emergency_contact', emergency_contact),
    emergency_phone   = COALESCE(p_data->>'emergency_phone', emergency_phone),
    notes             = COALESCE(p_data->>'notes', notes)
  WHERE id = p_id
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.api_paciente_delete(p_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM saved_contacts WHERE id = p_id;
  SELECT TRUE;
$$;

-- ─── MENSAGENS ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_messages_by_phone(
  p_instancia text,
  p_numero    text,
  p_limit     int DEFAULT 20,
  p_only_client boolean DEFAULT false
)
RETURNS SETOF mensagens_geral
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM mensagens_geral
   WHERE instancia = p_instancia
     AND numero = p_numero
     AND (NOT p_only_client OR LOWER(type) = 'cliente')
   ORDER BY id DESC
   LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.api_message_create(p_data jsonb)
RETURNS mensagens_geral
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row mensagens_geral;
BEGIN
  INSERT INTO mensagens_geral (instancia, numero, mensagem, type, "horaLastMessage")
  VALUES (
    p_data->>'instancia', p_data->>'numero', p_data->>'mensagem',
    COALESCE(p_data->>'type', 'ia'),
    COALESCE(p_data->>'horaLastMessage', to_char(now(), 'DD/MM/YYYY HH24:MI:SS'))
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- ─── CONVERSAS / TICKETS ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_conversation_close(
  p_session_id text,
  p_instancia  text,
  p_reason     text
)
RETURNS conversations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row conversations;
BEGIN
  INSERT INTO conversations (session_id, instancia, reason, closed_at)
  VALUES (p_session_id, p_instancia, p_reason, now())
  RETURNING * INTO v_row;
  BEGIN
    DELETE FROM attendances WHERE numero = p_session_id AND instancia = p_instancia;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.api_conversation_status(
  p_session_id text,
  p_instancia  text
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'is_open', NOT EXISTS (
      SELECT 1 FROM conversations
       WHERE session_id = p_session_id AND instancia = p_instancia
    ),
    'last_close', (
      SELECT row_to_json(c) FROM conversations c
       WHERE c.session_id = p_session_id AND c.instancia = p_instancia
       ORDER BY c.closed_at DESC LIMIT 1
    )
  );
$$;

-- ─── CATÁLOGO ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_professionals_list(
  p_instancia   text,
  p_only_active boolean DEFAULT true
)
RETURNS SETOF professionals
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM professionals
   WHERE instancia = p_instancia
     AND (NOT p_only_active OR active = true)
   ORDER BY name ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_procedures_list(
  p_instancia   text,
  p_only_active boolean DEFAULT true
)
RETURNS SETOF procedures
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM procedures
   WHERE instancia = p_instancia
     AND (NOT p_only_active OR active = true)
   ORDER BY name ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_insurance_plans_list(
  p_instancia   text,
  p_only_active boolean DEFAULT true
)
RETURNS SETOF insurance_plans
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM insurance_plans
   WHERE instancia = p_instancia
     AND (NOT p_only_active OR active = true)
   ORDER BY name ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_procedure_price(
  p_procedure_id      uuid,
  p_insurance_plan_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'price', COALESCE(
      (SELECT price FROM procedure_prices
        WHERE procedure_id = p_procedure_id
          AND insurance_plan_id = p_insurance_plan_id),
      (SELECT price_particular FROM procedures WHERE id = p_procedure_id)
    ),
    'is_default', (
      SELECT NOT EXISTS (
        SELECT 1 FROM procedure_prices
         WHERE procedure_id = p_procedure_id
           AND insurance_plan_id = p_insurance_plan_id
      )
    )
  );
$$;

-- ─── AGENDA ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_agendas_list(p_instancia text)
RETURNS SETOF agendas
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM agendas WHERE instancia = p_instancia ORDER BY name ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_appointments_by_date(
  p_instancia text,
  p_date      date
)
RETURNS SETOF appointments
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM appointments
   WHERE instancia = p_instancia
     AND starts_at >= p_date::timestamptz
     AND starts_at <  (p_date + INTERVAL '1 day')::timestamptz
   ORDER BY starts_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_appointments_by_phone(
  p_instancia text,
  p_phone     text,
  p_limit     int DEFAULT 10
)
RETURNS SETOF appointments
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM appointments
   WHERE instancia = p_instancia AND contact_numero = p_phone
   ORDER BY starts_at DESC
   LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.api_appointments_busy_slots(
  p_instancia       text,
  p_professional_id uuid,
  p_from            timestamptz,
  p_to              timestamptz
)
RETURNS TABLE (starts_at timestamptz, duration_minutes int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT starts_at, duration_minutes FROM appointments
   WHERE instancia = p_instancia
     AND professional_id = p_professional_id
     AND status <> 'cancelado'
     AND starts_at >= p_from
     AND starts_at <  p_to
   ORDER BY starts_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_appointment_create(p_data jsonb)
RETURNS appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row appointments;
BEGIN
  INSERT INTO appointments (
    instancia, agenda_id, professional_id, procedure_id, insurance_plan_id,
    contact_nome, contact_numero, starts_at, duration_minutes, status,
    payment_status, price, notes
  ) VALUES (
    p_data->>'instancia',
    NULLIF(p_data->>'agenda_id','')::uuid,
    NULLIF(p_data->>'professional_id','')::uuid,
    NULLIF(p_data->>'procedure_id','')::uuid,
    NULLIF(p_data->>'insurance_plan_id','')::uuid,
    p_data->>'contact_nome', p_data->>'contact_numero',
    (p_data->>'starts_at')::timestamptz,
    COALESCE((p_data->>'duration_minutes')::int, 30),
    COALESCE(p_data->>'status', 'agendado'),
    COALESCE(p_data->>'payment_status', 'pendente'),
    NULLIF(p_data->>'price','')::numeric,
    p_data->>'notes'
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.api_appointment_update_status(
  p_id             uuid,
  p_status         text,
  p_payment_status text DEFAULT NULL
)
RETURNS appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row appointments;
BEGIN
  UPDATE appointments SET
    status         = p_status,
    payment_status = COALESCE(p_payment_status, payment_status),
    paid_at        = CASE WHEN p_payment_status = 'pago' THEN now() ELSE paid_at END
  WHERE id = p_id
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- ─── ALERTAS ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_alert_create(p_data jsonb)
RETURNS alerts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row alerts;
BEGIN
  INSERT INTO alerts (instancia, numero, mensagem, resolved)
  VALUES (
    p_data->>'instancia', p_data->>'numero', p_data->>'mensagem',
    COALESCE((p_data->>'resolved')::boolean, false)
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.api_alerts_pending(p_instancia text)
RETURNS SETOF alerts
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM alerts
   WHERE instancia = p_instancia AND resolved = false
   ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.api_alert_resolve(p_id uuid)
RETURNS alerts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row alerts;
BEGIN
  UPDATE alerts SET resolved = true WHERE id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- ─── KANBAN ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_kanban_columns(p_instancia text)
RETURNS SETOF kanban_columns
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM kanban_columns
   WHERE instancia = p_instancia ORDER BY position ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_kanban_cards(p_instancia text)
RETURNS SETOF kanban_cards
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM kanban_cards
   WHERE instancia = p_instancia ORDER BY position ASC;
$$;

CREATE OR REPLACE FUNCTION public.api_kanban_card_create(p_data jsonb)
RETURNS kanban_cards
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row kanban_cards;
BEGIN
  INSERT INTO kanban_cards (
    instancia, column_id, title, description, priority, due_date, position,
    assigned_user_id, assigned_user_name
  ) VALUES (
    p_data->>'instancia',
    NULLIF(p_data->>'column_id','')::uuid,
    p_data->>'title', p_data->>'description',
    COALESCE(p_data->>'priority', 'normal'),
    NULLIF(p_data->>'due_date','')::date,
    COALESCE((p_data->>'position')::int, 0),
    NULLIF(p_data->>'assigned_user_id','')::uuid,
    p_data->>'assigned_user_name'
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- ─── GRANTS ─────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION
  public.api_pacientes_list(text, text, int, int),
  public.api_paciente_by_phone(text, text),
  public.api_paciente_create(jsonb),
  public.api_paciente_update(uuid, jsonb),
  public.api_paciente_delete(uuid),
  public.api_messages_by_phone(text, text, int, boolean),
  public.api_message_create(jsonb),
  public.api_conversation_close(text, text, text),
  public.api_conversation_status(text, text),
  public.api_professionals_list(text, boolean),
  public.api_procedures_list(text, boolean),
  public.api_insurance_plans_list(text, boolean),
  public.api_procedure_price(uuid, uuid),
  public.api_agendas_list(text),
  public.api_appointments_by_date(text, date),
  public.api_appointments_by_phone(text, text, int),
  public.api_appointments_busy_slots(text, uuid, timestamptz, timestamptz),
  public.api_appointment_create(jsonb),
  public.api_appointment_update_status(uuid, text, text),
  public.api_alert_create(jsonb),
  public.api_alerts_pending(text),
  public.api_alert_resolve(uuid),
  public.api_kanban_columns(text),
  public.api_kanban_cards(text),
  public.api_kanban_card_create(jsonb)
TO anon, authenticated;
