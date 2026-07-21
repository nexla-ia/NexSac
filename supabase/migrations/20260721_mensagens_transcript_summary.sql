-- Transcrição de áudio e resumo de PDF, gerados sob demanda (botão na bolha) e
-- persistidos aqui pra não precisar reprocessar toda vez que a conversa recarrega.
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS summary text;
