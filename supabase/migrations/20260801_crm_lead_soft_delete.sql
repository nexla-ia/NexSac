-- ==============================================================
-- CRM — soft-delete de lead (não deixar voltar como "novo lead")
-- Ao remover um lead, em vez de apagar a linha, marcamos removido = true.
-- Assim o número CONTINUA existindo em crm_contacts, e o gatilho de
-- autocriação (crm_autocreate_on_message) NÃO recria o lead quando a pessoa
-- manda mensagem de novo (ele já sai quando o número existe). O board/CRM
-- esconde os leads com removido = true.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase.
-- ==============================================================

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS removido    boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS removido_at timestamptz;

UPDATE public.crm_contacts SET removido = false WHERE removido IS NULL;

CREATE INDEX IF NOT EXISTS crm_contacts_removido_idx ON public.crm_contacts(instancia, removido);
