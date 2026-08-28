-- ==============================================================
-- PERF Fase 1 — RPCs de DISTINCT no servidor
-- Substitui queries que baixavam 5k-20k linhas de mensagens_geral
-- só para extrair os valores distintos (números / grupos).
-- O servidor passa a devolver o conjunto já deduplicado.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================

SET search_path TO public;

-- Índice de apoio para o DISTINCT por número (o composto existente lidera
-- por instancia mas tem aplicativo no meio, o que atrapalha o distinct).
CREATE INDEX IF NOT EXISTS idx_mensagens_geral_instancia_numero
  ON public.mensagens_geral (instancia, numero)
  WHERE numero IS NOT NULL;

-- --------------------------------------------------------------
-- api_distinct_numeros — números (session_ids) distintos de uma instância.
-- Substitui: select('numero').eq('instancia').limit(5000) + dedup no JS.
-- Retorna TODOS os distintos (antes capava em 5000 linhas brutas).
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_distinct_numeros(p_instancia text)
  RETURNS TABLE(numero text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT DISTINCT numero
    FROM mensagens_geral
    WHERE instancia = p_instancia
      AND numero IS NOT NULL;
  $$;

-- --------------------------------------------------------------
-- api_distinct_grupos — grupos distintos de uma instância, com o nomegrupo
-- da mensagem mais recente (maior id) — equivale ao "order by id desc,
-- primeiro visto vence" que o JS fazia.
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_distinct_grupos(p_instancia text)
  RETURNS TABLE(idgrupo text, nomegrupo text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT DISTINCT ON (idgrupo) idgrupo, nomegrupo
    FROM mensagens_geral
    WHERE instancia = p_instancia
      AND idgrupo IS NOT NULL
    ORDER BY idgrupo, id DESC;
  $$;

GRANT EXECUTE ON FUNCTION public.api_distinct_numeros(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_distinct_grupos(text)  TO anon, authenticated;
