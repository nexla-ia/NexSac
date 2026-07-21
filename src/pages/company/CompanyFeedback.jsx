import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Star, Send, Lightbulb, Bug, Heart, HelpCircle, MoreHorizontal,
  CheckCircle2, Clock, Sparkles, MessageCircle, ArrowRight, Plus,
  Calendar, ChevronRight, MessagesSquare,
} from 'lucide-react'
import './CompanyFeedback.css'

const CATEGORIES = [
  { value: 'sugestao', label: 'Sugestão',   icon: Lightbulb,    accent: '#D97706', soft: '#FEF3C7', softBg: '#FEFCE8', border: '#FDE68A' },
  { value: 'bug',      label: 'Bug',        icon: Bug,          accent: '#DC2626', soft: '#FEE2E2', softBg: '#FEF2F2', border: '#FECACA' },
  { value: 'elogio',   label: 'Elogio',     icon: Heart,        accent: '#DB2777', soft: '#FCE7F3', softBg: '#FDF2F8', border: '#FBCFE8' },
  { value: 'duvida',   label: 'Dúvida',     icon: HelpCircle,   accent: '#0891B2', soft: '#CFFAFE', softBg: '#ECFEFF', border: '#A5F3FC' },
  { value: 'outro',    label: 'Outro',      icon: MoreHorizontal, accent: '#6366F1', soft: '#E0E7FF', softBg: '#EEF2FF', border: '#C7D2FE' },
]

const STATUS_META = {
  novo:        { label: 'Recebido',       icon: Clock,        color: '#475569', bg: '#F1F5F9' },
  em_analise:  { label: 'Em análise',     icon: Sparkles,     color: '#0891B2', bg: '#CFFAFE' },
  planejado:   { label: 'No roadmap',     icon: ArrowRight,   color: '#7C3AED', bg: '#EDE9FE' },
  feito:       { label: 'Implementado',   icon: CheckCircle2, color: '#16A34A', bg: '#DCFCE7' },
  recusado:    { label: 'Fora do escopo', icon: MessageCircle, color: '#DC2626', bg: '#FEE2E2' },
}

const MAX_MSG = 600

function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtDateMonth(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').toLowerCase()
}

export default function CompanyFeedback() {
  const { session } = useAuth()
  const companyId = session?.company?.id
  const firstName = session?.user?.name?.split(' ')[0] || 'amig@'

  const [list, setList]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState('new') // 'new' | 'detail'
  const [selectedId, setSelectedId]   = useState(null)
  const contentRef = useRef(null)

  // Form state
  const [submitting, setSubmitting]   = useState(false)
  const [category, setCategory]       = useState('sugestao')
  const [rating, setRating]           = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [message, setMessage]         = useState('')
  const [errMsg, setErrMsg]           = useState('')
  const [sentToast, setSentToast]     = useState(false)

  // Carrega histórico
  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    supabase.from('feedbacks').select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setList(data || []); setLoading(false) })
  }, [companyId])

  // Realtime
  useEffect(() => {
    if (!companyId) return
    const ch = supabase.channel(`feedbacks-${companyId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'feedbacks', filter: `company_id=eq.${companyId}` },
        (p) => {
          if (p.eventType === 'INSERT') setList(prev => [p.new, ...prev.filter(f => f.id !== p.new.id)])
          else if (p.eventType === 'UPDATE') setList(prev => prev.map(f => f.id === p.new.id ? p.new : f))
          else if (p.eventType === 'DELETE') setList(prev => prev.filter(f => f.id !== p.old.id))
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [companyId])

  const stats = useMemo(() => ({
    total:        list.length,
    em_analise:   list.filter(f => ['novo', 'em_analise'].includes(f.status)).length,
    implementados: list.filter(f => f.status === 'feito').length,
  }), [list])

  const selected = useMemo(() => list.find(f => f.id === selectedId), [list, selectedId])
  const selectedCat = CATEGORIES.find(c => c.value === category) || CATEGORIES[0]

  function openDetail(id) {
    setSelectedId(id)
    setView('detail')
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function openForm() {
    setView('new')
    setSelectedId(null)
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit() {
    setErrMsg('')
    if (!message.trim()) { setErrMsg('Conta pra gente o que tá pensando 😊'); return }
    if (message.length > MAX_MSG) { setErrMsg(`Texto muito longo (máx ${MAX_MSG} caracteres)`); return }
    if (category !== 'duvida' && category !== 'bug' && rating === 0) {
      setErrMsg('Dá uma nota antes de mandar — ajuda a gente priorizar'); return
    }
    setSubmitting(true)
    const { error } = await supabase.from('feedbacks').insert({
      company_id: companyId,
      user_id:    session?.user?.id || null,
      user_name:  session?.user?.name || 'Anônimo',
      user_email: session?.user?.email || '',
      category,
      rating: rating || null,
      message: message.trim(),
    })
    setSubmitting(false)
    if (error) { setErrMsg('Não rolou enviar: ' + error.message); return }
    setMessage('')
    setRating(0)
    setHoverRating(0)
    setCategory('sugestao')
    setSentToast(true)
    setTimeout(() => setSentToast(false), 3500)
  }

  return (
    <div className="fb-root">
      {/* ─── HERO ───────────────────────────────────────── */}
      <div className="fb-hero">
        <div className="fb-hero-bg" />
        <div className="fb-hero-content">
          <div className="fb-hero-eyebrow">
            <MessagesSquare size={13} />
            Voz dos clientes
          </div>
          <h1 className="fb-hero-title">
            <em>Conta</em> o que tá pensando,<br/>
            {firstName}.
          </h1>
          <p className="fb-hero-sub">
            O NexSac evolui com vocês. Manda sugestão, reporta bug, deixa elogio
            ou dúvida — a gente lê tudo, responde e prioriza com base no que mais aparece.
            <span className="fb-hero-sub-italic"> sem rodeios, sem formulário robô.</span>
          </p>

          <div className="fb-hero-stats">
            <div className="fb-hero-stat">
              <div className="fb-hero-stat-value">{stats.total}</div>
              <div className="fb-hero-stat-label">{stats.total === 1 ? 'feedback enviado' : 'feedbacks enviados'}</div>
            </div>
            <div className="fb-hero-stat">
              <div className="fb-hero-stat-value">{stats.em_analise}</div>
              <div className="fb-hero-stat-label">em análise</div>
            </div>
            <div className="fb-hero-stat">
              <div className="fb-hero-stat-value">{stats.implementados}</div>
              <div className="fb-hero-stat-label">{stats.implementados === 1 ? 'implementado' : 'implementados'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SHELL: nav lateral + conteúdo ─────────────── */}
      <div className="fb-shell">
        {/* Sidebar */}
        <aside className="fb-nav">
          <button
            type="button"
            className={`fb-nav-new ${view === 'new' ? 'active' : ''}`}
            onClick={openForm}>
            <Plus size={14} /> Novo feedback
          </button>

          {list.length > 0 && (
            <>
              <div className="fb-nav-title">SEUS FEEDBACKS</div>
              {list.map(f => {
                const m = CATEGORIES.find(c => c.value === f.category) || CATEGORIES[CATEGORIES.length - 1]
                const isActive = selectedId === f.id && view === 'detail'
                const Icn = m.icon
                return (
                  <button
                    key={f.id}
                    onClick={() => openDetail(f.id)}
                    className={`fb-nav-item ${isActive ? 'active' : ''}`}
                    style={isActive ? { background: m.softBg, borderColor: m.accent } : {}}>
                    <div className="fb-nav-date" style={{ background: m.soft, color: m.accent }}>
                      {fmtDateMonth(f.created_at)}
                    </div>
                    <div className="fb-nav-info">
                      <div className="fb-nav-name">{f.message.slice(0, 50)}{f.message.length > 50 ? '…' : ''}</div>
                      <div className="fb-nav-meta">
                        <span style={{ color: m.accent, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icn size={10} /> {m.label}
                        </span>
                        {f.adm_response && <span className="fb-nav-replied">respondido</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} className="fb-nav-arrow" />
                  </button>
                )
              })}
            </>
          )}

          {!loading && list.length === 0 && (
            <div className="fb-nav-empty">
              <MessageCircle size={20} />
              <span>Seu histórico aparece aqui quando você mandar o primeiro feedback.</span>
            </div>
          )}
        </aside>

        {/* Conteúdo */}
        <main className="fb-content" ref={contentRef}>
          {view === 'detail' && selected
            ? <FeedbackDetail f={selected} onBack={openForm} />
            : <FeedbackForm
                category={category} setCategory={setCategory}
                rating={rating} setRating={setRating}
                hoverRating={hoverRating} setHoverRating={setHoverRating}
                message={message} setMessage={setMessage}
                errMsg={errMsg} sentToast={sentToast}
                submitting={submitting}
                onSubmit={handleSubmit}
                selectedCat={selectedCat}
              />
          }
        </main>
      </div>
    </div>
  )
}

// ─── Form ──────────────────────────────────────────────────────────────────
function FeedbackForm({
  category, setCategory, rating, setRating, hoverRating, setHoverRating,
  message, setMessage, errMsg, sentToast, submitting, onSubmit, selectedCat,
}) {
  const placeholders = {
    bug:      'Tela X, cliquei em Y, esperava Z, mas aconteceu W…',
    sugestao: 'Seria muito útil se desse pra…',
    elogio:   'Adoramos quando…',
    duvida:   'Não consegui entender como…',
    outro:    'Conta pra gente…',
  }
  const labels = {
    bug:      'Conta o que aconteceu',
    sugestao: 'O que você gostaria que tivesse',
    elogio:   'O que tá funcionando bem',
    duvida:   'Qual a dúvida',
    outro:    'Manda ver',
  }
  return (
    <article className="fb-release" key="form">
      {/* Header colorido */}
      <header className="fb-release-head" style={{ background: selectedCat.softBg }}>
        <div className="fb-release-emoji">💬</div>
        <div className="fb-release-head-content">
          <div className="fb-release-kicker" style={{ color: selectedCat.accent }}>
            <Send size={11} /> Novo feedback
          </div>
          <h2 className="fb-release-title">O que você quer contar?</h2>
          <div className="fb-release-cats">
            {CATEGORIES.map(c => {
              const CIcon = c.icon
              const active = category === c.value
              return (
                <button key={c.value} type="button"
                  onClick={() => setCategory(c.value)}
                  className={`fb-cat ${active ? 'active' : ''}`}
                  style={active ? {
                    background: c.soft,
                    color: c.accent,
                    borderColor: c.accent,
                  } : {}}>
                  <CIcon size={12} /> {c.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="fb-release-deco" style={{ background: selectedCat.accent }} />
      </header>

      {/* Body */}
      <div className="fb-form-body">
        {/* Rating */}
        <section>
          <div className="fb-form-label">
            Que nota você dá pra plataforma?
            {(category === 'duvida' || category === 'bug') && <span className="fb-form-optional">· opcional</span>}
          </div>
          <div className="fb-stars">
            {[1, 2, 3, 4, 5].map(n => {
              const filled = (hoverRating || rating) >= n
              return (
                <button key={n} type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                  className={`fb-star ${filled ? 'filled' : ''}`}>
                  <Star size={28}
                    fill={filled ? '#FBBF24' : 'transparent'}
                    color={filled ? '#F59E0B' : '#CBD5E1'}
                    strokeWidth={1.8} />
                </button>
              )
            })}
            {rating > 0 && (
              <span className="fb-star-label">
                {rating === 5 ? 'sensacional ✨' :
                 rating === 4 ? 'muito bom' :
                 rating === 3 ? 'razoável' :
                 rating === 2 ? 'precisa melhorar' :
                                'tá longe ainda'}
              </span>
            )}
          </div>
        </section>

        {/* Mensagem */}
        <section>
          <div className="fb-form-label">{labels[category]}</div>
          <textarea
            className="fb-textarea"
            placeholder={placeholders[category]}
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            maxLength={MAX_MSG}
          />
          <div className={`fb-count ${message.length > MAX_MSG * 0.9 ? 'warn' : ''}`}>
            {message.length} / {MAX_MSG}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="fb-form-foot">
        <div className="fb-form-status">
          {sentToast ? (
            <span className="fb-status-ok">✓ Recebido! A gente lê e volta com você.</span>
          ) : errMsg ? (
            <span className="fb-status-err">{errMsg}</span>
          ) : (
            <span className="fb-status-soft">Vai pro time direto. Resposta no painel ou no e-mail.</span>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={submitting || !message.trim()}
          className="fb-submit"
          style={{
            background: `linear-gradient(120deg, ${selectedCat.accent} 0%, ${selectedCat.accent}dd 100%)`,
            boxShadow: `0 6px 18px -6px ${selectedCat.accent}aa`,
          }}>
          <Send size={14} /> {submitting ? 'Enviando…' : 'Mandar feedback'}
        </button>
      </footer>
    </article>
  )
}

// ─── Detail ─────────────────────────────────────────────────────────────────
function FeedbackDetail({ f, onBack }) {
  const cat = CATEGORIES.find(c => c.value === f.category) || CATEGORIES[CATEGORIES.length - 1]
  const status = STATUS_META[f.status] || STATUS_META.novo
  const SIcon = status.icon
  const CIcon = cat.icon
  return (
    <article className="fb-release" key={f.id}>
      <header className="fb-release-head" style={{ background: cat.softBg }}>
        <div className="fb-release-emoji">{cat.value === 'bug' ? '🐛' : cat.value === 'elogio' ? '❤️' : cat.value === 'duvida' ? '❓' : cat.value === 'sugestao' ? '💡' : '💬'}</div>
        <div className="fb-release-head-content">
          <div className="fb-release-kicker" style={{ color: cat.accent }}>
            <Calendar size={11} /> {fmtDate(f.created_at)}
          </div>
          <h2 className="fb-release-title">{f.message.slice(0, 80)}{f.message.length > 80 ? '…' : ''}</h2>
          <div className="fb-release-tags">
            <span className="fb-release-type" style={{ color: cat.accent, background: cat.soft, borderColor: cat.border }}>
              <CIcon size={11} /> {cat.label}
            </span>
            <span className="fb-release-status" style={{ color: status.color, background: status.bg }}>
              <SIcon size={11} /> {status.label}
            </span>
            {f.rating && (
              <span className="fb-release-stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={12}
                    fill={i < f.rating ? '#FBBF24' : 'transparent'}
                    color={i < f.rating ? '#F59E0B' : '#CBD5E1'}
                    strokeWidth={1.8} />
                ))}
              </span>
            )}
          </div>
        </div>
        <div className="fb-release-deco" style={{ background: cat.accent }} />
      </header>

      <div className="fb-detail-body">
        <div className="fb-detail-intro">
          <MessagesSquare size={14} style={{ color: cat.accent }} />
          <span>Sua mensagem</span>
        </div>
        <div className="fb-detail-text">{f.message}</div>

        {f.adm_response ? (
          <>
            <div className="fb-detail-intro" style={{ marginTop: 22 }}>
              <Sparkles size={14} style={{ color: '#0891B2' }} />
              <span>Resposta do time NexSac</span>
            </div>
            <div className="fb-detail-response">{f.adm_response}</div>
          </>
        ) : (
          <div className="fb-detail-pending">
            <Clock size={13} /> Aguardando resposta do time
          </div>
        )}
      </div>

      <footer className="fb-detail-foot">
        <button onClick={onBack} className="fb-detail-back">
          <Plus size={13} /> Mandar outro feedback
        </button>
      </footer>
    </article>
  )
}
