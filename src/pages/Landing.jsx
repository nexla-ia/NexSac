import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowRightLeft, ArrowUpRight, Sparkles, MessageSquare, Calendar, BarChart3,
  Users, Bot, Package, Headset, Check, ChevronRight, ChevronLeft, Zap, ShieldCheck,
  Phone, Mail, Activity, Clock, TrendingUp, Lock,
  Network, Bot as BotIcon, Instagram, ScanLine, Menu, X, Inbox,
  BookUser, ImageIcon, ThumbsUp, Building2,
} from 'lucide-react'
import BrandMark from '../components/BrandMark'
import { useLandingAnalytics } from '../hooks/useLandingAnalytics'
import './Landing.css'

const TESTIMONIALS = [
  {
    quote: 'Antes a gente perdia 3 ou 4 clientes por dia só porque a atendente não dava conta do WhatsApp. Hoje a IA filtra, agenda e me chama só quando é caso especial. Mudou o jogo.',
    highlight: '3 ou 4 clientes por dia',
    strong: 'Mudou o jogo.',
    authorName: 'Camila Vieira',
    authorRole: 'Sócia · Empresa de Serviços · Brasília',
    initials: 'CV',
  },
]

const WA_TRIAL = 'https://wa.me/556999300101?text=Ol%C3%A1!%20Quero%20testar%20o%20NexSac%20gratuitamente%20por%2014%20dias!'

export default function Landing() {
  const { trackCTA } = useLandingAnalytics()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [barVisible, setBarVisible] = useState(() =>
    localStorage.getItem('nx_trial_bar_dismissed') !== 'true'
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Empurra o nav e o hero para baixo quando a barra de trial está visível
  useEffect(() => {
    const h = barVisible ? '40px' : '0px'
    document.documentElement.style.setProperty('--lp-bar-h', h)
    return () => document.documentElement.style.removeProperty('--lp-bar-h')
  }, [barVisible])

  function dismissBar() {
    setBarVisible(false)
    localStorage.setItem('nx_trial_bar_dismissed', 'true')
  }

  // Bloqueia scroll do body quando menu mobile aberto
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  function closeMobile() { setMobileOpen(false) }

  return (
    <div className="lp">
      {/* BARRA DE TRIAL */}
      {barVisible && (
        <div className="lp-trial-bar" onClick={() => { trackCTA(); window.open(WA_TRIAL, '_blank') }}>
          <div className="lp-trial-bar-inner">
            <span className="lp-trial-bar-dot" />
            <span className="lp-trial-bar-text">
              <strong>14 dias grátis, sem cartão.</strong>
              {' '}IA, Agenda e Atendimento desbloqueados — comece agora pelo WhatsApp
            </span>
            <span className="lp-trial-bar-cta">
              Começar grátis →
            </span>
          </div>
          <button
            className="lp-trial-bar-close"
            onClick={e => { e.stopPropagation(); dismissBar() }}
            aria-label="Fechar">
            <X size={13} />
          </button>
        </div>
      )}

      {/* NAV */}
      <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand" onClick={closeMobile}>
            <div className="lp-brand-mark">
              <BrandMark size={32} color="#0F0E1B" strokeWidth={1.6} />
            </div>
            <span className="lp-brand-text">Nex<span style={{ color: '#2563EB' }}>Sac</span></span>
          </Link>

          <div className="lp-nav-links">
            <a href="#recursos">Recursos</a>
            <a href="#atribuicao">Atribuição</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#para-quem">Pra quem é</a>
            <a href="#planos">Planos</a>
          </div>

          <div className="lp-nav-cta">
            <Link to="/login" className="lp-btn-ghost-sm">Acessar conta</Link>
            <a href="#planos" className="lp-btn-primary-sm">Começar agora <ArrowRight size={14} /></a>
          </div>

          <button
            className="lp-nav-burger"
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* MOBILE MENU OVERLAY */}
      <div className={`lp-mobile-menu ${mobileOpen ? 'open' : ''}`}>
        <div className="lp-mobile-menu-inner">
          <a href="#recursos" onClick={closeMobile}>Recursos <ChevronRight size={16} /></a>
          <a href="#atribuicao" onClick={closeMobile}>Atribuição <ChevronRight size={16} /></a>
          <a href="#como-funciona" onClick={closeMobile}>Como funciona <ChevronRight size={16} /></a>
          <a href="#para-quem" onClick={closeMobile}>Pra quem é <ChevronRight size={16} /></a>
          <a href="#planos" onClick={closeMobile}>Planos <ChevronRight size={16} /></a>
          <div className="lp-mobile-menu-actions">
            <Link to="/login" className="lp-btn-ghost-sm" onClick={closeMobile}>Acessar conta</Link>
            <a href="#planos" className="lp-btn-primary-sm" onClick={closeMobile}>Começar agora <ArrowRight size={14} /></a>
          </div>
        </div>
      </div>

      {/* HERO */}
      <header className="lp-hero">
        <div className="lp-hero-bg">
          <div className="lp-grain" />
          <div className="lp-hero-glow lp-glow-1" />
          <div className="lp-hero-glow lp-glow-2" />
        </div>

        <div className="lp-container">
          <div className="lp-hero-grid">
            <div className="lp-hero-left">

              <h1 className="lp-h1">
                Onde cliente <span className="lp-h1-em">fala</span>,
                <br />
                sua empresa <span className="lp-h1-accent">responde</span>.
                <br />
                WhatsApp, Instagram Direct e IA — numa só inbox.
              </h1>

              <p className="lp-hero-sub">
                Centralize WhatsApp e Instagram Direct numa caixa única.
                <strong> Atenda com IA, agende com inteligência</strong> e descubra de onde
                cada cliente veio — do anúncio até a venda.
              </p>

              <div className="lp-hero-actions">
                <a href="#planos" className="lp-btn-primary">
                  Experimentar grátis
                  <ArrowRight size={16} />
                </a>
                <a href="#como-funciona" className="lp-btn-ghost">
                  Como funciona
                  <ArrowRight size={16} />
                </a>
              </div>

              <p className="lp-microcopy">
                Sem cartão de crédito · Setup guiado em 24h · Cancele quando quiser
              </p>

              <div className="lp-hero-trust">
                <div className="lp-trust-item">
                  <ShieldCheck size={14} />
                  <span>LGPD Compliance</span>
                </div>
                <div className="lp-trust-divider" />
                <div className="lp-trust-item">
                  <Activity size={14} />
                  <span>99.9% uptime</span>
                </div>
                <div className="lp-trust-divider" />
                <div className="lp-trust-item">
                  <Clock size={14} />
                  <span>Setup em 24h</span>
                </div>
              </div>
            </div>

            <div className="lp-hero-right">
              <DashboardMock />
            </div>
          </div>
        </div>

      </header>

      {/* STATS — dark editorial moment */}
      <section className="lp-stats">
        <div className="lp-stats-glow lp-glow-warm" />
        <div className="lp-stats-glow lp-glow-cool" />
        <div className="lp-container">
          <div className="lp-stats-stage">

            {/* Hero — 3.2x */}
            <article className="lp-stat-card lp-stat-hero">
              <span className="lp-stat-idx">01</span>
              <div className="lp-stat-meta">
                <span className="lp-stat-trend">
                  <TrendingUp size={13} /> Crescimento médio
                </span>
              </div>
              <div className="lp-stat-figure">
                <span className="lp-stat-num lp-stat-num-1">3.2<em>x</em></span>
              </div>
              <p className="lp-stat-caption">Mais agendamentos confirmados<br/><span className="lp-stat-sub">vs. atendimento manual via WhatsApp</span></p>
              <div className="lp-stat-bars" aria-hidden="true">
                <span style={{ height: '22%' }} />
                <span style={{ height: '32%' }} />
                <span style={{ height: '44%' }} />
                <span style={{ height: '58%' }} />
                <span style={{ height: '92%' }} />
              </div>
            </article>

            {/* 02 — 68% */}
            <article className="lp-stat-card lp-stat-side lp-stat-2">
              <span className="lp-stat-idx">02</span>
              <div className="lp-stat-row">
                <span className="lp-stat-num lp-stat-num-2">68<em>%</em></span>
                <div className="lp-stat-visual"><Clock size={20} strokeWidth={1.8} /></div>
              </div>
              <p className="lp-stat-caption">Redução no tempo de atendimento</p>
            </article>

            {/* 03 — 24/7 */}
            <article className="lp-stat-card lp-stat-side lp-stat-3">
              <span className="lp-stat-idx">03</span>
              <div className="lp-stat-row">
                <span className="lp-stat-num lp-stat-num-3">24<em>/7</em></span>
                <div className="lp-stat-visual lp-vis-pulse">
                  <span className="lp-pulse-dot" />
                </div>
              </div>
              <p className="lp-stat-caption">IA atendendo seus clientes</p>
            </article>

            {/* 04 — <2% */}
            <article className="lp-stat-card lp-stat-side lp-stat-4">
              <span className="lp-stat-idx">04</span>
              <div className="lp-stat-row">
                <span className="lp-stat-num lp-stat-num-4"><i className="lp-stat-lt">&lt;</i>2<em>%</em></span>
                <div className="lp-stat-visual"><MessageSquare size={18} strokeWidth={1.8} /></div>
              </div>
              <p className="lp-stat-caption">Taxa de mensagens não respondidas</p>
            </article>

          </div>

          <p className="lp-stats-note">
            <span className="lp-stats-note-line" />
            Média dos clientes NexSac · últimos 6 meses · atualizado mensalmente
            <span className="lp-stats-note-line" />
          </p>
        </div>
      </section>

      {/* PARA QUEM É */}
      <section className="lp-icp" id="para-quem">
        <div className="lp-container">
          <SectionHeader
            kicker="Pra quem é"
            title={<>Feita pra empresas que levam<br /><em>crescimento a sério</em></>}
          />
          <p className="lp-icp-intro">
            Quatro perfis que a gente atende todo dia. <strong>Provavelmente um deles é você.</strong>
          </p>

          <div className="lp-icp-grid">
            {/* 01 — Investe em marketing */}
            <article className="lp-icp-card lp-icp-marketing" data-tone="amber">
              <div className="lp-icp-card-head">
                <span className="lp-icp-num">01</span>
                <span className="lp-icp-tag">
                  <ScanLine size={11} /> Performance
                </span>
              </div>
              <div className="lp-icp-card-title">
                <span>Investe em marketing</span>
                <em>e quer ver retorno</em>
              </div>
              <p className="lp-icp-card-desc">
                Faz tráfego pago no Meta e Google. Quer saber qual ad trouxe
                <strong> cliente que fechou a venda</strong>, não só lead que abriu chat.
              </p>
              <div className="lp-icp-card-visual lp-icp-visual-bars">
                <div className="lp-icp-visual-label">Receita por origem · out/26</div>
                <div className="lp-icp-bars">
                  <div className="lp-icp-bar" style={{ '--h': '78%', '--c': '#F59E0B' }}>
                    <span className="lp-icp-bar-val">R$ 9.3k</span>
                    <span className="lp-icp-bar-lbl">Meta</span>
                  </div>
                  <div className="lp-icp-bar" style={{ '--h': '52%', '--c': '#FCD34D' }}>
                    <span className="lp-icp-bar-val">R$ 6.2k</span>
                    <span className="lp-icp-bar-lbl">Google</span>
                  </div>
                  <div className="lp-icp-bar" style={{ '--h': '34%', '--c': '#FDE68A' }}>
                    <span className="lp-icp-bar-val">R$ 4.1k</span>
                    <span className="lp-icp-bar-lbl">Indica.</span>
                  </div>
                </div>
              </div>
            </article>

            {/* 02 — Multi-canal */}
            <article className="lp-icp-card lp-icp-multichannel" data-tone="emerald">
              <div className="lp-icp-card-head">
                <span className="lp-icp-num">02</span>
                <span className="lp-icp-tag">
                  <Network size={11} /> Multi-canal
                </span>
              </div>
              <div className="lp-icp-card-title">
                <span>Cliente chega</span>
                <em>por todo lugar</em>
              </div>
              <p className="lp-icp-card-desc">
                WhatsApp, Instagram Direct, site, indicação. Hoje gerencia tudo
                <strong> separado e perde conversa</strong> quando o telefone toca.
              </p>
              <div className="lp-icp-card-visual lp-icp-visual-channels">
                <div className="lp-icp-channel" style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
                  <MessageSquare size={14} />
                </div>
                <div className="lp-icp-channel" style={{ background: 'linear-gradient(135deg, #F472B6, #EC4899)' }}>
                  <Instagram size={14} />
                </div>
                <div className="lp-icp-channel" style={{ background: 'linear-gradient(135deg, #60A5FA, #3B82F6)' }}>
                  <Network size={14} />
                </div>
                <svg className="lp-icp-channel-flow" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M 20,12 Q 100,30 180,30" stroke="#10B981" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
                  <path d="M 20,30 Q 100,30 180,30" stroke="#10B981" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
                  <path d="M 20,48 Q 100,30 180,30" stroke="#10B981" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
                </svg>
                <div className="lp-icp-channel-target">
                  <Inbox size={14} />
                  <span>1 inbox</span>
                </div>
              </div>
            </article>

            {/* 03 — Multi-profissional */}
            <article className="lp-icp-card lp-icp-multidoc" data-tone="sky">
              <div className="lp-icp-card-head">
                <span className="lp-icp-num">03</span>
                <span className="lp-icp-tag">
                  <Users size={11} /> Equipe
                </span>
              </div>
              <div className="lp-icp-card-title">
                <span>Tem dois ou mais</span>
                <em>profissionais</em>
              </div>
              <p className="lp-icp-card-desc">
                Agenda complexa, especialidades diferentes, setores que se misturam.
                <strong> Excel e WhatsApp Web não dão mais conta.</strong>
              </p>
              <div className="lp-icp-card-visual lp-icp-visual-team">
                <div className="lp-icp-team-card" style={{ background: 'linear-gradient(135deg, #DBEAFE, #BFDBFE)', borderColor: '#93C5FD' }}>
                  <div className="lp-icp-team-avatar" style={{ background: 'linear-gradient(135deg, #60A5FA, #3B82F6)' }}>C</div>
                  <div>
                    <div className="lp-icp-team-name">Camila</div>
                    <div className="lp-icp-team-spec">Vendas</div>
                  </div>
                </div>
                <div className="lp-icp-team-card" style={{ background: 'linear-gradient(135deg, #E0E7FF, #C7D2FE)', borderColor: '#A5B4FC' }}>
                  <div className="lp-icp-team-avatar" style={{ background: 'linear-gradient(135deg, #A78BFA, #6366F1)' }}>R</div>
                  <div>
                    <div className="lp-icp-team-name">Rafael</div>
                    <div className="lp-icp-team-spec">Suporte</div>
                  </div>
                </div>
                <div className="lp-icp-team-card" style={{ background: 'linear-gradient(135deg, #DBEAFE, #BFDBFE)', borderColor: '#93C5FD' }}>
                  <div className="lp-icp-team-avatar" style={{ background: 'linear-gradient(135deg, #34D399, #06B6D4)' }}>M</div>
                  <div>
                    <div className="lp-icp-team-name">Marina</div>
                    <div className="lp-icp-team-spec">Financeiro</div>
                  </div>
                </div>
              </div>
            </article>

            {/* 04 — Quer controle */}
            <article className="lp-icp-card lp-icp-control" data-tone="rose">
              <div className="lp-icp-card-head">
                <span className="lp-icp-num">04</span>
                <span className="lp-icp-tag">
                  <BarChart3 size={11} /> Dados
                </span>
              </div>
              <div className="lp-icp-card-title">
                <span>Quer controle,</span>
                <em>não só ferramenta</em>
              </div>
              <p className="lp-icp-card-desc">
                Métrica de cada profissional, taxa de cancelamento, atribuição de marketing.
                <strong> Decisão por dado, não achismo.</strong>
              </p>
              <div className="lp-icp-card-visual lp-icp-visual-kpis">
                <div className="lp-icp-kpi">
                  <div className="lp-icp-kpi-val" style={{ color: '#16A34A' }}>R$ 87k</div>
                  <div className="lp-icp-kpi-lbl">Faturamento</div>
                  <div className="lp-icp-kpi-trend">↑ 12%</div>
                </div>
                <div className="lp-icp-kpi">
                  <div className="lp-icp-kpi-val" style={{ color: '#DC2626' }}>8%</div>
                  <div className="lp-icp-kpi-lbl">Cancelam.</div>
                  <div className="lp-icp-kpi-trend lp-icp-kpi-trend-down">↓ 3%</div>
                </div>
                <div className="lp-icp-kpi">
                  <div className="lp-icp-kpi-val" style={{ color: '#7C3AED' }}>R$ 312</div>
                  <div className="lp-icp-kpi-lbl">Ticket médio</div>
                  <div className="lp-icp-kpi-trend">↑ 8%</div>
                </div>
              </div>
            </article>
          </div>

          {/* Outro */}
          <div className="lp-icp-outro">
            <div className="lp-icp-outro-marker">
              <Sparkles size={14} />
            </div>
            <div>
              <strong>Se você se viu em pelo menos 2 desses</strong>, a gente já consegue
              te mostrar resultado em 30 dias.
            </div>
            <a href="#cta" className="lp-icp-outro-cta">
              Quero conversar <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="lp-how" id="como-funciona">
        <div className="lp-container">
          <SectionHeader
            kicker="Em 3 passos"
            title={<>Da bagunça do WhatsApp<br /><em>ao controle total</em></>}
            light
          />

          <div className="lp-how-stage">
            {/* Trilho da jornada — marching dashes + 3 pulses */}
            <svg className="lp-how-rail" viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="howRailGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FACC15" />
                  <stop offset="50%" stopColor="#4ADE80" />
                  <stop offset="100%" stopColor="#22D3EE" />
                </linearGradient>
              </defs>
              <path className="lp-how-rail-path" d="M 80 40 Q 300 -10, 600 40 T 1120 40" stroke="url(#howRailGrad)" strokeWidth="1.5" fill="none" strokeDasharray="6 9" />
              <g className="lp-how-rail-node lp-rail-node-1" transform="translate(180, 33)">
                <circle r="14" fill="rgba(252,211,77,0.12)" />
                <circle r="6" fill="#FACC15" />
              </g>
              <g className="lp-how-rail-node lp-rail-node-2" transform="translate(600, 33)">
                <circle r="14" fill="rgba(74,222,128,0.12)" />
                <circle r="6" fill="#4ADE80" />
              </g>
              <g className="lp-how-rail-node lp-rail-node-3" transform="translate(1020, 33)">
                <circle r="14" fill="rgba(34,211,238,0.12)" />
                <circle r="6" fill="#22D3EE" />
              </g>
            </svg>

            <div className="lp-steps">
              {/* 01 — Canais convergindo */}
              <article className="lp-step lp-step-1">
                <span className="lp-step-num">01</span>
                <div className="lp-step-viz lp-viz-channels">
                  <div className="lp-ch lp-ch-wa" title="WhatsApp">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.2-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.2-1.3-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.5.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.2 0-.3 0-.4 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4-.1 0-.3 0-.5 0s-.5.1-.7.3c-.3.3-1 1-1 2.4 0 1.4 1 2.7 1.2 2.9.1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.1-1.3 0-.1-.2-.2-.5-.3zM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.7 1.5 5.3L2 22l4.8-1.5C8.4 21.4 10.2 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
                  </div>
                  <div className="lp-ch lp-ch-ig" title="Instagram"><Instagram size={20} /></div>
                  <svg className="lp-ch-lines" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M 30 25 Q 100 50, 170 50" stroke="rgba(252,211,77,0.45)" strokeWidth="1.4" strokeDasharray="3 4" fill="none" />
                    <path d="M 30 75 Q 100 50, 170 50" stroke="rgba(252,211,77,0.45)" strokeWidth="1.4" strokeDasharray="3 4" fill="none" />
                  </svg>
                  <div className="lp-ch lp-ch-inbox" title="Inbox unificado"><Inbox size={20} /></div>
                </div>
                <h3 className="lp-step-title">Conecte seus canais</h3>
                <p className="lp-step-desc">Escaneie o QR Code do WhatsApp e conecte sua conta do Instagram Business. Em segundos, ambos começam a chegar na mesma inbox.</p>
              </article>

              {/* 02 — Mini calendário com avatar */}
              <article className="lp-step lp-step-2">
                <span className="lp-step-num">02</span>
                <div className="lp-step-viz lp-viz-setup">
                  <div className="lp-mini-cal">
                    <div className="lp-cal-head">
                      <span>SEG</span><span>TER</span><span>QUA</span><span>QUI</span><span>SEX</span>
                    </div>
                    <div className="lp-cal-row">
                      <span /><span className="on" /><span /><span className="on" /><span />
                    </div>
                    <div className="lp-cal-row">
                      <span className="on" /><span /><span className="on" /><span /><span className="on" />
                    </div>
                    <div className="lp-cal-row">
                      <span /><span className="on pulse" /><span /><span /><span />
                    </div>
                  </div>
                  <div className="lp-doc-avatar">
                    <span>DR</span>
                    <div className="lp-doc-badge"><Check size={10} strokeWidth={3} /></div>
                  </div>
                </div>
                <h3 className="lp-step-title">Configure profissionais e serviços</h3>
                <p className="lp-step-desc">Cadastre profissionais com horários, intervalos e dias de atendimento. Adicione serviços com seus valores.</p>
              </article>

              {/* 03 — Bot + chart subindo */}
              <article className="lp-step lp-step-3">
                <span className="lp-step-num">03</span>
                <div className="lp-step-viz lp-viz-ai">
                  <div className="lp-ai-bot">
                    <BotIcon size={22} strokeWidth={1.8} />
                    <Sparkles className="lp-ai-spark lp-spark-1" size={11} />
                    <Sparkles className="lp-ai-spark lp-spark-2" size={9} />
                  </div>
                  <svg className="lp-ai-chart" viewBox="0 0 140 60" aria-hidden="true">
                    <defs>
                      <linearGradient id="aiChartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="lp-ai-chart-area" d="M 0 52 L 24 46 L 48 40 L 72 30 L 96 22 L 120 12 L 140 6 L 140 60 L 0 60 Z" fill="url(#aiChartFill)" />
                    <path className="lp-ai-chart-line" d="M 0 52 L 24 46 L 48 40 L 72 30 L 96 22 L 120 12 L 140 6" stroke="#22D3EE" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <circle className="lp-ai-chart-end" cx="140" cy="6" r="3.5" fill="#22D3EE" />
                  </svg>
                </div>
                <h3 className="lp-step-title">Deixe a IA trabalhar (e medir)</h3>
                <p className="lp-step-desc">A IA atende, qualifica, agenda e te avisa quando precisa de atenção humana. E ainda registra de onde cada cliente veio — você foca em atender os clientes e tomar decisões com dado real.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section className="lp-features" id="recursos">
        <div className="lp-container">
          <SectionHeader
            kicker="O que faz por você"
            title={<>Tudo que sua empresa<br /><em>precisa em um só lugar</em></>}
          />

          <div className="lp-features-grid">
            <FeatureCard
              variant="primary"
              icon={<Bot size={22} />}
              title="IA que conversa, qualifica e agenda"
              description="Atendente virtual 24/7 que entende seu cliente, responde dúvidas, qualifica o lead e agenda automaticamente — sem você levantar um dedo."
              tags={['WhatsApp', 'Instagram', 'Digisac']}
            />
            <FeatureCard
              icon={<MessageSquare size={22} />}
              title="Atendimento humano organizado"
              description="Recepção, setores e finalizados em abas. Cada atendente vê só o seu setor. Áudios, imagens e PDFs renderizados direto no chat."
            />
            <FeatureCard
              icon={<Calendar size={22} />}
              title="Agenda completa"
              description="Cadastre profissionais, dias de atendimento, intervalos e serviços. Validação automática de conflitos e horários."
            />
            <FeatureCard
              icon={<Package size={22} />}
              title="Catálogo de serviços"
              description="Profissionais, serviços e valores. Tudo cadastrado e refletido no agendamento."
            />
            <FeatureCard
              icon={<BookUser size={22} />}
              title="Cadastro de clientes"
              description="Cada contato vira ficha completa: nome, telefone, histórico de conversas, agendamentos e notas privadas. Centralizado e pesquisável."
            />
            <FeatureCard
              variant="instagram"
              icon={<Instagram size={22} />}
              title="Instagram + WhatsApp na mesma caixa"
              description="Direct, comentários e stories do Instagram unificados com o WhatsApp. Atenda os dois canais com a mesma equipe e a mesma IA."
              tags={['Direct', 'Stories', 'Comentários']}
            />
            <FeatureCard
              icon={<ImageIcon size={22} />}
              title="IA cria posts para Instagram"
              description="A IA escreve legendas, sugere imagens e agenda postagens com base nos serviços, datas e promoções da sua empresa."
              soon
            />
            <FeatureCard
              icon={<BarChart3 size={22} />}
              title="Métricas que importam"
              description="Faturamento por profissional, taxa de cancelamento, ticket médio, tempo de resposta. Dashboard com 6 abas de análise."
            />
            <FeatureCard
              icon={<Users size={22} />}
              title="Gestão de equipe e setores"
              description="Convide atendentes, atribua a setores, defina permissões. Cada conversa fica com quem deve atender."
            />
          </div>
        </div>
      </section>

      {/* TIME INTEIRO NUM NÚMERO SÓ */}
      <section className="lp-team" id="time">
        <div className="lp-container">
          {/* Cabeçalho com tom diferenciado */}
          <div className="lp-team-header">
            <div className="lp-team-eyebrow">
              <span className="lp-team-eyebrow-dot" />
              <span>Time inteiro num número só</span>
            </div>
            <h2 className="lp-team-title">
              <span>Sua equipe inteira atendendo.</span>
              <span className="lp-team-title-grad">no mesmo número de WhatsApp.</span>
            </h2>
            <p className="lp-team-sub">
              Acabou aquela história de revezar o celular ou ter 5 números diferentes
              pros setores. Aqui é <strong>um número, time inteiro</strong> — com regra
              de ownership pra ninguém atrapalhar a conversa do colega.
            </p>
          </div>

          {/* Visual: paciente ↔ time */}
          <div className="lp-team-stage">
            {/* COLUNA ESQUERDA — paciente vê 1 conversa */}
            <div className="lp-team-side lp-team-patient">
              <div className="lp-team-side-label">
                <Phone size={11} />
                <span>O cliente vê</span>
              </div>
              <div className="lp-team-phone">
                <div className="lp-team-phone-notch" />
                <div className="lp-team-phone-bar">
                  <div className="lp-team-phone-avatar">SE</div>
                  <div>
                    <div className="lp-team-phone-name">Sua Empresa</div>
                    <div className="lp-team-phone-status">
                      <span className="lp-team-phone-dot" />
                      online · respondendo
                    </div>
                  </div>
                </div>
                <div className="lp-team-phone-msgs">
                  <div className="lp-team-bubble lp-team-bubble-out">Oi, gostaria de agendar um atendimento</div>
                  <div className="lp-team-bubble lp-team-bubble-in">Claro! Vou te passar pra triagem.</div>
                  <div className="lp-team-bubble lp-team-bubble-in">
                    Por gentileza, qual a data preferida?
                  </div>
                  <div className="lp-team-bubble lp-team-bubble-out">Quinta de tarde se possível</div>
                  <div className="lp-team-bubble lp-team-bubble-in lp-team-typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
                <div className="lp-team-phone-foot">
                  <span>Mensagem</span>
                </div>
              </div>
              <div className="lp-team-side-caption">
                <em>uma conversa só</em>, contínua e fluida —
                ele nem percebe que mudou de atendente
              </div>
            </div>

            {/* CONECTOR — fluxo central animado */}
            <svg className="lp-team-flow" viewBox="0 0 220 480" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="teamFlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22C55E" />
                  <stop offset="50%" stopColor="#C9A074" />
                  <stop offset="100%" stopColor="#7C3AED" />
                </linearGradient>
              </defs>
              {/* 3 linhas saindo do meio-esquerda pra meio-direita */}
              <path d="M 0,80 Q 110,80 220,80" stroke="url(#teamFlow)" strokeWidth="2" fill="none" strokeDasharray="6 8" className="lp-team-flow-path" />
              <path d="M 0,240 Q 110,240 220,240" stroke="url(#teamFlow)" strokeWidth="2" fill="none" strokeDasharray="6 8" className="lp-team-flow-path lp-team-flow-path-2" />
              <path d="M 0,400 Q 110,400 220,400" stroke="url(#teamFlow)" strokeWidth="2" fill="none" strokeDasharray="6 8" className="lp-team-flow-path lp-team-flow-path-3" />
              {/* Bolinhas pulsantes nas pontas */}
              <circle cx="6" cy="80" r="4" fill="#22C55E" className="lp-team-flow-pulse" />
              <circle cx="6" cy="240" r="4" fill="#C9A074" className="lp-team-flow-pulse lp-team-flow-pulse-2" />
              <circle cx="6" cy="400" r="4" fill="#7C3AED" className="lp-team-flow-pulse lp-team-flow-pulse-3" />
            </svg>

            {/* COLUNA DIREITA — painel do time */}
            <div className="lp-team-side lp-team-control">
              <div className="lp-team-side-label">
                <Users size={11} />
                <span>Vocês organizam por setor</span>
              </div>
              <div className="lp-team-panel">
                <div className="lp-team-panel-bar">
                  <div className="lp-team-panel-title">Inbox NexSac</div>
                  <div className="lp-team-panel-meta">
                    <span className="lp-team-panel-pulse" />
                    8 conversas ativas
                  </div>
                </div>

                {/* Setor 1 — Recepção */}
                <div className="lp-team-sector">
                  <div className="lp-team-sector-head">
                    <span className="lp-team-sector-color" style={{ background: '#22C55E' }} />
                    <span className="lp-team-sector-name">Recepção</span>
                    <div className="lp-team-sector-team">
                      <span className="lp-team-mini-avatar" style={{ background: 'linear-gradient(135deg, #F472B6, #EC4899)' }}>A</span>
                      <span className="lp-team-mini-avatar" style={{ background: 'linear-gradient(135deg, #FBBF24, #FB923C)' }}>J</span>
                      <span className="lp-team-mini-avatar" style={{ background: 'linear-gradient(135deg, #34D399, #06B6D4)' }}>M</span>
                    </div>
                  </div>
                  <div className="lp-team-conv lp-team-conv-active">
                    <span className="lp-team-conv-bullet">●</span>
                    <span className="lp-team-conv-text">
                      <strong>Maria Silva</strong> · Ana digitando
                    </span>
                    <span className="lp-team-conv-tag" style={{ color: '#16A34A', background: '#DCFCE7' }}>assumida</span>
                  </div>
                  <div className="lp-team-conv">
                    <span className="lp-team-conv-bullet" style={{ color: '#94A3B8' }}>●</span>
                    <span className="lp-team-conv-text">
                      <strong>Pedro Santos</strong> · aguardando
                    </span>
                    <span className="lp-team-conv-tag" style={{ color: '#7C3AED', background: '#F3E8FF' }}>IA</span>
                  </div>
                </div>

                {/* Setor 2 — Triagem */}
                <div className="lp-team-sector">
                  <div className="lp-team-sector-head">
                    <span className="lp-team-sector-color" style={{ background: '#C9A074' }} />
                    <span className="lp-team-sector-name">Triagem</span>
                    <div className="lp-team-sector-team">
                      <span className="lp-team-mini-avatar" style={{ background: 'linear-gradient(135deg, #A78BFA, #6366F1)' }}>C</span>
                      <span className="lp-team-mini-avatar" style={{ background: 'linear-gradient(135deg, #60A5FA, #3B82F6)' }}>L</span>
                    </div>
                  </div>
                  <div className="lp-team-conv">
                    <span className="lp-team-conv-bullet" style={{ color: '#C9A074' }}>●</span>
                    <span className="lp-team-conv-text">
                      <strong>Joana Lima</strong> · Carlos assumiu há 2min
                    </span>
                    <span className="lp-team-conv-tag" style={{ color: '#B8895C', background: 'rgba(201, 160, 116, 0.18)' }}>travada</span>
                  </div>
                </div>

                {/* Setor 3 — Vendas */}
                <div className="lp-team-sector">
                  <div className="lp-team-sector-head">
                    <span className="lp-team-sector-color" style={{ background: '#7C3AED' }} />
                    <span className="lp-team-sector-name">Vendas</span>
                    <div className="lp-team-sector-team">
                      <span className="lp-team-mini-avatar" style={{ background: 'linear-gradient(135deg, #C084FC, #9333EA)' }}>K</span>
                    </div>
                  </div>
                  <div className="lp-team-conv">
                    <span className="lp-team-conv-bullet" style={{ color: '#7C3AED' }}>●</span>
                    <span className="lp-team-conv-text">
                      <strong>Ana Bia</strong> · transferida da Triagem
                    </span>
                    <span className="lp-team-conv-tag" style={{ color: '#0891B2', background: '#CFFAFE' }}>↪ recebida</span>
                  </div>
                </div>
              </div>
              <div className="lp-team-side-caption">
                cada um <em>vê só o que precisa</em> —
                e ninguém pisa na conversa do outro
              </div>
            </div>
          </div>

          {/* 3 regras de ouro */}
          <div className="lp-team-rules">
            <div className="lp-team-rule">
              <div className="lp-team-rule-icon" style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#16A34A' }}>
                <Users size={18} />
              </div>
              <div>
                <div className="lp-team-rule-title">Setores que organizam</div>
                <div className="lp-team-rule-desc">
                  Recepção, triagem, vendas, financeiro — você divide do jeito que faz sentido pra empresa.
                  Cada atendente só vê o que é dele.
                </div>
              </div>
            </div>
            <div className="lp-team-rule lp-team-rule-featured">
              <div className="lp-team-rule-icon" style={{ background: 'rgba(201, 160, 116, 0.18)', color: '#C9A074' }}>
                <Lock size={18} />
              </div>
              <div>
                <div className="lp-team-rule-title">Trava automática</div>
                <div className="lp-team-rule-desc">
                  Quando alguém assume a conversa, ela <strong>trava no nome dele</strong>.
                  Os outros enxergam, mas não conseguem mandar mensagem — cliente nunca recebe resposta dupla.
                </div>
                <span className="lp-team-rule-pill">Novo</span>
              </div>
            </div>
            <div className="lp-team-rule">
              <div className="lp-team-rule-icon" style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7C3AED' }}>
                <ArrowRightLeft size={18} />
              </div>
              <div>
                <div className="lp-team-rule-title">Transferência num clique</div>
                <div className="lp-team-rule-desc">
                  Recepção encaminha pra triagem, triagem manda pra vendas — sem perder histórico,
                  sem o cliente trocar de número.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <TestimonialsSection items={TESTIMONIALS} />

      {/* PLANOS */}
      <section className="lp-pricing" id="planos">
        <div className="lp-container">
          <SectionHeader
            kicker="Planos"
            title={<>Três tamanhos.<br /><em>O comercial te ajuda a escolher.</em></>}
          />
          <p className="lp-pricing-anchor lp-pricing-anchor-soft">
            Cada empresa tem um tamanho — e cada tamanho um preço. A gente conversa rápido,
            entende seu cenário e mostra o que cabe melhor.
          </p>

          <div className="lp-pricing-grid">
            <PricingTier
              name="Starter"
              tier="Para começar"
              tagline="Pra negócios solos (até 3 profissionais)"
              features={[
                'Até 3 profissionais cadastrados',
                'Até 5 usuários na equipe',
                'WhatsApp + IA de atendimento 24/7',
                'Rastreamento de origem do lead (básico)',
                'Ficha completa do cliente (foto, dados, timeline)',
                'Catálogo: profissionais e serviços',
                'Setores e distribuição de conversas',
                '1 agenda · Kanban · Conversas IA',
                'Métricas: visão geral, atendimento, agenda e leads',
                'Suporte por e-mail',
              ]}
            />
            <PricingTier
              featured
              name="Pro"
              tier="Mais escolhido"
              tagline="Pra empresas em crescimento (até 25 profissionais)"
              features={[
                'Até 25 profissionais cadastrados',
                'Até 20 usuários na equipe',
                'Tudo do Starter, e mais:',
                '+ Instagram Direct unificado com IA',
                '+ Rastreamento de origem completo (UTM + IA)',
                '+ Atribuição (lead → agendamento → venda)',
                '+ Distribuição automática de tickets (round-robin)',
                '+ Templates HSM (lembrete de atendimento automatizado)',
                '+ Agendas ilimitadas',
                '+ Métricas avançadas (Equipe, Financeiro)',
                'Suporte prioritário (resposta em 2h úteis)',
              ]}
            />
            <PricingTier
              name="Business"
              tier="Personalizado"
              tagline="Pra grupos, franquias e redes"
              features={[
                'Profissionais e usuários ilimitados',
                'Múltiplas instâncias WhatsApp + Instagram',
                'IA criando posts (Em breve)',
                'IA gerando relatórios (Em breve)',
                'Comparativo consolidado entre filiais',
                'API + integrações personalizadas',
                'Onboarding presencial · SLA contratual',
                'Gerente de conta dedicado',
              ]}
            />
          </div>

          {/* CTA único pro comercial */}
          <div className="lp-pricing-cta">
            <a href="https://wa.me/556999300101?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20a%20NexSac" target="_blank" rel="noreferrer" className="lp-btn-primary lp-btn-large">
              Falar com o comercial agora
              <ArrowRight size={18} />
            </a>
            <p className="lp-pricing-cta-sub">Em média, respondemos em <strong>menos de 5 minutos</strong> em horário comercial.</p>
          </div>

          {/* Tabela completa de comparação */}
          <details className="lp-compare">
            <summary className="lp-compare-toggle">
              <span>Ver tabela completa de comparação</span>
              <ChevronRight size={16} />
            </summary>
            <ComparisonTable />
          </details>

          <p className="lp-pricing-note">
            Onboarding incluso em todos os planos · Sem cobrar por mensagem · Cancele quando quiser
          </p>
        </div>
      </section>

      {/* TRIAL SECTION */}
      <section className="lp-trial">
        <div className="lp-trial-bg-glow lp-trial-glow-1" />
        <div className="lp-trial-bg-glow lp-trial-glow-2" />
        <div className="lp-trial-grid-tex" />
        <div className="lp-container">
          <div className="lp-trial-layout">

            {/* Lado esquerdo — número impactante */}
            <div className="lp-trial-left">
              <div className="lp-trial-big-num">
                <span className="lp-trial-num-14">14</span>
                <div className="lp-trial-num-label">
                  <span>DIAS</span>
                  <span>GRÁTIS</span>
                </div>
              </div>
              <div className="lp-trial-badge-row">
                <span className="lp-trial-badge">⚡ Sem cartão de crédito</span>
                <span className="lp-trial-badge">✓ Cancele quando quiser</span>
              </div>
            </div>

            {/* Lado direito — headline + features + CTA */}
            <div className="lp-trial-right">
              <div className="lp-trial-kicker">
                <span className="lp-trial-dot-green" />
                Período de teste completo
              </div>
              <h2 className="lp-trial-h2">
                Experimente tudo.<br />
                <em>Sem pagar nada.</em>
              </h2>
              <p className="lp-trial-sub">
                Durante 14 dias você usa a plataforma completa — IA de atendimento 24/7,
                agenda integrada, kanban de clientes e métricas reais — com suporte humano incluído.
              </p>

              <ul className="lp-trial-features">
                {[
                  { icon: <Bot size={14}/>,          text: 'IA respondendo clientes 24/7 no WhatsApp' },
                  { icon: <Calendar size={14}/>,     text: 'Agenda integrada com confirmação automática' },
                  { icon: <MessageSquare size={14}/>,text: 'Caixa unificada WhatsApp + Instagram Direct' },
                  { icon: <BarChart3 size={14}/>,    text: 'Métricas e relatórios em tempo real' },
                  { icon: <Headset size={14}/>,      text: 'Suporte humano e onboarding guiado' },
                ].map((f, i) => (
                  <li key={i} className="lp-trial-feat">
                    <span className="lp-trial-feat-icon">{f.icon}</span>
                    {f.text}
                  </li>
                ))}
              </ul>

              <div className="lp-trial-actions">
                <a
                  href={WA_TRIAL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={trackCTA}
                  className="lp-trial-btn-wa">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Começar pelo WhatsApp — é grátis
                </a>
                <Link to="/login" className="lp-trial-btn-login">
                  Já tenho conta
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="lp-cta" id="contato">
        <div className="lp-container">
          <div className="lp-cta-card">
            <div className="lp-cta-text">
              <h2 className="lp-h2">
                Sua empresa merece <em>uma operação digital</em> de alta performance.
              </h2>
              <p>
                Pare de perder cliente no WhatsApp e no Direct.
                Pare de pagar ad sem saber se trouxe venda.
                Comece agora — sem cartão de crédito.
              </p>
            </div>
            <div className="lp-cta-actions">
              <a href="#planos" className="lp-btn-primary lp-btn-large">
                Experimentar grátis
                <ArrowRight size={18} />
              </a>
              <a href="https://wa.me/556999300101" target="_blank" rel="noreferrer" className="lp-btn-ghost lp-btn-large">
                <Phone size={16} />
                Falar com humano
              </a>
              <p className="lp-microcopy lp-cta-microcopy">
                Sem cartão de crédito · Setup guiado em 24h · Cancele quando quiser
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <Link to="/" className="lp-brand">
                <div className="lp-brand-mark">
                  <BrandMark size={32} color="#C9A074" strokeWidth={1.6} />
                </div>
                <div>
                  <span className="lp-brand-text">Nex<span style={{ color: '#60A5FA' }}>Sac</span></span>
                  <span className="lp-brand-tagline">O SAC inteligente da sua empresa</span>
                </div>
              </Link>
              <p>
                A central de atendimento, agenda e gestão para empresas que valorizam tempo, dinheiro e o cliente.
              </p>
            </div>
            <div className="lp-footer-col">
              <h4>Produto</h4>
              <a href="#recursos">Recursos</a>
              <a href="#como-funciona">Como funciona</a>
              <a href="#planos">Planos</a>
              <Link to="/login">Acessar conta</Link>
            </div>
            <div className="lp-footer-col">
              <h4>Empresa</h4>
              <a href="#contato">Contato</a>
              <a href="#">Termos de uso</a>
              <a href="#">Privacidade</a>
              <a href="#">LGPD</a>
            </div>
            <div className="lp-footer-col">
              <h4>Falar com a gente</h4>
              <a href="https://wa.me/556999300101"><Phone size={12} /> WhatsApp</a>
              <a href="mailto:contato@nexsac.com"><Mail size={12} /> contato@nexsac.com</a>
              <a href="https://instagram.com/nexsac" target="_blank" rel="noreferrer">
                <Instagram size={12} /> @nexsac
              </a>
            </div>
          </div>

          {/* SOCIAL STRIP */}
          <div className="lp-footer-social">
            <span className="lp-footer-social-label">Siga a gente</span>
            <div className="lp-footer-social-cards">
              <a
                href="https://instagram.com/nexsac"
                target="_blank"
                rel="noreferrer"
                className="lp-ig-card lp-ig-clinisac">
                <span className="lp-ig-at">@</span>
                <span className="lp-ig-handle">nexsac</span>
                <span className="lp-ig-sub">NexSac · produto</span>
                <Instagram size={16} className="lp-ig-icon" />
              </a>
              <a
                href="https://instagram.com/nexla_ia"
                target="_blank"
                rel="noreferrer"
                className="lp-ig-card lp-ig-nexla">
                <span className="lp-ig-at">@</span>
                <span className="lp-ig-handle">nexla_ia</span>
                <span className="lp-ig-sub">Nexla · tecnologia</span>
                <Instagram size={16} className="lp-ig-icon" />
              </a>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>© 2026 NexSac · Todos os direitos reservados</span>
            <span className="lp-footer-made">O SAC inteligente da sua empresa.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ─── Subcomponentes ──────────────────────────────────────────────────────── */
function SectionHeader({ kicker, title, light }) {
  return (
    <div className={`lp-section-header ${light ? 'light' : ''}`}>
      <div className="lp-kicker">
        <span className="lp-kicker-line" />
        {kicker}
      </div>
      <h2 className="lp-h2">{title}</h2>
    </div>
  )
}

function FeatureCard({ icon, title, description, variant, tags, soon }) {
  const variantClass =
    variant === 'primary' ? 'primary' :
    variant === 'instagram' ? 'instagram' : ''
  return (
    <div className={`lp-feature ${variantClass}`}>
      {soon && <span className="lp-feature-soon">Em breve</span>}
      <div className="lp-feature-icon">{icon}</div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-desc">{description}</p>
      {tags && (
        <div className="lp-feature-tags">
          {tags.map(t => <span key={t}>{t}</span>)}
        </div>
      )}
      <div className="lp-feature-arrow"><ArrowUpRight size={18} /></div>
    </div>
  )
}


function TestimonialsSection({ items }) {
  const [idx, setIdx] = useState(0)
  const total = items.length
  useEffect(() => {
    if (total <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % total), 8000)
    return () => clearInterval(t)
  }, [total])
  const t = items[idx]
  return (
    <section className="lp-testimonial">
      <div className="lp-container">
        <div className="lp-testimonial-card" key={idx}>
          <div className="lp-quote-mark">&ldquo;</div>
          <p className="lp-quote">
            {renderQuote(t)}
          </p>
          <div className="lp-quote-author">
            <div className="lp-avatar">{t.initials}</div>
            <div>
              <div className="lp-author-name">{t.authorName}</div>
              <div className="lp-author-role">{t.authorRole}</div>
            </div>
          </div>
          {total > 1 && (
            <div className="lp-testimonial-nav">
              <button
                className="lp-testimonial-arrow"
                onClick={() => setIdx(i => (i - 1 + total) % total)}
                aria-label="Depoimento anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="lp-testimonial-dots">
                {items.map((_, i) => (
                  <button
                    key={i}
                    className={`lp-testimonial-dot ${i === idx ? 'active' : ''}`}
                    onClick={() => setIdx(i)}
                    aria-label={`Depoimento ${i + 1}`}
                  />
                ))}
              </div>
              <button
                className="lp-testimonial-arrow"
                onClick={() => setIdx(i => (i + 1) % total)}
                aria-label="Próximo depoimento"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function renderQuote(t) {
  // Quebra a quote pra aplicar <em> no highlight e <strong> no fechamento
  let txt = t.quote
  const parts = []
  if (t.highlight && txt.includes(t.highlight)) {
    const [before, after] = txt.split(t.highlight)
    parts.push(before, <em key="hl">{t.highlight}</em>)
    txt = after
  }
  if (t.strong && txt.includes(t.strong)) {
    const [before, after] = txt.split(t.strong)
    parts.push(before, <strong key="st">{t.strong}</strong>, after)
  } else {
    parts.push(txt)
  }
  return parts
}

function ComparisonTable() {
  const groups = [
    { title: 'Plano e equipe', rows: [
      ['Profissionais cadastrados',     'Até 3',         'Até 25',          'Ilimitado'],
      ['Usuários (equipe)',             '5 inclusos',    '20 inclusos',     'Ilimitado'],
      ['Clientes cadastrados',          'Ilimitado',     'Ilimitado',       'Ilimitado'],
      ['Agendas',                       '1',             'Ilimitadas',      'Ilimitadas'],
    ]},
    { title: 'Canais e atendimento', rows: [
      ['WhatsApp',                      '1 instância',   '1 instância',     'Multi-instância'],
      ['Instagram Direct',              false,           '1 conta',         'Multi-conta'],
      ['Digisac (integração)',          true,            true,              true],
      ['IA atendimento 24/7',           'WhatsApp',      'WhatsApp + Insta','Todos os canais'],
      ['Distribuição automática (round-robin)', false,   true,              true],
      ['Templates HSM (fora da janela 24h)',    false,   true,              true],
      ['Setores e atribuição',          true,            true,              true],
      ['Encaminhar conversa entre atendentes', true,     true,              true],
      ['Conversas IA (auditoria)',      true,            true,              true],
    ]},
    { title: 'Clientes e operação', rows: [
      ['Ficha completa (foto, timeline, dados)', true,   true,              true],
      ['Catálogo (profissionais e serviços)', true, true,                   true],
      ['Cálculo automático de valores por serviço',  true, true,            true],
      ['Banner de aniversário',         true,            true,              true],
      ['Kanban de atividades',          '1 quadro',      'Ilimitado',       'Ilimitado'],
    ]},
    { title: 'Métricas', rows: [
      ['Visão geral · Atendimento · Agenda · Leads', true, true,            true],
      ['Equipe · Financeiro',           false,           true,              true],
      ['Comparativo entre filiais',     false,           false,             true],
    ]},
    { title: 'IA avançada', rows: [
      ['IA criando posts no Instagram', false,           false,             'Em breve'],
      ['IA gerando relatórios',         false,           false,             'Em breve'],
    ]},
    { title: 'Integrações e suporte', rows: [
      ['API + integrações custom',      false,           false,             true],
      ['Onboarding',                    'Tutorial auto', 'Setup em 24h',    'Presencial dedicado'],
      ['Suporte',                       'E-mail',        'Prioritário (2h)','Gerente + SLA'],
    ]},
  ]

  function cell(v) {
    if (v === true)  return <Check size={14} className="lp-cmp-yes" />
    if (v === false) return <span className="lp-cmp-no">—</span>
    return <span className="lp-cmp-text">{v}</span>
  }

  return (
    <div className="lp-cmp">
      <div className="lp-cmp-row lp-cmp-head">
        <div className="lp-cmp-cell-feature"></div>
        <div className="lp-cmp-cell-plan">Starter<span>Para começar</span></div>
        <div className="lp-cmp-cell-plan featured">Pro<span>Mais escolhido</span></div>
        <div className="lp-cmp-cell-plan">Business<span>Personalizado</span></div>
      </div>
      {groups.map(g => (
        <div key={g.title} className="lp-cmp-group">
          <div className="lp-cmp-group-title">{g.title}</div>
          {g.rows.map((r, i) => (
            <div key={i} className="lp-cmp-row">
              <div className="lp-cmp-cell-feature">{r[0]}</div>
              <div className="lp-cmp-cell">{cell(r[1])}</div>
              <div className="lp-cmp-cell featured">{cell(r[2])}</div>
              <div className="lp-cmp-cell">{cell(r[3])}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PricingTier({ name, tier, tagline, features, featured }) {
  return (
    <div className={`lp-plan lp-plan-tier ${featured ? 'featured' : ''}`}>
      {featured && <div className="lp-plan-badge">Mais escolhido</div>}
      <div className="lp-plan-name">{name}</div>
      <div className="lp-plan-tier-label">{tier}</div>
      <p className="lp-plan-tagline">{tagline}</p>
      <ul className="lp-plan-features">
        {features.map(f => (
          <li key={f}><Check size={14} /> {f}</li>
        ))}
      </ul>
      <a
        href="https://wa.me/556999300101?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20plano%20NexSac"
        target="_blank"
        rel="noreferrer"
        className={`lp-plan-cta ${featured ? 'featured' : ''}`}>
        Falar com o comercial <ArrowRight size={14} />
      </a>
    </div>
  )
}

function PricingCard({ name, price, tagline, features, cta, featured, badge, custom }) {
  // mantido pra compat — não usado mais na landing pública (substituído por PricingTier)
  return (
    <div className={`lp-plan ${featured ? 'featured' : ''}`}>
      {badge && <div className="lp-plan-badge">{badge}</div>}
      <div className="lp-plan-name">{name}</div>
      <div className="lp-plan-price">
        {custom ? (
          <span className="lp-plan-custom">{price}</span>
        ) : (
          <>
            <span className="lp-plan-currency">R$</span>
            <span className="lp-plan-value">{price}</span>
            <span className="lp-plan-period">/mês</span>
          </>
        )}
      </div>
      <p className="lp-plan-tagline">{tagline}</p>
      <ul className="lp-plan-features">
        {features.map(f => (
          <li key={f}><Check size={14} /> {f}</li>
        ))}
      </ul>
      <Link to="/login" className={`lp-plan-cta ${featured ? 'featured' : ''}`}>
        {cta} <ArrowRight size={14} />
      </Link>
      {!custom && (
        <p className="lp-plan-microcopy">Sem cartão · Setup em 24h</p>
      )}
    </div>
  )
}

const MOCK_VIEWS = [
  { key: 'rastreio',   icon: TrendingUp,    label: 'Rastreio' },
  { key: 'conversas',  icon: MessageSquare, label: 'Conversas' },
  { key: 'agenda',     icon: Calendar,      label: 'Agenda' },
  { key: 'metricas',   icon: BarChart3,     label: 'Métricas' },
  { key: 'catalogo',   icon: Package,       label: 'Catálogo' },
  { key: 'equipe',     icon: Users,         label: 'Equipe' },
]

function DashboardMock() {
  const [view, setView]       = useState('rastreio')
  const [autoPlay, setAutoPlay] = useState(true)
  const [hovered, setHovered]  = useState(false)

  useEffect(() => {
    if (!autoPlay || hovered) return
    const keys = MOCK_VIEWS.map(v => v.key)
    let iv
    const timeout = setTimeout(() => {
      iv = setInterval(() => {
        setView(cur => {
          const idx = keys.indexOf(cur)
          return keys[(idx + 1) % keys.length]
        })
      }, 2800)
    }, 1500)
    return () => { clearTimeout(timeout); clearInterval(iv) }
  }, [autoPlay, hovered])

  const VIEWS = MOCK_VIEWS

  const FLOATING = {
    rastreio:  { left: { icon: ScanLine, label: 'Rastreados:', value: '94% dos leads' }, right: { icon: TrendingUp, label: 'Top canal:', value: 'Instagram', green: true } },
    conversas: { left: { icon: Zap, label: 'Tempo médio:', value: '2min 14s' }, right: { icon: TrendingUp, label: 'Conversão:', value: '+47%', green: true } },
    agenda:    { left: { icon: Calendar, label: 'Hoje:', value: '14 atendimentos' }, right: { icon: TrendingUp, label: 'Ocupação:', value: '92%', green: true } },
    metricas:  { left: { icon: TrendingUp, label: 'Faturado:', value: 'R$ 38,4k' }, right: { icon: Sparkles, label: 'Ticket médio:', value: 'R$ 280', green: true } },
    catalogo:  { left: { icon: Package, label: 'Profissionais:', value: '8 ativos' }, right: { icon: Activity, label: 'Serviços:', value: '47', green: true } },
    equipe:    { left: { icon: Headset, label: 'Online agora:', value: '5 atendentes' }, right: { icon: Sparkles, label: 'Resp. média:', value: '1min 22s', green: true } },
  }

  const float = FLOATING[view]

  return (
    <div
      className="lp-mock"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="lp-mock-glow" />
      <div className="lp-mock-window">
        <div className="lp-mock-bar">
          <div className="lp-mock-dots">
            <span /><span /><span />
          </div>
          <div className="lp-mock-url">app.nexsac.com / {view}</div>
        </div>
        <div className="lp-mock-body">
          <div className="lp-mock-side">
            <div className="lp-mock-logo">M</div>
            {VIEWS.map((v, i) => (
              <button
                key={v.key}
                onClick={() => { setAutoPlay(false); setView(v.key) }}
                title={v.label}
                className={`lp-mock-nav-item ${view === v.key ? 'active' : ''}`}
                style={{ '--nav-i': i }}
              >
                <v.icon size={11} />
              </button>
            ))}
          </div>

          <div className="lp-mock-scene" key={view}>
            {view === 'rastreio'   && <SceneRastreio />}
            {view === 'conversas'  && <SceneConversas />}
            {view === 'agenda'     && <SceneAgenda />}
            {view === 'metricas'   && <SceneMetricas />}
            {view === 'catalogo'   && <SceneCatalogo />}
            {view === 'equipe'     && <SceneEquipe />}
          </div>
        </div>
      </div>

      <div className="lp-mock-floating" key={`fl-${view}`}>
        <div className="lp-mock-stat">
          <float.left.icon size={14} /> {float.left.label} <strong>{float.left.value}</strong>
        </div>
      </div>
      <div className="lp-mock-floating-2" key={`fr-${view}`}>
        <div className={`lp-mock-stat ${float.right.green ? 'green' : ''}`}>
          <float.right.icon size={14} /> {float.right.label} <strong>{float.right.value}</strong>
        </div>
      </div>
    </div>
  )
}

function SceneRastreio() {
  const sources = [
    { name: 'Instagram',     leads: 47, agendou: 18, color: '#E11D48', icon: Instagram },
    { name: 'Indicação',     leads: 29, agendou: 19, color: '#16A34A', icon: ThumbsUp },
    { name: 'Google Ads',    leads: 24, agendou: 7,  color: '#2563EB', icon: ScanLine },
    { name: 'Meta Ads',      leads: 18, agendou: 5,  color: '#7C3AED', icon: TrendingUp },
    { name: 'Site / Direto', leads: 11, agendou: 4,  color: '#0891B2', icon: Building2 },
  ]
  const total = sources.reduce((s, x) => s + x.leads, 0)
  const totalAgenda = sources.reduce((s, x) => s + x.agendou, 0)
  const max = sources[0].leads
  return (
    <div className="lp-scene-rastreio">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Atribuição de leads</div>
          <div className="lp-scene-sub">Últimos 30 dias · {total} leads rastreados</div>
        </div>
        <div className="lp-scene-pill green">{Math.round(totalAgenda / total * 100)}% conversão</div>
      </div>

      <div className="lp-rastreio-list">
        {sources.map(s => {
          const conv = Math.round(s.agendou / s.leads * 100)
          return (
            <div key={s.name} className="lp-rastreio-row">
              <div className="lp-rastreio-icon" style={{ background: `${s.color}18`, color: s.color }}>
                <s.icon size={11} />
              </div>
              <div className="lp-rastreio-info">
                <div className="lp-rastreio-name-row">
                  <span className="lp-rastreio-name">{s.name}</span>
                  <span className="lp-rastreio-num">{s.leads}</span>
                </div>
                <div className="lp-rastreio-bar-wrap">
                  <div className="lp-rastreio-bar" style={{ width: `${(s.leads / max) * 100}%`, background: s.color }} />
                </div>
                <div className="lp-rastreio-meta">
                  <span className="lp-rastreio-agendou">{s.agendou} agendamentos</span>
                  <span
                    className="lp-rastreio-conv"
                    style={{
                      background: conv >= 50 ? '#F0FDF4' : conv >= 25 ? '#FFFBEB' : '#FEF2F2',
                      color: conv >= 50 ? '#16A34A' : conv >= 25 ? '#D97706' : '#DC2626',
                    }}>
                    {conv}% conv.
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SceneConversas() {
  return (
    <>
      <div className="lp-mock-list">
        <div className="lp-mock-list-header">Conversas <span>14</span></div>
        <div className="lp-mock-msg">
          <div className="lp-mock-avatar" style={{ background: '#FEF3C7' }}>M</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Maria Silva</div>
            <div className="lp-mock-msg-text">Quero marcar um atendimento...</div>
          </div>
          <div className="lp-mock-tag">📅</div>
        </div>
        <div className="lp-mock-msg active">
          <div className="lp-mock-avatar" style={{ background: '#DBEAFE' }}>R</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Roberto Alves</div>
            <div className="lp-mock-msg-text">Tem horário sexta?</div>
          </div>
          <div className="lp-mock-tag green">✓</div>
        </div>
        <div className="lp-mock-msg">
          <div className="lp-mock-avatar" style={{ background: '#FCE7F3' }}>P</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Patrícia Souza</div>
            <div className="lp-mock-msg-text">Obrigada! Até amanhã.</div>
          </div>
        </div>
        <div className="lp-mock-msg">
          <div className="lp-mock-avatar" style={{ background: '#D1FAE5' }}>F</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Fernando R.</div>
            <div className="lp-mock-msg-text">Confirmado às 14h</div>
          </div>
        </div>
      </div>
      <div className="lp-mock-chat">
        <div className="lp-mock-chat-header">
          <div>
            <div className="lp-mock-chat-name">Roberto Alves</div>
            <div className="lp-mock-chat-meta">Recepção · sob atendimento da IA</div>
          </div>
        </div>
        <div className="lp-mock-bubble client">Tem horário sexta de manhã?</div>
        <div className="lp-mock-bubble ai">
          <div className="lp-mock-bubble-tag"><Sparkles size={9} /> IA</div>
          Tenho terça e quinta às 9h ou 10h. Qual prefere?
        </div>
        <div className="lp-mock-bubble client small">Quinta às 10h</div>
        <div className="lp-mock-bubble ai">
          <div className="lp-mock-bubble-tag"><Sparkles size={9} /> IA</div>
          ✅ Agendado! Quinta 28/04 às 10h com Camila
        </div>
      </div>
    </>
  )
}

function SceneAgenda() {
  const days = ['Seg 27', 'Ter 28', 'Qua 29', 'Qui 30', 'Sex 01']
  const slots = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
  const appts = {
    '09:00-1': { name: 'Maria S.', color: '#FCD34D' },
    '10:00-2': { name: 'Roberto A.', color: '#4ADE80' },
    '11:00-0': { name: 'Patrícia', color: '#A78BFA' },
    '14:00-3': { name: 'Fernando', color: '#F472B6' },
    '15:00-1': { name: 'Camila N.', color: '#22D3EE' },
    '16:00-4': { name: 'Lucas M.', color: '#FB923C' },
    '08:00-2': { name: 'Júlia P.', color: '#4ADE80' },
  }
  return (
    <div className="lp-scene-agenda">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Agenda da semana</div>
          <div className="lp-scene-sub">Camila · Vendas</div>
        </div>
        <div className="lp-scene-pill">Hoje</div>
      </div>
      <div className="lp-cal">
        <div className="lp-cal-row lp-cal-head">
          <div />
          {days.map(d => <div key={d} className={d === 'Ter 28' ? 'today' : ''}>{d}</div>)}
        </div>
        {slots.map(s => (
          <div key={s} className="lp-cal-row">
            <div className="lp-cal-time">{s}</div>
            {[0, 1, 2, 3, 4].map(i => {
              const a = appts[`${s}-${i}`]
              return (
                <div key={i} className="lp-cal-slot">
                  {a && (
                    <div className="lp-cal-appt" style={{ background: a.color }}>
                      {a.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneMetricas() {
  const bars = [
    { label: 'Seg', value: 60, color: '#FCD34D' },
    { label: 'Ter', value: 85, color: '#4ADE80' },
    { label: 'Qua', value: 45, color: '#22D3EE' },
    { label: 'Qui', value: 95, color: '#A78BFA' },
    { label: 'Sex', value: 75, color: '#F472B6' },
    { label: 'Sáb', value: 35, color: '#FB923C' },
  ]
  return (
    <div className="lp-scene-metricas">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Faturamento</div>
          <div className="lp-scene-sub">Esta semana</div>
        </div>
        <div className="lp-scene-pill green">+24%</div>
      </div>
      <div className="lp-kpi-row">
        <div className="lp-kpi-card" style={{ background: '#FEF3C7' }}>
          <div className="lp-kpi-label">Faturado</div>
          <div className="lp-kpi-value">R$ 38.4k</div>
        </div>
        <div className="lp-kpi-card" style={{ background: '#DCFCE7' }}>
          <div className="lp-kpi-label">Concluídos</div>
          <div className="lp-kpi-value">137</div>
        </div>
        <div className="lp-kpi-card" style={{ background: '#FCE7F3' }}>
          <div className="lp-kpi-label">Cancelam.</div>
          <div className="lp-kpi-value">4%</div>
        </div>
      </div>
      <div className="lp-bars">
        {bars.map((b, i) => (
          <div key={b.label} className="lp-bar-col">
            <div className="lp-bar-track">
              <div
                className="lp-bar-fill"
                style={{ height: `${b.value}%`, background: b.color, animationDelay: `${i * 0.06}s` }}
              />
            </div>
            <div className="lp-bar-label">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneCatalogo() {
  const procs = [
    { name: 'Atendimento premium',    price: 'R$ 350', type: 'Atendimento', color: '#A78BFA' },
    { name: 'Consultoria express',    price: 'R$ 180', type: 'Serviço',      color: '#4ADE80' },
    { name: 'Pacote completo',        price: 'R$ 420', type: 'Serviço',      color: '#4ADE80' },
    { name: 'Plano mensal',           price: 'R$ 580', type: 'Recorrente',   color: '#FB923C' },
    { name: 'Avaliação inicial',      price: 'R$ 320', type: 'Serviço',      color: '#FB923C' },
  ]
  return (
    <div className="lp-scene-catalogo">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Serviços</div>
          <div className="lp-scene-sub">Catálogo da empresa</div>
        </div>
        <div className="lp-scene-pill">Serviços</div>
      </div>
      <div className="lp-proc-list">
        {procs.map(p => (
          <div key={p.name} className="lp-proc-row">
            <div className="lp-proc-icon" style={{ background: `${p.color}33`, color: p.color }}>
              <Package size={11} />
            </div>
            <div className="lp-proc-content">
              <div className="lp-proc-name">{p.name}</div>
              <div className="lp-proc-meta">
                <span style={{ color: p.color, background: `${p.color}22`, padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: 8, textTransform: 'uppercase' }}>{p.type}</span>
              </div>
            </div>
            <div className="lp-proc-price">{p.price}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneEquipe() {
  const team = [
    { name: 'Camila', role: 'Vendas',     status: 'online',  load: 4, color: '#A78BFA' },
    { name: 'Lucas',  role: 'Suporte',    status: 'online',  load: 6, color: '#4ADE80' },
    { name: 'Bia',    role: 'Recepção',   status: 'busy',    load: 8, color: '#F472B6' },
    { name: 'Hugo',   role: 'Financeiro', status: 'online',  load: 3, color: '#FB923C' },
    { name: 'Lara',   role: 'Comercial',  status: 'offline', load: 0, color: '#94A3B8' },
  ]
  return (
    <div className="lp-scene-equipe">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Equipe</div>
          <div className="lp-scene-sub">5 profissionais</div>
        </div>
        <div className="lp-scene-pill green">4 online</div>
      </div>
      <div className="lp-team-list">
        {team.map(t => (
          <div key={t.name} className="lp-team-row">
            <div className="lp-team-avatar" style={{ background: t.color }}>{t.name.split(' ')[1]?.[0] || t.name[0]}</div>
            <div className="lp-team-content">
              <div className="lp-team-name">{t.name}</div>
              <div className="lp-team-role">{t.role}</div>
            </div>
            <div className={`lp-team-status ${t.status}`}>
              {t.status === 'online' ? 'Online' : t.status === 'busy' ? 'Ocupado' : 'Offline'}
            </div>
            <div className="lp-team-load">{t.load} {t.load === 1 ? 'ticket' : 'tickets'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
