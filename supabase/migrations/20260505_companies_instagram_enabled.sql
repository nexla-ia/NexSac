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
