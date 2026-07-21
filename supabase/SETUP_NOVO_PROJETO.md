# Setup — Novo Projeto (Base Comercial)

Checklist completo para subir a plataforma em um banco Supabase novo.
Execute na ordem abaixo para evitar dependências quebradas.

---

## 1. Supabase — Criar projeto

- [ ] Criar novo projeto em [supabase.com](https://supabase.com)
- [ ] Anotar a **Project URL** e a **anon key** (Settings → API)
- [ ] Anotar a **service_role key** (usada no n8n)

---

## 2. Supabase — Habilitar Extensions

Acesse **Database → Extensions** e habilite:

- [ ] `pg_cron` — lembretes automáticos de agendamento
- [ ] `pg_net` — disparo de webhooks HTTP de dentro do Postgres
- [ ] `uuid-ossp` — geração de UUIDs (geralmente já vem ativo)

---

## 3. Supabase — Rodar o schema

Acesse **SQL Editor → New query**, cole o conteúdo de `schema_consolidado.sql` e execute.

- [ ] Rodar `supabase/schema_consolidado.sql` completo
- [ ] Verificar se não houve erros no output (warnings são ok)
- [ ] Confirmar que as tabelas aparecem em **Table Editor**

> Se der erro em `pg_cron` ou `pg_net`, as extensions não estão ativas — volte ao passo 2.

---

## 4. Supabase — Realtime

Acesse **Database → Replication** e confirme que as tabelas abaixo estão na publicação `supabase_realtime`:

- [ ] `mensagens_geral`
- [ ] `conversations`
- [ ] `attendances`
- [ ] `appointments`
- [ ] `kanban_cards`
- [ ] `alerts`
- [ ] `saved_contacts`

> O schema já adiciona essas tabelas automaticamente, mas vale conferir.

---

## 5. Frontend — Variáveis de ambiente

Crie o arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO_ID.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

- [ ] Substituir `SEU_PROJETO_ID` pela URL real do projeto
- [ ] Substituir `sua_anon_key_aqui` pela anon key real

---

## 6. Vercel — Deploy do frontend

- [ ] Fazer push do repositório para o GitHub
- [ ] Importar o repositório no [vercel.com](https://vercel.com)
- [ ] Configurar as variáveis de ambiente no painel da Vercel:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- [ ] Fazer o deploy e confirmar que a URL abre sem erro

---

## 7. Primeiro acesso — Criar empresa e usuário admin

No **Supabase SQL Editor**, inserir a primeira empresa manualmente:

```sql
-- 1. Criar empresa
INSERT INTO public.companies (name, instance, plan, ai_enabled)
VALUES ('Nome da Empresa', 'instancia_whatsapp', 'Pro', true)
RETURNING id;

-- 2. Criar usuário admin (usar o id retornado acima)
SELECT create_user(
  'admin@empresa.com',
  'senha_inicial_segura',
  'Nome do Admin',
  'UUID_DA_EMPRESA_ACIMA',
  'admin'
);
```

- [ ] Substituir os valores acima pelos dados reais
- [ ] Fazer login no sistema e confirmar acesso

---

## 8. N8N — Reimportar workflows

- [ ] Abrir o N8N e importar os workflows do projeto anterior
- [ ] Atualizar a **Supabase URL** e **service_role key** em todos os nodes Supabase
- [ ] Atualizar a URL base do webhook de lembretes de agendamento
- [ ] Testar o fluxo de envio de mensagem manualmente

---

## 9. Evolution API / WhatsApp

- [ ] Criar nova instância na Evolution API com o nome da `instancia` cadastrada no passo 7
- [ ] Escanear o QR Code para conectar o WhatsApp
- [ ] Configurar o webhook da Evolution para apontar para o n8n novo
- [ ] Enviar mensagem de teste para confirmar o fluxo completo

---

## 10. Configurações iniciais no sistema

Após o login, acessar **Administração** e configurar:

- [ ] Setores / departamentos
- [ ] Usuários da equipe
- [ ] Horários da agenda
- [ ] Profissionais
- [ ] Catálogo de produtos/serviços
- [ ] Mensagem padrão de confirmação de agendamento
- [ ] Planos de pagamento (se aplicável)

---

## Checklist rápido — validação final

Antes de liberar para produção:

- [ ] Login funcionando
- [ ] Conversa chegando no painel em tempo real
- [ ] Envio de mensagem manual funcionando
- [ ] Agendamento criando e enviando confirmação
- [ ] Financeiro registrando lançamentos
- [ ] CRM criando contatos e movendo etapas

---

## Diferenças do modelo comercial

Este setup não inclui (removido intencionalmente):

- ~~Bucket de storage `prontuario`~~ — não necessário para plataforma comercial
- ~~Módulo de anamnese odontológica~~ — pode ser desativado em `companies.modules`
- ~~Campos Dente/Faces no orçamento~~ — ocultos por padrão, só aparecem com toggle

Para desativar módulos por empresa, editar o campo `modules` em `companies`:

```sql
UPDATE companies
SET modules = '{"agenda": true, "financeiro": true, "crm": true, "kanban": true, "contatos": true, "conversas": true}'
WHERE instance = 'instancia_da_empresa';
```
