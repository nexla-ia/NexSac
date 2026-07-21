-- Vincula card a um paciente cadastrado
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES saved_contacts(id) ON DELETE SET NULL;
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS contact_nome text;

-- Comentários por card
CREATE TABLE IF NOT EXISTS kanban_card_comments (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id     uuid NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  instancia   text NOT NULL,
  author_name text NOT NULL,
  author_email text,
  body        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanban_card_comments_card ON kanban_card_comments(card_id);

ALTER TABLE kanban_card_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY kanban_card_comments_all ON kanban_card_comments USING (true) WITH CHECK (true);
