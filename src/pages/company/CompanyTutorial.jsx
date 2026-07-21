import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GraduationCap, MessageSquare, History, Calendar, Kanban, BellRing,
  BarChart3, Stethoscope, Settings2, Sparkles, Check, ArrowRight, Lightbulb,
  PartyPopper, BookOpen, ChevronRight, Bot, Headset, Phone, Star, Zap,
  Mic, Paperclip, FileText, Trophy, Inbox, Users, Flag, Clock, ShieldCheck,
  Camera, Cake, Instagram, UserPlus, UserCheck, ClipboardList,
  TrendingUp, AlertCircle, MessageSquareHeart, Lock, EyeOff, Database, Send,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import ConfirmModal from '../../components/ConfirmModal'
import './CompanyTutorial.css'

const SEEN_KEY = 'nx_tutorial_completed'

// ─── DADOS ───────────────────────────────────────────────────────────────────
const MODULES = [
  {
    key: 'conversas',
    icon: MessageSquare,
    color: '#2563EB',
    bg: '#DBEAFE',
    emoji: '💬',
    title: 'Conversas',
    subtitle: 'O coração do atendimento',
    intro: 'Aqui você vê tudo que chega da sua empresa em tempo real — WhatsApp, Instagram, Digisac, tudo no mesmo lugar.',
    steps: [
      {
        title: 'Três abas para organizar tudo',
        desc: 'Recepção (sob IA, aguardando humano) · Meu Setor (atendimentos seus) · Finalizados (encerrados). A cor da bolinha mostra onde a conversa está.',
      },
      {
        title: 'Assumir uma conversa',
        desc: 'Clica no botão verde "Assumir atendimento". A conversa sai da Recepção e vem para o Meu Setor. Você também pode mandar mensagem direto na Recepção que assume automaticamente.',
      },
      {
        title: 'Mandar texto, áudio, imagem ou PDF',
        desc: 'Use os botões de microfone (🎤) e clipe (📎) ao lado da caixa de texto. Áudio gravado direto pelo navegador, mídia visualizada na conversa.',
        chips: [{ icon: Mic, label: 'Áudio' }, { icon: Paperclip, label: 'Anexo' }, { icon: FileText, label: 'PDF' }],
      },
      {
        title: 'Salvar contato direto no header',
        desc: 'Botão "Salvar contato" agora fica visível no topo da conversa, do lado de Agendar e Finalizar. Quando o cliente já tá fichado, o botão fica verde mostrando "Editar [nome]". Sem precisar mais lembrar de clicar com botão direito.',
        chips: [{ icon: UserPlus, label: 'Salvar' }, { icon: UserCheck, label: 'Editar' }],
      },
      {
        title: 'Origem do contato detectada sozinha',
        desc: 'Se o cliente disser "vi vocês no Instagram" ou "minha amiga indicou" nas primeiras mensagens, a plataforma identifica e marca a origem dele automaticamente — sem você precisar perguntar.',
      },
      {
        title: 'Abrir ficha do contato em 1 clique',
        desc: 'Clica no nome ou na foto do contato no header do chat e abre a ficha completa: resumo, cadastro e histórico de atendimentos.',
        chips: [{ icon: Camera, label: 'Foto' }, { icon: ClipboardList, label: 'Ficha' }],
      },
      {
        title: 'Finalizar com motivo',
        desc: 'Ao terminar, clica em "Finalizar conversa" e escolhe: Agendado, Resolvido, Encaminhado ou Desistiu. Isso vai virar métrica depois.',
      },
    ],
    tip: 'Tickets sem atividade por 2h fecham automaticamente como "Expirado". Se o cliente voltar, o ticket reabre na Recepção sozinho — sem trabalho manual pra equipe.',
    cta: { label: 'Abrir Conversas', to: '/painel/conversas' },
  },
  {
    key: 'historico',
    icon: History,
    color: '#7C3AED',
    bg: '#EDE9FE',
    emoji: '🤖',
    title: 'Conversas IA',
    subtitle: 'O histórico completo da IA',
    intro: 'Aqui ficam todas as mensagens que a IA processou — útil para auditar respostas e entender o que sua assistente virtual está dizendo aos clientes.',
    steps: [
      {
        title: 'Veja só as conversas com IA',
        desc: 'Diferente da aba Conversas, aqui você vê o registro puro do que a IA respondeu. Quando alguém assume o atendimento, as mensagens humanas não aparecem aqui.',
      },
      {
        title: 'Tag "Assumido"',
        desc: 'Conversas que foram para atendente humano ganham essa tag verde. Te ajuda a identificar onde a IA precisou passar o bastão.',
      },
      {
        title: 'Pesquise por número',
        desc: 'Use a busca para encontrar rápido o histórico de um cliente específico.',
      },
    ],
    tip: 'Empresas com IA desativada não veem essa aba — só faz sentido se você usa IA.',
    cta: { label: 'Abrir Conversas IA', to: '/painel/historico' },
  },
  {
    key: 'pacientes',
    icon: Users,
    color: '#16A34A',
    bg: '#DCFCE7',
    emoji: '🧑‍💼',
    title: 'Contatos',
    subtitle: 'Ficha completa de cada contato',
    intro: 'A aba Contatos guarda a ficha completa de cada cliente — foto, dados de cadastro e histórico de atendimentos. Tudo que a empresa precisa pra acompanhar quem é atendido ali.',
    steps: [
      {
        title: 'Cadastro novo com autocomplete',
        desc: 'Clica em "Novo contato" e o sistema sugere números que já conversaram com vocês mas ainda não foram cadastrados. Um clique e o telefone vai pro formulário.',
        chips: [{ icon: UserPlus, label: 'Cadastro rápido' }, { icon: Phone, label: 'Sugere telefone' }],
      },
      {
        title: 'Foto no perfil',
        desc: 'Cada contato pode ter uma foto. Ela aparece como avatar nas Conversas, no header do chat, nos cards de agendamento — toda a plataforma fica com cara de gente.',
        chips: [{ icon: Camera, label: 'Avatar em todo lugar' }],
      },
      {
        title: 'Ficha em 3 abas',
        desc: 'Resumo (visão geral) · Cadastro (dados pessoais e contato) · Histórico (timeline de atendimentos e agendamentos).',
        chips: [{ icon: ClipboardList, label: 'Resumo' }, { icon: FileText, label: 'Cadastro' }, { icon: History, label: 'Histórico' }],
      },
      {
        title: 'Banner de aniversário',
        desc: 'Quando o contato faz aniversário nos próximos 7 dias, a ficha mostra um banner dourado lembrando — perfeito pra mandar mensagem carinhosa e fortalecer relacionamento.',
        chips: [{ icon: Cake, label: 'Lembrete automático' }],
      },
      {
        title: 'Edição em formulário guiado',
        desc: 'Clica em "Editar" e abre um modal com sub-abas: Identificação, Contato, Notas. Cada campo no lugar certo, sem se perder.',
      },
      {
        title: 'Atalho pra Conversar',
        desc: 'Em qualquer card de contato, botão verde "Conversar" abre o ticket existente ou cria um novo. E clicando na linha, abre direto a ficha completa.',
      },
      {
        title: 'Origem detectada sozinha',
        desc: 'Não precisa perguntar "como conheceu a empresa?". A plataforma lê as primeiras mensagens do cliente e detecta automaticamente: Indicação, Instagram, Google, Facebook, Anúncio, Site... Tudo isso vira métrica em Métricas → Leads.',
      },
    ],
    tip: 'Mantenha o cadastro do contato sempre atualizado — nome, telefone e notas ficam visíveis no Resumo da ficha, ajudando a equipe a atender com contexto na hora.',
    cta: { label: 'Abrir Contatos', to: '/painel/contatos' },
  },
  {
    key: 'agenda',
    icon: Calendar,
    color: '#0891B2',
    bg: '#CFFAFE',
    emoji: '📅',
    title: 'Agenda',
    subtitle: 'Marque agendamentos direto da plataforma',
    intro: 'Calendário semanal com os agendamentos da empresa. Cria múltiplas agendas (uma por profissional ou por sala) com horários, dias e duração de slot configuráveis.',
    steps: [
      {
        title: 'Crie agendas na aba "Agendas"',
        desc: 'Cada agenda tem nome, cor, dias da semana ativos, horário de início/fim e duração de slot (15 a 90 min). Pode vincular a um profissional cadastrado.',
      },
      {
        title: 'Agendar clicando num slot',
        desc: 'No calendário, clica num horário vazio para criar agendamento. Auto-completa nome dos contatos salvos. Selecione profissional + serviço que o valor vem automático.',
      },
      {
        title: 'Status do agendamento',
        desc: '5 estados: Agendado · Confirmado · Concluído · Não compareceu · Cancelado. Marcar como Concluído já registra pagamento como Pago.',
      },
      {
        title: 'Validações automáticas',
        desc: 'Não deixa marcar fora do dia/horário do profissional, nem dentro do intervalo, nem em conflito com outro cliente do mesmo profissional.',
      },
      {
        title: 'Integração com Conversas',
        desc: 'Cada vez que cria, remarca, confirma ou cancela um agendamento, registra mensagem no chat do cliente. Vocês veem o histórico inteiro do agendamento dentro da conversa, sem alternar telas.',
      },
      {
        title: 'WhatsApp dispara automaticamente em todo evento',
        desc: 'Marcou o agendamento? Cliente recebe confirmação no WhatsApp na hora. Remarcou? Aviso com data nova. Confirmou? Mensagem agradecendo. Cancelou? Aviso amigável. Tudo sai sozinho, com o nome do cliente, data, hora e profissional — vocês não precisam mais ficar copiando e colando texto.',
        chips: [{ icon: MessageSquare, label: 'WhatsApp em todo evento' }, { icon: Zap, label: 'Sem trabalho manual' }],
      },
      {
        title: 'Sugestões de telefone inteligentes',
        desc: 'No campo de telefone do agendamento, comece a digitar pelo DDD (sem precisar do 55) e a plataforma sugere clientes que já conversaram com vocês. Pega contatos salvos e também números que aparecem no histórico do chat — mesmo cliente nunca cadastrado aparece na sugestão.',
        chips: [{ icon: Phone, label: 'Filtra do DDD' }],
      },
    ],
    tip: 'Na lista de Conversas aparece uma tag roxa "📅 hoje 14:30" no contato que tem agendamento futuro. Visualmente indica quem espera atendimento. E se ligar os lembretes automáticos lá na Administração, o cliente recebe mais um WhatsApp antes da hora — relembrando que tem agendamento.',
    cta: { label: 'Abrir Agenda', to: '/painel/agenda' },
  },
  {
    key: 'atividades',
    icon: Kanban,
    color: '#DB2777',
    bg: '#FCE7F3',
    emoji: '📋',
    title: 'Kanban',
    subtitle: 'Quadro de tarefas internas da empresa',
    intro: 'Crie colunas (A Fazer, Em Andamento, Concluído ou o que preferir) e cards de tarefas. Use para checklists internos, follow-up de clientes, tarefas da empresa.',
    steps: [
      {
        title: 'Crie suas colunas',
        desc: 'Botão "Nova coluna" (só admin). Dá nome e cor. Tem o atalho "Usar padrão" que cria as 3 colunas básicas automaticamente.',
      },
      {
        title: 'Adicionar cards',
        desc: 'Em cada coluna tem botão "Adicionar card". Cada card tem título, descrição, prioridade (Baixa/Normal/Alta/Urgente), data de vencimento e atendente atribuído.',
      },
      {
        title: 'Arrastar entre colunas',
        desc: 'Para mudar de status, segura e arrasta o card. A posição também é salva — você pode reordenar dentro da coluna.',
      },
      {
        title: 'Filtros',
        desc: 'No topo: filtrar por atendente (incluindo "Meus cards" e "Sem atribuição") e por prioridade. Útil quando o quadro fica grande.',
      },
    ],
    tip: 'Cards com data vencida ganham badge vermelho "Atrasado". Use para nunca perder um follow-up importante.',
    cta: { label: 'Abrir Kanban', to: '/painel/atividades' },
  },
  {
    key: 'alertas',
    icon: BellRing,
    color: '#D97706',
    bg: '#FEF3C7',
    emoji: '🔔',
    title: 'Alertas',
    subtitle: 'Avisos da IA e encaminhamentos',
    intro: 'Quando a IA não dá conta, ela manda um alerta para vocês. Quando alguém precisa transferir uma conversa, vira um encaminhamento.',
    steps: [
      {
        title: 'Notificação sonora',
        desc: 'Ative o som no banner amarelo no topo da tela para ser avisado em tempo real quando chega alerta novo.',
      },
      {
        title: 'Encaminhar para colega',
        desc: 'Cada alerta tem botão "Encaminhar". Escolhe um atendente da equipe e ele recebe na tela dele com badge roxa "Encaminhado para você".',
      },
      {
        title: 'Botões de ação rápida',
        desc: 'Em cada alerta tem nome, número (com botão de copiar), atalho para WhatsApp e Digisac (se configurado).',
      },
      {
        title: 'Marcar como resolvido',
        desc: 'Quando lidar com a situação, clica em "Marcar resolvido". Some da fila pendente.',
      },
    ],
    tip: 'Empresas com IA desativada veem só encaminhamentos — alertas gerais da IA não aparecem.',
    cta: { label: 'Abrir Alertas', to: '/painel/alertas' },
  },
  {
    key: 'instagram',
    icon: Instagram,
    color: '#E11D48',
    bg: '#FFE4E6',
    emoji: '📸',
    title: 'Instagram',
    subtitle: 'Em breve · DMs unificadas + IA criando posts',
    intro: 'A aba Instagram já existe no menu (com badge "Em breve") como teaser do que tá vindo. A ideia é centralizar tudo do Insta da empresa dentro da plataforma.',
    steps: [
      {
        title: 'DMs do Instagram nas Conversas',
        desc: 'Mesma caixa de entrada do WhatsApp — DM cai como ticket, IA filtra, equipe assume. Sem precisar abrir o app do celular.',
      },
      {
        title: 'IA gera posts pra empresa',
        desc: 'Conta pra IA o tema (ex: "5 dúvidas sobre o seu serviço") e ela monta carrossel completo: copy, sugestão visual, hashtags. Você só revisa e aprova.',
      },
      {
        title: 'Calendário editorial integrado',
        desc: 'Programa post pra sair na quarta às 18h. A plataforma publica e ainda mede engajamento dentro da própria aba de Métricas.',
      },
    ],
    tip: 'Esse módulo ainda não está liberado — a aba mostra uma página teaser editorial. Assine a newsletter dentro da página pra ser avisado quando entrar em produção.',
    cta: { label: 'Ver teaser', to: '/painel/instagram' },
  },
  {
    key: 'metricas',
    icon: BarChart3,
    color: '#059669',
    bg: '#D1FAE5',
    emoji: '📊',
    title: 'Métricas',
    subtitle: '6 abas para entender sua operação',
    intro: 'Dashboard completo. Use os filtros de período (Hoje, Ontem, Semana, Mês, Todos) no topo — eles afetam todas as abas.',
    steps: [
      {
        title: 'Visão Geral',
        desc: 'KPIs principais: tickets novos, ativos, finalizados, agendamentos hoje, alertas pendentes, atividades atrasadas. Volume de mensagens por dia.',
      },
      {
        title: 'Atendimento',
        desc: 'Tempo médio até atendimento, duração de ticket, taxa de IA→humano, motivos de encerramento, mensagens por hora.',
      },
      {
        title: 'Equipe',
        desc: 'Ranking de atendentes (com troféu pro top 1) e distribuição por setor.',
      },
      {
        title: 'Agenda',
        desc: 'Confirmação, não comparecimento, cancelamento. Distribuição por status e por dia da semana.',
      },
      {
        title: 'Financeiro',
        desc: 'Faturamento, ticket médio, a receber, perdido em faltas. Ranking por profissional e serviço. Donut por forma de pagamento.',
      },
      {
        title: 'Leads — funil completo de conversão',
        desc: '6 KPIs (total, contactados, agendaram, receita atribuída, tempo até 1º contato, sem resposta), funil visual de 5 etapas (Recebidos → Contactados → Trocaram msg → Agendaram → Compareceram) com taxa de conversão entre etapas, volume diário em barras, tabela de origens com taxa de conversão por canal, e lista acionável de leads sem resposta com badge urgente +24h.',
        chips: [{ icon: Flag, label: 'Funil' }, { icon: TrendingUp, label: 'Atribuição' }, { icon: AlertCircle, label: 'Pendentes' }],
      },
      {
        title: 'Status do lead computado automaticamente',
        desc: '5 estágios atualizados sozinhos: novo → em atendimento → agendado → encerrado / perdido. Sem você ter que classificar manualmente — a plataforma deduz pelo que está acontecendo na conversa.',
      },
      {
        title: 'Atividades (Kanban)',
        desc: 'Visão geral do quadro: cards atrasados, urgentes, sem atribuição, distribuição por coluna.',
      },
    ],
    tip: 'O badge laranja "Atenção" aparece quando algum KPI está em estado crítico (não comparecimento alto, cards atrasados, etc.). Olhe primeiro para esses.',
    cta: { label: 'Abrir Métricas', to: '/painel/metricas' },
  },
  {
    key: 'catalogo',
    icon: Stethoscope,
    color: '#A855F7',
    bg: '#F3E8FF',
    emoji: '🩺',
    title: 'Catálogo de Serviços',
    subtitle: 'Profissionais e serviços',
    intro: 'Aqui é onde você cadastra a estrutura da empresa. Tudo que cadastrar aparece automaticamente nos modais de agendamento.',
    steps: [
      {
        title: 'Profissionais',
        desc: 'Nome, departamento/setor, cor, dias e horários de atendimento, intervalo (almoço). Tudo isso vira validação na agenda.',
      },
      {
        title: 'Serviços',
        desc: 'Nome do serviço, duração padrão e valor. Pode ser específico de um profissional ou da empresa toda.',
      },
    ],
    tip: 'No agendamento, ao escolher o serviço, o valor é preenchido automaticamente. Se o cliente pagar diferente, é só editar no campo.',
    cta: { label: 'Abrir Catálogo', to: '/painel/catalogo' },
  },
  {
    key: 'seguranca',
    icon: ShieldCheck,
    color: '#0D9488',
    bg: '#CCFBF1',
    emoji: '🛡️',
    title: 'Segurança & Privacidade',
    subtitle: 'O que a gente vê, o que a gente nunca vê',
    intro: 'A aba Segurança existe pra deixar transparente como a NexSac trata os dados de vocês e dos clientes. Quando cliente perguntar "pra onde vai meu dado?", vocês têm a resposta dentro da plataforma.',
    steps: [
      {
        title: 'Nove pilares navegáveis',
        desc: 'Cada pilar é um card com explicação enxuta: privacidade da conversa, infraestrutura AWS Brasil, criptografia (TLS 1.3 + AES-256), métricas vs bisbilhotagem, LGPD na prática, controlador vs operadora, transparência total, direitos do cliente e plano de incidente.',
        chips: [{ icon: Lock, label: 'Criptografia' }, { icon: Database, label: 'AWS Brasil' }, { icon: ShieldCheck, label: 'LGPD' }],
      },
      {
        title: 'O que a equipe Nexla vê',
        desc: 'Métricas agregadas (volume de tickets, tempo médio, conversão), erros do sistema pra debugar, configurações que vocês mesmo definem. Tudo o que precisa pra plataforma funcionar bem.',
      },
      {
        title: 'O que a equipe Nexla NUNCA vê (sem autorização)',
        desc: 'Conteúdo de mensagens, áudios e imagens enviadas pelos clientes. Esses dados ficam isolados — só vocês acessam. Se a gente precisar olhar pra resolver um problema específico, pedimos autorização antes.',
        chips: [{ icon: EyeOff, label: 'Conteúdo isolado' }],
      },
      {
        title: 'LGPD na prática',
        desc: 'Vocês são o controlador dos dados dos clientes; a NexSac é só operadora. Cada cliente tem direito de pedir acesso, exportação ou exclusão dos próprios dados — vocês podem fazer isso direto na ficha do contato.',
      },
      {
        title: 'Plano de incidente',
        desc: 'Se acontecer algo inesperado (vazamento, indisponibilidade), o protocolo está descrito na própria página: prazo de notificação à ANPD, comunicação aos titulares afetados, registro de auditoria. Não é checklist genérico — é o que a gente faz.',
      },
    ],
    tip: 'Mostre a aba Segurança pra cliente preocupado com privacidade. Mostre também pra qualquer parceiro que pedir auditoria. Está tudo pronto pra apresentar — e é a verdade.',
    cta: { label: 'Abrir Segurança', to: '/painel/seguranca' },
  },
  {
    key: 'feedback',
    icon: MessageSquareHeart,
    color: '#DB2777',
    bg: '#FCE7F3',
    emoji: '💌',
    title: 'Feedback — moldando a plataforma com vocês',
    subtitle: 'Diga o que mudaria, faria diferente ou que ama',
    intro: 'O Feedback é o lugar pra vocês contarem o que tá funcionando, o que tá doendo e o que querem ver. A gente lê tudo — e usa pra decidir o que construir a seguir.',
    steps: [
      {
        title: 'Capa editorial dividida em dois',
        desc: 'Esquerda: o formulário pra mandar um feedback novo, com categorias (Sugestão, Melhoria, Bug, Ideia maluca, Elogio) e nota de 1 a 5 estrelas. Direita: o histórico dos seus feedbacks anteriores, com a resposta da equipe quando tiver.',
        chips: [{ icon: Star, label: 'Categoria + nota' }, { icon: History, label: 'Histórico fixo' }],
      },
      {
        title: 'O que escrever',
        desc: 'Pode ser "isso aqui devia ser do jeito X", "achei um bug na tela Y", "o nome desse botão é ruim", "amei a parte Z". Sem regra. Quanto mais específico, mais útil — mas se vier curto, tudo bem também.',
      },
      {
        title: 'A gente responde',
        desc: 'Cada feedback ganha um status (Recebido → Em análise → Em desenvolvimento → Implementado / Não vai rolar). Quando a equipe responde, aparece embaixo do seu feedback como um post-it. Você consegue acompanhar o ciclo inteiro da sua ideia.',
        chips: [{ icon: Send, label: 'Status' }, { icon: MessageSquareHeart, label: 'Resposta da equipe' }],
      },
      {
        title: 'Pra reportar bug, use o Suporte',
        desc: 'Feedback é pra ideia, sugestão, opinião. Pra problema que tá impedindo de trabalhar agora, mais rápido abrir um chamado no Suporte — a equipe vê na hora.',
      },
    ],
    tip: 'Não tenha cerimônia. Os melhores features da plataforma saíram daqui — empresa disse "queria que tivesse X" e em duas semanas tava no ar.',
    cta: { label: 'Mandar um feedback', to: '/painel/feedback' },
  },
  {
    key: 'suporte',
    icon: Headset,
    color: '#C9A074',
    bg: '#FFFBEB',
    emoji: '🎧',
    title: 'Suporte direto com a Nexla',
    subtitle: 'Gente de verdade do outro lado',
    intro: 'Não tem central de URA, não tem ticket genérico que demora 2 dias. Você fala direto com a equipe que cuida da plataforma — em chat, com print, em poucos minutos.',
    steps: [
      {
        title: 'Encontre o Suporte no menu lateral',
        desc: 'No menu da esquerda tem o item "Suporte" com ícone de fone. Click e abre o painel deslizante de chamados sobre a tela que você estava — sem perder o contexto. Se tiver resposta nova aguardando, um número amarelo aparece ao lado do item indicando quantas.',
        chips: [{ icon: Headset, label: 'Sempre no menu' }, { icon: BellRing, label: 'Badge de não lidas' }],
      },
      {
        title: 'Abrir um chamado novo',
        desc: 'Click em "Novo chamado". Em uma linha você descreve o problema, e na descrição conta com calma. A gente recebe na hora — e responde, em média, em menos de 5 minutos em horário comercial.',
      },
      {
        title: 'Pode mandar print',
        desc: 'Dentro do chat tem botão de clipe pra anexar imagem (até 2MB). Print do erro ajuda muito a gente entender e resolver rápido.',
        chips: [{ icon: Camera, label: 'Imagem' }],
      },
      {
        title: 'Chat realtime com indicador de "digitando"',
        desc: 'Quando alguém da equipe está digitando uma resposta, você vê 3 bolinhas pulsando — igual WhatsApp. E quando você manda mensagem, aparece "Visto" embaixo quando a gente lê.',
      },
      {
        title: 'Histórico de chamados',
        desc: 'Cada chamado fica salvo. Quando vier um problema parecido depois, é só abrir e mostrar a solução de antes. Status: Aguardando · Respondido · Encerrado.',
      },
      {
        title: 'Voltar ou fechar a qualquer hora',
        desc: 'No topo do painel tem botão "Voltar" (no chat) e "Fechar" (no canto direito) com texto bem visível — no celular você não fica perdido sem saber como sair. Marcar como resolvido também tá no rodapé do chat.',
      },
    ],
    tip: 'Quanto mais detalhe e print, mais rápido a gente resolve. Se for urgente, fala "URGENTE" no resumo — a equipe prioriza.',
    cta: { label: 'Abrir um chamado agora', to: '/painel/conversas' },
  },
  {
    key: 'admin',
    icon: Settings2,
    color: '#475569',
    bg: '#E2E8F0',
    emoji: '⚙️',
    title: 'Administração',
    subtitle: 'Plano, conexão, lembretes e equipe',
    intro: 'Painel de configurações. Visível só para usuários com perfil Admin — onde você cuida do plano, da conexão WhatsApp, dos lembretes automáticos e dos acessos da equipe.',
    steps: [
      {
        title: 'Plano e cobrança no topo',
        desc: 'Primeiro card mostra qual plano vocês têm, valor mensal, próximo vencimento e status (em dia, próximo do venc., vencido). Ao lado, três barras de progresso mostram quantos profissionais, usuários e agendas vocês já usaram do limite. Se houver upgrade disponível, aparece botão dourado/azul que abre conversa com a nossa equipe direto no WhatsApp.',
        chips: [{ icon: TrendingUp, label: 'Uso do plano' }, { icon: Clock, label: 'Vencimento' }, { icon: ArrowRight, label: 'Upgrade' }],
      },
      {
        title: 'Conexão WhatsApp',
        desc: 'Status da instância em tempo real (Conectado / Aguardando / Desconectado). Botão "Gerar QR Code" mostra o QR pra escanear no celular. Cai a conexão? Reconecta pelo mesmo botão.',
      },
      {
        title: 'Lembretes automáticos de agendamento',
        desc: 'Ligue o switch e escolha a antecedência: 30 min, 1h, 24h, 48h ou 7 dias antes do agendamento. A plataforma manda WhatsApp pro cliente sozinha, no horário certo, com o nome dele, data, hora e profissional. Preview da mensagem aparece embaixo pra você ver exatamente o que o cliente vai receber.',
        chips: [{ icon: BellRing, label: 'Disparo automático' }, { icon: MessageSquare, label: 'Preview da msg' }, { icon: Clock, label: '30min a 7d antes' }],
      },
      {
        title: 'Setores',
        desc: 'Crie setores como "Comercial", "Suporte", "Recepção". Cada conversa atribuída fica visível só para quem é desse setor (admin vê tudo).',
      },
      {
        title: 'Usuários',
        desc: 'Crie acessos para sua equipe (respeitando o limite do seu plano). Defina perfil Admin ou Operador. Pode editar nome, e-mail, senha e excluir.',
      },
    ],
    tip: 'O card de Plano mostra "em vermelho" quando algum recurso passou do limite do plano — antes da gente travar, vocês já veem que precisam fazer upgrade. Botão fala direto com nossa equipe pra acertar.',
    cta: { label: 'Abrir Administração', to: '/painel/admin' },
  },
]

// ─── COMPONENTE ──────────────────────────────────────────────────────────────
export default function CompanyTutorial() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userKey = session?.user?.email
  const onboardingDone = userKey && localStorage.getItem(`nx_onboarding_done_${userKey}`) === 'true'
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
  })
  const [activeKey, setActiveKey] = useState(MODULES[0].key)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const isAdmin = session?.user?.role === 'admin'
  const aiEnabled = session?.company?.ai_enabled !== false
  const contentRef = useRef(null)

  function finishOnboarding() {
    if (!userKey) return
    localStorage.setItem(`nx_onboarding_done_${userKey}`, 'true')
    navigate('/painel/conversas', { replace: true })
  }

  function skipOnboarding() {
    if (!userKey) return
    setConfirmSkip(true)
  }
  function confirmSkipAction() {
    if (!userKey) return
    localStorage.setItem(`nx_onboarding_done_${userKey}`, 'true')
    setConfirmSkip(false)
    navigate('/painel/conversas', { replace: true })
  }

  // Filtra módulos pelo perfil
  const visibleModules = useMemo(() => {
    return MODULES.filter(m => {
      if (m.key === 'historico' && !aiEnabled) return false
      if ((m.key === 'admin' || m.key === 'catalogo') && !isAdmin) return false
      return true
    })
  }, [isAdmin, aiEnabled])

  const active = visibleModules.find(m => m.key === activeKey) || visibleModules[0]

  function toggleComplete(key) {
    setCompleted(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
      return next
    })
  }

  function selectModule(key) {
    setActiveKey(key)
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalCompleted = visibleModules.filter(m => completed.includes(m.key)).length
  const pct = Math.round((totalCompleted / visibleModules.length) * 100)
  const allDone = totalCompleted === visibleModules.length

  return (
    <div className="tut-root">
      {/* Banner de onboarding obrigatório */}
      {!onboardingDone && (
        <div className="tut-onboard-banner">
          <div className="tut-onboard-icon">
            <Sparkles size={16} />
          </div>
          <div className="tut-onboard-text">
            <strong>Bem-vindo à plataforma!</strong>
            <span>Conhece todos os capítulos antes de começar — assim você aproveita o máximo desde o primeiro dia.</span>
          </div>
          <button className="tut-onboard-skip" onClick={skipOnboarding}>
            Pular por agora
          </button>
        </div>
      )}

      {/* Hero — estética 'diário de bordo' */}
      <div className="tut-hero">
        <div className="tut-hero-bg" />
        <div className="tut-hero-progress-fab">
          <svg viewBox="0 0 100 100" className="tut-hero-progress-svg">
            <circle cx="50" cy="50" r="42" stroke="rgba(15,14,27,0.08)" strokeWidth="6" fill="none" />
            <circle cx="50" cy="50" r="42"
              stroke="url(#tutGrad)" strokeWidth="6" fill="none"
              strokeLinecap="round" strokeDasharray={`${(pct/100) * 263.9} 263.9`}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }} />
            <defs>
              <linearGradient id="tutGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor="#7C3AED" />
                <stop offset="50%"  stopColor="#DB2777" />
                <stop offset="100%" stopColor="#FB923C" />
              </linearGradient>
            </defs>
          </svg>
          <div className="tut-hero-progress-text">
            <span className="tut-hero-progress-num">{totalCompleted}</span>
            <span className="tut-hero-progress-divider">de</span>
            <span className="tut-hero-progress-total">{visibleModules.length}</span>
          </div>
        </div>
        <div className="tut-hero-content">
          <div className="tut-hero-eyebrow">
            <BookOpen size={14} />
            Manual da plataforma
          </div>
          <h1 className="tut-hero-title">
            <em>Vamos</em> dominar a plataforma<br />
            juntos, {session?.user?.name?.split(' ')[0] || 'amig@'}.
          </h1>
          <p className="tut-hero-sub">
            Cada bloco abaixo é um capítulo do manual. Leia no seu ritmo, marque os
            que terminou e siga em frente. Não tem prova no final, prometo.
          </p>

          <div className="tut-hero-stats">
            <div className="tut-hero-stat">
              <div className="tut-hero-stat-value">{visibleModules.length}</div>
              <div className="tut-hero-stat-label">capítulos no total</div>
            </div>
            <div className="tut-hero-stat">
              <div className="tut-hero-stat-value">{totalCompleted}</div>
              <div className="tut-hero-stat-label">já dominei</div>
            </div>
            <div className="tut-hero-stat">
              <div className="tut-hero-stat-value">{pct}%</div>
              <div className="tut-hero-stat-label">{allDone ? 'tudo concluído' : 'do tutorial'}</div>
            </div>
          </div>

          {allDone && !onboardingDone && (
            <button className="tut-finish-btn" onClick={finishOnboarding}>
              <PartyPopper size={16} />
              Concluir tutorial e ir para o painel
              <ArrowRight size={16} />
            </button>
          )}
          {allDone && onboardingDone && (
            <div className="tut-trophy-badge">
              <Trophy size={14} /> Tutorial 100% dominado
            </div>
          )}
        </div>
      </div>

      {/* Layout principal */}
      <div className="tut-shell">
        {/* Navegação lateral */}
        <aside className="tut-nav">
          <div className="tut-nav-title">CAPÍTULOS</div>
          {visibleModules.map((m, i) => {
            const done = completed.includes(m.key)
            const isActive = m.key === activeKey
            return (
              <button
                key={m.key}
                onClick={() => selectModule(m.key)}
                className={`tut-nav-item ${isActive ? 'active' : ''} ${done ? 'done' : ''}`}
                style={isActive ? { borderColor: m.color } : {}}
              >
                <div className="tut-nav-badge" style={{ background: m.bg, color: m.color }}>
                  {done ? <Check size={14} /> : String(i + 1).padStart(2, '0')}
                </div>
                <div className="tut-nav-info">
                  <div className="tut-nav-name">{m.title}</div>
                  <div className="tut-nav-meta">
                    <span style={{ color: m.color, fontWeight: 700 }}>{m.subtitle}</span>
                    {done && <span className="tut-nav-done-pill">concluído</span>}
                  </div>
                </div>
                <ChevronRight size={14} className="tut-nav-arrow" />
              </button>
            )
          })}
        </aside>

        {/* Conteúdo */}
        <main className="tut-content" ref={contentRef}>
          <ModuleGuide
            module={active}
            done={completed.includes(active.key)}
            onToggle={() => toggleComplete(active.key)}
          />
        </main>
      </div>

      <ConfirmModal
        open={confirmSkip}
        variant="warning"
        title="Pular tutorial?"
        message="Sem stress — você pode voltar aqui a qualquer momento pelo menu lateral. Mas perder esse manual pode te custar tempo lá na frente."
        confirmLabel="Pular mesmo assim"
        cancelLabel="Continuar tutorial"
        onConfirm={confirmSkipAction}
        onCancel={() => setConfirmSkip(false)}
      />
    </div>
  )
}

// ─── GUIA DO MÓDULO ──────────────────────────────────────────────────────────
function ModuleGuide({ module: m, done, onToggle }) {
  const Icon = m.icon
  return (
    <article className="tut-guide" key={m.key}>
      {/* Cabeçalho colorido */}
      <header className="tut-guide-head" style={{ background: m.bg }}>
        <div className="tut-guide-emoji">{m.emoji}</div>
        <div className="tut-guide-head-content">
          <div className="tut-guide-kicker" style={{ color: m.color }}>
            <Icon size={13} /> {m.subtitle}
          </div>
          <h2 className="tut-guide-title">{m.title}</h2>
          <p className="tut-guide-intro">{m.intro}</p>
        </div>
        <div className="tut-guide-deco" style={{ background: m.color }} />
      </header>

      {/* Passos */}
      <div className="tut-steps">
        {m.steps.map((step, i) => (
          <div key={i} className="tut-step">
            <div className="tut-step-num" style={{ background: m.color }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="tut-step-line" style={{ background: `${m.color}33` }} />
            <div className="tut-step-card">
              <h3 className="tut-step-title">{step.title}</h3>
              <p className="tut-step-desc">{step.desc}</p>
              {step.chips && (
                <div className="tut-step-chips">
                  {step.chips.map((c, j) => (
                    <span key={j} style={{ background: m.bg, color: m.color, borderColor: `${m.color}44` }}>
                      <c.icon size={11} /> {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dica em formato post-it */}
      {m.tip && (
        <div className="tut-tip" style={{ '--tip-color': m.color, '--tip-bg': m.bg }}>
          <div className="tut-tip-icon"><Lightbulb size={18} /></div>
          <div>
            <div className="tut-tip-label">Dica de quem usa</div>
            <p className="tut-tip-text">{m.tip}</p>
          </div>
        </div>
      )}

      {/* Footer com CTA + marcar concluído */}
      <footer className="tut-guide-foot">
        <Link to={m.cta.to} className="tut-cta" style={{ background: m.color }}>
          {m.cta.label} <ArrowRight size={15} />
        </Link>
        <button onClick={onToggle} className={`tut-mark ${done ? 'done' : ''}`} style={done ? { background: m.color, borderColor: m.color, color: '#fff' } : {}}>
          {done ? <><Check size={14} /> Capítulo concluído</> : <>Marcar como concluído</>}
        </button>
      </footer>

      {/* Fim do capítulo */}
      <div className="tut-end">
        <div className="tut-end-stars">
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
        </div>
        <span>Fim do capítulo</span>
      </div>
    </article>
  )
}
