# Migrations trazidas de outro repositório

Estas migrations já estavam **aplicadas no banco de produção**, mas os arquivos
viviam em outro repositório (`alissonamorim2004/nexsac`), que a Vercel não lê.
O resultado é que este repositório descrevia um schema mais pobre do que o
banco real: quem montasse um ambiente novo a partir dele teria colunas,
tabelas e funções faltando, e a plataforma quebraria em vários pontos.

Trazidas aqui para o repositório voltar a descrever o banco.

## O que cada uma resolve

| Arquivo | Para quê |
|---|---|
| `20260630_mensagens_apagada` | coluna `apagada` — mensagem apagada pelo cliente |
| `20260723_mensagens_contact_card` | coluna `contact_card` — vCard compartilhado |
| `20260724_mensagens_location` | coluna `location` — pin de localização |
| `20260813_message_reactions` | coluna `reaction` + `set_message_reaction()` |
| `20260629_perf_distinct_rpcs` | `api_distinct_numeros`, `api_distinct_grupos` |
| `20260629_perf_aggregation_rpcs` | agregações do ADM (dashboard e operação) |
| `20260713_conversas_contatos_rpc` | `api_conversas_contatos` — lista de contatos |
| `20260727_api_grupos_lista` | `api_grupos_lista` — lista de grupos |
| `20260817_reopen_grace_period` | conversa finalizada parava de reabrir sozinha |
| `20260629_crm_autocreate_lead` | número novo vira lead automaticamente |
| `20260630_crm_advance_concluido` | lead avança ao concluir o agendamento |
| `20260801_crm_contact_funnels` | mesmo lead em vários funis |
| `20260801_crm_lead_soft_delete` | lead removido não volta como novo |
| `20260807_crm_temperature_custom` | temperaturas além de frio/morno/quente |
| `20260828_group_custom_names_nome` | `custom_name` → `nome` (ver abaixo) |

As duas RPCs de lista não são otimização: sem elas a tela cai num fallback
paginado, porque o PostgREST corta em 1000 linhas e contatos com mensagem
antiga sumiam da Recepção.

## Ordem importa em uma delas

`20260828_group_custom_names_nome` tem data **posterior** à
`20260721_group_custom_names` de propósito. Aquela cria a tabela com
`custom_name`; esta renomeia para `nome` e adiciona `id` e `updated_at`, que é
o formato que o código usa. Rodando antes, não teria o que renomear.

Ela reconcilia em vez de recriar, então funciona tanto num banco novo quanto
num que já rodava com o formato antigo.

## Não foram trazidas

`close_reasons`, `mensagens_quoted` e `quoted_text` existem aqui em versão
própria (`20260721_*`) com o mesmo resultado final. Duplicar só criaria ruído.

## Migration opcional

`_OPCIONAL_20260630_crm_backfill_leads.sql` tem esse prefixo porque é a única
que **escreve dados**: cria um lead para cada contato que já mandou mensagem.
As outras só mexem em estrutura. O CRM funciona sem ela — o gatilho de
autocriação vai populando daqui pra frente.

## Lição que custou caro

A tabela `group_custom_names` foi encontrada no banco sem migration
correspondente **neste** repositório, e concluí que tinha sido criada à mão no
dashboard. Não tinha: vinha do outro repositório, que eu ainda não conhecia.
Agi sobre essa conclusão errada, dropei `custom_name` e quebrei o renomear
grupo em produção.

Com mais de um repositório vivo, "não achei a migration" não quer dizer "não
existe".
