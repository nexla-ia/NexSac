-- Adiciona coluna recipient_id em mensagens_geral.
-- Necessária pra Instagram Direct: a Meta Graph API exige o "recipient.id"
-- (PSID — Page-scoped ID da conversa) pra enviar resposta. O n8n preenche
-- esse campo quando a mensagem chega do cliente; no envio, o frontend lê
-- o valor mais recente da conversa e manda no payload do webhook.
--
-- Coluna nullable: WhatsApp não usa esse campo, fica NULL nessas linhas.

ALTER TABLE mensagens_geral
  ADD COLUMN IF NOT EXISTS recipient_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mensagens_geral_recipient_id
  ON mensagens_geral (recipient_id)
  WHERE recipient_id IS NOT NULL;
