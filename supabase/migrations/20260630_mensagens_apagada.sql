-- ==============================================================
-- Conversas — marca de mensagem apagada
-- Coluna para registrar que uma mensagem foi apagada (fica riscada na
-- plataforma). O apagar de fato no WhatsApp é feito pelo webhook do n8n;
-- aqui só guardamos o estado para exibir riscado de forma persistente.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================

ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS apagada boolean NOT NULL DEFAULT false;
