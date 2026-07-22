-- Corrige funis "Funil Principal" duplicados: o carregamento do CRM criava
-- automaticamente um funil quando a instância não tinha nenhum, mas duas
-- chamadas simultâneas (ex.: duas abas abertas ao mesmo tempo) podiam ambas
-- ver "0 funis" e inserir cada uma o seu, gerando 2 pipelines iguais.

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
      -- reaponta contatos para o estágio equivalente (mesma posição) no funil mantido
      UPDATE public.crm_contacts c
      SET funil_id = keep_id,
          stage_id = ks.id
      FROM public.crm_stages ds
      JOIN public.crm_stages ks ON ks.funil_id = keep_id AND ks.posicao = ds.posicao
      WHERE c.funil_id = dup_id AND c.stage_id = ds.id;

      -- contatos sem estágio casado (raro) só reapontam o funil
      UPDATE public.crm_contacts SET funil_id = keep_id WHERE funil_id = dup_id;

      DELETE FROM public.crm_stages WHERE funil_id = dup_id;
      DELETE FROM public.crm_funnels WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- Evita a mesma corrida no futuro: só pode existir 1 funil com posicao 0 por instância
DO $$
BEGIN
  CREATE UNIQUE INDEX crm_funnels_instancia_posicao0_uidx
    ON public.crm_funnels (instancia)
    WHERE posicao = 0;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
