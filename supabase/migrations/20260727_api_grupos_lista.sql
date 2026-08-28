-- ==============================================================
-- Grupos — RPC que devolve a lista de grupos já agregada no servidor
--
-- POR QUE: a lista de grupos era montada no cliente baixando mensagens e
-- deduplicando por idgrupo. Como o PostgREST corta em 1000 linhas, grupos
-- SEM mensagem recente (fora das 1000 últimas) sumiam da lista.
--
-- Esta função devolve, para cada grupo da instância, a linha da ÚLTIMA
-- mensagem (uma por idgrupo) — sem depender de nenhum limite de linhas.
-- O front tem fallback e funciona sem ela; com ela fica bem mais leve.
--
-- Tudo como text pra não dar conflito de tipo no RETURNS TABLE.
--
-- NOTA: DROP antes do CREATE de propósito. Uma versão anterior desta função
-- devolvia created_at como timestamptz; CREATE OR REPLACE não consegue mudar
-- o tipo de retorno ("cannot change return type of existing function") e a
-- migration falharia silenciosamente, deixando a função antiga no lugar.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================

DROP FUNCTION IF EXISTS public.api_grupos_lista(text);

CREATE FUNCTION public.api_grupos_lista(p_instancia text)
RETURNS TABLE (
  idgrupo         text,
  nomegrupo       text,
  mensagem        text,
  numero          text,
  nome            text,
  "horaLastMessage" text,
  created_at      text
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (m.idgrupo)
    m.idgrupo::text,
    m.nomegrupo::text,
    m.mensagem::text,
    m.numero::text,
    m.nome::text,
    m."horaLastMessage"::text,
    m.created_at::text
  FROM public.mensagens_geral m
  WHERE m.instancia = p_instancia
    AND m.idgrupo IS NOT NULL
  ORDER BY m.idgrupo, m.id DESC;
$$;

-- Deixa a role anon/authenticated chamar (mesmo padrão das outras api_*).
GRANT EXECUTE ON FUNCTION public.api_grupos_lista(text) TO anon, authenticated;
