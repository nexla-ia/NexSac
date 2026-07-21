-- Adiciona campo de prontuário ao agendamento
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS prontuario text,
  ADD COLUMN IF NOT EXISTS prontuario_at timestamptz,
  ADD COLUMN IF NOT EXISTS prontuario_by text;
