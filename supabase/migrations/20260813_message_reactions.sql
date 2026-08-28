-- ==============================================================
-- Reações (emoji) nas mensagens
--
-- Quando o cliente reage a uma mensagem no WhatsApp, a Evolution manda um
-- evento com messageType = 'reactionMessage'. Ele NÃO é uma mensagem nova —
-- aponta pra mensagem original pelo id (reactionMessage.key.id), que é o
-- mesmo `id_mensagem` já guardado em mensagens_geral.
--
-- Aqui:
--  • mensagens_geral.reaction guarda o emoji da reação (nulo = sem reação);
--  • set_message_reaction() casa pela id da mensagem original + instancia e
--    grava/limpa o emoji. O n8n chama essa função no ramo de reactionMessage.
--
-- Seguro rodar mais de uma vez.
-- ==============================================================

ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS reaction text;

-- Grava (ou limpa, se vier vazio) a reação na mensagem original.
-- Devolve quantas linhas casaram (0 = não achou a mensagem pelo id).
CREATE OR REPLACE FUNCTION public.set_message_reaction(
  p_instancia text, p_id_mensagem text, p_reaction text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  UPDATE public.mensagens_geral
     SET reaction = NULLIF(btrim(coalesce(p_reaction, '')), '')
   WHERE instancia = p_instancia
     AND id_mensagem = p_id_mensagem;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_message_reaction(text, text, text) TO anon, authenticated, service_role;
