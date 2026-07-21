import { useEffect, useMemo, useState, useRef } from 'react'
import { Sparkles, Wrench, Bug, Tag, Star, Calendar, Zap, BookOpen, ChevronRight, Rocket, MessagesSquare } from 'lucide-react'
import { UPDATES, latestUpdateDate } from '../../data/updates'
import { useAuth } from '../../context/AuthContext'
import './CompanyNews.css'

const TYPE_META = {
  feature:     {
    label: 'Novidade',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
    softBg: '#EDE9FE', emoji: '🚀',
  },
  improvement: {
    label: 'Melhoria',  color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE',
    softBg: '#DBEAFE', emoji: '⚡',
  },
  fix: {
    label: 'Correção',  color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0',
    softBg: '#DCFCE7', emoji: '🔧',
  },
}

const SEEN_KEY = 'nx_news_seen'

function fmtDate(d) {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtDateShort(d) {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtDateMonth(d) {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').toLowerCase()
}

export default function CompanyNews() {
  const { session } = useAuth()
  const [activeIdx, setActiveIdx] = useState(0)
  const contentRef = useRef(null)

  const lastSeenBefore = useMemo(() => {
    try { return localStorage.getItem(SEEN_KEY) } catch { return null }
  }, [])

  // Marca como visto ao entrar
  useEffect(() => {
    localStorage.setItem(SEEN_KEY, latestUpdateDate())
  }, [])

  const newCount = useMemo(() => {
    if (!lastSeenBefore) return UPDATES.length
    return UPDATES.filter(u => u.date > lastSeenBefore).length
  }, [lastSeenBefore])

  function selectRelease(idx) {
    setActiveIdx(idx)
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const active = UPDATES[activeIdx]
  const meta = TYPE_META[active?.type] || TYPE_META.improvement

  return (
    <div className="news-root">
      {/* Hero */}
      <div className="news-hero">
        <div className="news-hero-bg" />
        <div className="news-hero-content">
          <div className="news-hero-eyebrow">
            <Sparkles size={14} />
            Diário de bordo
          </div>
          <h1 className="news-hero-title">
            <em>Olha</em> o que tem de novo<br />
            por aqui, {session?.user?.name?.split(' ')[0] || 'amig@'}.
          </h1>
          <p className="news-hero-sub">
            A gente registra todas as melhorias e novas funcionalidades neste diário.
            Cada entrada é uma conversa direta com vocês — sem termo técnico, prometido.
          </p>

          <div className="news-hero-stats">
            <div className="news-hero-stat">
              <div className="news-hero-stat-value">{UPDATES.length}</div>
              <div className="news-hero-stat-label">releases até agora</div>
            </div>
            <div className="news-hero-stat">
              <div className="news-hero-stat-value">{newCount}</div>
              <div className="news-hero-stat-label">{newCount === 1 ? 'nova desde a última visita' : 'novas desde a última visita'}</div>
            </div>
            <div className="news-hero-stat">
              <div className="news-hero-stat-value">{fmtDateShort(UPDATES[0]?.date)}</div>
              <div className="news-hero-stat-label">última atualização</div>
            </div>
          </div>
        </div>
      </div>

      {/* Layout */}
      <div className="news-shell">
        {/* Sidebar */}
        <aside className="news-nav">
          <div className="news-nav-title">RELEASES</div>
          {UPDATES.map((u, i) => {
            const m = TYPE_META[u.type] || TYPE_META.improvement
            const isActive = i === activeIdx
            const isNew = lastSeenBefore && u.date > lastSeenBefore
            return (
              <button
                key={i}
                onClick={() => selectRelease(i)}
                className={`news-nav-item ${isActive ? 'active' : ''}`}
                style={isActive ? { background: m.bg, borderColor: m.color } : {}}
              >
                <div className="news-nav-date" style={{ background: m.softBg, color: m.color }}>
                  {fmtDateMonth(u.date)}
                </div>
                <div className="news-nav-info">
                  <div className="news-nav-name">{u.title}</div>
                  <div className="news-nav-meta">
                    <span style={{ color: m.color, fontWeight: 700 }}>{m.label}</span>
                    {isNew && <span className="news-nav-new">novo</span>}
                  </div>
                </div>
                <ChevronRight size={14} className="news-nav-arrow" />
              </button>
            )
          })}
        </aside>

        {/* Conteúdo */}
        <main className="news-content" ref={contentRef}>
          {active && <ReleasePost update={active} meta={meta} />}
        </main>
      </div>
    </div>
  )
}

function ReleasePost({ update: u, meta }) {
  return (
    <article className="news-release" key={u.date + u.title}>
      {/* Header colorido */}
      <header className="news-release-head" style={{ background: meta.bg }}>
        <div className="news-release-emoji">{meta.emoji}</div>
        <div className="news-release-head-content">
          <div className="news-release-kicker" style={{ color: meta.color }}>
            <Calendar size={12} /> {fmtDate(u.date)}
          </div>
          <h2 className="news-release-title">{u.title}</h2>
          <div className="news-release-tags">
            <span className="news-release-type" style={{ color: meta.color, background: meta.softBg, borderColor: meta.border }}>
              {meta.label}
            </span>
            {(u.tags || []).map(t => (
              <span key={t} className="news-release-tag">
                <Tag size={9} /> {t}
              </span>
            ))}
          </div>
        </div>
        <div className="news-release-deco" style={{ background: meta.color }} />
      </header>

      {/* Intro */}
      <div className="news-release-intro">
        <MessagesSquare size={15} style={{ color: meta.color }} />
        <span>O que mudou nesta versão:</span>
      </div>

      {/* Items como timeline */}
      <ol className="news-release-items">
        {u.items.map((it, i) => (
          <li key={i} className="news-release-item">
            <div className="news-release-num" style={{ background: meta.color }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="news-release-line" style={{ background: `${meta.color}33` }} />
            <div className="news-release-card">
              <p>{it}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Footer */}
      <footer className="news-release-foot">
        <div className="news-release-stars">
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
        </div>
        <span>Lançado em {fmtDate(u.date)}</span>
      </footer>
    </article>
  )
}
