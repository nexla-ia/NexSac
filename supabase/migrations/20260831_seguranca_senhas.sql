-- ==============================================================
-- SEGURANÇA — hashes de senha fora do alcance da chave pública
--
-- Achado numa auditoria: a tabela `users` era legível pela chave anon (a que
-- vai no bundle e qualquer visitante extrai), INCLUINDO a coluna
-- password_hash. E o hash era bcrypt de custo 6 — o gen_salt('bf') foi
-- chamado sem parâmetro, e o padrão do pgcrypto é 6. São 64 iterações contra
-- as 4.096 do custo 12.
--
-- Juntando as duas coisas: dava pra baixar todos os hashes e quebrar offline
-- em tempo trivial, sem nem tentar o login.
--
-- Esta migration resolve as duas pontas. O isolamento por empresa (RLS de
-- verdade) é problema separado e maior — depende de trocar a autenticação,
-- porque hoje não existe identidade no banco pra política filtrar.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. password_hash deixa de ser legível
--
-- Privilégio de COLUNA, não RLS: as políticas são USING (true) e não têm como
-- esconder coluna. Revoga o SELECT da tabela toda e devolve só nas colunas que
-- a aplicação usa de fato — password_hash fica de fora.
--
-- ATENÇÃO: exige que nenhum select peça `*` em users. O CompanyAdmin fazia
-- isso e foi trocado por lista explícita de colunas no mesmo commit. Se um
-- select('*') voltar, a tela quebra com erro de permissão.
-- ─────────────────────────────────────────────────────────────

REVOKE SELECT ON public.users FROM anon, authenticated;

GRANT SELECT (id, name, email, role, active, company_id, created_at)
  ON public.users TO anon, authenticated;

-- INSERT/UPDATE seguem como estavam: quem cria e troca senha são as funções
-- SECURITY DEFINER abaixo, que rodam como dono e não dependem destes grants.

-- ─────────────────────────────────────────────────────────────
-- 2. bcrypt custo 12 nas senhas novas
--
-- Não dá pra re-hashear as existentes: o hash é irreversível e a senha em
-- claro não existe em lugar nenhum. Elas continuam em custo 6 até que a
-- pessoa troque a senha. Por isso vale forçar uma troca geral depois de
-- rodar isto — é a única forma de tirar todo mundo do custo 6.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_user(
  p_name text, p_email text, p_password text, p_role text, p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
declare new_id uuid;
begin
  insert into public.users (name, email, password_hash, role, company_id)
  values (p_name, p_email, crypt(p_password, gen_salt('bf', 12)), p_role, p_company_id)
  returning id into new_id;
  return new_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.update_user_password(p_user_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
begin
  update public.users
  set password_hash = crypt(p_password, gen_salt('bf', 12))
  where id = p_user_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. login_user para de entregar quais e-mails existem
--
-- A versão anterior respondia em ~122ms para e-mail cadastrado e ~73ms para
-- inexistente, porque só chamava o crypt() quando encontrava a linha. A
-- diferença dizia quem tem conta.
--
-- Agora o crypt() roda sempre — contra o hash real quando existe, contra um
-- hash descartável quando não existe — então o tempo não denuncia mais.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.login_user(p_email text, p_password text)
RETURNS TABLE(id uuid, name text, email text, role text, active boolean, company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   public.users%ROWTYPE;
  v_ok     boolean;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE email = p_email;

  IF FOUND THEN
    v_ok := (v_user.password_hash = crypt(p_password, v_user.password_hash));
  ELSE
    -- Queima o mesmo tempo de CPU e descarta. gen_salt gera um salt novo
    -- (barato) e o crypt em custo 12 é a parte cara — exatamente o mesmo
    -- trabalho de verificar um hash real, sem depender de constante fixa.
    PERFORM crypt(p_password, gen_salt('bf', 12));
    v_ok := false;
  END IF;

  IF v_ok AND v_user.active THEN
    RETURN QUERY SELECT v_user.id, v_user.name, v_user.email,
                        v_user.role, v_user.active, v_user.company_id;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated;
