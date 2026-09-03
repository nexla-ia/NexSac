-- O node do n8n só grava o voto em poll_options — nunca em poll_votes.
-- A correção anterior (20260903e/f) só atualizava poll_votes quando a
-- linha órfã tinha algo em poll_votes, o que nunca acontece: poll_votes
-- ficava parado no valor antigo pra sempre, e ao somar com poll_options
-- (que sempre é lido junto no trigger de status), um voto "fantasma"
-- antigo entrava na conta — dava empate e o status parava de mudar
-- quando o paciente trocava de opção mais de uma vez.
--
-- Agora sempre substitui poll_votes pelo estado atual (prioriza
-- NEW.poll_votes se um dia vier preenchido; senão usa NEW.poll_options,
-- que é o que realmente chega) — sem sobra de voto antigo.
CREATE OR REPLACE FUNCTION public.link_orphan_poll_vote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_id bigint;
BEGIN
  IF NEW.poll_name IS NULL OR NEW.poll_appointment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO original_id
  FROM public.mensagens_geral
  WHERE instancia = NEW.instancia
    AND numero = NEW.numero
    AND poll_name = NEW.poll_name
    AND poll_appointment_id IS NOT NULL
    AND id <> NEW.id
  ORDER BY id DESC
  LIMIT 1;

  IF original_id IS NOT NULL THEN
    UPDATE public.mensagens_geral
    SET poll_votes = COALESCE(NEW.poll_votes, NEW.poll_options),
        poll_options = COALESCE(NEW.poll_options, poll_options)
    WHERE id = original_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
