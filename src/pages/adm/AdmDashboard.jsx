import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Building2, Users, MessageSquare, AlertTriangle, Activity, Wifi, WifiOff,
  Calendar, BarChart3, Clock, TrendingUp, RefreshCw, Sparkles, Bot,
  CircleDollarSign, Zap, Stethoscope, ArrowUpRight, ChevronRight, X, Bell,
} from 'lucide-react'
import './AdmDashboard.css'

const PLAN_PRICE = { Starter: 297, Pro: 597, Business: 1497 }
const PLAN_COLORS = { Starter: '#6B7280', Pro: '#2563EB', Business: '#8B5CF6' }

function timeAgo(ts) {
  if (!ts) return 'nunca'
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d atrás`
  return d.toLocaleDateString('pt-BR')
}

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtNumber(v) {
  return Number(v || 0).toLocaleString('pt-BR')
}

export default function AdmDashboard() {
  const { db, loadDB } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState({
    msgs: [], convs: [], atts: [], appts: [], plans: [], saved: [], alerts: [],
  })
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [evolutionStatuses, setEvolutionStatuses] = useState({}) // instance → 'open'|'close'|'unknown'
  const [offlineSince, setOfflineSince] = useState({}) // instance → timestamp ms quando ficou offline
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const prevStatusesRef = useRef({})

  function checkAllInstances() {
    db.companies.forEach(c => {
      if (!c.instance || !c.api_instancia) return
      const baseUrl = c.evolution_url || 'https://evolutionapi.nexladesenvolvimento.com.br'
      fetch(`${baseUrl}/instance/connectionState/${c.instance}`, {
        headers: { apikey: c.api_instancia },
      })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          const state = j?.instance?.state || j?.state || 'unknown'
          setEvolutionStatuses(prev => {
            const previous = prev[c.instance]
            // Detectou transição open → close: notifica
            if (previous === 'open' && state === 'close') {
              notifyDisconnect(c)
              setBannerDismissed(false) // re-mostra banner se estava fechado
              setOfflineSince(o => ({ ...o, [c.instance]: Date.now() }))
            }
            // Voltou online: limpa offlineSince
            if (state === 'open' && previous !== 'open') {
              setOfflineSince(o => { const n = { ...o }; delete n[c.instance]; return n })
            }
            // Primeira leitura e está offline: marca momento
            if (!previous && state === 'close') {
              setOfflineSince(o => o[c.instance] ? o : { ...o, [c.instance]: Date.now() })
            }
            return { ...prev, [c.instance]: state }
          })
        })
        .catch(() => {
          setEvolutionStatuses(prev => ({ ...prev, [c.instance]: 'unknown' }))
        })
    })
  }

  function notifyDisconnect(_company) {
    // notificação do browser removida
  }

  async function loadAll() {
    setLoading(true)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const [msgs, convs, atts, appts, saved, alerts] = await Promise.all([
      supabase.from('mensagens_geral').select('id, instancia, type, created_at').gte('created_at', sevenDaysAgo).limit(50000),
      supabase.from('conversations').select('id, instancia, closed_at').gte('closed_at', thirtyDaysAgo),
      supabase.from('attendances').select('numero, instancia'),
      supabase.from('appointments').select('id, instancia, status, starts_at, payment_status, price').gte('starts_at', thirtyDaysAgo),
      supabase.from('saved_contacts').select('id, instancia'),
      supabase.from('alerts').select('id, instancia, resolved'),
    ])

    setData({
      msgs:   msgs.data || [],
      convs:  convs.data || [],
      atts:   atts.data || [],
      appts:  appts.data || [],
      saved:  saved.data || [],
      alerts: alerts.data || [],
    })
    setLastRefresh(new Date())
    setLoading(false)
    checkAllInstances()
  }

  useEffect(() => {
    loadDB()
  }, [loadDB])

  useEffect(() => {
    if (db.companies?.length) loadAll()
  }, [db.companies?.length])

  // Polling de status do WhatsApp a cada 30 segundos
  useEffect(() => {
    if (!db.companies?.length) return
    const id = setInterval(checkAllInstances, 30000)
    return () => clearInterval(id)
  }, [db.companies?.length])

  // ─── Cálculos por empresa ─────────────────────────────────────────────────
  const companyStats = useMemo(() => {
    return db.companies.map(c => {
      const inst = c.instance
      const msgs7d   = data.msgs.filter(m => m.instancia === inst).length
      const msgsToday = data.msgs.filter(m => {
        if (m.instancia !== inst || !m.created_at) return false
        const d = new Date(m.created_at)
        const today = new Date(); today.setHours(0,0,0,0)
        return d >= today
      }).length
      const convs30 = data.convs.filter(co => co.instancia === inst).length
      const activeAtts = data.atts.filter(a => a.instancia === inst).length
      const apptsList = data.appts.filter(a => a.instancia === inst)
      const apptsTotal = apptsList.length
      const revenue = apptsList.filter(a => a.payment_status === 'pago').reduce((s, a) => s + Number(a.price || 0), 0)
      const savedCt = data.saved.filter(s => s.instancia === inst).length
      const alertsPending = data.alerts.filter(a => a.instancia === inst && !a.resolved).length
      const lastMsg = data.msgs.filter(m => m.instancia === inst).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]?.created_at
      const wppState = evolutionStatuses[inst] || 'unknown'
      const activeUsers = (c.users || []).filter(u => u.active).length

      return { ...c, msgs7d, msgsToday, convs30, activeAtts, apptsTotal, revenue, savedCt, alertsPending, lastMsg, wppState, activeUsers }
    })
  }, [db.companies, data, evolutionStatuses])

  // ─── KPIs globais ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalCompanies = db.companies.length
    const activeCompanies = db.companies.filter(c => c.active).length
    const totalUsers = db.companies.reduce((s, c) => s + (c.users?.length || 0), 0)
    const totalActiveUsers = db.companies.reduce((s, c) => s + (c.users || []).filter(u => u.active).length, 0)
    const todayMsgs = companyStats.reduce((s, c) => s + c.msgsToday, 0)
    const week7Msgs = companyStats.reduce((s, c) => s + c.msgs7d, 0)
    const totalAppts = companyStats.reduce((s, c) => s + c.apptsTotal, 0)
    const mrr = db.companies.filter(c => c.active).reduce((s, c) => s + (PLAN_PRICE[c.plan] || 0), 0)
    const onlineInstances = companyStats.filter(c => c.wppState === 'open').length
    const offlineInstances = companyStats.filter(c => c.instance && c.wppState !== 'open' && c.wppState !== 'unknown').length
    const totalSaved = data.saved.length
    const totalAlertsPending = companyStats.reduce((s, c) => s + c.alertsPending, 0)
    const totalRevenue = companyStats.reduce((s, c) => s + c.revenue, 0)
    return {
      totalCompanies, activeCompanies, totalUsers, totalActiveUsers,
      todayMsgs, week7Msgs, totalAppts, mrr, onlineInstances, offlineInstances,
      totalSaved, totalAlertsPending, totalRevenue,
    }
  }, [db.companies, companyStats, data.saved.length])

  // ─── Distribuição por plano ───────────────────────────────────────────────
  const byPlan = useMemo(() => {
    const map = {}
    db.companies.forEach(c => {
      const p = c.plan || 'Starter'
      if (!map[p]) map[p] = 0
      map[p]++
    })
    return Object.entries(map).map(([plan, count]) => ({ plan, count, color: PLAN_COLORS[plan] || '#6B7280' }))
  }, [db.companies])

  // ─── Heatmap de mensagens (24h por dia) ───────────────────────────────────
  const hoursMap = useMemo(() => {
    const arr = Array(24).fill(0)
    data.msgs.forEach(m => {
      if (!m.created_at) return
      const d = new Date(m.created_at)
      arr[d.getHours()]++
    })
    return arr
  }, [data.msgs])
  const maxHour = Math.max(...hoursMap, 1)

  // ─── Top 5 empresas por volume de mensagens ──────────────────────────────
  const topCompanies = useMemo(() => {
    return [...companyStats].sort((a, b) => b.msgs7d - a.msgs7d).slice(0, 5)
  }, [companyStats])

  // ─── Empresas com atenção ─────────────────────────────────────────────────
  const attentionCompanies = useMemo(() => {
    return companyStats.filter(c => {
      if (!c.active) return false
      if (c.instance && c.wppState === 'close') return true
      if (c.alertsPending > 5) return true
      const lastMsgDate = c.lastMsg ? new Date(c.lastMsg) : null
      const inactive = !lastMsgDate || (Date.now() - lastMsgDate.getTime()) > 7 * 86400000
      if (inactive && c.instance) return true
      return false
    })
  }, [companyStats])

  // Lista de empresas com WhatsApp offline (state 'close')
  const offlineCompanies = useMemo(() => {
    return companyStats.filter(c => c.instance && c.api_instancia && c.wppState === 'close')
  }, [companyStats])

  return (
    <div className="adm-cmd">
      {/* Banner de alerta de WhatsApp desconectado */}
      {offlineCompanies.length > 0 && !bannerDismissed && (
        <div className="adm-wpp-alert">
          <div className="adm-wpp-alert-icon">
            <WifiOff size={18} />
          </div>
          <div className="adm-wpp-alert-body">
            <div className="adm-wpp-alert-title">
              <Bell size={13} />
              {offlineCompanies.length === 1
                ? '1 instância WhatsApp desconectada'
                : `${offlineCompanies.length} instâncias WhatsApp desconectadas`}
            </div>
            <div className="adm-wpp-alert-list">
              {offlineCompanies.slice(0, 5).map(c => {
                const since = offlineSince[c.instance]
                const minutes = since ? Math.floor((Date.now() - since) / 60000) : null
                return (
                  <button
                    key={c.id}
                    className="adm-wpp-alert-item"
                    onClick={() => navigate(`/adm/empresas/${c.id}`)}>
                    <span className="adm-wpp-dot" />
                    <strong>{c.name}</strong>
                    <span className="adm-wpp-instance">{c.instance}</span>
                    {minutes !== null && (
                      <span className="adm-wpp-since">
                        offline há {minutes < 60 ? `${minutes || '<1'}min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`}
                      </span>
                    )}
                    <ChevronRight size={13} />
                  </button>
                )
              })}
              {offlineCompanies.length > 5 && (
                <div className="adm-wpp-alert-more">+ {offlineCompanies.length - 5} outras na tabela abaixo</div>
              )}
            </div>
          </div>
          <div className="adm-wpp-alert-actions">
            <button className="adm-wpp-alert-refresh" onClick={checkAllInstances} title="Verificar agora">
              <RefreshCw size={13} />
            </button>
            <button className="adm-wpp-alert-close" onClick={() => setBannerDismissed(true)} title="Fechar">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Hero strip */}
      <div className="adm-cmd-hero">
        <div>
          <div className="adm-cmd-eyebrow">
            <span className="adm-cmd-pulse" />
            Sistema operando · ao vivo
          </div>
          <h1 className="adm-cmd-title">Command Center</h1>
          <div className="adm-cmd-sub">
            Tudo que está acontecendo nas empresas {lastRefresh && `· atualizado às ${lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </div>
        </div>
        <button className="adm-cmd-refresh" onClick={loadAll} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* KPIs principais */}
      <div className="adm-cmd-kpis">
        <KpiBig
          icon={<Building2 size={18} />}
          color="#FDE047"
          label="Empresas ativas"
          value={kpis.activeCompanies}
          sub={`${kpis.totalCompanies} cadastradas no total`}
        />
        <KpiBig
          icon={<Users size={18} />}
          color="#A78BFA"
          label="Usuários do sistema"
          value={kpis.totalActiveUsers}
          sub={`${kpis.totalUsers} cadastros · ${kpis.totalActiveUsers} ativos`}
        />
        <KpiBig
          icon={<MessageSquare size={18} />}
          color="#4ADE80"
          label="Mensagens hoje"
          value={fmtNumber(kpis.todayMsgs)}
          sub={`${fmtNumber(kpis.week7Msgs)} nos últimos 7 dias`}
        />
        <KpiBig
          icon={<Calendar size={18} />}
          color="#22D3EE"
          label="Agendamentos (30d)"
          value={fmtNumber(kpis.totalAppts)}
          sub={`em todas as empresas`}
        />
        <KpiBig
          icon={<CircleDollarSign size={18} />}
          color="#F472B6"
          label="MRR estimado"
          value={fmtMoney(kpis.mrr)}
          sub={`valor recorrente mensal`}
          highlight
        />
        <KpiBig
          icon={<Wifi size={18} />}
          color="#10B981"
          label="WhatsApp online"
          value={`${kpis.onlineInstances}/${db.companies.filter(c => c.instance).length}`}
          sub={kpis.offlineInstances > 0 ? `${kpis.offlineInstances} desconectadas` : 'todas conectadas'}
          alert={kpis.offlineInstances > 0}
        />
      </div>

      {/* Linha 2: distribuição + heatmap */}
      <div className="adm-cmd-row">
        <div className="adm-cmd-card">
          <div className="adm-cmd-card-head">
            <BarChart3 size={14} /> Distribuição por plano
          </div>
          <div className="adm-cmd-plan-list">
            {byPlan.map(p => {
              const total = byPlan.reduce((s, x) => s + x.count, 0)
              const pct = Math.round((p.count / total) * 100) || 0
              return (
                <div key={p.plan} className="adm-cmd-plan">
                  <div className="adm-cmd-plan-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="adm-cmd-plan-dot" style={{ background: p.color }} />
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{p.plan}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      <strong style={{ color: 'white' }}>{p.count}</strong> · {pct}%
                    </span>
                  </div>
                  <div className="adm-cmd-plan-bar">
                    <div className="adm-cmd-plan-fill" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="adm-cmd-plan-foot">
            <span>Receita estimada</span>
            <strong>{fmtMoney(kpis.mrr)}/mês</strong>
          </div>
        </div>

        <div className="adm-cmd-card">
          <div className="adm-cmd-card-head">
            <Activity size={14} /> Atividade por hora <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>últimos 7 dias</span>
          </div>
          <div className="adm-cmd-heatmap">
            {hoursMap.map((v, i) => (
              <div key={i} className="adm-cmd-heat-col">
                <div className="adm-cmd-heat-bar"
                  title={`${i}h — ${v} mensagens`}
                  style={{
                    height: `${Math.max((v / maxHour) * 100, v ? 6 : 2)}%`,
                    background: v > maxHour * 0.7 ? '#EC4899'
                      : v > maxHour * 0.4 ? '#FBBF24'
                      : v > 0 ? '#4ADE80'
                      : 'rgba(255,255,255,0.06)',
                  }}
                />
                {i % 3 === 0 && <span className="adm-cmd-heat-lbl">{i}h</span>}
              </div>
            ))}
          </div>
          <div className="adm-cmd-heat-foot">
            Total: <strong>{fmtNumber(kpis.week7Msgs)} mensagens</strong> · Pico: <strong>{maxHour}/h</strong>
          </div>
        </div>
      </div>

      {/* Top empresas + atenção */}
      <div className="adm-cmd-row">
        <div className="adm-cmd-card light">
          <div className="adm-cmd-card-head light">
            <TrendingUp size={14} /> Top 5 por volume <span style={{ marginLeft: 'auto', color: '#9CA3AF', fontWeight: 500 }}>últimos 7 dias</span>
          </div>
          {topCompanies.length === 0 ? (
            <div style={{ padding: '24px 16px', color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>Sem dados ainda.</div>
          ) : (
            <div className="adm-cmd-top">
              {topCompanies.map((c, i) => (
                <div key={c.id} className="adm-cmd-top-row" onClick={() => navigate(`/adm/empresas/${c.id}`)}>
                  <div className="adm-cmd-top-rank">{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="adm-cmd-top-name">{c.name}</div>
                    <div className="adm-cmd-top-meta">
                      <span className={`adm-cmd-plan-chip ${c.plan?.toLowerCase()}`}>{c.plan}</span>
                      · {c.activeUsers} usuários · {c.savedCt} contatos
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="adm-cmd-top-value">{fmtNumber(c.msgs7d)}</div>
                    <div className="adm-cmd-top-value-lbl">mensagens</div>
                  </div>
                  <ChevronRight size={14} style={{ color: '#9CA3AF' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="adm-cmd-card light">
          <div className="adm-cmd-card-head light" style={{ color: '#DC2626' }}>
            <AlertTriangle size={14} /> Empresas que precisam de atenção
            {attentionCompanies.length > 0 && (
              <span className="adm-cmd-att-badge">{attentionCompanies.length}</span>
            )}
          </div>
          {attentionCompanies.length === 0 ? (
            <div style={{ padding: '32px 16px', color: '#9CA3AF', fontSize: 13, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Sparkles size={18} style={{ color: '#16A34A', margin: '0 auto' }} />
              <div>Tudo rodando bem.</div>
            </div>
          ) : (
            <div className="adm-cmd-attention">
              {attentionCompanies.map(c => {
                const reasons = []
                if (c.instance && c.wppState === 'close') reasons.push({ icon: WifiOff, text: 'WhatsApp desconectado', color: '#DC2626' })
                if (c.alertsPending > 5) reasons.push({ icon: AlertTriangle, text: `${c.alertsPending} alertas pendentes`, color: '#D97706' })
                const inactive = !c.lastMsg || (Date.now() - new Date(c.lastMsg).getTime()) > 7 * 86400000
                if (inactive && c.instance) reasons.push({ icon: Clock, text: `Inativa há ${timeAgo(c.lastMsg)}`, color: '#6B7280' })
                return (
                  <div key={c.id} className="adm-cmd-att-row" onClick={() => navigate(`/adm/empresas/${c.id}`)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="adm-cmd-att-name">{c.name}</div>
                      <div className="adm-cmd-att-reasons">
                        {reasons.map((r, i) => (
                          <span key={i} style={{ color: r.color }}>
                            <r.icon size={11} /> {r.text}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: '#9CA3AF' }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabela completa */}
      <div className="adm-cmd-card light" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="adm-cmd-card-head light" style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <Building2 size={14} /> Todas as empresas
          <span style={{ marginLeft: 'auto', color: '#9CA3AF', fontWeight: 500, fontSize: 12 }}>{db.companies.length} cadastradas</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-cmd-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Plano</th>
                <th>WhatsApp</th>
                <th>Usuários</th>
                <th>Contatos</th>
                <th>Mensagens 7d</th>
                <th>Tickets ativos</th>
                <th>Agend. (30d)</th>
                <th>Faturamento (30d)</th>
                <th>Última atividade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {companyStats.map(c => (
                <tr key={c.id} onClick={() => navigate(`/adm/empresas/${c.id}`)}>
                  <td className="td-name" style={{ minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: c.active ? '#EFF6FF' : '#F3F4F6',
                        border: `1px solid ${c.active ? '#BFDBFE' : '#E5E7EB'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: c.active ? '#2563EB' : '#9CA3AF',
                      }}>{c.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace' }}>
                          {c.instance || 'sem instância'}
                          {c.ai_enabled !== false && <span style={{ marginLeft: 6, color: '#7C3AED' }}>· IA</span>}
                          {c.instagram_enabled === true && <span style={{ marginLeft: 6, color: '#DC2880' }}>· IG</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`adm-cmd-plan-chip ${c.plan?.toLowerCase()}`}>{c.plan}</span>
                  </td>
                  <td>
                    {!c.instance ? (
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>—</span>
                    ) : c.wppState === 'open' ? (
                      <span className="adm-cmd-wpp on"><span className="adm-cmd-wpp-dot" /> Online</span>
                    ) : c.wppState === 'close' ? (
                      <span className="adm-cmd-wpp off"><span className="adm-cmd-wpp-dot" /> Offline</span>
                    ) : c.wppState === 'connecting' ? (
                      <span className="adm-cmd-wpp wait"><span className="adm-cmd-wpp-dot" /> QR</span>
                    ) : (
                      <span className="adm-cmd-wpp unknown"><span className="adm-cmd-wpp-dot" /> ...</span>
                    )}
                  </td>
                  <td><strong>{c.activeUsers}</strong>/{(c.users?.length || 0)}</td>
                  <td>{c.savedCt}</td>
                  <td><strong>{fmtNumber(c.msgs7d)}</strong> <span style={{ fontSize: 10, color: '#9CA3AF' }}>({c.msgsToday} hoje)</span></td>
                  <td>{c.activeAtts}</td>
                  <td>{c.apptsTotal}</td>
                  <td><strong style={{ color: c.revenue > 0 ? '#16A34A' : '#9CA3AF' }}>{fmtMoney(c.revenue)}</strong></td>
                  <td style={{ fontSize: 11, color: '#6B7280' }}>{timeAgo(c.lastMsg)}</td>
                  <td>
                    <span className={`adm-cmd-status ${c.active ? 'on' : 'off'}`}>
                      {c.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiBig({ icon, color, label, value, sub, highlight, alert }) {
  return (
    <div className={`adm-cmd-kpi ${highlight ? 'highlight' : ''} ${alert ? 'alert' : ''}`}>
      <div className="adm-cmd-kpi-head">
        <div className="adm-cmd-kpi-ic" style={{ background: `${color}1F`, color }}>{icon}</div>
        {alert && <span className="adm-cmd-kpi-alert">Atenção</span>}
      </div>
      <div className="adm-cmd-kpi-value" style={{ color }}>{value}</div>
      <div className="adm-cmd-kpi-label">{label}</div>
      <div className="adm-cmd-kpi-sub">{sub}</div>
    </div>
  )
}
