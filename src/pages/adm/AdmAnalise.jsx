import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Users, Briefcase, ClipboardList, Calendar, CircleDollarSign,
  Clock, Inbox, AlertOctagon, MessageSquare, Bot, Activity, RefreshCw,
  Building2, Crown, Award, TrendingUp, AlertTriangle, ChevronRight, Hourglass,
  Zap, Eye, Search, Wrench, User, Sparkles, FileText, Cake, Kanban, Filter,
  Headset, Wifi, WifiOff, BarChart3,
} from 'lucide-react'
import CompanyMetrics from '../company/CompanyMetrics'
import './AdmAnalise.css'

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseTimestamp(val) {
  if (!val) return null
  if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
    const [date, time] = val.split(' ')
    const [d, m, y] = date.split('/')
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`)
  }
  return new Date(val)
}
function fmtMs(ms) {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}min`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
function fmtMoney(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) }
function fmtNum(v) { return Number(v || 0).toLocaleString('pt-BR') }
function fmtDateBR(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtPhone(numero) {
  if (!numero) return '—'
  const c = numero.replace(/@.*$/, '')
  if (c.length === 13) return `+${c.slice(0,2)} (${c.slice(2,4)}) ${c.slice(4,9)}-${c.slice(9)}`
  if (c.length === 11) return `(${c.slice(0,2)}) ${c.slice(2,7)}-${c.slice(7)}`
  return c
}
function detectMedia(b64) {
  if (!b64 || b64.length < 10) return null
  if (b64.startsWith('T2dn'))         return { type: 'audio', mime: 'audio/ogg' }
  if (b64.startsWith('//uQ') || b64.startsWith('SUQz')) return { type: 'audio', mime: 'audio/mpeg' }
  if (b64.startsWith('GkXf'))         return { type: 'audio', mime: 'audio/webm' }
  if (b64.startsWith('/9j/'))         return { type: 'image', mime: 'image/jpeg' }
  if (b64.startsWith('iVBOR'))        return { type: 'image', mime: 'image/png' }
  if (b64.startsWith('UklGR'))        return { type: 'image', mime: 'image/webp' }
  if (b64.startsWith('JVBERi'))       return { type: 'pdf',   mime: 'application/pdf' }
  return null
}
function median(arr) { if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2 }
function p90(arr)   { if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[Math.min(Math.floor(s.length*0.9), s.length-1)] }
function slaColor(ms) {
  if (!ms) return '#94A3B8'
  if (ms < 5*60*1000)  return '#16A34A'
  if (ms < 30*60*1000) return '#D97706'
  return '#DC2626'
}
const STATUS_LABELS = {
  agendado:   { label: 'Agendado',   color: '#64748B', bg: '#F1F5F9' },
  confirmado: { label: 'Confirmado', color: '#0891B2', bg: '#ECFEFF' },
  concluido:  { label: 'Concluído',  color: '#16A34A', bg: '#F0FDF4' },
  faltou:     { label: 'Não compareceu', color: '#DC2626', bg: '#FEF2F2' },
  cancelado:  { label: 'Cancelado',  color: '#6B7280', bg: '#F9FAFB' },
}

// ─── Página principal ──────────────────────────────────────────────────────
export default function AdmAnalise() {
  const { db } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const companies = (db.companies || []).filter(c => c.instance)

  const initialId = params.get('empresa') || companies[0]?.id || ''
  const [selectedId, setSelectedId] = useState(initialId)
  const [tab, setTab] = useState(params.get('tab') || 'operacao')
  const [period, setPeriod] = useState('30d')
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)

  const company = companies.find(c => c.id === selectedId) || companies[0]

  const [data, setData] = useState({
    msgs: [], convs: [], atts: [], appts: [], pacientes: [], pros: [], procs: [],
    alerts: [], kanbanCards: [], users: [],
  })
  const [wppState, setWppState] = useState('unknown')

  async function loadAll() {
    if (!company?.instance) return
    setLoading(true)
    const since = new Date(Date.now() - (period === '24h' ? 1 : period === '7d' ? 7 : 30) * 86400000).toISOString()
    const inst = company.instance
    const [msgs, convs, atts, appts, pacientes, pros, procs, alerts, kanban, users] = await Promise.all([
      supabase.from('mensagens_geral').select('id, numero, mensagem, base64, type, "horaLastMessage", created_at').eq('instancia', inst).gte('created_at', since).order('id', { ascending: false }).limit(20000),
      supabase.from('conversations').select('session_id, instancia, reason, closed_at').eq('instancia', inst),
      supabase.from('attendances').select('numero, instancia, user_id').eq('instancia', inst),
      supabase.from('appointments').select('*').eq('instancia', inst).order('starts_at', { ascending: false }),
      supabase.from('saved_contacts').select('*').eq('instancia', inst),
      supabase.from('professionals').select('*').eq('instancia', inst),
      supabase.from('procedures').select('*').eq('instancia', inst),
      supabase.from('alerts').select('id, resolved, created_at').eq('instancia', inst),
      supabase.from('kanban_cards').select('id, priority, due_date').eq('instancia', inst),
      supabase.from('users').select('id, name, email, active').eq('company_id', company.id),
    ])
    setData({
      msgs: msgs.data || [],
      convs: convs.data || [],
      atts: atts.data || [],
      appts: appts.data || [],
      pacientes: pacientes.data || [],
      pros: pros.data || [],
      procs: procs.data || [],
      alerts: alerts.data || [],
      kanbanCards: kanban.data || [],
      users: users.data || [],
    })
    setLastRefresh(new Date())
    setLoading(false)

    // Status WhatsApp em paralelo
    if (company.api_instancia) {
      const baseUrl = company.evolution_url || 'https://evolutionapi.nexladesenvolvimento.com.br'
      try {
        const r = await fetch(`${baseUrl}/instance/connectionState/${inst}`, { headers: { apikey: company.api_instancia } })
        if (r.ok) {
          const j = await r.json()
          setWppState(j?.instance?.state || j?.state || 'unknown')
        }
      } catch { setWppState('unknown') }
    }
  }

  useEffect(() => { loadAll() }, [company?.instance, period])

  // Sincroniza URL
  useEffect(() => {
    const next = new URLSearchParams()
    if (selectedId) next.set('empresa', selectedId)
    if (tab !== 'operacao') next.set('tab', tab)
    setParams(next, { replace: true })
  }, [selectedId, tab])

  if (!company) {
    return (
      <div className="an-root">
        <div className="an-empty-page">
          <Building2 size={40} />
          <h2>Nenhuma empresa cadastrada</h2>
          <p>Cadastre uma empresa em /adm/empresas pra começar a análise.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="an-root">
      {/* Header sticky */}
      <div className="an-head">
        <div className="an-head-left">
          <div className="an-eyebrow"><Activity size={13} /> Análise 360°</div>
          <h1 className="an-title">{company.name}</h1>
          <div className="an-meta">
            <span className="an-meta-instance">{company.instance}</span>
            <span className={`an-wpp-pill ${wppState === 'open' ? 'on' : 'off'}`}>
              {wppState === 'open' ? <Wifi size={11} /> : <WifiOff size={11} />}
              {wppState === 'open' ? 'WhatsApp online' : wppState === 'close' ? 'WhatsApp offline' : 'WhatsApp ?'}
            </span>
            {company.plan && <span className="an-plan-pill">{company.plan}</span>}
          </div>
        </div>
        <div className="an-head-actions">
          <div className="an-company-select-wrap">
            <Building2 size={14} className="an-company-select-ico" />
            <select className="an-company-select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              {companies.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="an-pills">
            {['24h', '7d', '30d'].map(p => (
              <button key={p} className={`an-pill ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <button className="an-refresh" onClick={loadAll} disabled={loading} title={lastRefresh ? `Atualizado ${lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="an-tabs">
        {[
          { k: 'operacao',  l: 'Operação',  ico: Activity },
          { k: 'qualidade', l: 'Qualidade', ico: Hourglass },
          { k: 'metricas',  l: 'Métricas',  ico: BarChart3 },
          { k: 'espiao',    l: 'Conversas', ico: Eye },
        ].map(t => (
          <button key={t.k} className={`an-tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>
            <t.ico size={14} /> {t.l}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab */}
      {tab === 'operacao'  && <TabOperacao  data={data} loading={loading} />}
      {tab === 'qualidade' && <TabQualidade data={data} period={period} loading={loading} />}
      {tab === 'metricas'  && <TabMetricas  company={company} />}
      {tab === 'espiao'    && <TabEspiao    data={data} company={company} loading={loading} />}
    </div>
  )
}

// ─── TAB MÉTRICAS — embed do painel completo da empresa ────────────────────
function TabMetricas({ company }) {
  if (!company) {
    return (
      <div className="an-empty">
        <Building2 size={32} style={{ opacity: 0.25 }} />
        <div>Selecione uma empresa pra ver as métricas completas.</div>
      </div>
    )
  }
  return (
    <div className="an-metricas-embed">
      <CompanyMetrics companyOverride={company} hideHeader />
    </div>
  )
}

// ─── TAB OPERAÇÃO ───────────────────────────────────────────────────────────
function TabOperacao({ data, loading }) {
  const stats = useMemo(() => {
    const concluded = data.appts.filter(a => a.status === 'concluido')
    const revenue   = concluded.reduce((s, a) => s + Number(a.price || 0), 0)
    const noshow    = data.appts.filter(a => a.status === 'faltou').length
    const noshowPct = data.appts.length ? Math.round((noshow / data.appts.length) * 100) : 0
    const today = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today.getTime() + 86400000)
    const apptsHoje = data.appts.filter(a => {
      const d = new Date(a.starts_at)
      return d >= today && d < tomorrow
    }).length
    const aniversariantes = data.pacientes.filter(p => {
      const b = p.birth_date || p.birthdate
      if (!b) return false
      const dt = new Date(b); const cur = new Date()
      const next = new Date(cur.getFullYear(), dt.getMonth(), dt.getDate())
      if (next < cur) next.setFullYear(cur.getFullYear() + 1)
      return (next - cur) / 86400000 <= 7
    }).length
    return { revenue, noshowPct, apptsHoje, aniversariantes }
  }, [data])

  const topPros = useMemo(() => {
    const map = {}
    data.pros.forEach(p => { map[p.id] = { ...p, count: 0, revenue: 0, completed: 0 } })
    data.appts.forEach(a => {
      if (!a.professional_id || !map[a.professional_id]) return
      map[a.professional_id].count++
      if (a.status === 'concluido') {
        map[a.professional_id].revenue += Number(a.price || 0)
        map[a.professional_id].completed++
      }
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [data])

  const topProcs = useMemo(() => {
    const map = {}
    data.procs.forEach(p => { map[p.id] = { ...p, count: 0, revenue: 0 } })
    data.appts.forEach(a => {
      if (!a.procedure_id || !map[a.procedure_id]) return
      map[a.procedure_id].count++
      if (a.status === 'concluido') map[a.procedure_id].revenue += Number(a.price || 0)
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [data])

  const recentAppts = useMemo(() => data.appts.slice(0, 10), [data.appts])

  return (
    <>
      <div className="an-kpi-grid">
        <KpiBig icon={Users}            color="#2563EB" bg="#EFF6FF" value={fmtNum(data.pacientes.length)} label="Contatos" />
        <KpiBig icon={Briefcase}        color="#7C3AED" bg="#EDE9FE" value={fmtNum(data.pros.length)}      label="Profissionais" />
        <KpiBig icon={ClipboardList}    color="#DB2777" bg="#FCE7F3" value={fmtNum(data.procs.length)}     label="Serviços" />
        <KpiBig icon={Calendar}         color="#16A34A" bg="#D1FAE5" value={fmtNum(data.appts.length)}     label="Agendamentos" sub={`${stats.apptsHoje} hoje`} />
        <KpiBig icon={CircleDollarSign} color="#fff"    bg="green-grad" value={fmtMoney(stats.revenue)}    label="Receita período" sub={`${stats.noshowPct}% não compareceu`} highlight />
      </div>

      <div className="an-mini-grid">
        <Mini icon={Cake}            bg="#FEF3C7" color="#D97706" num={stats.aniversariantes} label="Aniversariantes (7d)" />
        <Mini icon={AlertTriangle}   bg="#FEE2E2" color="#DC2626" num={data.alerts.filter(a => !a.resolved).length} label="Alertas pendentes" />
        <Mini icon={Users}           bg="#DBEAFE" color="#2563EB" num={`${data.users.filter(u => u.active).length}/${data.users.length}`} label="Usuários ativos" />
        <Mini icon={Kanban}          bg="#FCE7F3" color="#DB2777" num={data.kanbanCards.length} label="Kanban cards" />
        <Mini icon={MessageSquare}   bg="#EDE9FE" color="#7C3AED" num={fmtNum(data.msgs.length)} label="Mensagens período" />
        <Mini icon={Bot}             bg="#D1FAE5" color="#059669" num={fmtNum(data.msgs.filter(m => (m.type||'').toLowerCase()==='ia').length)} label="Respostas IA" />
      </div>

      <div className="an-row-2">
        <div className="an-card">
          <div className="an-card-head"><Award size={14} /> Top profissionais por receita</div>
          {topPros.length === 0 ? <Empty msg="Nenhum profissional cadastrado." /> : (
            <div className="an-rank">
              {topPros.map((p, i) => (
                <div key={p.id} className="an-rank-row">
                  <div className={`an-rank-medal m${i+1}`}>{i === 0 ? <Crown size={12}/> : i+1}</div>
                  <div className="an-rank-info">
                    <div className="an-rank-name">{p.name}</div>
                    <div className="an-rank-sub">{p.specialty || '—'}</div>
                  </div>
                  <div className="an-rank-stats">
                    <div className="an-rank-money">{fmtMoney(p.revenue)}</div>
                    <div className="an-rank-count">{p.completed} agendamentos</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="an-card">
          <div className="an-card-head"><ClipboardList size={14} /> Top serviços</div>
          {topProcs.length === 0 ? <Empty msg="Sem dados." /> : (
            <div className="an-rank">
              {topProcs.map((p, i) => (
                <div key={p.id} className="an-rank-row">
                  <div className="an-rank-num">{i+1}</div>
                  <div className="an-rank-info">
                    <div className="an-rank-name">{p.name}</div>
                    <div className="an-rank-sub">{p.type || '—'} · {p.duration_minutes || 30}min</div>
                  </div>
                  <div className="an-rank-stats">
                    <div className="an-rank-money">{fmtMoney(p.revenue)}</div>
                    <div className="an-rank-count">{p.count}x</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="an-card">
        <div className="an-card-head"><Calendar size={14} /> Agendamentos recentes</div>
        <table className="an-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Contato</th>
              <th>Profissional</th>
              <th>Serviço</th>
              <th>Status</th>
              <th style={{ textAlign:'right' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {recentAppts.length === 0 ? (
              <tr><td colSpan={6} className="an-empty-row">Sem agendamentos no período.</td></tr>
            ) : recentAppts.map(a => {
              const pro = data.pros.find(p => p.id === a.professional_id)
              const proc = data.procs.find(p => p.id === a.procedure_id)
              const st = STATUS_LABELS[a.status] || STATUS_LABELS.agendado
              return (
                <tr key={a.id}>
                  <td>{fmtDateBR(a.starts_at)} {new Date(a.starts_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
                  <td>{a.contact_nome || a.patient_name || '—'}</td>
                  <td>{pro?.name || '—'}</td>
                  <td>{proc?.name || '—'}</td>
                  <td><span className="an-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                  <td style={{ textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{fmtMoney(a.price)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── TAB QUALIDADE ──────────────────────────────────────────────────────────
function TabQualidade({ data, period, loading }) {
  const sessions = useMemo(() => {
    const map = {}
    data.msgs.forEach(m => {
      if (!m.numero) return
      if (!map[m.numero]) map[m.numero] = []
      map[m.numero].push(m)
    })
    Object.values(map).forEach(s => s.sort((a, b) => {
      const ta = new Date(parseTimestamp(a.horaLastMessage) || a.created_at).getTime()
      const tb = new Date(parseTimestamp(b.horaLastMessage) || b.created_at).getTime()
      return ta - tb
    }))
    return map
  }, [data.msgs])

  const closedSet = useMemo(() => {
    const s = new Set()
    data.convs.forEach(c => s.add(c.session_id))
    return s
  }, [data.convs])

  const sessionMetrics = useMemo(() => {
    return Object.entries(sessions).map(([numero, msgs]) => {
      const last = msgs[msgs.length - 1]
      const lastTime = last ? new Date(parseTimestamp(last.horaLastMessage) || last.created_at) : null
      const lastType = (last?.type || '').toLowerCase()
      const isClosed = closedSet.has(numero)
      const isPending = !isClosed && lastType === 'cliente'
      const waitingMs = isPending && lastTime ? (Date.now() - lastTime.getTime()) : 0

      const firstClientIdx = msgs.findIndex(m => (m.type||'').toLowerCase() === 'cliente')
      let firstHumanMs = null, firstAnyMs = null
      if (firstClientIdx >= 0) {
        const t0 = new Date(parseTimestamp(msgs[firstClientIdx].horaLastMessage) || msgs[firstClientIdx].created_at).getTime()
        const fh = msgs.slice(firstClientIdx + 1).find(m => ['humano','atendente'].includes((m.type||'').toLowerCase()))
        const fa = msgs.slice(firstClientIdx + 1).find(m => ['ia','humano','atendente'].includes((m.type||'').toLowerCase()))
        if (fh) firstHumanMs = new Date(parseTimestamp(fh.horaLastMessage) || fh.created_at).getTime() - t0
        if (fa) firstAnyMs   = new Date(parseTimestamp(fa.horaLastMessage) || fa.created_at).getTime() - t0
      }
      const hasIa     = msgs.some(m => (m.type||'').toLowerCase() === 'ia')
      const hasHumano = msgs.some(m => ['humano','atendente'].includes((m.type||'').toLowerCase()))

      return { numero, msgs, last, lastTime, lastType, isClosed, isPending, waitingMs, firstHumanMs, firstAnyMs, hasIa, hasHumano }
    })
  }, [sessions, closedSet])

  const kpis = useMemo(() => {
    const allHuman = sessionMetrics.map(s => s.firstHumanMs).filter(x => x != null)
    const allAny   = sessionMetrics.map(s => s.firstAnyMs).filter(x => x != null)
    const pending  = sessionMetrics.filter(s => s.isPending)
    const expired  = data.convs.filter(c => c.reason === 'auto_encerrado').length
    const aiH      = sessionMetrics.filter(s => s.hasIa && s.hasHumano).length
    const aiTot    = sessionMetrics.filter(s => s.hasIa).length
    return {
      mHuman: median(allHuman), p9Human: p90(allHuman),
      mAny: median(allAny), p9Any: p90(allAny),
      pending: pending.length,
      pending1h: pending.filter(p => p.waitingMs > 3600000).length,
      pending24h: pending.filter(p => p.waitingMs > 86400000).length,
      expired,
      aiHandover: aiH, aiHandoverPct: aiTot ? (aiH/aiTot*100) : 0,
      total: sessionMetrics.length,
    }
  }, [sessionMetrics, data.convs])

  const dailyTrend = useMemo(() => {
    const buckets = {}
    sessionMetrics.forEach(s => {
      if (s.firstHumanMs == null || !s.lastTime) return
      const day = s.lastTime.toISOString().slice(0, 10)
      if (!buckets[day]) buckets[day] = []
      buckets[day].push(s.firstHumanMs)
    })
    return Object.entries(buckets).sort().map(([day, vals]) => ({ day, median: median(vals), count: vals.length }))
  }, [sessionMetrics])
  const maxTrend = Math.max(1, ...dailyTrend.map(d => d.median))

  const topPending = useMemo(() => sessionMetrics.filter(s => s.isPending).sort((a,b) => b.waitingMs - a.waitingMs).slice(0, 10), [sessionMetrics])

  return (
    <>
      <div className="an-kpi-grid">
        <KpiBig icon={Clock}        color="#2563EB" bg="#EFF6FF" value={fmtMs(kpis.mHuman)}  label="Resposta humana (mediana)" sub={`p90: ${fmtMs(kpis.p9Human)}`} />
        <KpiBig icon={Zap}          color="#7C3AED" bg="#F5F3FF" value={fmtMs(kpis.mAny)}    label="Qualquer resposta" sub={`inclui IA · p90 ${fmtMs(kpis.p9Any)}`} />
        <KpiBig icon={Inbox}        color="#D97706" bg="#FFFBEB" value={kpis.pending}        label="Pendentes agora" sub={`${kpis.pending1h} > 1h · ${kpis.pending24h} > 24h`} alert={kpis.pending1h > 0} />
        <KpiBig icon={AlertOctagon} color="#DC2626" bg="#FEF2F2" value={kpis.expired}        label="Expirados" sub="auto-encerrados" alert={kpis.expired > 0} />
        <KpiBig icon={Bot}          color="#0891B2" bg="#ECFEFF" value={`${kpis.aiHandoverPct.toFixed(0)}%`} label="IA → Humano" sub={`${kpis.aiHandover} handovers`} />
        <KpiBig icon={MessageSquare} color="#16A34A" bg="#F0FDF4" value={kpis.total}          label="Conversas no período" sub={period === '24h' ? '24h' : period === '7d' ? '7 dias' : '30 dias'} />
      </div>

      <div className="an-card">
        <div className="an-card-head"><Activity size={14} /> Tempo médio de resposta humana — dia a dia <span className="an-card-sub">{dailyTrend.length} dias</span></div>
        <div className="an-trend">
          {dailyTrend.length === 0 ? <Empty msg="Sem dados ainda" /> : dailyTrend.map(d => {
            const h = Math.max(4, (d.median / maxTrend) * 100)
            return (
              <div key={d.day} className="an-trend-bar-wrap" title={`${d.day} — ${fmtMs(d.median)} (${d.count} conv.)`}>
                <div className="an-trend-num">{fmtMs(d.median)}</div>
                <div className="an-trend-bar-track">
                  <div className="an-trend-bar" style={{ height: `${h}%`, background: slaColor(d.median) }} />
                </div>
                <div className="an-trend-day">{new Date(d.day + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="an-card">
        <div className="an-card-head">
          <Hourglass size={14} /> Top pendências aguardando humano
          {topPending.length > 0 && <span className="an-pending-count">{topPending.length}</span>}
        </div>
        {topPending.length === 0 ? (
          <div className="an-empty-card"><Sparkles size={20} style={{ color: '#16A34A' }} /><p>Nenhum contato pendente. Bom trabalho.</p></div>
        ) : (
          <div className="an-pending-list">
            {topPending.map(s => {
              const urgent = s.waitingMs > 3600000
              const critical = s.waitingMs > 14400000
              return (
                <div key={s.numero} className={`an-pending-row ${critical ? 'critical' : urgent ? 'urgent' : ''}`}>
                  <div className="an-pending-time" style={{
                    background: critical ? '#FEE2E2' : urgent ? '#FEF3C7' : '#F0FDF4',
                    color: critical ? '#991B1B' : urgent ? '#92400E' : '#16A34A',
                  }}>
                    <Clock size={11} /> {fmtMs(s.waitingMs)}
                  </div>
                  <div className="an-pending-info">
                    <div className="an-pending-msg">"{(s.last?.mensagem || '').replace(/^\*[^*]+\*:\n/, '').slice(0, 80)}"</div>
                    <div className="an-pending-meta">{fmtPhone(s.numero)} · {s.msgs.length} msgs</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ─── TAB ESPIÃO (chat read-only) ────────────────────────────────────────────
function TabEspiao({ data, company, loading }) {
  const [activeNum, setActiveNum] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('todos')
  const chatRef = useRef(null)

  const conversations = useMemo(() => {
    const grouped = {}
    data.msgs.forEach(m => {
      if (!m.numero) return
      if (!grouped[m.numero]) grouped[m.numero] = { numero: m.numero, messages: [], lastTs: null, hasIa: false, hasHumano: false }
      grouped[m.numero].messages.push(m)
      const ts = parseTimestamp(m.horaLastMessage) || m.created_at
      if (!grouped[m.numero].lastTs || new Date(ts) > new Date(grouped[m.numero].lastTs)) {
        grouped[m.numero].lastTs = ts
        if (m.mensagem) grouped[m.numero].lastMsg = m.mensagem
        else if (m.base64) {
          const md = detectMedia(m.base64)
          grouped[m.numero].lastMsg = md?.type === 'image' ? '📷 Imagem' : md?.type === 'audio' ? '🎤 Áudio' : md?.type === 'pdf' ? '📄 PDF' : '📎 Anexo'
        }
      }
      const t = (m.type || '').toLowerCase()
      if (t === 'ia') grouped[m.numero].hasIa = true
      if (t === 'humano' || t === 'atendente') grouped[m.numero].hasHumano = true
    })
    let list = Object.values(grouped)
    if (typeFilter === 'so_ia')      list = list.filter(c => c.hasIa && !c.hasHumano)
    if (typeFilter === 'assumidas')  list = list.filter(c => c.hasHumano)
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(c => c.numero.toLowerCase().includes(s))
    }
    list.sort((a, b) => new Date(b.lastTs || 0) - new Date(a.lastTs || 0))
    return list
  }, [data.msgs, typeFilter, search])

  const activeConv = activeNum ? conversations.find(c => c.numero === activeNum) : null
  const activeMessages = useMemo(() => {
    if (!activeConv) return []
    return [...activeConv.messages].sort((a, b) => {
      const ta = new Date(parseTimestamp(a.horaLastMessage) || a.created_at)
      const tb = new Date(parseTimestamp(b.horaLastMessage) || b.created_at)
      return ta - tb
    })
  }, [activeConv])

  const contactByNum = useMemo(() => {
    const m = {}
    data.pacientes.forEach(p => { if (p.numero) m[p.numero] = p })
    return m
  }, [data.pacientes])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [activeNum, activeMessages.length])

  return (
    <div className="an-espiao">
      <div className="an-esp-toolbar">
        <div className="an-esp-search">
          <Search size={13} />
          <input placeholder="Buscar número..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="an-pills">
          {[
            { k: 'todos', l: 'Todas' },
            { k: 'so_ia', l: 'Só IA' },
            { k: 'assumidas', l: 'Assumidas' },
          ].map(f => (
            <button key={f.k} className={`an-pill ${typeFilter === f.k ? 'on' : ''}`} onClick={() => setTypeFilter(f.k)}>{f.l}</button>
          ))}
        </div>
        <div className="an-esp-count">{conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}</div>
      </div>

      <div className="an-esp-shell">
        <aside className="an-esp-list">
          {conversations.length === 0 ? (
            <div className="an-empty-card"><MessageSquare size={20} /><p>Sem conversas no período.</p></div>
          ) : conversations.slice(0, 200).map(c => {
            const pat = contactByNum[c.numero]
            const isActive = c.numero === activeNum
            return (
              <button key={c.numero} className={`an-esp-conv ${isActive ? 'active' : ''}`} onClick={() => setActiveNum(c.numero)}>
                <div className="an-esp-avatar">
                  {pat?.photo ? <img src={pat.photo} alt="" /> : <span>{(pat?.nome || c.numero).charAt(0).toUpperCase()}</span>}
                </div>
                <div className="an-esp-info">
                  <div className="an-esp-name-row">
                    <span className="an-esp-name">{pat?.nome || fmtPhone(c.numero)}</span>
                  </div>
                  <div className="an-esp-preview">{(c.lastMsg || '').slice(0, 60)}</div>
                  <div className="an-esp-tags">
                    {c.hasHumano && <span className="an-tag blue">Humano</span>}
                    {c.hasIa && !c.hasHumano && <span className="an-tag purple">Só IA</span>}
                    <span className="an-tag ghost">{c.messages.length} msg</span>
                  </div>
                </div>
              </button>
            )
          })}
        </aside>

        <main className="an-esp-chat">
          {!activeConv ? (
            <div className="an-esp-chat-empty">
              <Eye size={36} />
              <h3>Selecione uma conversa</h3>
              <p>Vê tudo que entrou e saiu — incluindo IA e ferramentas internas.</p>
            </div>
          ) : (
            <>
              <header className="an-esp-chat-head">
                <div className="an-esp-chat-avatar">
                  {contactByNum[activeConv.numero]?.photo
                    ? <img src={contactByNum[activeConv.numero].photo} alt="" />
                    : <span>{(contactByNum[activeConv.numero]?.nome || activeConv.numero).charAt(0).toUpperCase()}</span>}
                </div>
                <div>
                  <div className="an-esp-chat-name">{contactByNum[activeConv.numero]?.nome || fmtPhone(activeConv.numero)}</div>
                  <div className="an-esp-chat-num">{fmtPhone(activeConv.numero)} · {activeConv.messages.length} mensagens</div>
                </div>
              </header>
              <div ref={chatRef} className="an-esp-chat-body">
                {activeMessages.map(m => {
                  const rawType = (m.type || 'cliente').toLowerCase()
                  const type = rawType === 'atendente' ? 'humano' : rawType
                  const ts = parseTimestamp(m.horaLastMessage) || m.created_at
                  const rawContent = (m.mensagem || m.base64 || '').replace(/^\*[^*]+\*:\n/, '').trim()
                  const media = detectMedia(m.base64 || rawContent)
                  const mediaSrc = m.base64 || rawContent
                  const isTool = type === 'tool' || (type === 'ia' && /^Calling \w+ with input:/i.test(rawContent))
                  return (
                    <div key={m.id} className={`an-msg an-msg-${type} ${isTool ? 'an-msg-tool' : ''}`}>
                      <div className="an-msg-meta">
                        {type === 'cliente' && <><User size={10} /> Cliente</>}
                        {type === 'ia' && !isTool && <><Bot size={10} /> IA</>}
                        {isTool && <><Wrench size={10} /> Ferramenta</>}
                        {type === 'humano' && <><Sparkles size={10} /> Atendente</>}
                        <span className="an-msg-ts">{new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="an-msg-bubble">
                        {media?.type === 'audio' && <audio controls src={`data:${media.mime};base64,${mediaSrc}`} />}
                        {media?.type === 'image' && <img src={`data:${media.mime};base64,${mediaSrc}`} alt="" />}
                        {media?.type === 'pdf' && <a className="an-msg-pdf" href={`data:${media.mime};base64,${mediaSrc}`} target="_blank" rel="noreferrer"><FileText size={14} /> Abrir PDF</a>}
                        {!media && rawContent && <pre className="an-msg-text">{rawContent.length > 1200 ? rawContent.slice(0, 800) + '\n\n[...]' : rawContent}</pre>}
                        {!media && !rawContent && <pre className="an-msg-text" style={{ color: '#94A3B8', fontStyle: 'italic' }}>(mensagem vazia)</pre>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ─────────────────────────────────────────────────
function KpiBig({ icon: Icon, color, bg, value, label, sub, alert, highlight }) {
  const isGreen = bg === 'green-grad'
  return (
    <div className={`an-kpi ${alert ? 'alert' : ''} ${highlight ? 'highlight' : ''}`} style={isGreen ? { background: 'linear-gradient(135deg, #10B981, #059669)', borderColor: 'transparent' } : {}}>
      <div className="an-kpi-ico" style={{ background: isGreen ? 'rgba(255,255,255,0.2)' : bg, color: isGreen ? '#fff' : color }}>
        <Icon size={18} />
      </div>
      <div className="an-kpi-num" style={{ color: isGreen ? '#fff' : '#0F172A' }}>{value}</div>
      <div className="an-kpi-lbl" style={{ color: isGreen ? 'rgba(255,255,255,0.85)' : '#64748B' }}>{label}</div>
      {sub && <div className="an-kpi-sub" style={{ color: isGreen ? 'rgba(255,255,255,0.7)' : '#94A3B8' }}>{sub}</div>}
    </div>
  )
}
function Mini({ icon: Icon, bg, color, num, label }) {
  return (
    <div className="an-mini">
      <div className="an-mini-ico" style={{ background: bg, color }}><Icon size={14} /></div>
      <div>
        <div className="an-mini-num">{num}</div>
        <div className="an-mini-lbl">{label}</div>
      </div>
    </div>
  )
}
function Empty({ msg }) {
  return <div className="an-empty-card"><p>{msg}</p></div>
}
