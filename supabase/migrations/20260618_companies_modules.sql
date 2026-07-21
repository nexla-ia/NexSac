-- Módulos habilitados por empresa (pacote personalizado)
-- Formato: { "financeiro": true, "grupos": false, "kanban": true, ... }
-- NULL = usa defaults do plano (tudo habilitado)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS modules jsonb DEFAULT NULL;

COMMENT ON COLUMN public.companies.modules IS
  'Módulos habilitados individualmente. NULL = todos habilitados (padrão do plano).';
