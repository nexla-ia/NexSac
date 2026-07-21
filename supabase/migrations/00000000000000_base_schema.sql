--
-- PostgreSQL database dump
--

\restrict xyjy8hxYz2pqAQTfpeMwmCc1FTSfeImbSK2lFPLsDJbMSiIqaSnfAUqPqNFGqxt

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
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

\unrestrict xyjy8hxYz2pqAQTfpeMwmCc1FTSfeImbSK2lFPLsDJbMSiIqaSnfAUqPqNFGqxt

