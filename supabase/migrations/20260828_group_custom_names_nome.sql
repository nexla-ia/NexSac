-- ==============================================================
-- Grupos - renomeia custom_name para nome
--
-- A 20260721_group_custom_names criou esta tabela com a coluna `custom_name`.
-- O codigo passou a usar `nome` (e ganhou `id` e `updated_at`), entao a tabela
-- precisa acompanhar.
--
-- ORDEM IMPORTA: esta migration tem data POSTERIOR a 20260721 de proposito.
-- Ela reconcilia o que aquela criou; rodando antes, nao teria o que renomear.
--
-- Reconcilia em vez de recriar: renomeia preservando o conteudo, adiciona o
-- que falta e cria o indice unico que o upsert da tela precisa. Assim funciona
-- tanto num banco novo quanto num que ja rodava com o formato antigo.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase.
-- ==============================================================

-- Caminho feliz: banco novo, nasce já no formato certo.
CREATE TABLE IF NOT EXISTS public.group_custom_names (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  idgrupo    text        NOT NULL,
  nome       text        NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Reconciliação do formato legado.
DO $$
DECLARE
  has_col boolean;
BEGIN
  -- nome (no legado a coluna se chama custom_name)
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_custom_names' AND column_name='nome')
    INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.group_custom_names ADD COLUMN nome text;
    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='group_custom_names' AND column_name='custom_name') THEN
      UPDATE public.group_custom_names SET nome = custom_name WHERE nome IS NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_custom_names' AND column_name='custom_name') THEN
    ALTER TABLE public.group_custom_names DROP COLUMN custom_name;
  END IF;

  -- Apelido vazio não significa nada — a tela trata "sem apelido" como
  -- ausência de linha. Limpa antes de exigir NOT NULL.
  DELETE FROM public.group_custom_names WHERE nome IS NULL OR btrim(nome) = '';
  ALTER TABLE public.group_custom_names ALTER COLUMN nome SET NOT NULL;

  -- id + chave primária
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_custom_names' AND column_name='id')
    INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.group_custom_names ADD COLUMN id uuid DEFAULT gen_random_uuid();
    UPDATE public.group_custom_names SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.group_custom_names ALTER COLUMN id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.group_custom_names'::regclass AND contype = 'p') THEN
    ALTER TABLE public.group_custom_names ADD PRIMARY KEY (id);
  END IF;

  -- updated_at
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_custom_names' AND column_name='updated_at')
    INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.group_custom_names ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  -- instancia/idgrupo precisam ser obrigatórios (o legado pode permitir null)
  DELETE FROM public.group_custom_names WHERE instancia IS NULL OR idgrupo IS NULL;
  ALTER TABLE public.group_custom_names ALTER COLUMN instancia SET NOT NULL;
  ALTER TABLE public.group_custom_names ALTER COLUMN idgrupo   SET NOT NULL;
END $$;

-- O upsert da tela usa onConflict 'instancia,idgrupo' — precisa deste índice.
-- (Num banco novo a constraint UNIQUE do CREATE TABLE já geraria este mesmo
-- nome; aqui a criação fica explícita pra cobrir também o formato legado.)
CREATE UNIQUE INDEX IF NOT EXISTS group_custom_names_instancia_idgrupo_key
  ON public.group_custom_names (instancia, idgrupo);

ALTER TABLE public.group_custom_names ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "group_custom_names_all" ON public.group_custom_names
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS group_custom_names_instancia_idx
  ON public.group_custom_names (instancia);
