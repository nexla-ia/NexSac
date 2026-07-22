-- ============================================================
-- COLE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE E RODE.
-- Cria índices que aceleram a abertura de conversas/grupos
-- (a query mais comum: últimas N mensagens de um número/grupo, por id DESC).
-- Seguro rodar mesmo que os índices já existam.
--
-- Usa CONCURRENTLY pra não travar a tabela mensagens_geral durante a
-- criação (importante porque o n8n está sempre inserindo mensagens nela).
-- Por isso rode CADA COMANDO SEPARADO (selecione um de cada vez e rode),
-- em vez de rodar o arquivo inteiro de uma vez — CONCURRENTLY não pode
-- ficar dentro da mesma transação que outro comando.
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensagens_geral_numero_id
  ON public.mensagens_geral (instancia, numero, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensagens_geral_idgrupo_id
  ON public.mensagens_geral (instancia, idgrupo, id DESC)
  WHERE idgrupo IS NOT NULL;
