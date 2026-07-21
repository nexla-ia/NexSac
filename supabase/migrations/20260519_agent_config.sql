-- Adiciona coluna de configuração do agente IA por empresa
alter table companies
  add column if not exists agent_config jsonb;
