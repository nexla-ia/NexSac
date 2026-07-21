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
