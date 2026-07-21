-- ────────────────────────────────────────────────────────────────────────────
-- Migration: Habilita Realtime nas tabelas que o frontend assina
--
-- O dump do banco antigo não trouxe as memberships da publication
-- supabase_realtime (pg_dump --no-owner pula objetos owned por supabase_admin).
-- Resultado: nenhuma das tabelas estava na publicação no banco novo, então
-- conversas, agendamentos, kanban etc. não atualizavam em tempo real — o
-- usuário precisava recarregar a página pra ver nova mensagem.
--
-- Tabelas que o frontend usa via supabase.channel(...).on('postgres_changes'):
--   mensagens_geral    — conversas (CompanyConversations)
--   appointments       — agenda (CompanyAgenda, CompanyConversations)
--   saved_contacts     — pacientes (CompanyContacts, CompanyConversations)
--   attendances        — quem está atendendo (CompanyConversations)
--   conversations      — tickets encerrados
--   kanban_cards       — atividades (CompanyKanban)
--   kanban_columns     — colunas do kanban
--   alerts             — alertas (CompanyAlerts)
--   support_messages   — chat de suporte
--   support_tickets    — tickets de suporte
--
-- Idempotente: só adiciona se ainda não estiver na publication.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'mensagens_geral',
    'appointments',
    'saved_contacts',
    'attendances',
    'conversations',
    'kanban_cards',
    'kanban_columns',
    'alerts',
    'support_messages',
    'support_tickets'
  ];
BEGIN
  -- Garante que a publicação existe (Supabase já cria, mas por segurança)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    END IF;
  END LOOP;
END;
$$;

-- REPLICA IDENTITY FULL nas tabelas com event='*' (precisamos do old row
-- em UPDATE/DELETE pra alguns fluxos como apagar conversa encerrada).
-- Sem isso, payloads de UPDATE/DELETE vêm sem os campos antigos.
ALTER TABLE public.mensagens_geral SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE public.attendances     REPLICA IDENTITY FULL;
ALTER TABLE public.conversations   REPLICA IDENTITY FULL;
ALTER TABLE public.mensagens_geral REPLICA IDENTITY FULL;
ALTER TABLE public.appointments    REPLICA IDENTITY FULL;
ALTER TABLE public.kanban_cards    REPLICA IDENTITY FULL;
ALTER TABLE public.saved_contacts  REPLICA IDENTITY FULL;
ALTER TABLE public.alerts          REPLICA IDENTITY FULL;
