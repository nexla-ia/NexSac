-- ────────────────────────────────────────────────────────────────────────────
-- Pivot saúde → empresas gerais: REMOÇÃO dos recursos médicos
--
-- ⚠️  DESTRUTIVO E IRREVERSÍVEL. Faça backup do projeto Supabase antes de rodar.
--
-- Remove: prontuário, anamnese, orçamentos, convênios e os campos clínicos da
-- ficha de contato. Mantém: contatos, agenda, profissionais, serviços
-- (procedures), kanban, crm, financeiro, billing, tags.
--
-- A ordem importa: 1) funções que dependem de objetos médicos, 2) tabelas,
-- 3) colunas, 4) recriação das RPCs genéricas, 5) storage.
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- O schema_consolidado/dump zera o search_path da sessão; garantimos 'public'
-- para que tipos não-qualificados (RETURNS saved_contacts, etc.) resolvam.
SET search_path TO public;

-- ─── 1. Funções que referenciam tabelas/colunas que serão removidas ──────────
DROP FUNCTION IF EXISTS public.api_insurance_plans_list(text, boolean);
DROP FUNCTION IF EXISTS public.api_procedure_price(uuid, uuid);

-- ─── 2. Tabelas médico-específicas ───────────────────────────────────────────
-- Sem dependentes externos (a não ser FKs que o CASCADE resolve).
DROP TABLE IF EXISTS public.anamnese_responses   CASCADE;
DROP TABLE IF EXISTS public.anamnese_templates   CASCADE;
DROP TABLE IF EXISTS public.orcamento_items      CASCADE;
DROP TABLE IF EXISTS public.orcamentos           CASCADE;
DROP TABLE IF EXISTS public.prontuario_attachments CASCADE;
DROP TABLE IF EXISTS public.procedure_prices     CASCADE;
-- insurance_plans é referenciada por saved_contacts e appointments — CASCADE
-- remove as constraints de FK (as colunas em si caem no passo 3).
DROP TABLE IF EXISTS public.insurance_plans      CASCADE;

-- ─── 3. Colunas médicas em tabelas genéricas ─────────────────────────────────
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

-- Vínculo de orçamento no financeiro (financial_transactions.orcamento_id):
-- a tabela orcamentos já caiu; remove a coluna órfã se existir.
ALTER TABLE IF EXISTS public.financial_transactions
  DROP COLUMN IF EXISTS orcamento_id;

-- ─── 4. Recriação das RPCs genéricas (sem campos médicos) ────────────────────
-- CREATE OR REPLACE preserva os GRANTs existentes a anon/authenticated.

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

-- ─── 5. Storage: bucket 'prontuario' + políticas ─────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS "prontuario_public_read" ON storage.objects;
  DROP POLICY IF EXISTS "prontuario_upload"      ON storage.objects;
  DROP POLICY IF EXISTS "prontuario_delete"      ON storage.objects;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Obs: o Supabase bloqueia DELETE direto em storage.objects/buckets
-- (storage.protect_delete). Remova o bucket 'prontuario' pelo Storage UI do
-- painel, se quiser. Aqui só removemos as políticas associadas (acima).

COMMIT;
