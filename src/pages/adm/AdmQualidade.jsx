import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Headset, Clock, Inbox, AlertTriangle, TrendingDown, RefreshCw, Building2,
  Activity, Hourglass, MessageSquare, ChevronRight, Eye, Bot,
  Zap, AlertOctagon, CheckCircle2, Timer,
} from 'lucide-react'
import './AdmQualidade.css'

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

function timeAgo(ts) {
  if (!ts) return '—'
  const ms = Date.now() - new Date(ts).getTime()
  return fmtMs(ms)
}

function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function percentile(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.floor(s.length * p / 100)
  return s[Math.min(idx, s.length - 1)]
}

const SLA_THRESHOLDS = {
  green:  5 * 60 * 1000,   // < 5min: ótimo
  yellow: 30 * 60 * 1000,  // < 30min: aceitável
  // > 30min: ruim
}
function slaColor(ms) {
  if (!ms) return '#94A3B8'
  if (ms < SLA_THRESHOLDS.green)  return '#16A34A'
  if (ms < SLA_THRESHOLDS.yellow) return '#D97706'
  return '#DC2626'
}
function slaBg(ms) {
  if (!ms) return '#F1F5F9'
  if (ms < SLA_THRESHOLDS.green)  return '#F0FDF4'
  if (ms < SLA_THRESHOLDS.yellow) return '#FFFBEB'
  return '#FEF2F2'
}

export default function AdmQualidade() {
  const { db } = useAuth()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('7d') // 24h | 7d | 30d
  const [selectedInstance, setSelectedInstance] = useState('all') // 'all' ou instancia específica
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [data, setData] = useState({ msgs: [], convs: [], atts: [] })

  async function loadAll() {
    setLoading(true)
    const since = new Date(Date.now() - (period === '24h' ? 1 : period === '7d' ? 7 : 30) * 86400000).toISOString()
    const [msgs, convs, atts] = await Promise.all([
      supabase.from('mensagens_geral')
        .select('id, instancia, numero, type, "horaLastMessage", created_at, mensagem')
        .gte('created_at', since)
        .limit(50000),
      supabase.from('conversations')
        .select('session_id, instancia, reason, closed_at')
        .gte('closed_at', since),
      supabase.from('attendances').select('numero, instancia, user_id'),
    ])
    setData({
      msgs: msgs.data || [],
      convs: convs.data || [],
      atts: atts.data || [],
    })
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [period])

  // Auto-refresh a cada 60s
  useEffect(() => {
    const id = setInterval(loadAll, 60000)
    return () => clearInterval(id)
  }, [period])

  const companies = db.companies || []
  const companyByInstance = useMemo(() => {
    const m = {}
    companies.forEach(c => { if (c.instance) m[c.instance] = c })
    return m
  }, [companies])

  // Filtra dados por empresa se houver seleção
  const filteredMsgs = useMemo(() => {
    if (selectedInstance === 'all') return data.msgs
    return data.msgs.filter(m => m.instancia === selectedInstance)
  }, [data.msgs, selectedInstance])

  const filteredConvs = useMemo(() => {
    if (selectedInstance === 'all') return data.convs
    return data.convs.filter(c => c.instancia === selectedInstance)
  }, [data.convs, selectedInstance])

  // Indexa mensagens por instancia + numero (sessão)
  const sessions = useMemo(() => {
    const map = {}
    filteredMsgs.forEach(m => {
      if (!m.instancia || !m.numero) return
      const key = `${m.instancia}|${m.numero}`
      if (!map[key]) map[key] = { instancia: m.instancia, numero: m.numero, msgs: [] }
      map[key].msgs.push(m)
    })
    Object.values(map).forEach(s => {
      s.msgs.sort((a, b) => {
        const ta = new Date(parseTimestamp(a.horaLastMessage) || a.created_at).getTime()
        const tb = new Date(parseTimestamp(b.horaLastMessage) || b.created_at).getTime()
        return ta - tb
      })
    })
    return map
  }, [filteredMsgs])

  // Tickets encerrados como Set pra rapido lookup
  const closedSet = useMemo(() => {
    const s = new Set()
    filteredConvs.forEach(c => s.add(`${c.instancia}|${c.session_id}`))
    return s
  }, [filteredConvs])

  // Calcula métricas por sessão
  const sessionMetrics = useMemo(() => {
    return Object.values(sessions).map(s => {
      const isClosed = closedSet.has(`${s.instancia}|${s.numero}`)
      const lastMsg = s.msgs[s.msgs.length - 1]
      const lastMsgTime = lastMsg ? new Date(parseTimestamp(lastMsg.horaLastMessage) || lastMsg.created_at) : null
      const lastSenderType = (lastMsg?.type || '').toLowerCase()

      // Pendente: última msg foi do cliente E ticket não encerrado
      const isPending = !isClosed && lastSenderType === 'cliente'

      // Tempo aguardando (se pendente)
      const waitingMs = isPending && lastMsgTime ? (Date.now() - lastMsgTime.getTime()) : 0

      // Tempo até 1ª resposta humana
      const firstClientIdx = s.msgs.findIndex(m => (m.type || '').toLowerCase() === 'cliente')
      let firstHumanResponseMs = null
      let firstResponseMs = null // pode ser IA ou humano
      if (firstClientIdx >= 0) {
        const firstClientTime = new Date(parseTimestamp(s.msgs[firstClientIdx].horaLastMessage) || s.msgs[firstClientIdx].created_at).getTime()
        const firstHuman = s.msgs.slice(firstClientIdx + 1).find(m => (m.type || '').toLowerCase() === 'humano')
        const firstResponse = s.msgs.slice(firstClientIdx + 1).find(m => ['ia', 'humano'].includes((m.type || '').toLowerCase()))
        if (firstHuman) {
          firstHumanResponseMs = new Date(parseTimestamp(firstHuman.horaLastMessage) || firstHuman.created_at).getTime() - firstClientTime
        }
        if (firstResponse) {
          firstResponseMs = new Date(parseTimestamp(firstResponse.horaLastMessage) || firstResponse.created_at).getTime() - firstClientTime
        }
      }

      const hasHumano = s.msgs.some(m => (m.type || '').toLowerCase() === 'humano')
      const hasIa     = s.msgs.some(m => (m.type || '').toLowerCase() === 'ia')

      return {
        ...s,
        lastMsg, lastMsgTime, lastSenderType,
        isClosed, isPending, waitingMs,
        firstHumanResponseMs, firstResponseMs,
        hasHumano, hasIa,
        msgCount: s.msgs.length,
      }
    })
  }, [sessions, closedSet])

  // Métricas globais
  const globalKpis = useMemo(() => {
    const allFirstResp = sessionMetrics.map(s => s.firstResponseMs).filter(x => x != null)
    const allFirstHuman = sessionMetrics.map(s => s.firstHumanResponseMs).filter(x => x != null)
    const pending = sessionMetrics.filter(s => s.isPending)
    const expired = filteredConvs.filter(c => c.reason === 'auto_encerrado').length
    const aiHandover = sessionMetrics.filter(s => s.hasIa && s.hasHumano).length
    const aiTotal = sessionMetrics.filter(s => s.hasIa).length

    return {
      medianFirstResp: median(allFirstResp),
      p90FirstResp:    percentile(allFirstResp, 90),
      medianHuman:     median(allFirstHuman),
      p90Human:        percentile(allFirstHuman, 90),
      pendingCount:    pending.length,
      pendingOver1h:   pending.filter(p => p.waitingMs > 3600000).length,
      pendingOver24h:  pending.filter(p => p.waitingMs > 86400000).length,
      expired,
      totalSessions:   sessionMetrics.length,
      aiHandover,
      aiHandoverPct:   aiTotal ? (aiHandover / aiTotal * 100) : 0,
    }
  }, [sessionMetrics, filteredConvs])

  // Métricas por empresa
  const companyMetrics = useMemo(() => {
    const map = {}
    sessionMetrics.forEach(s => {
      if (!map[s.instancia]) {
        map[s.instancia] = {
          instancia: s.instancia,
          company: companyByInstance[s.instancia],
          sessions: [],
          firstHumanTimes: [],
          pending: 0,
          pendingOver1h: 0,
          pendingOver24h: 0,
        }
      }
      const e = map[s.instancia]
      e.sessions.push(s)
      if (s.firstHumanResponseMs != null) e.firstHumanTimes.push(s.firstHumanResponseMs)
      if (s.isPending) {
        e.pending++
        if (s.waitingMs > 3600000)  e.pendingOver1h++
        if (s.waitingMs > 86400000) e.pendingOver24h++
      }
    })
    // expirados por empresa
    filteredConvs.forEach(c => {
      if (c.reason === 'auto_encerrado' && map[c.instancia]) {
        map[c.instancia].expired = (map[c.instancia].expired || 0) + 1
      }
    })
    return Object.values(map).map(e => ({
      ...e,
      median:  median(e.firstHumanTimes),
      p90:     percentile(e.firstHumanTimes, 90),
      total:   e.sessions.length,
      expired: e.expired || 0,
    })).sort((a, b) => (b.pendingOver1h - a.pendingOver1h) || (b.median - a.median))
  }, [sessionMetrics, companyByInstance, filteredConvs])

  // Top pendentes urgentes (ordenado por tempo aguardando)
  const topPending = useMemo(() => {
    return sessionMetrics
      .filter(s => s.isPending)
      .sort((a, b) => b.waitingMs - a.waitingMs)
      .slice(0, 12)
  }, [sessionMetrics])

  // Tendência diária (tempo médio de resposta humana por dia)
  const dailyTrend = useMemo(() => {
    const buckets = {}
    sessionMetrics.forEach(s => {
      if (s.firstHumanResponseMs == null || !s.lastMsgTime) return
      const day = s.lastMsgTime.toISOString().slice(0, 10)
      if (!buckets[day]) buckets[day] = []
      buckets[day].push(s.firstHumanResponseMs)
    })
    return Object.entries(buckets)
      .sort()
      .map(([day, vals]) => ({ day, median: median(vals), count: vals.length }))
  }, [sessionMetrics])
  const maxTrend = Math.max(1, ...dailyTrend.map(d => d.median))

  return (
    <div className="qm-root">
      {/* Hero */}
      <div className="qm-head">
        <div>
          <div className="qm-eyebrow">
            <Headset size={13} /> Qualidade de atendimento
          </div>
          <h1 className="qm-title">Monitoramento de SLA</h1>
          <p className="qm-sub">
            Painel pra identificar gargalos no atendimento das empresas — tempo de
            resposta, pendências críticas, expirados. Use pra treinar e cobrar quem
            está demorando demais.
          </p>
        </div>
        <div className="qm-head-actions">
          <div className="qm-company-select-wrap">
            <Building2 size={13} className="qm-company-select-ico" />
            <select
              className="qm-company-select"
              value={selectedInstance}
              onChange={e => setSelectedInstance(e.target.value)}>
              <option value="all">Todas as empresas</option>
              {companies
                .filter(c => c.instance)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(c => (
                  <option key={c.id} value={c.instance}>{c.name}</option>
                ))}
            </select>
          </div>
          <div className="qm-pills">
            {['24h', '7d', '30d'].map(p => (
              <button key={p} className={`qm-pill ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <button className="qm-refresh" onClick={loadAll} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            {lastRefresh ? `${timeAgo(lastRefresh)}` : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="qm-kpis">
        <KpiCard
          icon={Clock}
          color="#2563EB"
          bg="#EFF6FF"
          label="Tempo médio até resposta humana"
          value={fmtMs(globalKpis.medianHuman)}
          sub={`p90: ${fmtMs(globalKpis.p90Human)}`}
          slaColor={slaColor(globalKpis.medianHuman)}
        />
        <KpiCard
          icon={Zap}
          color="#7C3AED"
          bg="#F5F3FF"
          label="Tempo até qualquer resposta"
          value={fmtMs(globalKpis.medianFirstResp)}
          sub={`p90: ${fmtMs(globalKpis.p90FirstResp)} · inclui IA`}
        />
        <KpiCard
          icon={Inbox}
          color="#D97706"
          bg="#FFFBEB"
          label="Pendentes sem resposta agora"
          value={globalKpis.pendingCount}
          sub={`${globalKpis.pendingOver1h} > 1h · ${globalKpis.pendingOver24h} > 24h`}
          alert={globalKpis.pendingOver1h > 0}
        />
        <KpiCard
          icon={AlertOctagon}
          color="#DC2626"
          bg="#FEF2F2"
          label="Expirados (auto-encerrados)"
          value={globalKpis.expired}
          sub="conversas que ninguém atendeu"
          alert={globalKpis.expired > 0}
        />
        <KpiCard
          icon={Bot}
          color="#0891B2"
          bg="#ECFEFF"
          label="IA → Humano (handover)"
          value={`${globalKpis.aiHandoverPct.toFixed(0)}%`}
          sub={`${globalKpis.aiHandover} de ${sessionMetrics.filter(s => s.hasIa).length} c/ IA`}
        />
        <KpiCard
          icon={MessageSquare}
          color="#16A34A"
          bg="#F0FDF4"
          label="Conversas no período"
          value={globalKpis.totalSessions}
          sub={period === '24h' ? 'últimas 24h' : period === '7d' ? '7 dias' : '30 dias'}
        />
      </div>

      {/* Tendência diária */}
      <div className="qm-card">
        <div className="qm-card-head">
          <Activity size={14} /> Tempo médio de resposta humana — dia a dia
          <span className="qm-card-sub">{dailyTrend.length} dias</span>
        </div>
        <div className="qm-trend">
          {dailyTrend.length === 0 ? (
            <div className="qm-empty">Sem dados ainda</div>
          ) : dailyTrend.map(d => {
            const h = Math.max(4, (d.median / maxTrend) * 100)
            return (
              <div key={d.day} className="qm-trend-bar-wrap" title={`${d.day} — ${fmtMs(d.median)} (${d.count} conversas)`}>
                <div className="qm-trend-num">{fmtMs(d.median)}</div>
                <div className="qm-trend-bar-track">
                  <div className="qm-trend-bar" style={{ height: `${h}%`, background: slaColor(d.median) }} />
                </div>
                <div className="qm-trend-day">
                  {new Date(d.day + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top pendências críticas */}
      <div className="qm-card">
        <div className="qm-card-head">
          <Hourglass size={14} /> Top pendências aguardando humano
          {topPending.length > 0 && <span className="qm-pending-count">{topPending.length} contatos</span>}
        </div>
        {topPending.length === 0 ? (
          <div className="qm-empty">
            <CheckCircle2 size={26} style={{ color: '#16A34A' }} />
            <p>Nenhum contato pendente. Bom trabalho.</p>
          </div>
        ) : (
          <div className="qm-pending-list">
            {topPending.map(s => {
              const c = companyByInstance[s.instancia]
              const urgent = s.waitingMs > 3600000 // > 1h
              const critical = s.waitingMs > 14400000 // > 4h
              return (
                <button
                  key={`${s.instancia}-${s.numero}`}
                  className={`qm-pending-row ${critical ? 'critical' : urgent ? 'urgent' : ''}`}
                  onClick={() => navigate(`/adm/espiao?empresa=${c?.id || ''}`)}>
                  <div className="qm-pending-time" style={{
                    background: critical ? '#FEE2E2' : urgent ? '#FEF3C7' : '#F0FDF4',
                    color: critical ? '#991B1B' : urgent ? '#92400E' : '#16A34A',
                  }}>
                    <Timer size={11} /> {fmtMs(s.waitingMs)}
                  </div>
                  <div className="qm-pending-info">
                    <div className="qm-pending-company">
                      <Building2 size={11} /> {c?.name || s.instancia}
                    </div>
                    <div className="qm-pending-msg">
                      "{(s.lastMsg?.mensagem || '').replace(/^\*[^*]+\*:\n/, '').slice(0, 80)}{(s.lastMsg?.mensagem || '').length > 80 ? '...' : ''}"
                    </div>
                    <div className="qm-pending-meta">
                      {s.numero.replace(/@.*$/, '')} · {s.msgCount} mensagens
                    </div>
                  </div>
                  <ChevronRight size={14} className="qm-pending-arrow" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Ranking de empresas (só faz sentido em 'todas') */}
      {selectedInstance === 'all' && (
      <div className="qm-card">
        <div className="qm-card-head">
          <Building2 size={14} /> Ranking de empresas — onde está o gargalo
          <span className="qm-card-sub">{companyMetrics.length} empresas</span>
        </div>
        <div className="qm-rank">
          <div className="qm-rank-head">
            <div>Empresa</div>
            <div>Conversas</div>
            <div>Pendentes</div>
            <div>+1h</div>
            <div>+24h</div>
            <div>Expirados</div>
            <div>Tempo médio</div>
            <div>p90</div>
          </div>
          {companyMetrics.length === 0 ? (
            <div className="qm-empty">Sem dados no período</div>
          ) : companyMetrics.map(e => (
            <div
              key={e.instancia}
              className="qm-rank-row"
              onClick={() => e.company && navigate(`/adm/empresas/${e.company.id}`)}>
              <div className="qm-rank-name">
                <span className="qm-rank-dot" style={{ background: slaColor(e.median) }} />
                <strong>{e.company?.name || e.instancia}</strong>
                <span className="qm-rank-instance">{e.instancia}</span>
              </div>
              <div>{e.total}</div>
              <div className={e.pending > 0 ? 'qm-rank-warn' : ''}>{e.pending}</div>
              <div className={e.pendingOver1h > 0 ? 'qm-rank-bad' : ''}>{e.pendingOver1h}</div>
              <div className={e.pendingOver24h > 0 ? 'qm-rank-crit' : ''}>{e.pendingOver24h}</div>
              <div className={e.expired > 0 ? 'qm-rank-warn' : ''}>{e.expired}</div>
              <div style={{ background: slaBg(e.median), color: slaColor(e.median), borderRadius: 6, padding: '2px 8px', display: 'inline-block', fontSize: 11.5, fontWeight: 700 }}>
                {fmtMs(e.median)}
              </div>
              <div style={{ color: slaColor(e.p90), fontWeight: 600 }}>{fmtMs(e.p90)}</div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, color, bg, label, value, sub, alert, slaColor: customColor }) {
  return (
    <div className={`qm-kpi ${alert ? 'alert' : ''}`}>
      <div className="qm-kpi-ico" style={{ background: bg, color }}>
        <Icon size={18} />
      </div>
      <div className="qm-kpi-num" style={{ color: customColor || color }}>{value}</div>
      <div className="qm-kpi-lbl">{label}</div>
      {sub && <div className="qm-kpi-sub">{sub}</div>}
      {alert && <div className="qm-kpi-alert"><AlertTriangle size={11} /> Ação recomendada</div>}
    </div>
  )
}
