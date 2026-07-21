-- ────────────────────────────────────────────────────────────────────────────
-- Migration: delete_user RPC
-- Motivo: A tabela `users` não tem policy de DELETE no RLS, então o delete
-- direto via anon key é silenciosamente bloqueado (não retorna erro, mas o
-- registro permanece). Esta RPC roda como SECURITY DEFINER e bypassa RLS,
-- mesmo padrão de `create_user` e `update_user_password` que já existem.
--
-- Como aplicar:
--   1. Abra o Supabase Studio → SQL Editor
--   2. Cole este arquivo inteiro
--   3. Run
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_user(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM users WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Usuário não encontrado');
  END IF;

  -- Limpa vínculos best-effort (ignora se a tabela/coluna não existir ainda)
  BEGIN
    DELETE FROM sector_members WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE kanban_cards SET assignee_id = NULL WHERE assignee_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE attendances SET user_id = NULL WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE alerts SET forwarded_to = NULL WHERE forwarded_to = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object('ok', true, 'email', v_user_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO anon, authenticated;
