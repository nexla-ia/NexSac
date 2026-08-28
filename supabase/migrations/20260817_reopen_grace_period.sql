-- ==============================================================
-- Reabrir conversa: SÓ o CLIENTE reabre, só mensagens_geral, com carência
--
-- Consolida três correções da trigger reopen_session_on_new_message():
--
--  1) Só o CLIENTE reabre. A versão original apagava a linha de "conversa
--     finalizada" (public.conversations) a CADA insert em mensagens_geral —
--     inclusive mensagens de atendente/IA/sistema, o LEMBRETE automático de
--     agendamento e o aviso "▶ Atendimento assumido". Conversas finalizadas
--     "abriam sozinhas".
--
--  2) Mensagem de GRUPO não reabre o INDIVIDUAL. Mensagem de grupo vem com
--     numero = o número individual do participante e idgrupo = o grupo.
--     A trigger usava o `numero`, então reabria a conversa individual do
--     participante toda vez que ele falava no grupo. Agora grupo reabre, no
--     máximo, a conversa do GRUPO.
--
--  3) SÓ mensagens_geral reabre + carência de 2 min. A trigger também está
--     em tabelas AUXILIARES (public.clientes, public.n8n_chat_histories_*);
--     no ramo delas reabria em QUALQUER insert, sem checar tipo — uma
--     escrita na memória do n8n reabria a conversa sem mensagem nova de
--     verdade. E havia corrida de tempo: quem atende pelo WhatsApp finaliza
--     na plataforma antes da mensagem do cliente cair aqui pelo n8n, e
--     quando caía (segundos depois) reabria.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.reopen_session_on_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_session_id text;
  v_type       text;
begin
  -- SÓ a tabela de mensagens da conversa reabre. Escritas em tabelas
  -- auxiliares (clientes/contatos, memória do n8n) NÃO reabrem — eram elas
  -- que causavam a reabertura "sozinha", sem mensagem nova de verdade.
  IF TG_TABLE_NAME <> 'mensagens_geral' THEN
    RETURN NEW;
  END IF;

  -- Grupo reabre (no máximo) a conversa do GRUPO, nunca a do participante.
  IF NEW.idgrupo IS NOT NULL AND NEW.idgrupo <> '' THEN
    v_session_id := NEW.idgrupo;
  ELSE
    v_session_id := NEW.numero;
  END IF;

  -- Só o CLIENTE reabre. Atendente / IA / sistema / lembrete NÃO reabrem.
  -- (lower() porque no banco vem 'Cliente' com C maiúsculo)
  v_type := lower(coalesce(NEW.type, ''));
  IF v_type NOT IN ('cliente', 'human') THEN
    RETURN NEW;
  END IF;

  IF v_session_id IS NOT NULL THEN
    -- Carência: não reabre se acabou de ser finalizada (< 2 min). Evita o
    -- reabrir da mensagem atrasada (n8n) que o atendente já tratou.
    DELETE FROM public.conversations
     WHERE session_id = v_session_id
       AND (closed_at IS NULL OR closed_at < now() - interval '2 minutes');
  END IF;
  RETURN NEW;
end; $$;
