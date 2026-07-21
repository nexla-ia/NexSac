-- Atualiza RPC send_mensagem_geral para aceitar nome do remetente
CREATE OR REPLACE FUNCTION public.send_mensagem_geral(
  p_instancia text,
  p_numero    text,
  p_mensagem  text,
  p_type      text,
  p_hora      text,
  p_base64    text DEFAULT NULL,
  p_nome      text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.mensagens_geral
    (instancia, numero, mensagem, type, "horaLastMessage", base64, nome, created_at)
  VALUES
    (p_instancia, p_numero, p_mensagem, p_type, p_hora, p_base64, p_nome, NOW());
END;
$$;
