# NEXLA — AI Operations Hub

Painel centralizado para monitoramento de agentes de IA e atendimentos no WhatsApp.

## Estrutura de acesso

- **ADM Global** → gerencia todas as empresas e usuários
- **Usuário Empresa** → acessa somente dados da empresa vinculada

---

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Rodar em desenvolvimento
npm run dev

# 3. Abrir no navegador
http://localhost:5173
```

---

## Credenciais de demo

### ADM Global
- E-mail: `admin@nexla.ai`
- Senha: `nexla123`

### Empresa: Clínica Saúde Total
- `marcos@saudetotal.com` / `123456` (Admin)
- `ana@saudetotal.com` / `123456` (Viewer)

### Empresa: Imobiliária Novolar
- `carla@novolar.com.br` / `123456` (Admin)

### Empresa: Pet Shop Amigo Fiel
- `ju@amigofiel.com` / `123456` (Admin)

---

## Funcionalidades implementadas

### ADM Global
- [x] Dashboard com métricas globais
- [x] Listagem de empresas com status
- [x] Criar nova empresa (nome + plano)
- [x] Detalhe da empresa com lista de usuários
- [x] Criar usuário (nome, e-mail, senha, perfil admin/viewer)
- [x] Ativar/desativar usuário
- [x] Ativar/desativar empresa

### Painel Empresa
- [x] Lista de contatos WhatsApp com status em tempo real
- [x] Visualizador de conversas da IA por contato
- [x] Identificação de mensagens de agendamento e pedidos de ajuda
- [x] Histórico de conversas filtrável por contato
- [x] Tela de alertas com filtro pendente/resolvido
- [x] Marcar alerta como resolvido
- [x] Link direto para WhatsApp do contato

---

## Stack
- React 18 + Vite
- React Router v6
- Lucide React (ícones)
- CSS puro com variáveis (sem Tailwind, sem UI lib externa)

---

## Próximos passos sugeridos

- Integrar com backend real (Supabase, Firebase ou API própria)
- Conectar webhook do WhatsApp (Evolution API, Z-API, etc.)
- WebSocket para atualizações em tempo real
- Sistema de autenticação com JWT
- Notificações push para novos alertas
- Histórico com paginação e busca server-side
