-- Financeiro v2: forma de pagamento + recorrência
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS forma_pagamento  text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recorrente       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recorrencia_tipo text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS grupo_recorrencia uuid   DEFAULT NULL;
