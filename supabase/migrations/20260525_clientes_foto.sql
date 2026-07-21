-- Adiciona coluna foto (base64 ou URL) na tabela clientes
-- Usada pelo fluxo n8n para salvar a foto de perfil do WhatsApp no primeiro contato
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS foto TEXT;
