-- ==============================================================
-- CLINISAC — Schema Consolidado
-- Gerado em: 2026-06-23
-- Para usar: Cole tudo no Supabase SQL Editor de um projeto novo
-- ==============================================================


-- ── 00000000000000_base_schema.sql ─────────────────────────────────────────────────────────

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public; -- already exists in Supabase


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instancia text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#2563EB'::text,
    working_days integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    start_time time without time zone DEFAULT '08:00:00'::time without time zone,
    end_time time without time zone DEFAULT '18:00:00'::time without time zone,
    slot_minutes integer DEFAULT 30,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    professional_id uuid
);


--
-- Name: api_agendas_list(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_agendas_list(p_instancia text) RETURNS SETOF public.agendas
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM agendas WHERE instancia = p_instancia ORDER BY name ASC;
$$;


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instancia text NOT NULL,
    mensagem text NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    numero text,
    forwarded_to_user_id uuid,
    forwarded_to_name text,
    forwarded_by_name text
);


--
-- Name: api_alert_create(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_alert_create(p_data jsonb) RETURNS public.alerts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_alert_resolve(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_alert_resolve(p_id uuid) RETURNS public.alerts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row alerts;
BEGIN
  UPDATE alerts SET resolved = true WHERE id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;


--
-- Name: api_alerts_pending(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_alerts_pending(p_instancia text) RETURNS SETOF public.alerts
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM alerts
   WHERE instancia = p_instancia AND resolved = false
   ORDER BY created_at DESC;
$$;


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agenda_id uuid,
    instancia text NOT NULL,
    contact_numero text,
    contact_nome text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 30,
    status text DEFAULT 'agendado'::text,
    notes text,
    created_by_email text,
    created_at timestamp with time zone DEFAULT now(),
    professional_id uuid,
    procedure_id uuid,
    insurance_plan_id uuid,
    price numeric(10,2),
    payment_status text DEFAULT 'pendente'::text,
    paid_at timestamp with time zone
);


--
-- Name: api_appointment_create(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_appointment_create(p_data jsonb) RETURNS public.appointments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_appointment_update_status(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_appointment_update_status(p_id uuid, p_status text, p_payment_status text DEFAULT NULL::text) RETURNS public.appointments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_appointments_busy_slots(text, uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_appointments_busy_slots(p_instancia text, p_professional_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) RETURNS TABLE(starts_at timestamp with time zone, duration_minutes integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT starts_at, duration_minutes FROM appointments
   WHERE instancia = p_instancia
     AND professional_id = p_professional_id
     AND status <> 'cancelado'
     AND starts_at >= p_from
     AND starts_at <  p_to
   ORDER BY starts_at ASC;
$$;


--
-- Name: api_appointments_by_date(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_appointments_by_date(p_instancia text, p_date date) RETURNS SETOF public.appointments
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM appointments
   WHERE instancia = p_instancia
     AND starts_at >= p_date::timestamptz
     AND starts_at <  (p_date + INTERVAL '1 day')::timestamptz
   ORDER BY starts_at ASC;
$$;


--
-- Name: api_appointments_by_phone(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_appointments_by_phone(p_instancia text, p_phone text, p_limit integer DEFAULT 10) RETURNS SETOF public.appointments
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM appointments
   WHERE instancia = p_instancia AND contact_numero = p_phone
   ORDER BY starts_at DESC
   LIMIT p_limit;
$$;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    instancia text NOT NULL,
    reason text,
    closed_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_conversation_close(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_conversation_close(p_session_id text, p_instancia text, p_reason text) RETURNS public.conversations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_conversation_status(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_conversation_status(p_session_id text, p_instancia text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: insurance_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instancia text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_insurance_plans_list(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_insurance_plans_list(p_instancia text, p_only_active boolean DEFAULT true) RETURNS SETOF public.insurance_plans
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM insurance_plans
   WHERE instancia = p_instancia
     AND (NOT p_only_active OR active = true)
   ORDER BY name ASC;
$$;


--
-- Name: kanban_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanban_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    column_id uuid,
    instancia text NOT NULL,
    title text NOT NULL,
    description text,
    assigned_user_id uuid,
    assigned_user_name text,
    due_date date,
    priority text DEFAULT 'normal'::text,
    "position" double precision DEFAULT 0,
    created_by_email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_kanban_card_create(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_kanban_card_create(p_data jsonb) RETURNS public.kanban_cards
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_kanban_cards(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_kanban_cards(p_instancia text) RETURNS SETOF public.kanban_cards
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM kanban_cards
   WHERE instancia = p_instancia ORDER BY position ASC;
$$;


--
-- Name: kanban_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanban_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instancia text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text,
    "position" double precision DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_kanban_columns(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_kanban_columns(p_instancia text) RETURNS SETOF public.kanban_columns
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM kanban_columns
   WHERE instancia = p_instancia ORDER BY position ASC;
$$;


--
-- Name: mensagens_geral; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens_geral (
    id bigint NOT NULL,
    nome text,
    instancia text,
    numero text,
    mensagem text,
    "horaLastMessage" text,
    base64 text,
    type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id_mensagem text,
    aplicativo text DEFAULT 'whatsapp'::text,
    recipient_id text
);


--
-- Name: api_message_create(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_message_create(p_data jsonb) RETURNS public.mensagens_geral
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_messages_by_phone(text, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_messages_by_phone(p_instancia text, p_numero text, p_limit integer DEFAULT 20, p_only_client boolean DEFAULT false) RETURNS SETOF public.mensagens_geral
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM mensagens_geral
   WHERE instancia = p_instancia
     AND numero = p_numero
     AND (NOT p_only_client OR LOWER(type) = 'cliente')
   ORDER BY id DESC
   LIMIT p_limit;
$$;


--
-- Name: saved_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    instancia text NOT NULL,
    nome text NOT NULL,
    notes text,
    created_by_email text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    birth_date date,
    cpf text,
    email text,
    address text,
    insurance_plan_id uuid,
    insurance_card text,
    photo text,
    phone_secondary text,
    gender text,
    profession text,
    rg text,
    emergency_contact text,
    emergency_phone text,
    allergies text,
    chronic_conditions text,
    medications text,
    clinical_notes text,
    nome_social text,
    marital_status text,
    blood_type text,
    weight numeric(5,2),
    height numeric(4,2),
    referral_source text,
    guardian_name text,
    guardian_phone text,
    ad_source text,
    ad_title text,
    ad_body text,
    ad_thumbnail_url text,
    ad_media_url text,
    ad_click_id text,
    ad_captured_at timestamp with time zone,
    ad_platform text,
    ad_source_type text,
    ad_entry_point text,
    ad_source_url text
);


--
-- Name: api_paciente_by_phone(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_paciente_by_phone(p_instancia text, p_numero text) RETURNS SETOF public.saved_contacts
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM saved_contacts
   WHERE instancia = p_instancia AND numero = p_numero
   LIMIT 1;
$$;


--
-- Name: api_paciente_create(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_paciente_create(p_data jsonb) RETURNS public.saved_contacts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_paciente_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_paciente_delete(p_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM saved_contacts WHERE id = p_id;
  SELECT TRUE;
$$;


--
-- Name: api_paciente_update(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_paciente_update(p_id uuid, p_data jsonb) RETURNS public.saved_contacts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: api_pacientes_list(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_pacientes_list(p_instancia text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS SETOF public.saved_contacts
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM saved_contacts
   WHERE instancia = p_instancia
     AND (p_search IS NULL
          OR nome ILIKE '%' || p_search || '%'
          OR numero ILIKE '%' || p_search || '%'
          OR cpf ILIKE '%' || p_search || '%')
   ORDER BY nome ASC
   LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: api_procedure_price(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_procedure_price(p_procedure_id uuid, p_insurance_plan_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: procedures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instancia text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'consulta'::text,
    duration_minutes integer DEFAULT 30,
    price_particular numeric(10,2) DEFAULT 0,
    professional_id uuid,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_procedures_list(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_procedures_list(p_instancia text, p_only_active boolean DEFAULT true) RETURNS SETOF public.procedures
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM procedures
   WHERE instancia = p_instancia
     AND (NOT p_only_active OR active = true)
   ORDER BY name ASC;
$$;


--
-- Name: professionals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professionals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instancia text NOT NULL,
    name text NOT NULL,
    specialty text,
    registration text,
    color text DEFAULT '#2563EB'::text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    working_days integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    start_time time without time zone DEFAULT '08:00:00'::time without time zone,
    end_time time without time zone DEFAULT '18:00:00'::time without time zone,
    break_start time without time zone,
    break_end time without time zone
);


--
-- Name: api_professionals_list(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_professionals_list(p_instancia text, p_only_active boolean DEFAULT true) RETURNS SETOF public.professionals
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM professionals
   WHERE instancia = p_instancia
     AND (NOT p_only_active OR active = true)
   ORDER BY name ASC;
$$;


--
-- Name: auto_close_inactive_conversations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_close_inactive_conversations() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
declare
  comp record;
  sess record;
  last_msg timestamptz;
begin
  for comp in
    select instance, history_table
    from public.companies
    where history_table is not null and active = true
  loop
    for sess in execute format(
      'select distinct session_id from public.%I
       where session_id not in (
         select session_id from public.conversations where instancia = $1
       )',
      comp.history_table
    ) using comp.instance
    loop
      execute format(
        'select max(data) from public.%I where session_id = $1',
        comp.history_table
      ) into last_msg using sess.session_id;

      if last_msg is not null and last_msg < now() - interval '1 hour' then
        insert into public.conversations (session_id, instancia, reason, closed_at)
        values (sess.session_id, comp.instance, 'encerrado_auto', now())
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$_$;


--
-- Name: create_user(text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_user(p_name text, p_email text, p_password text, p_role text, p_company_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare new_id uuid;
begin
  insert into public.users (name, email, password_hash, role, company_id)
  values (p_name, p_email, crypt(p_password, gen_salt('bf')), p_role, p_company_id)
  returning id into new_id;
  return new_id;
end;
$$;


--
-- Name: delete_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM users WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Usuário não encontrado');
  END IF;

  -- Limpa vínculos best-effort (ignora se a tabela/coluna não existir ainda)
  BEGIN
    DELETE FROM sector_members WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE kanban_cards SET assignee_id = NULL WHERE assignee_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE attendances SET user_id = NULL WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE alerts SET forwarded_to = NULL WHERE forwarded_to = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object('ok', true, 'email', v_user_email);
END;
$$;


--
-- Name: ensure_table_setup(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_table_setup(p_table text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  -- Habilita RLS
  execute format('alter table public.%I enable row level security', p_table);

  -- Cria política de leitura (idempotente)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = p_table and policyname = 'allow_read'
  ) then
    execute format(
      'create policy allow_read on public.%I for select using (true)', p_table
    );
  end if;

  -- Adiciona à publicação Realtime (ignora erro se já existir)
  begin
    execute format('alter publication supabase_realtime add table public.%I', p_table);
  exception when others then null;
  end;

  -- Cria trigger para reabrir sessão quando chegar nova mensagem
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_reopen_session'
    and tgrelid = (quote_ident(p_table))::regclass
  ) then
    execute format(
      'create trigger trg_reopen_session after insert on public.%I
       for each row execute function reopen_session_on_new_message()', p_table
    );
  end if;
end;
$$;


--
-- Name: insert_alert(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_alert(instancia text, mensagem text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare new_id uuid;
begin
  insert into public.alerts (instancia, mensagem)
  values (instancia, mensagem)
  returning id into new_id;
  return new_id;
end;
$$;


--
-- Name: insert_alert(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_alert(p_instance text, p_type text, p_contact_name text, p_phone text, p_message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from companies where instance = p_instance;
  if v_company_id is null then
    raise exception 'Instância não encontrada: %', p_instance;
  end if;

  insert into alerts (company_id, type, contact_name, phone, message)
  values (v_company_id, p_type, p_contact_name, p_phone, p_message);
end;
$$;


--
-- Name: login_user(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.login_user(p_email text, p_password text) RETURNS TABLE(id uuid, name text, email text, role text, active boolean, company_id uuid)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select id, name, email, role, active, company_id
  from public.users
  where email = p_email
    and password_hash = crypt(p_password, password_hash)
    and active = true;
$$;


--
-- Name: mark_company_paid(uuid, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_company_paid(p_company_id uuid, p_amount numeric DEFAULT NULL::numeric, p_payment_method text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company record;
  v_amount numeric;
  v_due date;
  v_next date;
BEGIN
  SELECT * INTO v_company FROM companies WHERE id = p_company_id;
  IF v_company IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Empresa não encontrada');
  END IF;

  v_amount := COALESCE(p_amount, v_company.billing_amount);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'Valor da mensalidade não definido');
  END IF;

  -- Vencimento sendo pago: usa next_due_date se setado, senão calcula deste mês
  v_due := COALESCE(
    v_company.next_due_date,
    date_trunc('month', CURRENT_DATE)::date + (COALESCE(v_company.billing_day, 5) - 1)
  );

  -- Próximo vencimento: 1 mês depois
  v_next := (v_due + INTERVAL '1 month')::date;

  -- Insere invoice paga
  INSERT INTO invoices (company_id, amount, due_date, paid_at, payment_method, notes)
  VALUES (p_company_id, v_amount, v_due, now(), p_payment_method, p_notes);

  -- Avança next_due_date e desbloqueia (caso estivesse bloqueado)
  UPDATE companies
     SET next_due_date = v_next,
         billing_blocked = false
   WHERE id = p_company_id;

  RETURN json_build_object('ok', true, 'next_due_date', v_next);
END;
$$;


--
-- Name: n8n_clear_mensagens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.n8n_clear_mensagens() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.mensagens;

  TRUNCATE TABLE public.mensagens RESTART IDENTITY CASCADE;

  RETURN json_build_object(
    'ok', true,
    'deleted_before', v_count
  );
END;
$$;


--
-- Name: reopen_session_on_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reopen_session_on_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v_session_id text;
begin
  IF TG_TABLE_NAME = 'mensagens_geral' THEN
    v_session_id := NEW.numero;
  ELSE
    v_session_id := NEW.session_id;
  END IF;
  if v_session_id is not null then
    delete from public.conversations where session_id = v_session_id;
  end if;
  return NEW;
end; $$;


--
-- Name: send_mensagem_geral(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_mensagem_geral(p_instancia text, p_numero text, p_mensagem text, p_type text, p_hora text, p_base64 text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.mensagens_geral
    (instancia, numero, mensagem, type, "horaLastMessage", base64, created_at)
  VALUES
    (p_instancia, p_numero, p_mensagem, p_type, p_hora, p_base64, now());
END;
$$;


--
-- Name: support_bump_ticket(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_bump_ticket() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE support_tickets
     SET last_message_at = NEW.created_at,
         last_sender     = NEW.sender_type,
         status          = CASE
           WHEN NEW.sender_type = 'adm'     AND status = 'open'    THEN 'answered'
           WHEN NEW.sender_type = 'company' AND status = 'closed'  THEN 'answered'
           WHEN NEW.sender_type = 'company' AND status = 'answered' THEN 'open'
           ELSE status
         END
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_user_password(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_password(p_user_id uuid, p_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  update public.users
  set password_hash = crypt(p_password, gen_salt('bf'))
  where id = p_user_id;
end;
$$;


--
-- Name: attendances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    instancia text NOT NULL,
    sector_id uuid,
    sector_name text,
    sector_color text,
    attendant_name text,
    attendant_email text,
    assumed_at timestamp with time zone DEFAULT now()
);


--
-- Name: b2b-controleCliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."b2b-controleCliente" (
    "Identificador" bigint,
    "Nome" text,
    "Número do telefone" text,
    "E-mail" text,
    "Gênero" text,
    "Ativo" text,
    "Verificado" text,
    "App" text,
    "Data de nascimento" text,
    "Tipo de documento" text,
    "Documento" text,
    "Como nos conheceu?" text,
    "Data de desbloqueio da agenda" text,
    "Rua" text,
    "Número" text,
    "Complemento" text,
    "Bairro" text,
    "Cidade" text,
    "Estado" text,
    "Cep" text,
    "Observação" text,
    "Status de assinante" text,
    "Criando em" text,
    "Último atendimento" text,
    "Unidades" text,
    "EnvioMensagem?" text,
    semanal boolean DEFAULT false,
    id integer NOT NULL
);


--
-- Name: b2b-controleCliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."b2b-controleCliente_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: b2b-controleCliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."b2b-controleCliente_id_seq" OWNED BY public."b2b-controleCliente".id;


--
-- Name: b2b-controlecliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."b2b-controlecliente" (
    id bigint NOT NULL,
    "Nome" text,
    "Número do telefone" text,
    "E-mail" text,
    "Gênero" text,
    "Ativo" text,
    "Verificado" text,
    "App" text,
    "Data de nascimento" text,
    "Tipo de documento" text,
    "Documento" text,
    "Como nos conheceu?" text,
    "Data de desbloqueio da agenda" text,
    "Rua" text,
    "Número" text,
    "Complemento" text,
    "Bairro" text,
    "Cidade" text,
    "Estado" text,
    "Cep" text,
    "Observação" text,
    "Status de assinante" text,
    "Criando em" text,
    "Último atendimento" text,
    "Unidades" text,
    "EnvioMensagem?" text,
    semanal boolean DEFAULT false
);


--
-- Name: b2b-controlecliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."b2b-controlecliente_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: b2b-controlecliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."b2b-controlecliente_id_seq" OWNED BY public."b2b-controlecliente".id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id bigint NOT NULL,
    nome text,
    numero text,
    instancia text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    primeiro_contato text,
    ultima_mensagem text,
    "data_ultimaMensagem" text,
    classificacao_lead text,
    origem text,
    session_id text,
    ad_source text,
    ad_title text,
    ad_body text,
    ad_thumbnail_url text,
    ad_media_url text,
    ad_click_id text,
    ad_captured_at timestamp with time zone,
    ad_platform text,
    ad_source_type text,
    ad_entry_point text,
    ad_source_url text
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.clientes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.clientes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    plan text DEFAULT 'Starter'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contacts_table text,
    history_table text,
    instance text,
    api_instancia text,
    max_users integer DEFAULT 5,
    digisac_url text,
    ai_enabled boolean DEFAULT true,
    evolution_url text,
    extra_users integer DEFAULT 0,
    max_professionals integer,
    max_agendas integer,
    billing_day integer,
    next_due_date date,
    billing_amount numeric(10,2),
    billing_grace_days integer DEFAULT 1,
    billing_reminder_days integer DEFAULT 3,
    billing_blocked boolean DEFAULT false,
    instagram_enabled boolean DEFAULT false NOT NULL,
    instagram_webhook_path text,
    CONSTRAINT companies_plan_check CHECK ((plan = ANY (ARRAY['Starter'::text, 'Pro'::text, 'Business'::text])))
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    last_msg text,
    unread integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contacts_status_check CHECK ((status = ANY (ARRAY['attended'::text, 'waiting'::text, 'help'::text, 'scheduled'::text])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    due_date date NOT NULL,
    paid_at timestamp with time zone,
    payment_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    enviado boolean DEFAULT false NOT NULL,
    recebido boolean DEFAULT false NOT NULL,
    CONSTRAINT ck_flags_not_null CHECK (((enviado IS NOT NULL) AND (recebido IS NOT NULL)))
);


--
-- Name: mensagens_geral_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mensagens_geral ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.mensagens_geral_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    "from" text NOT NULL,
    text text NOT NULL,
    type text,
    pending boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT messages_from_check CHECK (("from" = ANY (ARRAY['client'::text, 'ai'::text]))),
    CONSTRAINT messages_type_check CHECK ((type = ANY (ARRAY['normal'::text, 'scheduled'::text, 'help'::text])))
);


--
-- Name: n8n_chat_histories_barbara; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_chat_histories_barbara (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    message jsonb NOT NULL
);


--
-- Name: n8n_chat_histories_barbara_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n8n_chat_histories_barbara_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n8n_chat_histories_barbara_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n8n_chat_histories_barbara_id_seq OWNED BY public.n8n_chat_histories_barbara.id;


--
-- Name: n8n_chat_histories_clinicanexla; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_chat_histories_clinicanexla (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    message jsonb NOT NULL
);


--
-- Name: n8n_chat_histories_clinicanexla_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n8n_chat_histories_clinicanexla_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n8n_chat_histories_clinicanexla_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n8n_chat_histories_clinicanexla_id_seq OWNED BY public.n8n_chat_histories_clinicanexla.id;


--
-- Name: n8n_chat_histories_clinicanexlainsta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_chat_histories_clinicanexlainsta (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    message jsonb NOT NULL
);


--
-- Name: n8n_chat_histories_clinicanexlainsta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n8n_chat_histories_clinicanexlainsta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n8n_chat_histories_clinicanexlainsta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n8n_chat_histories_clinicanexlainsta_id_seq OWNED BY public.n8n_chat_histories_clinicanexlainsta.id;


--
-- Name: n8n_chat_histories_clinicaolhos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_chat_histories_clinicaolhos (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    message jsonb NOT NULL,
    data timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text)
);


--
-- Name: n8n_chat_histories_clinicaolhos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n8n_chat_histories_clinicaolhos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n8n_chat_histories_clinicaolhos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n8n_chat_histories_clinicaolhos_id_seq OWNED BY public.n8n_chat_histories_clinicaolhos.id;


--
-- Name: n8n_chat_histories_etuany; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_chat_histories_etuany (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    message jsonb NOT NULL
);


--
-- Name: n8n_chat_histories_etuany_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n8n_chat_histories_etuany_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n8n_chat_histories_etuany_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n8n_chat_histories_etuany_id_seq OWNED BY public.n8n_chat_histories_etuany.id;


--
-- Name: n8n_chat_histories_gastroimagem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n8n_chat_histories_gastroimagem (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    message jsonb NOT NULL,
    data timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text)
);


--
-- Name: n8n_chat_histories_gastroimagem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n8n_chat_histories_gastroimagem_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n8n_chat_histories_gastroimagem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n8n_chat_histories_gastroimagem_id_seq OWNED BY public.n8n_chat_histories_gastroimagem.id;


--
-- Name: nexla_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nexla_historico (
    id bigint NOT NULL,
    session_id text,
    message jsonb,
    data timestamp with time zone DEFAULT now()
);


--
-- Name: nexla_historico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nexla_historico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nexla_historico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nexla_historico_id_seq OWNED BY public.nexla_historico.id;


--
-- Name: pagou_NexlaDaily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."pagou_NexlaDaily" (
    id bigint NOT NULL,
    "Numero" text,
    "pago_NexaDaily" boolean,
    "Nome" text,
    "data_UltimoPagamento" date,
    disparo_um time without time zone,
    disparo_dois time without time zone,
    disparo_tres time without time zone,
    "Check-in_list" text,
    observacoes_da_pessoa text,
    controle_financas text,
    disparo_quatro time without time zone,
    horario_disparo text,
    "realizados_doDia" text,
    "Observacao_fixa" text
);


--
-- Name: pagou_NexlaDaily_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."pagou_NexlaDaily" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."pagou_NexlaDaily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: procedure_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedure_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    procedure_id uuid,
    insurance_plan_id uuid,
    price numeric(10,2) NOT NULL,
    instancia text
);


--
-- Name: sector_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sector_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sector_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: sectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    instancia text NOT NULL,
    color text DEFAULT '#2563EB'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_user_id uuid,
    sender_name text,
    message text,
    image text,
    read_by_company boolean DEFAULT false,
    read_by_adm boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_by_user_id uuid,
    created_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sender text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    company_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['adm'::text, 'admin'::text, 'viewer'::text])))
);


--
-- Name: b2b-controleCliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."b2b-controleCliente" ALTER COLUMN id SET DEFAULT nextval('public."b2b-controleCliente_id_seq"'::regclass);


--
-- Name: b2b-controlecliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."b2b-controlecliente" ALTER COLUMN id SET DEFAULT nextval('public."b2b-controlecliente_id_seq"'::regclass);


--
-- Name: n8n_chat_histories_barbara id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_barbara ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_barbara_id_seq'::regclass);


--
-- Name: n8n_chat_histories_clinicanexla id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_clinicanexla ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_clinicanexla_id_seq'::regclass);


--
-- Name: n8n_chat_histories_clinicanexlainsta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_clinicanexlainsta ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_clinicanexlainsta_id_seq'::regclass);


--
-- Name: n8n_chat_histories_clinicaolhos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_clinicaolhos ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_clinicaolhos_id_seq'::regclass);


--
-- Name: n8n_chat_histories_etuany id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_etuany ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_etuany_id_seq'::regclass);


--
-- Name: n8n_chat_histories_gastroimagem id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_gastroimagem ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_gastroimagem_id_seq'::regclass);


--
-- Name: nexla_historico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nexla_historico ALTER COLUMN id SET DEFAULT nextval('public.nexla_historico_id_seq'::regclass);


--
-- Name: agendas agendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: attendances attendances_numero_instancia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendances
    ADD CONSTRAINT attendances_numero_instancia_key UNIQUE (numero, instancia);


--
-- Name: attendances attendances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendances
    ADD CONSTRAINT attendances_pkey PRIMARY KEY (id);


--
-- Name: b2b-controleCliente b2b-controleCliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."b2b-controleCliente"
    ADD CONSTRAINT "b2b-controleCliente_pkey" PRIMARY KEY (id);


--
-- Name: b2b-controlecliente b2b-controlecliente_Número do telefone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."b2b-controlecliente"
    ADD CONSTRAINT "b2b-controlecliente_Número do telefone_key" UNIQUE ("Número do telefone");


--
-- Name: b2b-controlecliente b2b-controlecliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."b2b-controlecliente"
    ADD CONSTRAINT "b2b-controlecliente_pkey" PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: companies companies_instance_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_instance_key UNIQUE (instance);


--
-- Name: companies companies_instance_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_instance_unique UNIQUE (instance);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: insurance_plans insurance_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_plans
    ADD CONSTRAINT insurance_plans_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: kanban_cards kanban_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_pkey PRIMARY KEY (id);


--
-- Name: kanban_columns kanban_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_columns
    ADD CONSTRAINT kanban_columns_pkey PRIMARY KEY (id);


--
-- Name: mensagens_geral mensagens_geral_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_geral
    ADD CONSTRAINT mensagens_geral_pkey PRIMARY KEY (id);


--
-- Name: mensagens mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: n8n_chat_histories_barbara n8n_chat_histories_barbara_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_barbara
    ADD CONSTRAINT n8n_chat_histories_barbara_pkey PRIMARY KEY (id);


--
-- Name: n8n_chat_histories_clinicanexla n8n_chat_histories_clinicanexla_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_clinicanexla
    ADD CONSTRAINT n8n_chat_histories_clinicanexla_pkey PRIMARY KEY (id);


--
-- Name: n8n_chat_histories_clinicanexlainsta n8n_chat_histories_clinicanexlainsta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_clinicanexlainsta
    ADD CONSTRAINT n8n_chat_histories_clinicanexlainsta_pkey PRIMARY KEY (id);


--
-- Name: n8n_chat_histories_clinicaolhos n8n_chat_histories_clinicaolhos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_clinicaolhos
    ADD CONSTRAINT n8n_chat_histories_clinicaolhos_pkey PRIMARY KEY (id);


--
-- Name: n8n_chat_histories_etuany n8n_chat_histories_etuany_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_etuany
    ADD CONSTRAINT n8n_chat_histories_etuany_pkey PRIMARY KEY (id);


--
-- Name: n8n_chat_histories_gastroimagem n8n_chat_histories_gastroimagem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n8n_chat_histories_gastroimagem
    ADD CONSTRAINT n8n_chat_histories_gastroimagem_pkey PRIMARY KEY (id);


--
-- Name: nexla_historico nexla_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nexla_historico
    ADD CONSTRAINT nexla_historico_pkey PRIMARY KEY (id);


--
-- Name: pagou_NexlaDaily pagou_NexlaDaily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pagou_NexlaDaily"
    ADD CONSTRAINT "pagou_NexlaDaily_pkey" PRIMARY KEY (id);


--
-- Name: procedure_prices procedure_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedure_prices
    ADD CONSTRAINT procedure_prices_pkey PRIMARY KEY (id);


--
-- Name: procedure_prices procedure_prices_procedure_id_insurance_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedure_prices
    ADD CONSTRAINT procedure_prices_procedure_id_insurance_plan_id_key UNIQUE (procedure_id, insurance_plan_id);


--
-- Name: procedures procedures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_pkey PRIMARY KEY (id);


--
-- Name: professionals professionals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_pkey PRIMARY KEY (id);


--
-- Name: saved_contacts saved_contacts_numero_instancia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_contacts
    ADD CONSTRAINT saved_contacts_numero_instancia_key UNIQUE (numero, instancia);


--
-- Name: saved_contacts saved_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_contacts
    ADD CONSTRAINT saved_contacts_pkey PRIMARY KEY (id);


--
-- Name: sector_members sector_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_pkey PRIMARY KEY (id);


--
-- Name: sector_members sector_members_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_user_id_key UNIQUE (user_id);


--
-- Name: sectors sectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sectors
    ADD CONSTRAINT sectors_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: contacts_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_company_id_idx ON public.contacts USING btree (company_id);


--
-- Name: contacts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_status_idx ON public.contacts USING btree (status);


--
-- Name: idx_clientes_ad_click_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_ad_click_id ON public.clientes USING btree (ad_click_id) WHERE (ad_click_id IS NOT NULL);


--
-- Name: idx_clientes_ad_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_ad_title ON public.clientes USING btree (ad_title) WHERE (ad_title IS NOT NULL);


--
-- Name: idx_invoices_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_company_id ON public.invoices USING btree (company_id);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_mensagens_geral_aplicativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_geral_aplicativo ON public.mensagens_geral USING btree (instancia, aplicativo, numero);


--
-- Name: idx_mensagens_geral_recipient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_geral_recipient_id ON public.mensagens_geral USING btree (recipient_id) WHERE (recipient_id IS NOT NULL);


--
-- Name: idx_saved_contacts_ad_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_contacts_ad_title ON public.saved_contacts USING btree (ad_title) WHERE (ad_title IS NOT NULL);


--
-- Name: idx_support_messages_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket ON public.support_messages USING btree (ticket_id, created_at);


--
-- Name: idx_support_tickets_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_company ON public.support_tickets USING btree (company_id);


--
-- Name: idx_support_tickets_last_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_last_msg ON public.support_tickets USING btree (last_message_at DESC);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: messages_contact_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_contact_id_idx ON public.messages USING btree (contact_id);


--
-- Name: clientes trg_reopen_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reopen_session AFTER INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.reopen_session_on_new_message();


--
-- Name: mensagens_geral trg_reopen_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reopen_session AFTER INSERT ON public.mensagens_geral FOR EACH ROW EXECUTE FUNCTION public.reopen_session_on_new_message();


--
-- Name: n8n_chat_histories_barbara trg_reopen_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reopen_session AFTER INSERT ON public.n8n_chat_histories_barbara FOR EACH ROW EXECUTE FUNCTION public.reopen_session_on_new_message();


--
-- Name: n8n_chat_histories_clinicaolhos trg_reopen_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reopen_session AFTER INSERT ON public.n8n_chat_histories_clinicaolhos FOR EACH ROW EXECUTE FUNCTION public.reopen_session_on_new_message();


--
-- Name: n8n_chat_histories_gastroimagem trg_reopen_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reopen_session AFTER INSERT ON public.n8n_chat_histories_gastroimagem FOR EACH ROW EXECUTE FUNCTION public.reopen_session_on_new_message();


--
-- Name: support_messages trg_support_bump_ticket; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_support_bump_ticket AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.support_bump_ticket();


--
-- Name: agendas agendas_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_forwarded_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_forwarded_to_user_id_fkey FOREIGN KEY (forwarded_to_user_id) REFERENCES public.users(id);


--
-- Name: alerts alerts_instancia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_instancia_fkey FOREIGN KEY (instancia) REFERENCES public.companies(instance) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: appointments appointments_agenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agendas(id) ON DELETE CASCADE;


--
-- Name: attendances attendances_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendances
    ADD CONSTRAINT attendances_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: kanban_cards kanban_cards_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.kanban_columns(id) ON DELETE CASCADE;


--
-- Name: messages messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: procedure_prices procedure_prices_insurance_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedure_prices
    ADD CONSTRAINT procedure_prices_insurance_plan_id_fkey FOREIGN KEY (insurance_plan_id) REFERENCES public.insurance_plans(id) ON DELETE CASCADE;


--
-- Name: procedure_prices procedure_prices_procedure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedure_prices
    ADD CONSTRAINT procedure_prices_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.procedures(id) ON DELETE CASCADE;


--
-- Name: procedures procedures_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;


--
-- Name: saved_contacts saved_contacts_insurance_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_contacts
    ADD CONSTRAINT saved_contacts_insurance_plan_id_fkey FOREIGN KEY (insurance_plan_id) REFERENCES public.insurance_plans(id);


--
-- Name: sector_members sector_members_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;


--
-- Name: sector_members sector_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: attendances Allow all attendances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all attendances" ON public.attendances USING (true) WITH CHECK (true);


--
-- Name: sector_members Allow all sector_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all sector_members" ON public.sector_members USING (true) WITH CHECK (true);


--
-- Name: sectors Allow all sectors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all sectors" ON public.sectors USING (true) WITH CHECK (true);


--
-- Name: b2b-controleCliente Permitir DELETE para autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir DELETE para autenticados" ON public."b2b-controleCliente" FOR DELETE TO authenticated USING (true);


--
-- Name: b2b-controleCliente Permitir INSERT para autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir INSERT para autenticados" ON public."b2b-controleCliente" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: b2b-controleCliente Permitir SELECT para anon e authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir SELECT para anon e authenticated" ON public."b2b-controleCliente" FOR SELECT TO authenticated, anon USING (true);


--
-- Name: b2b-controleCliente Permitir SELECT para autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir SELECT para autenticados" ON public."b2b-controleCliente" FOR SELECT TO authenticated USING (true);


--
-- Name: b2b-controleCliente Permitir UPDATE para anon e authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir UPDATE para anon e authenticated" ON public."b2b-controleCliente" FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: b2b-controleCliente Permitir UPDATE para autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir UPDATE para autenticados" ON public."b2b-controleCliente" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: pagou_NexlaDaily Service role can insert pagamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert pagamentos" ON public."pagou_NexlaDaily" FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: pagou_NexlaDaily Service role can update pagamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update pagamentos" ON public."pagou_NexlaDaily" FOR UPDATE TO service_role USING (true) WITH CHECK (true);


--
-- Name: agendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;

--
-- Name: agendas agendas_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agendas_all ON public.agendas TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow all" ON public.conversations USING (true) WITH CHECK (true);


--
-- Name: nexla_historico allow all nexla_historico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow all nexla_historico" ON public.nexla_historico USING (true) WITH CHECK (true);


--
-- Name: mensagens_geral allow insert mensagens_geral; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow insert mensagens_geral" ON public.mensagens_geral FOR INSERT WITH CHECK (true);


--
-- Name: clientes allow_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read ON public.clientes FOR SELECT USING (true);


--
-- Name: mensagens_geral allow_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read ON public.mensagens_geral FOR SELECT USING (true);


--
-- Name: n8n_chat_histories_barbara allow_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read ON public.n8n_chat_histories_barbara FOR SELECT USING (true);


--
-- Name: alerts anon can read alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon can read alerts" ON public.alerts FOR SELECT USING (true);


--
-- Name: alerts anon can update alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon can update alerts" ON public.alerts FOR UPDATE USING (true);


--
-- Name: n8n_chat_histories_gastroimagem anon read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon read" ON public.n8n_chat_histories_gastroimagem FOR SELECT USING (true);


--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments appointments_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_all ON public.appointments TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: attendances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b-controleCliente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."b2b-controleCliente" ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b-controlecliente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."b2b-controlecliente" ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: mensagens_geral gastro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gastro ON public.mensagens_geral USING (true) WITH CHECK (true);


--
-- Name: companies insert companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert companies" ON public.companies FOR INSERT WITH CHECK (true);


--
-- Name: users insert users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert users" ON public.users FOR INSERT WITH CHECK (true);


--
-- Name: insurance_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: insurance_plans insurance_plans_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insurance_plans_all ON public.insurance_plans TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_full_access ON public.invoices USING (true) WITH CHECK (true);


--
-- Name: kanban_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: kanban_cards kanban_cards_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kanban_cards_all ON public.kanban_cards TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: kanban_columns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

--
-- Name: kanban_columns kanban_columns_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kanban_columns_all ON public.kanban_columns TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: mensagens_geral; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensagens_geral ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: n8n_chat_histories_barbara; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.n8n_chat_histories_barbara ENABLE ROW LEVEL SECURITY;

--
-- Name: n8n_chat_histories_gastroimagem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.n8n_chat_histories_gastroimagem ENABLE ROW LEVEL SECURITY;

--
-- Name: nexla_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nexla_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: pagou_NexlaDaily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."pagou_NexlaDaily" ENABLE ROW LEVEL SECURITY;

--
-- Name: procedure_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procedure_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: procedure_prices procedure_prices_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY procedure_prices_all ON public.procedure_prices TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: procedures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

--
-- Name: procedures procedures_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY procedures_all ON public.procedures TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: professionals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

--
-- Name: professionals professionals_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY professionals_all ON public.professionals TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: companies read companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read companies" ON public.companies FOR SELECT USING (true);


--
-- Name: users read users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read users" ON public.users FOR SELECT USING (true);


--
-- Name: saved_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_contacts saved_contacts_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_contacts_all ON public.saved_contacts TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: sector_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sector_members ENABLE ROW LEVEL SECURITY;

--
-- Name: sectors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages support_messages_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_all ON public.support_messages USING (true) WITH CHECK (true);


--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets support_tickets_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_all ON public.support_tickets USING (true) WITH CHECK (true);


--
-- Name: companies update companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update companies" ON public.companies FOR UPDATE USING (true);


--
-- Name: users update users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update users" ON public.users FOR UPDATE USING (true);


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




-- ── 20260429_billing.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: sistema de cobrança/mensalidade
--
-- Adiciona em companies:
--   billing_day              — dia do mês de vencimento (1-31)
--   next_due_date            — próxima data de vencimento (avança ao marcar pago)
--   billing_amount           — valor mensal (R$)
--   billing_grace_days       — dias de carência após vencimento antes de bloquear (default 1)
--   billing_reminder_days    — quantos dias antes do vencimento começa o aviso (default 3)
--   billing_blocked          — bloqueio manual (override)
--
-- Cria tabela invoices: histórico de mensalidades
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_day            integer,
  ADD COLUMN IF NOT EXISTS next_due_date          date,
  ADD COLUMN IF NOT EXISTS billing_amount         numeric(10,2),
  ADD COLUMN IF NOT EXISTS billing_grace_days     integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_reminder_days  integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS billing_blocked        boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount          numeric(10,2) NOT NULL,
  due_date        date NOT NULL,
  paid_at         timestamptz,
  payment_method  text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date   ON public.invoices(due_date);

-- RPC: marca empresa como paga (cria invoice + avança next_due_date 1 mês)
-- Security definer pra bypassar RLS — só o ADM chama isso
CREATE OR REPLACE FUNCTION public.mark_company_paid(
  p_company_id uuid,
  p_amount numeric DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_amount numeric;
  v_due date;
  v_next date;
BEGIN
  SELECT * INTO v_company FROM companies WHERE id = p_company_id;
  IF v_company IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Empresa não encontrada');
  END IF;

  v_amount := COALESCE(p_amount, v_company.billing_amount);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'Valor da mensalidade não definido');
  END IF;

  -- Vencimento sendo pago: usa next_due_date se setado, senão calcula deste mês
  v_due := COALESCE(
    v_company.next_due_date,
    date_trunc('month', CURRENT_DATE)::date + (COALESCE(v_company.billing_day, 5) - 1)
  );

  -- Próximo vencimento: 1 mês depois
  v_next := (v_due + INTERVAL '1 month')::date;

  -- Insere invoice paga
  INSERT INTO invoices (company_id, amount, due_date, paid_at, payment_method, notes)
  VALUES (p_company_id, v_amount, v_due, now(), p_payment_method, p_notes);

  -- Avança next_due_date e desbloqueia (caso estivesse bloqueado)
  UPDATE companies
     SET next_due_date = v_next,
         billing_blocked = false
   WHERE id = p_company_id;

  RETURN json_build_object('ok', true, 'next_due_date', v_next);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_company_paid(uuid, numeric, text, text) TO anon, authenticated;

-- RLS: invoices acessível pra service_role livremente; anon só pode ler do próprio (não usado por enquanto)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_full_access" ON public.invoices;
CREATE POLICY "invoices_full_access" ON public.invoices
  FOR ALL USING (true) WITH CHECK (true);


-- ── 20260429_clientes_add_session_id.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: adicionar session_id em clientes
-- Motivo: existe uma trigger na tabela `clientes` que referencia NEW.session_id
-- (provavelmente instalada por ensure_table_setup quando a empresa foi criada,
-- assumindo o padrão de mensagens_geral). A coluna não existia, então inserts
-- via n8n falhavam com:
--   record "new" has no field "session_id"
-- Adicionamos a coluna como nullable. A trigger resolve sem erro.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS session_id text;

-- Backfill opcional: copia o número (sem o sufixo @s.whatsapp.net) pro session_id
-- pra ficar consistente com o padrão das outras tabelas. Pode pular se não quiser.
UPDATE public.clientes
   SET session_id = split_part(numero, '@', 1)
 WHERE session_id IS NULL
   AND numero IS NOT NULL;


-- ── 20260429_companies_plan_limits.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: campos de limite/override por empresa em companies
-- Permite que o ADM:
--   1. Cobre add-on de usuários (extra_users)
--   2. Override individual de profissionais (max_professionals) e agendas (max_agendas)
--      pra clientes especiais sem ter que mudar de plano completamente
-- Defaults vêm do plano (Starter/Pro/Business) — quando o override é NULL,
-- o frontend usa PLAN_DEFAULTS de src/lib/planLimits.js.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS extra_users        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_professionals  integer NULL,
  ADD COLUMN IF NOT EXISTS max_agendas        integer NULL;

COMMENT ON COLUMN public.companies.extra_users
  IS 'Add-on de usuários extras (R$39 cada) somados aos inclusos no plano';
COMMENT ON COLUMN public.companies.max_professionals
  IS 'Override individual do limite de profissionais. NULL = usar default do plano';
COMMENT ON COLUMN public.companies.max_agendas
  IS 'Override individual do limite de agendas. NULL = usar default do plano';


-- ── 20260429_delete_user_rpc.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: delete_user RPC
-- Motivo: A tabela `users` não tem policy de DELETE no RLS, então o delete
-- direto via anon key é silenciosamente bloqueado (não retorna erro, mas o
-- registro permanece). Esta RPC roda como SECURITY DEFINER e bypassa RLS,
-- mesmo padrão de `create_user` e `update_user_password` que já existem.
--
-- Como aplicar:
--   1. Abra o Supabase Studio → SQL Editor
--   2. Cole este arquivo inteiro
--   3. Run
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_user(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM users WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Usuário não encontrado');
  END IF;

  -- Limpa vínculos best-effort (ignora se a tabela/coluna não existir ainda)
  BEGIN
    DELETE FROM sector_members WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE kanban_cards SET assignee_id = NULL WHERE assignee_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE attendances SET user_id = NULL WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE alerts SET forwarded_to = NULL WHERE forwarded_to = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object('ok', true, 'email', v_user_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO anon, authenticated;


-- ── 20260430_api_rpc.sql ─────────────────────────────────────────────────────────

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


-- ── 20260430_mensagens_aplicativo.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: adiciona coluna `aplicativo` em mensagens_geral
--
-- Identifica de qual canal a mensagem veio:
--   'whatsapp'  (default — todas as msgs antigas e novas sem flag explícita)
--   'instagram' (msgs do Instagram Direct, setadas pelo n8n no salvamento)
--
-- Com isso, a tela de Conversas mostra só WhatsApp e a tela de Direct
-- mostra só Instagram, mesmo que ambos cheguem na mesma tabela.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS aplicativo text DEFAULT 'whatsapp';

-- Backfill: tudo que está NULL vira 'whatsapp'
UPDATE public.mensagens_geral
   SET aplicativo = 'whatsapp'
 WHERE aplicativo IS NULL;

CREATE INDEX IF NOT EXISTS idx_mensagens_geral_aplicativo
  ON public.mensagens_geral(instancia, aplicativo, numero);


-- ── 20260430_support.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: sistema de suporte (chat empresa ↔ super ADM)
--
-- support_tickets : 1 chamado por contexto
-- support_messages: histórico do chat, com texto + imagem opcional (base64)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject             text NOT NULL,
  status              text NOT NULL DEFAULT 'open', -- open | answered | closed
  created_by_user_id  uuid,
  created_by_name     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_message_at     timestamptz NOT NULL DEFAULT now(),
  last_sender         text
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company  ON public.support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_msg ON public.support_tickets(last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type     text NOT NULL,        -- 'company' | 'adm'
  sender_user_id  uuid,
  sender_name     text,
  message         text,
  image           text,                  -- base64 da imagem (data URI sem o prefixo)
  read_by_company boolean DEFAULT false,
  read_by_adm     boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

-- RLS aberta (controlado em frontend — chamados são internos)
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_all"  ON public.support_tickets;
DROP POLICY IF EXISTS "support_messages_all" ON public.support_messages;

CREATE POLICY "support_tickets_all"  ON public.support_tickets  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "support_messages_all" ON public.support_messages FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Trigger: atualiza last_message_at e last_sender no ticket quando chega msg
CREATE OR REPLACE FUNCTION public.support_bump_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE support_tickets
     SET last_message_at = NEW.created_at,
         last_sender     = NEW.sender_type,
         status          = CASE
           WHEN NEW.sender_type = 'adm'     AND status = 'open'    THEN 'answered'
           WHEN NEW.sender_type = 'company' AND status = 'closed'  THEN 'answered'
           WHEN NEW.sender_type = 'company' AND status = 'answered' THEN 'open'
           ELSE status
         END
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_bump_ticket ON public.support_messages;
CREATE TRIGGER trg_support_bump_ticket
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_bump_ticket();


-- ── 20260505_companies_instagram_enabled.sql ─────────────────────────────────────────────────────────

-- Adiciona flag de Instagram ativo por empresa.
-- Por padrão, Instagram fica DESATIVADO. Liberação manual via ADM exige
-- configuração técnica (n8n/Meta Business API), então não pode ser self-service.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS instagram_enabled BOOLEAN NOT NULL DEFAULT false;

-- Libera apenas pra empresa-piloto que já tem o setup pronto.
UPDATE companies
SET instagram_enabled = true
WHERE name ILIKE '%Centro Terap%Bem Estar%'
   OR name ILIKE '%bem-estar%'
   OR name ILIKE '%bem estar%';


-- ── 20260505_companies_instagram_webhook.sql ─────────────────────────────────────────────────────────

-- Path do webhook do n8n para cada empresa com Instagram ativo.
-- Cada clínica tem um workflow próprio no n8n com path único — isso garante
-- que a mensagem cai no fluxo certo, com a credencial Meta correta.
--
-- Frontend lê esse campo e monta a URL final como:
-- https://n8n.nexladesenvolvimento.com.br/webhook/<path>
--
-- Nullable porque empresas sem Instagram (instagram_enabled=false) não têm.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS instagram_webhook_path TEXT;

-- Centro Terapêutico Bem Estar usa o path piloto
UPDATE companies
SET instagram_webhook_path = 'envioNexlainstagram'
WHERE instagram_enabled = true
  AND instagram_webhook_path IS NULL;


-- ── 20260505_mensagens_recipient_id.sql ─────────────────────────────────────────────────────────

-- Adiciona coluna recipient_id em mensagens_geral.
-- Necessária pra Instagram Direct: a Meta Graph API exige o "recipient.id"
-- (PSID — Page-scoped ID da conversa) pra enviar resposta. O n8n preenche
-- esse campo quando a mensagem chega do cliente; no envio, o frontend lê
-- o valor mais recente da conversa e manda no payload do webhook.
--
-- Coluna nullable: WhatsApp não usa esse campo, fica NULL nessas linhas.

ALTER TABLE mensagens_geral
  ADD COLUMN IF NOT EXISTS recipient_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mensagens_geral_recipient_id
  ON mensagens_geral (recipient_id)
  WHERE recipient_id IS NOT NULL;


-- ── 20260511_appointment_reminders.sql ─────────────────────────────────────────────────────────

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


-- ── 20260511_feedbacks.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: tabela feedbacks
--
-- Cada empresa pode submeter sugestões, bugs, elogios e dúvidas com nota
-- de 1-5. O ADM Global lê tudo numa tela de moderação separada (futuro).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedbacks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_name    text NOT NULL,
  user_email   text NOT NULL,
  category     text NOT NULL CHECK (category IN ('sugestao','bug','elogio','duvida','outro')),
  rating       smallint CHECK (rating BETWEEN 1 AND 5),
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_analise','planejado','feito','recusado')),
  adm_response text,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedbacks_company_id_idx ON public.feedbacks (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedbacks_status_idx     ON public.feedbacks (status, created_at DESC);

-- RLS no padrão permissive do projeto (segurança via anon key + auth no app)
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read feedbacks"   ON public.feedbacks;
DROP POLICY IF EXISTS "allow_insert feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "allow_update feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "allow_delete feedbacks" ON public.feedbacks;

CREATE POLICY "allow_read feedbacks"   ON public.feedbacks FOR SELECT USING (true);
CREATE POLICY "allow_insert feedbacks" ON public.feedbacks FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update feedbacks" ON public.feedbacks FOR UPDATE USING (true);
CREATE POLICY "allow_delete feedbacks" ON public.feedbacks FOR DELETE USING (true);

-- Adiciona à publication supabase_realtime (pra notificações live no ADM)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='feedbacks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedbacks;
  END IF;
END;
$$;

-- Trigger pra updated_at automático
CREATE OR REPLACE FUNCTION public.feedbacks_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS feedbacks_updated_at ON public.feedbacks;
CREATE TRIGGER feedbacks_updated_at
  BEFORE UPDATE ON public.feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.feedbacks_set_updated_at();


-- ── 20260511_realtime_publication.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: Habilita Realtime nas tabelas que o frontend assina
--
-- O dump do banco antigo não trouxe as memberships da publication
-- supabase_realtime (pg_dump --no-owner pula objetos owned por supabase_admin).
-- Resultado: nenhuma das tabelas estava na publicação no banco novo, então
-- conversas, agendamentos, kanban etc. não atualizavam em tempo real — o
-- usuário precisava recarregar a página pra ver nova mensagem.
--
-- Tabelas que o frontend usa via supabase.channel(...).on('postgres_changes'):
--   mensagens_geral    — conversas (CompanyConversations)
--   appointments       — agenda (CompanyAgenda, CompanyConversations)
--   saved_contacts     — pacientes (CompanyContacts, CompanyConversations)
--   attendances        — quem está atendendo (CompanyConversations)
--   conversations      — tickets encerrados
--   kanban_cards       — atividades (CompanyKanban)
--   kanban_columns     — colunas do kanban
--   alerts             — alertas (CompanyAlerts)
--   support_messages   — chat de suporte
--   support_tickets    — tickets de suporte
--
-- Idempotente: só adiciona se ainda não estiver na publication.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'mensagens_geral',
    'appointments',
    'saved_contacts',
    'attendances',
    'conversations',
    'kanban_cards',
    'kanban_columns',
    'alerts',
    'support_messages',
    'support_tickets'
  ];
BEGIN
  -- Garante que a publicação existe (Supabase já cria, mas por segurança)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    END IF;
  END LOOP;
END;
$$;

-- REPLICA IDENTITY FULL nas tabelas com event='*' (precisamos do old row
-- em UPDATE/DELETE pra alguns fluxos como apagar conversa encerrada).
-- Sem isso, payloads de UPDATE/DELETE vêm sem os campos antigos.
ALTER TABLE public.mensagens_geral SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE public.attendances     REPLICA IDENTITY FULL;
ALTER TABLE public.conversations   REPLICA IDENTITY FULL;
ALTER TABLE public.mensagens_geral REPLICA IDENTITY FULL;
ALTER TABLE public.appointments    REPLICA IDENTITY FULL;
ALTER TABLE public.kanban_cards    REPLICA IDENTITY FULL;
ALTER TABLE public.saved_contacts  REPLICA IDENTITY FULL;
ALTER TABLE public.alerts          REPLICA IDENTITY FULL;


-- ── 20260511_reminder_fix_webhook.sql ─────────────────────────────────────────────────────────

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


-- ── 20260511_security_cleanup.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: Cleanup de segurança e schema
--
-- 1. Dropa 5 tabelas legadas n8n_chat_histories_* (lixo do banco antigo,
--    não usadas pelo Clinisac).
-- 2. Habilita RLS em public.mensagens com policy permissive (mesmo padrão
--    do resto do schema — segurança via anon key + custom auth).
-- 3. Remove índice duplicado companies_instance_unique (redundante com
--    companies_instance_key, ambos UNIQUE em instance).
--
-- Resolve os alertas CRITICAL do Supabase Security Advisor:
--   - RLS Disabled in Public (mensagens + 5 n8n_*)
--   - Sensitive Columns Exposed (5 n8n_*)
--   - Duplicate Index (companies)
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Drop tabelas legadas ───────────────────────────────────────────────
DROP TABLE IF EXISTS public.n8n_chat_histories_clinicanexla       CASCADE;
DROP TABLE IF EXISTS public.n8n_chat_histories_clinicanexlainsta  CASCADE;
DROP TABLE IF EXISTS public.n8n_chat_histories_etuany             CASCADE;
DROP TABLE IF EXISTS public.n8n_chat_histories_clinicaolhos       CASCADE;
DROP TABLE IF EXISTS public.n8n_chat_histories_adv_nexla          CASCADE;

-- ─── 2. RLS em mensagens ───────────────────────────────────────────────────
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read mensagens"   ON public.mensagens;
DROP POLICY IF EXISTS "allow_insert mensagens" ON public.mensagens;
DROP POLICY IF EXISTS "allow_update mensagens" ON public.mensagens;
DROP POLICY IF EXISTS "allow_delete mensagens" ON public.mensagens;

CREATE POLICY "allow_read mensagens"   ON public.mensagens FOR SELECT USING (true);
CREATE POLICY "allow_insert mensagens" ON public.mensagens FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update mensagens" ON public.mensagens FOR UPDATE USING (true);
CREATE POLICY "allow_delete mensagens" ON public.mensagens FOR DELETE USING (true);

-- ─── 3. Remove constraint UNIQUE duplicado (companies_instance_key já cobre) ─
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_instance_unique;


-- ── 20260512_companies_plan_price_override.sql ─────────────────────────────────────────────────────────

alter table companies add column if not exists plan_price_override numeric default null;


-- ── 20260512_companies_timezone.sql ─────────────────────────────────────────────────────────

alter table companies add column if not exists timezone text not null default '-03:00';


-- ── 20260512_contact_tags.sql ─────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- Migration: tags de contato (etiquetas)
--
-- Permite a clínica criar etiquetas coloridas e atribuí-las aos
-- pacientes/contatos. Funciona por telefone (numero), não exige cadastro
-- completo do paciente — qualquer número que apareceu no chat pode receber tag.
--
-- Filtros nas telas de Conversas / Finalizados / Pacientes usam essas tags.
-- ────────────────────────────────────────────────────────────────────────────

-- 1) Definições das tags (uma por empresa/instância)
CREATE TABLE IF NOT EXISTS public.contact_tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia  text        NOT NULL,
  name       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#2563EB',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instancia, name)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_instancia
  ON public.contact_tags (instancia);

-- 2) Atribuições (many-to-many entre número e tag)
CREATE TABLE IF NOT EXISTS public.contact_tag_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia        text        NOT NULL,
  numero           text        NOT NULL,   -- telefone bruto, sem sufixo @
  tag_id           uuid        NOT NULL REFERENCES public.contact_tags(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  UNIQUE (instancia, numero, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tag_assignments_lookup
  ON public.contact_tag_assignments (instancia, numero);

CREATE INDEX IF NOT EXISTS idx_contact_tag_assignments_tag
  ON public.contact_tag_assignments (tag_id);

-- 3) RLS — modelo permissive (seg. é no app)
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_tags_all ON public.contact_tags;
CREATE POLICY contact_tags_all ON public.contact_tags
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS contact_tag_assignments_all ON public.contact_tag_assignments;
CREATE POLICY contact_tag_assignments_all ON public.contact_tag_assignments
  FOR ALL USING (true) WITH CHECK (true);

-- 4) Realtime — pra picker/lista atualizarem ao vivo entre abas
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_tag_assignments;


-- ── 20260512_conversations_unique_session.sql ─────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_session_instancia_unique'
  ) then
    alter table conversations
      add constraint conversations_session_instancia_unique
      unique (session_id, instancia);
  end if;
end $$;


-- ── 20260512_performance_indexes.sql ─────────────────────────────────────────────────────────

-- Índices de performance para as tabelas multi-tenant mais consultadas.
-- mensagens_geral é a tabela mais pesada: todas as queries filtram por instancia+numero.
create index if not exists idx_mensagens_instancia_numero
  on mensagens_geral(instancia, numero);

create index if not exists idx_mensagens_instancia_created
  on mensagens_geral(instancia, created_at desc);

-- appointments: lookup por contato
create index if not exists idx_appointments_instancia_numero
  on appointments(instancia, contact_numero);

-- saved_contacts: lookup de número salvo
create index if not exists idx_saved_contacts_instancia_numero
  on saved_contacts(instancia, numero);

-- attendances: quem está atendendo qual número
create index if not exists idx_attendances_instancia_numero
  on attendances(instancia, numero);

-- kanban_cards: listagem por instância
create index if not exists idx_kanban_cards_instancia
  on kanban_cards(instancia);


-- ── 20260512_procedures_reminder.sql ─────────────────────────────────────────────────────────

alter table procedures add column if not exists reminder_message text;


-- ── 20260512_reminder_timestamp_fix.sql ─────────────────────────────────────────────────────────

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


-- ── 20260512_user_limit_trigger.sql ─────────────────────────────────────────────────────────

create or replace function check_user_limit()
returns trigger language plpgsql as $$
declare
  co      record;
  max_u   int;
  curr_u  int;
  plan_max int;
begin
  select * into co from companies where id = new.company_id;
  if not found then return new; end if;

  -- Limite efetivo: override direto tem prioridade; senão, default do plano + extras
  if co.max_users is not null and co.max_users > 0 then
    max_u := co.max_users;
  else
    plan_max := case co.plan
      when 'Starter'  then 5
      when 'Pro'      then 20
      when 'Business' then null
      else 5
    end;
    if plan_max is null then return new; end if; -- Business = ilimitado
    max_u := plan_max + coalesce(co.extra_users, 0);
  end if;

  select count(*) into curr_u
    from users
    where company_id = new.company_id
      and active is not false;

  if curr_u >= max_u then
    raise exception 'Limite de usuários atingido para esta empresa (máx: %). Contrate usuários extras ou faça upgrade de plano.', max_u;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_user_limit on users;
create trigger trg_check_user_limit
  before insert on users
  for each row execute function check_user_limit();


-- ── 20260513_kanban_contact_comments.sql ─────────────────────────────────────────────────────────

-- Vincula card a um paciente cadastrado
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES saved_contacts(id) ON DELETE SET NULL;
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS contact_nome text;

-- Comentários por card
CREATE TABLE IF NOT EXISTS kanban_card_comments (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id     uuid NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  instancia   text NOT NULL,
  author_name text NOT NULL,
  author_email text,
  body        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanban_card_comments_card ON kanban_card_comments(card_id);

ALTER TABLE kanban_card_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY kanban_card_comments_all ON kanban_card_comments USING (true) WITH CHECK (true);


-- ── 20260519_agent_config.sql ─────────────────────────────────────────────────────────

-- Adiciona coluna de configuração do agente IA por empresa
alter table companies
  add column if not exists agent_config jsonb;


-- ── 20260519_agent_configs_table.sql ─────────────────────────────────────────────────────────

-- Tabela dedicada para configuração do agente IA por instância
-- Mais fácil de consultar no n8n: SELECT * FROM agent_configs WHERE instancia = 'xxx'

create table if not exists agent_configs (
  id          uuid        default gen_random_uuid() primary key,
  instancia   text        not null unique,
  company_id  uuid        references companies(id) on delete cascade,
  config      jsonb       not null default '{}',
  updated_at  timestamptz default now()
);

-- Atualiza updated_at automaticamente
create or replace function update_agent_configs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agent_configs_updated_at on agent_configs;
create trigger trg_agent_configs_updated_at
  before update on agent_configs
  for each row execute function update_agent_configs_updated_at();

-- RLS — política aberta (auth customizada via JWT próprio, não Supabase Auth)
-- Acesso real é controlado pela instancia no backend/n8n com service_role key
alter table agent_configs enable row level security;

DO $$ BEGIN
  CREATE POLICY "agent_configs_all" ON public.agent_configs
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 20260519_landing_analytics.sql ─────────────────────────────────────────────────────────

-- Landing page analytics: session tracking for anonymous visitors
create table if not exists landing_analytics (
  id          uuid        default gen_random_uuid() primary key,
  session_id  text        not null unique,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz,
  duration_ms integer,
  referrer    text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  device      text,
  scroll_depth smallint   default 0,
  cta_clicked boolean     default false
);

alter table landing_analytics enable row level security;

-- Visitors (anon) can insert/update their own session
create policy "landing_anon_insert" on landing_analytics
  for insert to anon with check (true);

create policy "landing_anon_update" on landing_analytics
  for update to anon using (true) with check (true);

-- Any authenticated user (admins) can read
create policy "landing_auth_read" on landing_analytics
  for select using (auth.role() = 'authenticated' or true);

-- Enable Realtime so the admin page receives live updates
alter publication supabase_realtime add table landing_analytics;


-- ── 20260519_landing_section_times.sql ─────────────────────────────────────────────────────────

-- Add per-section time tracking to landing analytics
alter table landing_analytics
  add column if not exists section_times jsonb;


-- ── 20260520_mensagens_geral_idgrupo.sql ─────────────────────────────────────────────────────────

alter table mensagens_geral
  add column if not exists idgrupo text;


-- ── 20260520_mensagens_geral_idgrupo_index.sql ─────────────────────────────────────────────────────────

-- Índice para filtrar mensagens de grupos (idgrupo sempre termina em @g.us quando preenchido)
create index if not exists idx_mensagens_geral_idgrupo
  on mensagens_geral (instancia, idgrupo)
  where idgrupo is not null;


-- ── 20260520_mensagens_geral_nome.sql ─────────────────────────────────────────────────────────

alter table mensagens_geral
  add column if not exists nome text;


-- ── 20260520_mensagens_geral_nomegrupo.sql ─────────────────────────────────────────────────────────

alter table mensagens_geral
  add column if not exists nomegrupo text;


-- ── 20260525_clientes_foto.sql ─────────────────────────────────────────────────────────

-- Adiciona coluna foto (base64 ou URL) na tabela clientes
-- Usada pelo fluxo n8n para salvar a foto de perfil do WhatsApp no primeiro contato
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS foto TEXT;


-- ── 20260526_companies_numero_base.sql ─────────────────────────────────────────────────────────

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS numero_base text;


-- ── 20260603_send_mensagem_geral_nome.sql ─────────────────────────────────────────────────────────

-- Atualiza RPC send_mensagem_geral para aceitar nome do remetente
CREATE OR REPLACE FUNCTION public.send_mensagem_geral(
  p_instancia text,
  p_numero    text,
  p_mensagem  text,
  p_type      text,
  p_hora      text,
  p_base64    text DEFAULT NULL,
  p_nome      text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.mensagens_geral
    (instancia, numero, mensagem, type, "horaLastMessage", base64, nome, created_at)
  VALUES
    (p_instancia, p_numero, p_mensagem, p_type, p_hora, p_base64, p_nome, NOW());
END;
$$;


-- ── 20260611_anamneses.sql ─────────────────────────────────────────────────────────

-- Modelos de anamnese (por clínica)
CREATE TABLE IF NOT EXISTS public.anamnese_templates (
  id         uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia  text NOT NULL,
  nome       text NOT NULL,
  is_default boolean DEFAULT false,
  questions  jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT NOW(),
  created_by text
);

CREATE INDEX IF NOT EXISTS anamnese_templates_instancia_idx
  ON public.anamnese_templates (instancia);

ALTER TABLE public.anamnese_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_anamnese_templates"
    ON public.anamnese_templates FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Respostas de anamnese por paciente
CREATE TABLE IF NOT EXISTS public.anamnese_responses (
  id             uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia      text NOT NULL,
  contact_id     uuid REFERENCES public.saved_contacts(id) ON DELETE CASCADE,
  contact_numero text,
  template_id    uuid REFERENCES public.anamnese_templates(id) ON DELETE SET NULL,
  template_name  text,
  questions      jsonb NOT NULL DEFAULT '[]',
  answers        jsonb NOT NULL DEFAULT '{}',
  filled_by      text,
  filled_at      timestamptz DEFAULT NOW(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS anamnese_responses_contact_idx
  ON public.anamnese_responses (instancia, contact_id);

ALTER TABLE public.anamnese_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_anamnese_responses"
    ON public.anamnese_responses FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 20260611_appointments_prontuario.sql ─────────────────────────────────────────────────────────

-- Adiciona campo de prontuário ao agendamento
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS prontuario text,
  ADD COLUMN IF NOT EXISTS prontuario_at timestamptz,
  ADD COLUMN IF NOT EXISTS prontuario_by text;


-- ── 20260611_mensagens_geral_unique_id_mensagem.sql ─────────────────────────────────────────────────────────

-- Índice único parcial em id_mensagem para evitar duplicatas do echo do Evolution API
-- Ignora registros com id_mensagem NULL (mensagens sem ID ainda)
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_geral_id_mensagem_instancia_unique
  ON public.mensagens_geral (id_mensagem, instancia)
  WHERE id_mensagem IS NOT NULL;


-- ── 20260611_orcamentos.sql ─────────────────────────────────────────────────────────

-- Orçamentos / planos de tratamento
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id             uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia      text NOT NULL,
  contact_id     uuid REFERENCES public.saved_contacts(id) ON DELETE CASCADE,
  contact_numero text,
  status         text DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  desconto       numeric DEFAULT 0,
  entrada        numeric DEFAULT 0,
  parcelas       integer DEFAULT 1,
  notes          text,
  created_by     text,
  created_at     timestamptz DEFAULT NOW(),
  approved_at    timestamptz
);

CREATE INDEX IF NOT EXISTS orcamentos_contact_idx
  ON public.orcamentos (instancia, contact_id);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_orcamentos"
    ON public.orcamentos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Itens do orçamento (procedimentos)
CREATE TABLE IF NOT EXISTS public.orcamento_items (
  id           uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  orcamento_id uuid REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  procedimento text NOT NULL,
  dente        text,
  faces        text,
  valor        numeric NOT NULL DEFAULT 0,
  ordem        integer DEFAULT 0
);

ALTER TABLE public.orcamento_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_orcamento_items"
    ON public.orcamento_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 20260611_prontuario_attachments.sql ─────────────────────────────────────────────────────────

-- Tabela de anexos do prontuário (fotos de evolução, documentos, laudos)
CREATE TABLE IF NOT EXISTS public.prontuario_attachments (
  id           uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia    text NOT NULL,
  contact_numero text NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_type    text,
  file_size    integer,
  uploaded_by  text,
  uploaded_at  timestamptz DEFAULT NOW(),
  caption      text
);

CREATE INDEX IF NOT EXISTS prontuario_attachments_instancia_numero_idx
  ON public.prontuario_attachments (instancia, contact_numero);

ALTER TABLE public.prontuario_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_prontuario_attachments"
  ON public.prontuario_attachments FOR ALL USING (true) WITH CHECK (true);

-- Bucket de storage para arquivos do prontuário
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prontuario',
  'prontuario',
  true,
  20971520, -- 20MB max por arquivo
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/heic',
    'application/pdf',
    'video/mp4','video/quicktime',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Política de storage: acesso público para leitura, qualquer um pode fazer upload (auth via DB)
DO $$ BEGIN
  CREATE POLICY "prontuario_public_read"
    ON storage.objects FOR SELECT USING (bucket_id = 'prontuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "prontuario_upload"
    ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'prontuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "prontuario_delete"
    ON storage.objects FOR DELETE USING (bucket_id = 'prontuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 20260615_conversation_reads.sql ─────────────────────────────────────────────────────────

-- Rastreia quando cada usuário leu cada conversa (para badge de não lidos)
CREATE TABLE IF NOT EXISTS public.conversation_reads (
  instancia    text NOT NULL,
  session_id   text NOT NULL,
  user_email   text NOT NULL,
  last_read_at timestamptz DEFAULT NOW(),
  PRIMARY KEY (instancia, session_id, user_email)
);

ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_conversation_reads"
    ON public.conversation_reads FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 20260617_reminder_group.sql ─────────────────────────────────────────────────────────

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


-- ── 20260618_appointments_extra_recipients.sql ─────────────────────────────────────────────────────────

-- Destinatários extras por agendamento (contatos individuais ou grupos)
-- Formato: [{"nome":"...", "numero":"..."}] ou [{"nome":"...", "idgrupo":"...@g.us"}]
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS extra_recipients jsonb DEFAULT '[]'::jsonb;

-- Atualiza process_appointment_reminders para enviar também aos extra_recipients
CREATE OR REPLACE FUNCTION public.process_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r             record;
  recip         jsonb;
  cnt           integer := 0;
  msg           text;
  group_msg     text;
  recip_msg     text;
  appt_local    timestamptz;
  session_id    text;
  payload       jsonb;
  group_payload jsonb;
  recip_payload jsonb;
  recip_nome    text;
  recip_numero  text;
  recip_idgrupo text;
BEGIN
  FOR r IN
    SELECT
      a.id,
      a.contact_numero,
      a.contact_nome,
      a.starts_at,
      a.instancia,
      COALESCE(a.extra_recipients, '[]'::jsonb) AS extra_recipients,
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

    -- Mensagem individual (para o paciente principal)
    msg := format(
      'Olá %s! 👋 Passando pra lembrar da sua consulta no dia %s às %s%s. Até lá! 🩺',
      r.contact_nome,
      to_char(appt_local, 'DD/MM'),
      to_char(appt_local, 'HH24:MI'),
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

    -- Grupo global da empresa (se configurado)
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

    -- Destinatários extras do agendamento
    FOR recip IN SELECT * FROM jsonb_array_elements(r.extra_recipients)
    LOOP
      recip_nome    := recip->>'nome';
      recip_numero  := recip->>'numero';
      recip_idgrupo := recip->>'idgrupo';

      IF recip_idgrupo IS NOT NULL AND recip_idgrupo <> '' THEN
        -- É um grupo
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
        -- É um contato individual
        recip_msg := format(
          'Olá %s! 👋 Passando pra lembrar da consulta de %s no dia %s às %s%s. 🩺',
          COALESCE(recip_nome, 'tudo bem'),
          r.contact_nome,
          to_char(appt_local, 'DD/MM'),
          to_char(appt_local, 'HH24:MI'),
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


-- ── 20260618_companies_modules.sql ─────────────────────────────────────────────────────────

-- Módulos habilitados por empresa (pacote personalizado)
-- Formato: { "financeiro": true, "grupos": false, "kanban": true, ... }
-- NULL = usa defaults do plano (tudo habilitado)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS modules jsonb DEFAULT NULL;

COMMENT ON COLUMN public.companies.modules IS
  'Módulos habilitados individualmente. NULL = todos habilitados (padrão do plano).';


-- ── 20260618_quick_messages.sql ─────────────────────────────────────────────────────────

-- Mensagens rápidas por instância (respostas prontas no chat)
CREATE TABLE IF NOT EXISTS public.quick_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  titulo     text        NOT NULL,
  mensagem   text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.quick_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "quick_messages_all" ON public.quick_messages
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS quick_messages_instancia_idx ON public.quick_messages (instancia);


-- ── 20260619_crm.sql ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- CRM: funis, etapas, contatos, histórico de interações
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_funnels (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  nome       text        NOT NULL,
  posicao    integer     DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_stages (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  funil_id    uuid        REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
  instancia   text        NOT NULL,
  nome        text        NOT NULL,
  cor         text        DEFAULT '#6B7280',
  posicao     integer     DEFAULT 0,
  alerta_dias integer     DEFAULT 7,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia           text        NOT NULL,
  phone               text        NOT NULL,
  nome                text,
  email               text,
  stage_id            uuid        REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  funil_id            uuid        REFERENCES public.crm_funnels(id) ON DELETE SET NULL,
  temperatura         text        DEFAULT 'frio' CHECK (temperatura IN ('frio','morno','quente')),
  tags                text[]      DEFAULT '{}',
  responsavel_id      uuid,
  responsavel_nome    text,
  origem              text,
  observacoes         text,
  motivo_perda        text,
  data_ult_contato    timestamptz,
  data_entrada_etapa  timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  UNIQUE(instancia, phone)
);

CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  phone      text        NOT NULL,
  tipo       text        NOT NULL CHECK (tipo IN ('nota','etapa','mensagem','agendamento','tarefa')),
  conteudo   text,
  metadata   jsonb,
  autor_nome text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.crm_funnels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "crm_funnels_all"      ON public.crm_funnels      FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "crm_stages_all"       ON public.crm_stages       FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "crm_contacts_all"     ON public.crm_contacts     FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "crm_interactions_all" ON public.crm_interactions FOR ALL TO authenticated,anon USING(true) WITH CHECK(true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS crm_funnels_inst_idx      ON public.crm_funnels(instancia);
CREATE INDEX IF NOT EXISTS crm_stages_funil_idx      ON public.crm_stages(funil_id);
CREATE INDEX IF NOT EXISTS crm_contacts_inst_idx     ON public.crm_contacts(instancia);
CREATE INDEX IF NOT EXISTS crm_contacts_stage_idx    ON public.crm_contacts(stage_id);
CREATE INDEX IF NOT EXISTS crm_interactions_phone_idx ON public.crm_interactions(instancia, phone);


-- ── 20260619_crm_kanban.sql ─────────────────────────────────────────────────────────

-- Vincula cards do Kanban a contatos do CRM
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS crm_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS kanban_cards_crm_contact_idx ON public.kanban_cards(crm_contact_id);


-- ── 20260619_crm_phase4.sql ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- CRM Fase 4: listas dinâmicas + auto-avançar etapa ao agendar
-- ─────────────────────────────────────────────────────────────────────────────

-- Listas dinâmicas (filtros salvos)
CREATE TABLE IF NOT EXISTS public.crm_lists (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  nome       text        NOT NULL,
  filtros    jsonb       DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.crm_lists ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_lists_all" ON public.crm_lists FOR ALL TO authenticated,anon USING(true) WITH CHECK(true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS crm_lists_inst_idx ON public.crm_lists(instancia);

-- ─── Trigger: avança etapa CRM ao criar agendamento ──────────────────────────

CREATE OR REPLACE FUNCTION public.crm_advance_on_appointment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_phone    text;
  v_contact  public.crm_contacts%ROWTYPE;
  v_stage_id uuid;
  v_stage_pos integer;
  v_cur_pos   integer;
BEGIN
  v_phone := regexp_replace(COALESCE(NEW.contact_numero,''), '[^0-9]', '', 'g');
  IF v_phone = '' THEN RETURN NEW; END IF;

  SELECT * INTO v_contact
  FROM public.crm_contacts
  WHERE instancia = NEW.instancia
    AND regexp_replace(phone, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Etapa com 'agend' no nome dentro do mesmo funil
  SELECT id, posicao INTO v_stage_id, v_stage_pos
  FROM public.crm_stages
  WHERE funil_id = v_contact.funil_id
    AND lower(nome) LIKE '%agend%'
  ORDER BY posicao ASC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Só avança se o contato estiver em etapa anterior (não regride)
  SELECT posicao INTO v_cur_pos
  FROM public.crm_stages WHERE id = v_contact.stage_id;

  IF v_cur_pos IS NULL OR v_cur_pos < v_stage_pos THEN
    UPDATE public.crm_contacts
    SET stage_id = v_stage_id, data_entrada_etapa = now()
    WHERE id = v_contact.id;

    INSERT INTO public.crm_interactions(instancia, phone, tipo, conteudo, autor_nome)
    VALUES (
      NEW.instancia, v_phone, 'agendamento',
      'Agendamento criado — etapa avançada automaticamente para "Agendou"',
      'Sistema'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_advance_appt ON public.appointments;
CREATE TRIGGER crm_advance_appt
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.crm_advance_on_appointment();


-- ── 20260619_financeiro.sql ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo Financeiro: contas a pagar / receber / fluxo de caixa
-- ─────────────────────────────────────────────────────────────────────────────

-- Categorias financeiras por empresa
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  nome       text        NOT NULL,
  tipo       text        NOT NULL CHECK (tipo IN ('receita', 'despesa', 'ambos')),
  cor        text        DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "fin_categories_all" ON public.financial_categories
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS fin_categories_instancia_idx ON public.financial_categories (instancia);

-- Lançamentos financeiros
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia       text        NOT NULL,
  tipo            text        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao       text        NOT NULL,
  valor           numeric     NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  categoria_id    uuid        REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  vencimento      date        NOT NULL,
  pagamento_at    date,                          -- data real de pagamento/recebimento
  parcela_atual   integer     DEFAULT 1,
  total_parcelas  integer     DEFAULT 1,
  grupo_parcelas  uuid,                          -- UUID compartilhado entre parcelas do mesmo lançamento
  contact_id      uuid,
  contact_nome    text,
  appointment_id  uuid,
  orcamento_id    uuid,
  centro_custo    text,
  observacoes     text,
  created_by      text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "fin_transactions_all" ON public.financial_transactions
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS fin_transactions_instancia_idx   ON public.financial_transactions (instancia);
CREATE INDEX IF NOT EXISTS fin_transactions_vencimento_idx  ON public.financial_transactions (instancia, vencimento);
CREATE INDEX IF NOT EXISTS fin_transactions_status_idx      ON public.financial_transactions (instancia, tipo, status);
CREATE INDEX IF NOT EXISTS fin_transactions_grupo_idx       ON public.financial_transactions (grupo_parcelas);

-- Categorias padrão (inseridas para cada nova empresa via trigger ou manualmente)
-- Receitas
INSERT INTO public.financial_categories (instancia, nome, tipo, cor)
  SELECT '_default_', nome, tipo, cor FROM (VALUES
    ('Consulta',             'receita', '#16A34A'),
    ('Procedimento',         'receita', '#0284C7'),
    ('Exame',                'receita', '#7C3AED'),
    ('Produto/Material',     'receita', '#EA580C'),
    ('Outro (receita)',      'receita', '#6B7280'),
    ('Aluguel',              'despesa', '#DC2626'),
    ('Material clínico',     'despesa', '#B45309'),
    ('Salário / Pró-labore', 'despesa', '#7C3AED'),
    ('Serviços (água/luz/internet)', 'despesa', '#0369A1'),
    ('Marketing',            'despesa', '#DB2777'),
    ('Equipamento',          'despesa', '#6B7280'),
    ('Imposto / Taxa',       'despesa', '#92400E'),
    ('Outro (despesa)',      'despesa', '#374151')
  ) AS t(nome, tipo, cor)
ON CONFLICT DO NOTHING;


-- ── 20260619_financeiro_v2.sql ─────────────────────────────────────────────────────────

-- Financeiro v2: forma de pagamento + recorrência
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS forma_pagamento  text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recorrente       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recorrencia_tipo text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS grupo_recorrencia uuid   DEFAULT NULL;


-- ── 20260623_remove_medical.sql ────────────────────────────────────────────────────────
-- Pivot saúde → empresas gerais: remove prontuário, anamnese, orçamentos, convênios
-- e os campos clínicos. Roda por último para que o schema final já nasça sem nada médico.
-- (CASCADE limpa FKs, policies e grants dos objetos removidos automaticamente.)

-- O dump zera o search_path da sessão; garantimos 'public' para que tipos
-- não-qualificados (RETURNS saved_contacts, etc.) resolvam na recriação das RPCs.
SET search_path TO public;

-- 1. Funções que dependem de objetos médicos
DROP FUNCTION IF EXISTS public.api_insurance_plans_list(text, boolean);
DROP FUNCTION IF EXISTS public.api_procedure_price(uuid, uuid);

-- 2. Tabelas médico-específicas
DROP TABLE IF EXISTS public.anamnese_responses     CASCADE;
DROP TABLE IF EXISTS public.anamnese_templates     CASCADE;
DROP TABLE IF EXISTS public.orcamento_items        CASCADE;
DROP TABLE IF EXISTS public.orcamentos             CASCADE;
DROP TABLE IF EXISTS public.prontuario_attachments CASCADE;
DROP TABLE IF EXISTS public.procedure_prices       CASCADE;
DROP TABLE IF EXISTS public.insurance_plans        CASCADE;

-- 3. Colunas médicas em tabelas genéricas
ALTER TABLE public.saved_contacts
  DROP COLUMN IF EXISTS insurance_plan_id,
  DROP COLUMN IF EXISTS insurance_card,
  DROP COLUMN IF EXISTS allergies,
  DROP COLUMN IF EXISTS chronic_conditions,
  DROP COLUMN IF EXISTS medications,
  DROP COLUMN IF EXISTS clinical_notes,
  DROP COLUMN IF EXISTS blood_type,
  DROP COLUMN IF EXISTS weight,
  DROP COLUMN IF EXISTS height;

ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS insurance_plan_id,
  DROP COLUMN IF EXISTS prontuario,
  DROP COLUMN IF EXISTS prontuario_at,
  DROP COLUMN IF EXISTS prontuario_by;

ALTER TABLE IF EXISTS public.financial_transactions
  DROP COLUMN IF EXISTS orcamento_id;

-- 4. Recriação das RPCs genéricas (sem campos médicos)
CREATE OR REPLACE FUNCTION public.api_paciente_create(p_data jsonb)
RETURNS saved_contacts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row saved_contacts;
BEGIN
  INSERT INTO saved_contacts (
    instancia, nome, numero, birth_date, gender, email, phone_secondary,
    address, cpf, rg, profession, nome_social, marital_status,
    guardian_name, guardian_phone, referral_source, photo,
    emergency_contact, emergency_phone, notes
  ) VALUES (
    p_data->>'instancia', p_data->>'nome', p_data->>'numero',
    NULLIF(p_data->>'birth_date','')::date, p_data->>'gender', p_data->>'email',
    p_data->>'phone_secondary', p_data->>'address', p_data->>'cpf',
    p_data->>'rg', p_data->>'profession', p_data->>'nome_social',
    p_data->>'marital_status',
    p_data->>'guardian_name', p_data->>'guardian_phone',
    p_data->>'referral_source', p_data->>'photo',
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
    guardian_name     = COALESCE(p_data->>'guardian_name', guardian_name),
    guardian_phone    = COALESCE(p_data->>'guardian_phone', guardian_phone),
    referral_source   = COALESCE(p_data->>'referral_source', referral_source),
    photo             = COALESCE(p_data->>'photo', photo),
    emergency_contact = COALESCE(p_data->>'emergency_contact', emergency_contact),
    emergency_phone   = COALESCE(p_data->>'emergency_phone', emergency_phone),
    notes             = COALESCE(p_data->>'notes', notes)
  WHERE id = p_id
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.api_appointment_create(p_data jsonb)
RETURNS appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row appointments;
BEGIN
  INSERT INTO appointments (
    instancia, agenda_id, professional_id, procedure_id,
    contact_nome, contact_numero, starts_at, duration_minutes, status,
    payment_status, price, notes
  ) VALUES (
    p_data->>'instancia',
    NULLIF(p_data->>'agenda_id','')::uuid,
    NULLIF(p_data->>'professional_id','')::uuid,
    NULLIF(p_data->>'procedure_id','')::uuid,
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

-- 5. Storage: bucket 'prontuario' + políticas
DO $$ BEGIN
  DROP POLICY IF EXISTS "prontuario_public_read" ON storage.objects;
  DROP POLICY IF EXISTS "prontuario_upload"      ON storage.objects;
  DROP POLICY IF EXISTS "prontuario_delete"      ON storage.objects;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Obs: o Supabase bloqueia DELETE direto em storage.objects/buckets
-- (storage.protect_delete). Num banco novo o bucket nasce vazio e sem uso,
-- então deixamos como está — se quiser removê-lo, use o Storage UI do painel.

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

