-- ==============================================================
-- Conversas/Grupos — enviar e exibir LOCALIZAÇÃO (pin do WhatsApp)
--
-- Guarda a localização de uma mensagem (enviada pela plataforma OU recebida
-- do cliente). O front mostra um cartãozinho com nome/endereço + botão
-- "Abrir no mapa".
--
-- Shape do JSON:
--   { "latitude": -8.7616, "longitude": -63.9022,
--     "name": "Escritório", "address": "Av. Principal, 123" }
--
-- No n8n, no insert da mensagem RECEBIDA, quando messageType for
-- 'locationMessage':
--   location = {
--     "latitude":  data.message.locationMessage.degreesLatitude,
--     "longitude": data.message.locationMessage.degreesLongitude,
--     "name":      data.message.locationMessage.name,
--     "address":   data.message.locationMessage.address
--   }
--   mensagem = '📍 ' || coalesce(name, address, 'Localização')  (fallback do preview)
--
-- Seguro rodar mais de uma vez.
-- ==============================================================

ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS location jsonb;
