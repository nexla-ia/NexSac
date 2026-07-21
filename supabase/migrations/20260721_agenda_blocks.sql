-- Bloqueio de horário na agenda (ausência/almoço/férias). O intervalo bloqueado
-- aparece listrado na grade e não aceita agendamento (clique abre desbloquear,
-- drag-and-drop de agendamento existente é recusado).
CREATE TABLE IF NOT EXISTS public.agenda_blocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia        text NOT NULL,
  agenda_id        uuid NOT NULL REFERENCES public.agendas(id) ON DELETE CASCADE,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  reason           text,
  created_by_email text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_blocks_lookup_idx
  ON public.agenda_blocks (agenda_id, starts_at, ends_at);

ALTER TABLE public.agenda_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_agenda_blocks"
    ON public.agenda_blocks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
