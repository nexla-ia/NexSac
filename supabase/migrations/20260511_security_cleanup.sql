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
