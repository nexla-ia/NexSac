-- Índice único parcial em id_mensagem para evitar duplicatas do echo do Evolution API
-- Ignora registros com id_mensagem NULL (mensagens sem ID ainda)
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_geral_id_mensagem_instancia_unique
  ON public.mensagens_geral (id_mensagem, instancia)
  WHERE id_mensagem IS NOT NULL;
