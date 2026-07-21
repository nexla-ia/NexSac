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
