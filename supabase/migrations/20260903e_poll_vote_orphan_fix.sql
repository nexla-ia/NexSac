-- Contorno pro node do n8n que ainda faz INSERT (não UPDATE) ao completar o
-- id_mensagem da enquete: isso cria uma segunda linha em mensagens_geral com
-- o voto, mas sem poll_appointment_id — órfã, o trigger de confirmação nunca
-- via ela.
--
-- Esse trigger detecta a linha órfã assim que ela é inserida (tem poll_name
-- mas não tem poll_appointment_id), acha a enquete ORIGINAL pendente (mesma
-- instancia+numero+pergunta, com poll_appointment_id preenchido) e repassa
-- o voto pra ela — o que dispara o trg_poll_vote_to_appointment normalmente.
--
-- Não substitui consertar o node do n8n (fica uma linha extra "fantasma" no
-- histórico), mas o status do agendamento passa a mudar mesmo sem esperar
-- esse conserto.
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
    SET poll_votes = COALESCE(NEW.poll_votes, poll_votes),
        poll_options = COALESCE(NEW.poll_options, poll_options)
    WHERE id = original_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_orphan_poll_vote ON public.mensagens_geral;
CREATE TRIGGER trg_link_orphan_poll_vote
  AFTER INSERT ON public.mensagens_geral
  FOR EACH ROW
  WHEN (NEW.poll_name IS NOT NULL AND NEW.poll_appointment_id IS NULL)
  EXECUTE FUNCTION public.link_orphan_poll_vote();
