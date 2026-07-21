-- ────────────────────────────────────────────────────────────────────────────
-- Migration: sistema de suporte (chat empresa ↔ super ADM)
--
-- support_tickets : 1 chamado por contexto
-- support_messages: histórico do chat, com texto + imagem opcional (base64)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject             text NOT NULL,
  status              text NOT NULL DEFAULT 'open', -- open | answered | closed
  created_by_user_id  uuid,
  created_by_name     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_message_at     timestamptz NOT NULL DEFAULT now(),
  last_sender         text
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company  ON public.support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_msg ON public.support_tickets(last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type     text NOT NULL,        -- 'company' | 'adm'
  sender_user_id  uuid,
  sender_name     text,
  message         text,
  image           text,                  -- base64 da imagem (data URI sem o prefixo)
  read_by_company boolean DEFAULT false,
  read_by_adm     boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

-- RLS aberta (controlado em frontend — chamados são internos)
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_all"  ON public.support_tickets;
DROP POLICY IF EXISTS "support_messages_all" ON public.support_messages;

CREATE POLICY "support_tickets_all"  ON public.support_tickets  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "support_messages_all" ON public.support_messages FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Trigger: atualiza last_message_at e last_sender no ticket quando chega msg
CREATE OR REPLACE FUNCTION public.support_bump_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE support_tickets
     SET last_message_at = NEW.created_at,
         last_sender     = NEW.sender_type,
         status          = CASE
           WHEN NEW.sender_type = 'adm'     AND status = 'open'    THEN 'answered'
           WHEN NEW.sender_type = 'company' AND status = 'closed'  THEN 'answered'
           WHEN NEW.sender_type = 'company' AND status = 'answered' THEN 'open'
           ELSE status
         END
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_bump_ticket ON public.support_messages;
CREATE TRIGGER trg_support_bump_ticket
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_bump_ticket();
