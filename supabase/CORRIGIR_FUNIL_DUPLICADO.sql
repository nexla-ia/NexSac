-- ============================================================
-- COLE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE E RODE.
-- Corrige o "Funil Principal" duplicado no CRM (2 pipelines iguais)
-- e evita que a duplicação volte a acontecer.
-- Seguro rodar mesmo se não houver duplicados (não faz nada nesse caso).
-- ============================================================

-- ── 20260722_crm_funnels_dedupe.sql ─────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  keep_id uuid;
  dup_id uuid;
BEGIN
  FOR r IN
    SELECT instancia, nome
    FROM public.crm_funnels
    WHERE nome = 'Funil Principal'
    GROUP BY instancia, nome
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id
    FROM public.crm_funnels
    WHERE instancia = r.instancia AND nome = r.nome
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    FOR dup_id IN
      SELECT id FROM public.crm_funnels
      WHERE instancia = r.instancia AND nome = r.nome AND id <> keep_id
    LOOP
      UPDATE public.crm_contacts c
      SET funil_id = keep_id,
          stage_id = ks.id
      FROM public.crm_stages ds
      JOIN public.crm_stages ks ON ks.funil_id = keep_id AND ks.posicao = ds.posicao
      WHERE c.funil_id = dup_id AND c.stage_id = ds.id;

      UPDATE public.crm_contacts SET funil_id = keep_id WHERE funil_id = dup_id;

      DELETE FROM public.crm_stages WHERE funil_id = dup_id;
      DELETE FROM public.crm_funnels WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX crm_funnels_instancia_posicao0_uidx
    ON public.crm_funnels (instancia)
    WHERE posicao = 0;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
