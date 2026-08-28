-- ==============================================================
-- PERF Fase 2 — RPCs de AGREGAÇÃO no servidor
-- Substitui queries que baixavam 20k-50k linhas de mensagens_geral
-- só para CONTAR (por instância / por tipo / por hora do dia).
-- Também corrige subcontagem: o cap em 20k/50k linhas truncava os números.
--
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================

SET search_path TO public;

-- Índice para filtros por instância + janela de tempo (usado em todas as
-- agregações por instância e nas listas por período).
CREATE INDEX IF NOT EXISTS idx_mensagens_geral_instancia_created_at
  ON public.mensagens_geral (instancia, created_at);

-- --------------------------------------------------------------
-- api_adm_msg_stats — por instância: total na janela, total "hoje" e última msg.
-- "Hoje" é calculado no timezone passado (p_tz), para casar com o que o
-- browser do admin mostra (ex.: 'America/Sao_Paulo').
-- Substitui (AdmDashboard): select('id,instancia,type,created_at')
--   .gte('created_at', 7d).limit(50000) + filtros/contagens no JS.
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_adm_msg_stats(p_since timestamptz, p_tz text)
  RETURNS TABLE(instancia text, total bigint, today bigint, last_msg timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT
      instancia,
      count(*) AS total,
      count(*) FILTER (
        WHERE created_at >= (date_trunc('day', now() AT TIME ZONE p_tz) AT TIME ZONE p_tz)
      ) AS today,
      max(created_at) AS last_msg
    FROM mensagens_geral
    WHERE created_at >= p_since
    GROUP BY instancia;
  $$;

-- --------------------------------------------------------------
-- api_adm_msg_hours — histograma de mensagens por hora do dia (0-23) na
-- janela, no timezone p_tz. Substitui o forEach de heatmap no JS.
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_adm_msg_hours(p_since timestamptz, p_tz text)
  RETURNS TABLE(hour int, total bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT
      extract(hour FROM (created_at AT TIME ZONE p_tz))::int AS hour,
      count(*) AS total
    FROM mensagens_geral
    WHERE created_at >= p_since
    GROUP BY 1;
  $$;

-- --------------------------------------------------------------
-- api_operacao_msg_stats — contagem por tipo (lowercase) de uma instância
-- numa janela. O JS deriva o total (soma) e os baldes cliente/ia/humano/tool.
-- Substitui (AdmOperacao): select('id,type,created_at').eq(instancia)
--   .gte('created_at', 30d).limit(20000) + contagem no JS.
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api_operacao_msg_stats(p_instancia text, p_since timestamptz)
  RETURNS TABLE(type text, total bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT lower(coalesce(type, '')) AS type, count(*) AS total
    FROM mensagens_geral
    WHERE instancia = p_instancia
      AND created_at >= p_since
    GROUP BY lower(coalesce(type, ''));
  $$;

GRANT EXECUTE ON FUNCTION public.api_adm_msg_stats(timestamptz, text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_adm_msg_hours(timestamptz, text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_operacao_msg_stats(text, timestamptz) TO anon, authenticated;
