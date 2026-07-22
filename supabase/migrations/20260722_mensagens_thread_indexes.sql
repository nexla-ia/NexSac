-- Índices dedicados para a query mais quente da tela de Conversas/Grupos:
-- abrir uma conversa busca "as últimas N mensagens" filtrando por
-- instancia+numero (ou instancia+idgrupo) e ordenando por id DESC.
-- Sem um índice cobrindo isso, o Postgres faz sort em memória sobre o
-- resultado do filtro, o que fica cada vez mais lento conforme a tabela
-- mensagens_geral cresce — essa é a causa mais provável da lentidão ao
-- carregar as mensagens de uma conversa.

CREATE INDEX IF NOT EXISTS idx_mensagens_geral_numero_id
  ON public.mensagens_geral (instancia, numero, id DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_geral_idgrupo_id
  ON public.mensagens_geral (instancia, idgrupo, id DESC)
  WHERE idgrupo IS NOT NULL;
