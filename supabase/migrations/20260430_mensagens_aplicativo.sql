-- ────────────────────────────────────────────────────────────────────────────
-- Migration: adiciona coluna `aplicativo` em mensagens_geral
--
-- Identifica de qual canal a mensagem veio:
--   'whatsapp'  (default — todas as msgs antigas e novas sem flag explícita)
--   'instagram' (msgs do Instagram Direct, setadas pelo n8n no salvamento)
--
-- Com isso, a tela de Conversas mostra só WhatsApp e a tela de Direct
-- mostra só Instagram, mesmo que ambos cheguem na mesma tabela.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS aplicativo text DEFAULT 'whatsapp';

-- Backfill: tudo que está NULL vira 'whatsapp'
UPDATE public.mensagens_geral
   SET aplicativo = 'whatsapp'
 WHERE aplicativo IS NULL;

CREATE INDEX IF NOT EXISTS idx_mensagens_geral_aplicativo
  ON public.mensagens_geral(instancia, aplicativo, numero);
