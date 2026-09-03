-- O node do n8n às vezes INSERE a linha órfã (voto novo) e às vezes
-- ATUALIZA essa mesma linha órfã de novo quando o paciente troca o voto.
-- O gatilho de correção (20260903e) só escutava INSERT — trocar o voto
-- não disparava a propagação pra linha original. Agora escuta os dois.
DROP TRIGGER IF EXISTS trg_link_orphan_poll_vote ON public.mensagens_geral;
CREATE TRIGGER trg_link_orphan_poll_vote
  AFTER INSERT OR UPDATE OF poll_votes, poll_options ON public.mensagens_geral
  FOR EACH ROW
  WHEN (NEW.poll_name IS NOT NULL AND NEW.poll_appointment_id IS NULL)
  EXECUTE FUNCTION public.link_orphan_poll_vote();
