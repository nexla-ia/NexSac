import { useState, useRef } from 'react'
import {
  ShieldCheck, Lock, Server, BarChart3, FileCheck2, Database,
  Cloud, KeyRound, Check, X, AlertTriangle, Sparkles, Headset,
  ChevronRight, Eye, BookOpen, Star, Heart, FileText, Trash2,
  ArrowRight, MapPin, Activity, MessageSquare,
} from 'lucide-react'
import './CompanySeguranca.css'

// ─── PILARES (capítulos do "manual de segurança") ───────────────────────────
const PILLARS = [
  {
    key: 'privacidade',
    icon: Lock,
    color: '#C9A074',
    bg: '#FFFBEB',
    emoji: '🔒',
    title: 'A conversa do seu cliente é da sua empresa',
    subtitle: 'Sem bisbilhotagem, sem uso comercial',
    intro: 'Ninguém da NexSac abre o chat de um cliente por curiosidade ou pra uso comercial. Em nenhuma hipótese usamos seus dados pra treinar IA externa, vender insight ou benchmark sem anonimizar.',
    steps: [
      { title: 'Acesso técnico só com propósito', desc: 'Quando precisamos olhar uma conversa específica (ex: você abriu chamado e pediu ajuda), a equipe acessa só aquela. Tudo registrado em log de auditoria.' },
      { title: 'Sem treinar IA externa com seus dados', desc: 'O conteúdo das suas conversas nunca alimenta modelo de terceiros. A IA que atende seus clientes usa contexto da sua empresa, não da empresa vizinha.' },
      { title: 'Sem benchmark identificável', desc: 'Quando comparamos métricas entre empresas pra te dar insight, todos os dados são anonimizados — você não aparece nominalmente em relatório nenhum.' },
    ],
    tip: 'Acesso técnico existe pra suporte (você pediu, equipe olhou) e auditoria de bugs — sempre registrado.',
  },
  {
    key: 'infra',
    icon: Server,
    color: '#2563EB',
    bg: '#EFF6FF',
    emoji: '☁️',
    title: 'Infraestrutura AWS no Brasil',
    subtitle: 'Servidores em São Paulo, soberania nacional',
    intro: 'Servidores na AWS São Paulo com replicação geográfica e backups diários automáticos. Latência baixa, soberania de dados nacional, sem dúvida sobre transferência internacional.',
    steps: [
      { title: 'Região AWS sa-east-1', desc: 'Toda infra hospedada em São Paulo. Seus dados não saem do Brasil — atende exigência da LGPD pra dados sensíveis de saúde.' },
      { title: 'Banco de dados gerenciado', desc: 'PostgreSQL gerenciado pela Supabase rodando em cima de AWS RDS. Alta disponibilidade, replicação síncrona, ponto de recuperação a cada minuto.' },
      { title: 'Backups diários replicados', desc: 'Snapshots do banco feitos automaticamente todo dia, retidos por 30 dias, replicados pra outra região AWS pra recuperação em caso de desastre.' },
      { title: 'Monitoramento 24/7', desc: 'Alertas automáticos de latência, erros e indisponibilidade. Equipe técnica notificada em segundos se algo sair do padrão.' },
    ],
    tip: 'Banco de dados gerenciado, alta disponibilidade, monitoramento 24/7 de incidentes.',
  },
  {
    key: 'cripto',
    icon: KeyRound,
    color: '#16A34A',
    bg: '#F0FDF4',
    emoji: '🔑',
    title: 'Criptografia ponta a ponta',
    subtitle: 'TLS 1.3 + AES-256 + bcrypt',
    intro: 'TLS 1.3 protege cada mensagem entre o navegador e o servidor. AES-256 at-rest criptografa o banco inteiro — mesmo se alguém invadisse fisicamente o storage, os dados ficariam ilegíveis sem a chave.',
    steps: [
      { title: 'TLS 1.3 em trânsito', desc: 'Toda comunicação entre o navegador da sua equipe e nossos servidores passa por canal criptografado. Mesmo num WiFi público, ninguém intercepta o conteúdo.' },
      { title: 'AES-256 at-rest', desc: 'O banco inteiro fica criptografado no disco. Se alguém roubar fisicamente o servidor (cenário improvável), os dados ficam ilegíveis sem a chave mestra.' },
      { title: 'Senhas com hash bcrypt + salt', desc: 'Senha de operador nunca é guardada em texto. É processada por bcrypt com salt único — mesmo um admin do banco não consegue ver senha de ninguém.' },
      { title: 'Tokens de API individuais', desc: 'Cada empresa tem chave própria, isolada. Token comprometido afeta só uma empresa e pode ser revogado em segundos.' },
    ],
    tip: 'Senhas com hash bcrypt + salt. Tokens de API individuais por empresa.',
  },
  {
    key: 'metricas',
    icon: BarChart3,
    color: '#7C3AED',
    bg: '#F5F3FF',
    emoji: '📊',
    title: 'Métricas pra te ajudar — não pra bisbilhotar',
    subtitle: 'Números agregados, nunca conteúdo nominal',
    intro: 'A equipe NexSac acompanha números, não conteúdo: tempo de resposta médio, taxa de não comparecimento, volume de mensagens. Isso vira recomendação concreta pra sua operação melhorar — não relatório de cotação pra terceiros.',
    steps: [
      { title: 'O que vemos', desc: 'Volume de mensagens por dia, tempo médio até primeira resposta, taxa de conversão, status agregado de tickets. Tudo número, nada nome.' },
      { title: 'O que NÃO vemos rotineiramente', desc: 'Conteúdo das mensagens, áudios, fotos, documentos e dados sensíveis do cliente. Pra acessar algo assim precisa autorização sua + log de auditoria.' },
      { title: 'Pra que serve', desc: 'Identificar gargalos no atendimento (ex: "sua empresa X tá demorando muito pra responder"), te ajudar a treinar a equipe, melhorar a plataforma com base em uso real.' },
    ],
    tip: 'Quando precisamos olhar um caso real, é via suporte, com sua autorização e registro em auditoria.',
  },
  {
    key: 'lgpd',
    icon: FileCheck2,
    color: '#DB2777',
    bg: '#FDF2F8',
    emoji: '✅',
    title: 'LGPD na prática, não no slide',
    subtitle: 'DPO, contrato e direitos cumpridos',
    intro: 'Contrato com cláusula de tratamento de dados, DPO designado pela NexSac, política de retenção configurável por empresa. Cumprimos os direitos do cliente — acesso, retificação e exclusão — em prazos legais.',
    steps: [
      { title: 'Cláusula de tratamento no contrato', desc: 'Todo cliente recebe contrato com adendo de tratamento de dados especificando: o que coletamos, pra quê, por quanto tempo, e como cumprimos a LGPD.' },
      { title: 'DPO designado', desc: 'NexSac tem encarregado de proteção de dados (DPO) responsável por dúvidas. Email direto pra ele aparece no rodapé do contrato — sem URA, sem ticket genérico.' },
      { title: 'Retenção configurável', desc: 'Você define por quanto tempo guardar histórico de conversas (padrão: indefinido, mas pode ajustar). Mensagens de clientes que pediram exclusão são anonimizadas em 30 dias.' },
      { title: 'Direitos do cliente em 2 cliques', desc: 'Botão na ficha do cliente: exportar dados (PDF), retificar campo, excluir cadastro. Sua equipe atende em segundos — sem ter que abrir ticket de TI.' },
    ],
    tip: 'Você pode solicitar exportação ou exclusão de qualquer cliente em 2 cliques na ficha dele.',
  },
  {
    key: 'controlador',
    icon: Database,
    color: '#0891B2',
    bg: '#ECFEFF',
    emoji: '🗄️',
    title: 'Você é o controlador, a NexSac é operadora',
    subtitle: 'Os dados são da sua empresa — você pode levar embora',
    intro: 'Os dados dos clientes são da sua empresa. A NexSac processa em nome de vocês, conforme contrato. Se quiser sair da plataforma, faz a exportação completa em CSV/JSON — leva embora tudo que é seu.',
    steps: [
      { title: 'Você é o controlador (LGPD)', desc: 'Pela lei, quem decide o que faz com os dados dos clientes é a empresa — não a NexSac. A gente só processa em nome de vocês conforme o contrato.' },
      { title: 'Exportação completa sem fee', desc: 'Botão "Exportar tudo" disponível no painel. Gera CSV/JSON com clientes, mensagens, agendamentos, financeiro, etc. Sem cobrar fee, sem reter nada.' },
      { title: 'Migração assistida', desc: 'Se você decidir ir pra outra plataforma, a equipe NexSac ajuda a migrar — sem ressentimento. Não é vingança fazer cliente ficar refém.' },
      { title: 'Direito ao esquecimento', desc: 'Cancelou a conta? Em 30 dias os dados são deletados permanentemente. Você recebe confirmação por email + log de auditoria do que foi removido.' },
    ],
    tip: 'Migração assistida sem custo. Você não fica refém da plataforma — é seu direito.',
  },
  {
    key: 'transparencia',
    icon: Eye,
    color: '#059669',
    bg: '#ECFDF5',
    emoji: '👁️',
    title: 'Transparência total — sem zona cinza',
    subtitle: 'O que a NexSac vê e o que NÃO vê',
    intro: 'Aqui está exatamente o que a equipe NexSac acessa no dia-a-dia e o que nunca chega aos olhos dela sem autorização. Sem rodeio, sem letra miúda.',
    steps: [
      { title: '✅ Métricas agregadas', desc: 'Volume, tempo, conversão (números, não nomes). Aparecem no painel da NexSac pra acompanhar performance.' },
      { title: '✅ Status de tickets', desc: 'Abertos, fechados, expirados — sem ler conteúdo das mensagens. É só pra dimensionar suporte.' },
      { title: '✅ Performance técnica', desc: 'Uptime, latência, taxa de erro do sistema. Aparece em logs anonimizados pra time de engenharia.' },
      { title: '✅ Uso de features', desc: 'Quais telas vocês usam mais (pra priorizar evolução do produto). Sem associar a usuário específico.' },
      { title: '❌ Conteúdo das mensagens', desc: 'Texto entre cliente e empresa não é acessado rotineiramente. Só com autorização sua via suporte.' },
      { title: '❌ Áudios, fotos, documentos', desc: 'Mídia e dados sensíveis ficam isolados. Nem visualização rápida pra debug — sempre criptografados, sempre privados.' },
      { title: '❌ Dados financeiros nominais', desc: 'A gente vê faturamento agregado da empresa (pra benchmarks), nunca quanto cada cliente pagou.' },
      { title: '❌ Senhas dos seus operadores', desc: 'São guardadas com hash. Nem o admin do banco da NexSac consegue ver — só você sabe a sua.' },
    ],
    tip: 'Acesso a conteúdo só com sua autorização explícita via suporte — fica registrado em log permanente de auditoria.',
  },
  {
    key: 'direitos',
    icon: Heart,
    color: '#EA580C',
    bg: '#FFF7ED',
    emoji: '💛',
    title: 'Direitos do cliente — você atende em 2 cliques',
    subtitle: 'A LGPD não é burocracia, é reputação',
    intro: 'A plataforma já tem tudo embarcado pra você responder qualquer pedido em segundos. Cliente quer ver os dados dele? Quer corrigir? Quer ser apagado? Tudo na ficha.',
    steps: [
      { title: 'Acesso aos próprios dados', desc: 'Cliente pediu o que vocês têm sobre ele? Abre a ficha dele, clica em "Exportar PDF" — pronto. Em segundos vocês entregam o relatório completo.' },
      { title: 'Retificação', desc: 'Erro no cadastro? Edita direto na ficha. Histórico de alterações fica registrado pra auditoria — quem mudou, quando, o que.' },
      { title: 'Exclusão / esquecimento', desc: 'Cliente quer ser apagado? Botão "Excluir cadastro" na ficha. As mensagens dele são anonimizadas em 30 dias automaticamente.' },
      { title: 'Portabilidade', desc: 'Vai migrar de plataforma? Exporta tudo em CSV / JSON. Sem fee, sem retenção do dado. É direito do cliente, e o seu também.' },
    ],
    tip: 'Os direitos do cliente são automatizados — não dá trabalho cumprir LGPD na operação do dia-a-dia.',
  },
  {
    key: 'incidente',
    icon: AlertTriangle,
    color: '#D97706',
    bg: '#FEF3C7',
    emoji: '⚠️',
    title: 'Plano de incidente: 24h pra te avisar',
    subtitle: 'Sem maquiar, sem esconder',
    intro: 'Compromisso firmado em contrato: identificou? Em até 24h vocês são avisados, com explicação clara do que aconteceu, quais dados foram afetados (se houver) e o que está sendo feito pra resolver.',
    steps: [
      { title: 'Detecção em minutos', desc: 'Sistema de monitoramento 24/7. Anomalia em padrão de acesso, falha em criptografia, pico de erro — alerta automático pra equipe técnica em segundos.' },
      { title: 'Comunicação em até 24h', desc: 'Identificou incidente? Contrato obriga: você é avisado em até 24h. Email + chamado de suporte criado automaticamente com detalhes técnicos.' },
      { title: 'Notificação à ANPD', desc: 'Conforme prazo legal, a ANPD é notificada pelo nosso DPO. Você não precisa se preocupar com a parte regulatória — a gente cuida.' },
      { title: 'Pós-incidente: relatório completo', desc: 'Depois que tudo for resolvido, você recebe relatório transparente: causa raiz, impacto, ações tomadas, plano pra evitar repetição. Sem desculpa, sem rodeio.' },
    ],
    tip: 'Sem maquiar, sem esconder. Reputação se constrói com transparência em momento difícil — é assim que a NexSac joga.',
  },
]

export default function CompanySeguranca() {
  const [activeKey, setActiveKey] = useState(PILLARS[0].key)
  const contentRef = useRef(null)

  const active = PILLARS.find(p => p.key === activeKey) || PILLARS[0]

  function selectPillar(key) {
    setActiveKey(key)
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openSupport() {
    const fab = document.querySelector('.sw-fab')
    if (fab) fab.click()
  }

  return (
    <div className="seg-root">
      {/* Hero */}
      <div className="seg-hero">
        <div className="seg-hero-bg" />
        <div className="seg-hero-seal">
          <div className="seg-hero-seal-inner">
            <ShieldCheck size={40} />
            <div className="seg-hero-seal-label">LGPD</div>
            <div className="seg-hero-seal-sub">compliant</div>
          </div>
        </div>
        <div className="seg-hero-content">
          <div className="seg-hero-eyebrow">
            <ShieldCheck size={14} />
            Segurança & privacidade
          </div>
          <h1 className="seg-hero-title">
            Sua empresa é <em>sua</em>.<br />
            Seus clientes, idem.
          </h1>
          <p className="seg-hero-sub">
            A gente cuida da plataforma — você cuida da sua gente. Aqui está,
            sem rodeio, exatamente o que fazemos com os dados que passam por aqui.
          </p>

          <div className="seg-hero-stats">
            <div className="seg-hero-stat">
              <div className="seg-hero-stat-value">AWS</div>
              <div className="seg-hero-stat-label">São Paulo · Brasil</div>
            </div>
            <div className="seg-hero-stat">
              <div className="seg-hero-stat-value">AES-256</div>
              <div className="seg-hero-stat-label">criptografia at-rest</div>
            </div>
            <div className="seg-hero-stat">
              <div className="seg-hero-stat-value">TLS 1.3</div>
              <div className="seg-hero-stat-label">em trânsito</div>
            </div>
          </div>
        </div>
      </div>

      {/* Layout master-detail */}
      <div className="seg-shell">
        <aside className="seg-nav">
          <div className="seg-nav-title">PILARES</div>
          {PILLARS.map((p, i) => {
            const isActive = p.key === activeKey
            return (
              <button
                key={p.key}
                onClick={() => selectPillar(p.key)}
                className={`seg-nav-item ${isActive ? 'active' : ''}`}
                style={isActive ? { borderColor: p.color } : {}}
              >
                <div className="seg-nav-badge" style={{ background: p.bg, color: p.color }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="seg-nav-info">
                  <div className="seg-nav-name">{p.title}</div>
                  <div className="seg-nav-meta">
                    <span style={{ color: p.color, fontWeight: 700 }}>{p.subtitle}</span>
                  </div>
                </div>
                <ChevronRight size={14} className="seg-nav-arrow" />
              </button>
            )
          })}
        </aside>

        <main className="seg-content" ref={contentRef}>
          <PillarPost pillar={active} onOpenSupport={openSupport} />
        </main>
      </div>
    </div>
  )
}

function PillarPost({ pillar: p, onOpenSupport }) {
  const Icon = p.icon
  return (
    <article className="seg-pillar-post" key={p.key}>
      <header className="seg-pillar-head" style={{ background: p.bg }}>
        <div className="seg-pillar-emoji">{p.emoji}</div>
        <div className="seg-pillar-head-content">
          <div className="seg-pillar-kicker" style={{ color: p.color }}>
            <Icon size={13} /> {p.subtitle}
          </div>
          <h2 className="seg-pillar-title">{p.title}</h2>
          <p className="seg-pillar-intro">{p.intro}</p>
        </div>
        <div className="seg-pillar-deco" style={{ background: p.color }} />
      </header>

      <div className="seg-intro-bar">
        <Sparkles size={15} style={{ color: p.color }} />
        <span>O que isso significa, na prática:</span>
      </div>

      <ol className="seg-steps">
        {p.steps.map((step, i) => (
          <li key={i} className="seg-step">
            <div className="seg-step-num" style={{ background: p.color }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="seg-step-line" style={{ background: `${p.color}33` }} />
            <div className="seg-step-card">
              <h3 className="seg-step-title">{step.title}</h3>
              <p className="seg-step-desc">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      {p.tip && (
        <div className="seg-tip" style={{ '--tip-color': p.color, '--tip-bg': p.bg }}>
          <div className="seg-tip-icon"><BookOpen size={18} /></div>
          <div>
            <div className="seg-tip-label">No fundo do peito</div>
            <p className="seg-tip-text">{p.tip}</p>
          </div>
        </div>
      )}

      <footer className="seg-pillar-foot">
        <button className="seg-cta" style={{ background: p.color }} onClick={onOpenSupport}>
          <Headset size={15} /> Tem dúvida específica? Pergunta.
        </button>
        <div className="seg-pillar-foot-meta">
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
          <span>Privacidade não é tema pra ficar nas entrelinhas.</span>
        </div>
      </footer>
    </article>
  )
}
