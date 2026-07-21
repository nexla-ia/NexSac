-- Tabela dedicada para configuração do agente IA por instância
-- Mais fácil de consultar no n8n: SELECT * FROM agent_configs WHERE instancia = 'xxx'

create table if not exists agent_configs (
  id          uuid        default gen_random_uuid() primary key,
  instancia   text        not null unique,
  company_id  uuid        references companies(id) on delete cascade,
  config      jsonb       not null default '{}',
  updated_at  timestamptz default now()
);

-- Atualiza updated_at automaticamente
create or replace function update_agent_configs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agent_configs_updated_at on agent_configs;
create trigger trg_agent_configs_updated_at
  before update on agent_configs
  for each row execute function update_agent_configs_updated_at();

-- RLS — política aberta (auth customizada via JWT próprio, não Supabase Auth)
-- Acesso real é controlado pela instancia no backend/n8n com service_role key
alter table agent_configs enable row level security;

DO $$ BEGIN
  CREATE POLICY "agent_configs_all" ON public.agent_configs
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
