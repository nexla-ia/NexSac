-- ==============================================================
-- Conversas — mostrar CONTATO compartilhado (vCard do WhatsApp)
--
-- Quando o cliente compartilha um contato no WhatsApp, a Evolution manda
-- messageType = 'contactMessage' com um vCard (nome + telefone + waid).
-- Guardamos esse contato aqui pra plataforma exibir um cartãozinho (nome,
-- telefone, botões "Conversar" e "Salvar"), estilo WhatsApp.
--
-- Guarda o objeto contactMessage cru (tem displayName + vcard). O front
-- faz o parse do vCard e monta o cartão. Serve pra 1 contato ou vários
-- (contactsArrayMessage → guarda o array em .contacts).
--
-- No n8n, no insert da mensagem recebida, quando messageType for
-- 'contactMessage' (ou 'contactsArrayMessage'):
--   contact_card = data.message.contactMessage
--                  (ou { "contacts": data.message.contactsArrayMessage.contacts })
--   mensagem     = '📇 ' || displayName   (fallback pra listas/preview)
--
-- Seguro rodar mais de uma vez.
-- ==============================================================

ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS contact_card jsonb;
