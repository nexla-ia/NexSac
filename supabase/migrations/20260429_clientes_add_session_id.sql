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
