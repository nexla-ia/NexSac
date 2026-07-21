-- Suporte a responder/citar mensagem (estilo WhatsApp).
-- quoted_id_mensagem: id_mensagem (WhatsApp) da mensagem citada, usado ao ENVIAR uma resposta.
-- quoted_text: trecho da mensagem citada, usado quando o CLIENTE responde algo (contextInfo do n8n).
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS quoted_id_mensagem text;
ALTER TABLE public.mensagens_geral ADD COLUMN IF NOT EXISTS quoted_text text;

CREATE OR REPLACE FUNCTION public.send_mensagem_geral(
  p_instancia text,
  p_numero    text,
  p_mensagem  text,
  p_type      text,
  p_hora      text,
  p_base64    text DEFAULT NULL,
  p_nome      text DEFAULT NULL,
  p_quoted    text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.mensagens_geral
    (instancia, numero, mensagem, type, "horaLastMessage", base64, nome, quoted_id_mensagem, created_at)
  VALUES
    (p_instancia, p_numero, p_mensagem, p_type, p_hora, p_base64, p_nome, p_quoted, NOW());
END;
$$;
