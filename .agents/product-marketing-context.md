# Product Marketing Context

*Last updated: 2026-04-29 · V1 auto-rascunhado*

## Product Overview
**One-liner:** A central de atendimento, agenda e gestão que sua clínica precisa.
**What it does:** Unifica WhatsApp, Instagram e Digisac numa caixa única, atende pacientes com IA 24/7, marca consultas com validação automática de conflitos e mede cada real que entra. Tudo num painel só, sem precisar planilha paralela.
**Product category:** Plataforma de atendimento e gestão para clínicas (vertical healthcare).
**Product type:** SaaS multi-tenant.
**Business model:** Assinatura mensal por empresa, 3 planos (Starter R$297 atual / Pro R$597 atual / Business sob medida). Sem cobrança por mensagem. Cancela quando quiser.
**Brand wordmark:** CliniSac — tagline "O SAC inteligente da sua clínica".

## Target Audience
**Target companies:** Clínicas médicas e odontológicas (consultórios solo até grupos com 50+ profissionais), com volume relevante de atendimento via WhatsApp e que dependem de secretária(s) pra agendar. Inclui também consultórios com franquia/multi-unidade.
**Decision-makers:** Médico-dono / dentista-dono (compra), gerente de clínica (operacionaliza), secretária (usuário diário).
**Primary use case:** Não perder paciente que chega pelo WhatsApp + organizar agenda sem planilha + ter visão financeira da clínica.
**Jobs to be done:**
- Atender 24/7 quem chama no WhatsApp/Instagram sem precisar contratar mais secretária
- Marcar consulta com cálculo automático de valor (procedimento × convênio) sem erro
- Saber quanto a clínica faturou, quem mais agendou, qual procedimento mais vendido — sem montar planilha

**Use cases:**
- Pré-agendamento por IA em horário não-comercial (madrugada, finais de semana)
- Substituir 1 secretária CLT (~R$3.500/mês) ou liberá-la pra trabalho mais estratégico
- Recepção de clínicas com filiais ver conversas/agendamentos de qualquer unidade
- Centralizar prontuário leve (ficha do paciente) sem comprar prontuário eletrônico caro

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Médico-dono (Champion + Decision Maker + Financial Buyer) | ROI, profissionalização da clínica, ter mais tempo livre | "Minha secretária vive sobrecarregada, paciente reclama de demora pra responder, não sei quanto faturei mês passado" | Operação digital de alta performance — atende 24/7, agenda sem erro, mostra o número certo |
| Gerente / coordenadora da clínica (User + Champion) | Eficiência da equipe, menos retrabalho | Excel tem versões diferentes em cada secretária, follow-up de paciente cai por terra | Quadro Kanban + agenda integrada + ficha de paciente: tudo num lugar |
| Secretária (User) | Não apanhar do WhatsApp, não esquecer paciente | Mil conversas paralelas, cliente esperando enquanto outro liga | Caixa unificada + IA filtrando, encerrando os simples e passando os complexos |

## Problems & Pain Points
**Core problem:** Paciente chega pelo WhatsApp e cai num atendimento humano lento, com horário comercial restrito, secretária sobrecarregada — clínica perde agendamento e nem sabe.
**Why alternatives fall short:**
- WhatsApp Business puro: não tem agenda, não tem IA, não tem métrica
- iClinic / Doctoralia / Feegow: são prontuário eletrônico, não falam direito com WhatsApp
- Planilha + Google Calendar: depende de disciplina humana, sem cálculo de convênio, sem IA
- Contratar mais secretária: R$3.500+/mês cada, escala linearmente

**What it costs them:** Pacientes perdidos (cada agendamento médio R$200-500), tempo de secretária retrabalhando, decisões financeiras no escuro.
**Emotional tension:** "Estou pagando secretária pra ela ficar copiando recado de WhatsApp pra Excel" + "Não sei quanto a clínica realmente fatura nem qual é meu paciente mais lucrativo".

## Competitive Landscape
**Direct:** iClinic, Feegow, Doctoralia Pro, Ninsaúde, Clinicorp — São prontuário eletrônico que tentou virar agenda. WhatsApp é pluggado mal e IA quase inexistente.
**Secondary:** WhatsApp Business + Google Calendar + Excel — Custa zero mas escala mal, sem IA, sem visão financeira, sem multi-unidade.
**Indirect:** Contratar mais secretárias — Resolve volume mas custa caro, não tem dado, depende de pessoa estar lá.

## Differentiation
**Key differentiators:**
- IA de atendimento 24/7 que realmente fecha agendamento (não só responde)
- Agenda com cálculo automático procedimento × convênio (sem secretária errar valor)
- Multi-tenant pensado pra clínicas com filiais (super-admin Nexla, instâncias separadas)
- Ficha de paciente leve com foto, timeline, prontuário básico — sem ser EHR caro
- Painel super-admin "Command Center" pra grupos/franquias com espelho de conversa e operação consolidada
- Métricas em 6 abas (Visão geral, Atendimento, Equipe, Agenda, Financeiro, Leads)

**How we do it differently:** Nasce centrado no atendimento (WhatsApp+IA primeiro), agenda e ficha vieram depois. Concorrentes nasceram como prontuário e empurraram WhatsApp como afterthought.
**Why that's better:** Onde o paciente realmente entra (WhatsApp) é onde a plataforma funciona melhor.
**Why customers choose us:** Substitui parcialmente secretária CLT por R$297/mês, retornando o investimento em 30 dias.

## Objections
| Objection | Response |
|-----------|----------|
| "IA vai responder besteira pro meu paciente" | IA é treinada com sua tabela de procedimentos/convênios; tudo que ela não souber vai pra Recepção humana com alerta sonoro |
| "Já tenho prontuário eletrônico (iClinic, Feegow)" | Não substitui — complementa. A gente é o front-end de atendimento; integramos depois |
| "Parece complicado migrar minha agenda" | Setup guiado em 24h. Cadastrar profissionais e procedimentos leva 1-2h |

**Anti-persona:** Hospital grande / rede com TI próprio (vão querer dev custom), profissional autônomo sem volume (não justifica nem o Starter), clínica que recusa qualquer automação ("paciente quer ouvir voz humana").

## Switching Dynamics
**Push:** Secretária pediu demissão / saiu de licença / sobrecarregou. Paciente reclamando que demora pra responder. Mês fechou e dono não sabe quanto faturou.
**Pull:** "Eu queria que a IA respondesse de noite" + "queria saber quem mais agenda".
**Habit:** Excel da agenda + grupo de WhatsApp da equipe + planilha financeira do contador.
**Anxiety:** "E se a IA disser preço errado?" + "minha equipe vai resistir a mudar?" + "vou ficar refém do sistema?"

## Customer Language
**How they describe the problem:**
- "Tô perdendo paciente no WhatsApp"
- "Minha secretária não dá conta"
- "Não sei quanto a clínica fatura"
- "A gente vive na planilha"

**How they describe us:**
- "É tipo um WhatsApp que faz a agenda sozinho"
- "Substitui meia secretária"
- "Centraliza tudo num lugar só"

**Words to use:** atendimento, agenda, ficha do paciente, convênio, recepção, agendamento, profissional, procedimento, lucro, paciente.
**Words to avoid:** lead (parece marketing genérico), MRR/SaaS/churn (jargão de tech), funil (parece vendas), CRM (denota frieza). Use "paciente" sempre, nunca "cliente".
**Glossary:**
| Term | Meaning |
|------|---------|
| Recepção | Aba de conversas que IA filtrou, aguardando humano |
| Meu Setor | Conversas atribuídas ao operador logado |
| Ticket | Uma conversa aberta com paciente |
| Instância | Conexão WhatsApp da empresa (Evolution API) |
| Espião (interno) | Painel super-admin pra Nexla espelhar conversa de qualquer empresa |

## Brand Voice
**Tone:** Direto, conversacional, sem jargão de tech. "Vocês podem", "demos pra vocês", "acabou aquela história de planilha". Tom de quem entende a dor do médico-dono.
**Style:** Frase curta, exemplo concreto, número quando possível. Não usa emoji em produto (só na landing/comunicação).
**Personality:** Confiável, eficiente, irônico-com-graça, pragmático, anti-corporativês.

## Proof Points
**Metrics:** 3.2x mais agendamentos confirmados · 68% redução no tempo de atendimento · 24/7 IA · <2% mensagens não respondidas · Setup em 24h · 99.9% uptime · LGPD Compliance.
**Customers:** [PREENCHER — quais clínicas reais já usam? Hoje listadas no README como demo: Saúde Total, Novolar, Pet Shop Amigo Fiel — substituir por reais]
**Testimonials:** [PREENCHER — pegar 1-3 quotes reais de clientes piloto]
**Value themes:**
| Theme | Proof |
|-------|-------|
| Substitui secretária CLT | R$297 vs R$3.500/mês = ROI em <1 mês |
| IA não-besta | Atende 24/7 e fecha agendamento, não só responde "ok, deixa eu verificar" |
| Tudo num lugar | WhatsApp + Instagram + agenda + ficha + financeiro + métricas |

## Goals
**Business goal:** [CONFIRMAR — bater quantos clientes pagantes até quando?]
**Conversion action:** Trial grátis (sem cartão) → ativação em 24h → conversão pra plano pago.
**Current metrics:** [PREENCHER — quantos clientes hoje? MRR atual? Plano mais vendido?]

---

## Pendências para você confirmar/preencher
1. **Clientes reais e logos** — substituir os mocks do README
2. **Testimonials reais** — 1-3 frases de clientes piloto
3. **Métricas atuais** — quantos clientes pagantes, MRR, distribuição por plano
4. **Meta de negócio** — qual número você está perseguindo nos próximos 6 meses?
5. **As stats da landing (3.2x, 68%, etc)** — são reais ou aspiracionais? Se não medidas, pegar mais leve no copy
