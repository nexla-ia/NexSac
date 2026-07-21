-- Status manual "aguardando paciente": atendente marca que já respondeu e está
-- esperando o cliente responder de volta. Some sozinho quando o cliente manda
-- mensagem nova (limpo no front ao receber o realtime).
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS awaiting_client boolean NOT NULL DEFAULT false;
