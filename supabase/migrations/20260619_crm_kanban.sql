-- Vincula cards do Kanban a contatos do CRM
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS crm_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS kanban_cards_crm_contact_idx ON public.kanban_cards(crm_contact_id);
