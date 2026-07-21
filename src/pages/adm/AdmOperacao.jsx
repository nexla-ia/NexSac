import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Building2, Users, ClipboardList, Calendar,
  CircleDollarSign, RefreshCw, TrendingUp, Award, Crown, Cake, Activity,
  Search, MessageSquare, AlertTriangle, Kanban, Briefcase,
} from 'lucide-react'
import './AdmOperacao.css'

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtNumber(v) { return Number(v || 0).toLocaleString('pt-BR') }
function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function calcAge(birth) {
  if (!birth) return null
  const d = new Date(birth)
  const t = new Date()
  let age = t.getFullYear() - d.getFullYear()
  const mDiff = t.getMonth() - d.getMonth()
  if (mDiff < 0 || (mDiff === 0 && t.getDate() < d.getDate())) age--
  return age
}

const STATUS_LABELS = {
  agendado:   { label: 'Agendado',   color: '#64748B', bg: '#F1F5F9' },
  confirmado: { label: 'Confirmado', color: '#0891B2', bg: '#ECFEFF' },
  concluido:  { label: 'Concluído',  color: '#16A34A', bg: '#F0FDF4' },
  faltou:     { label: 'Não compareceu', color: '#DC2626', bg: '#FEF2F2' },
  cancelado:  { label: 'Cancelado',  color: '#6B7280', bg: '#F9FAFB' },
}

export default function AdmOperacao() {
  const { db } = useAuth()
  const companies = (db.companies || []).filter(c => c.instance && c.active)

  const [selected, setSelected] = useState(companies[0]?.id || null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')

  const [pacientes, setPacientes]   = useState([])
  const [pros, setPros]             = useState([])
  const [procs, setProcs]           = useState([])
  const [appts, setAppts]           = useState([])
  const [users, setUsers]           = useState([])
  const [kanbanCards, setKanbanCards] = useState([])
  const [alerts, setAlerts]         = useState([])
  const [msgs, setMsgs]             = useState([])

  const company = companies.find(c => c.id === selected)

  useEffect(() => { if (company?.instance) loadAll() }, [company?.instance])

  async function loadAll() {
    if (!company?.instance) return
    setLoading(true)
    const thirty = new Date(Date.now() - 30 * 86400000).toISOString()
    const [pat, pr, prc, ap, us, kc, al, mg] = await Promise.all([
      supabase.from('saved_contacts').select('*').eq('instancia', company.instance),
      supabase.from('professionals').select('*').eq('instancia', company.instance),
      supabase.from('procedures').select('*').eq('instancia', company.instance),
      supabase.from('appointments').select('*').eq('instancia', company.instance).gte('starts_at', thirty),
      supabase.from('users').select('id, name, email, role, active').eq('company_id', company.id),
      supabase.from('kanban_cards').select('id, instancia, priority, due_date').eq('instancia', company.instance),
      supabase.from('alerts').select('id, instancia, resolved, created_at').eq('instancia', company.instance),
      supabase.from('mensagens_geral').select('id, type, created_at').eq('instancia', company.instance).gte('created_at', thirty).limit(20000),
    ])
    setPacientes(pat.data || [])
    setPros(pr.data || [])
    setProcs(prc.data || [])
    setAppts(ap.data || [])
    setUsers(us.data || [])
    setKanbanCards(kc.data || [])
    setAlerts(al.data || [])
    setMsgs(mg.data || [])
    setLoading(false)
  }

  const stats = useMemo(() => {
    const concluded = appts.filter(a => a.status === 'concluido')
    const revenue = concluded.reduce((s, a) => s + Number(a.price || 0), 0)
    const noshow = appts.filter(a => a.status === 'faltou').length
    const noshowPct = appts.length ? Math.round((noshow / appts.length) * 100) : 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86400000)
    const apptsHoje = appts.filter(a => {
      const d = new Date(a.starts_at)
      return d >= today && d < tomorrow
    }).length
    const aniversariantes = pacientes.filter(p => {
      if (!p.birthdate) return false
      const b = new Date(p.birthdate)
      const cur = new Date()
      const next = new Date(cur.getFullYear(), b.getMonth(), b.getDate())
      if (next < cur) next.setFullYear(cur.getFullYear() + 1)
      const diff = (next - cur) / 86400000
      return diff <= 7
    }).length
    return { revenue, noshow, noshowPct, apptsHoje, aniversariantes }
  }, [appts, pacientes])

  // Top profissionais por agendamento e receita
  const topPros = useMemo(() => {
    const map = {}
    pros.forEach(p => { map[p.id] = { ...p, count: 0, revenue: 0, completed: 0 } })
    appts.forEach(a => {
      if (!a.professional_id || !map[a.professional_id]) return
      map[a.professional_id].count++
      if (a.status === 'concluido') {
        map[a.professional_id].revenue += Number(a.price || 0)
        map[a.professional_id].completed++
      }
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [pros, appts])

  // Top procedimentos
  const topProcs = useMemo(() => {
    const map = {}
    procs.forEach(p => { map[p.id] = { ...p, count: 0, revenue: 0 } })
    appts.forEach(a => {
      if (!a.procedure_id || !map[a.procedure_id]) return
      map[a.procedure_id].count++
      if (a.status === 'concluido') map[a.procedure_id].revenue += Number(a.price || 0)
    })
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [procs, appts])

  const filteredPats = useMemo(() => {
    if (!search.trim()) return pacientes
    const s = search.toLowerCase()
    return pacientes.filter(p =>
      (p.nome || '').toLowerCase().includes(s) ||
      (p.numero || '').toLowerCase().includes(s) ||
      (p.cpf || '').toLowerCase().includes(s)
    )
  }, [pacientes, search])

  const recentAppts = useMemo(() => {
    return [...appts].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 12)
  }, [appts])

  const msgsByType = useMemo(() => {
    const m = { cliente: 0, ia: 0, humano: 0, tool: 0 }
    msgs.forEach(x => { const t = (x.type || '').toLowerCase(); if (m[t] !== undefined) m[t]++ })
    return m
  }, [msgs])

  if (!company) {
    return (
      <div className="opx-root">
        <div className="opx-empty-page">
          <Building2 size={40} />
          <h2>Nenhuma empresa cadastrada</h2>
          <p>Cadastre uma empresa em /adm/empresas para visualizar a operação.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="opx-root">
      {/* Header */}
      <div className="opx-head">
        <div>
          <div className="opx-head-eyebrow"><Activity size={13} /> Operação consolidada</div>
          <h1 className="opx-head-title">Operação · {company.name}</h1>
          <p className="opx-head-sub">Tudo que essa empresa tem cadastrado e está acontecendo nos últimos 30 dias.</p>
        </div>
        <div className="opx-head-right">
          <select className="opx-select" value={selected} onChange={e => setSelected(e.target.value)}>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name} · {c.instance}</option>
            ))}
          </select>
          <button className="opx-refresh" onClick={loadAll} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="opx-kpi-grid">
        <div className="opx-kpi opx-kpi-blue">
          <Users size={18} />
          <div className="opx-kpi-num">{fmtNumber(pacientes.length)}</div>
          <div className="opx-kpi-lbl">Contatos cadastrados</div>
        </div>
        <div className="opx-kpi opx-kpi-purple">
          <Briefcase size={18} />
          <div className="opx-kpi-num">{fmtNumber(pros.length)}</div>
          <div className="opx-kpi-lbl">Profissionais</div>
        </div>
        <div className="opx-kpi opx-kpi-pink">
          <ClipboardList size={18} />
          <div className="opx-kpi-num">{fmtNumber(procs.length)}</div>
          <div className="opx-kpi-lbl">Serviços</div>
        </div>
        <div className="opx-kpi opx-kpi-green">
          <Calendar size={18} />
          <div className="opx-kpi-num">{fmtNumber(appts.length)}</div>
          <div className="opx-kpi-lbl">Agendamentos 30d</div>
          <div className="opx-kpi-sub">{stats.apptsHoje} hoje</div>
        </div>
        <div className="opx-kpi opx-kpi-money">
          <CircleDollarSign size={18} />
          <div className="opx-kpi-num">{fmtMoney(stats.revenue)}</div>
          <div className="opx-kpi-lbl">Receita 30d</div>
          <div className="opx-kpi-sub">{stats.noshowPct}% não compareceu</div>
        </div>
      </div>

      {/* Mini-cards extras */}
      <div className="opx-mini-grid">
        <div className="opx-mini">
          <div className="opx-mini-icon" style={{ background: '#FEF3C7', color: '#D97706' }}><Cake size={14} /></div>
          <div>
            <div className="opx-mini-num">{stats.aniversariantes}</div>
            <div className="opx-mini-lbl">Aniversariantes (próx. 7d)</div>
          </div>
        </div>
        <div className="opx-mini">
          <div className="opx-mini-icon" style={{ background: '#FEE2E2', color: '#DC2626' }}><AlertTriangle size={14} /></div>
          <div>
            <div className="opx-mini-num">{alerts.filter(a => !a.resolved).length}</div>
            <div className="opx-mini-lbl">Alertas pendentes</div>
          </div>
        </div>
        <div className="opx-mini">
          <div className="opx-mini-icon" style={{ background: '#DBEAFE', color: '#2563EB' }}><Users size={14} /></div>
          <div>
            <div className="opx-mini-num">{users.filter(u => u.active).length}/{users.length}</div>
            <div className="opx-mini-lbl">Usuários ativos</div>
          </div>
        </div>
        <div className="opx-mini">
          <div className="opx-mini-icon" style={{ background: '#FCE7F3', color: '#DB2777' }}><Kanban size={14} /></div>
          <div>
            <div className="opx-mini-num">{kanbanCards.length}</div>
            <div className="opx-mini-lbl">Atividades Kanban</div>
          </div>
        </div>
        <div className="opx-mini">
          <div className="opx-mini-icon" style={{ background: '#EDE9FE', color: '#7C3AED' }}><MessageSquare size={14} /></div>
          <div>
            <div className="opx-mini-num">{fmtNumber(msgs.length)}</div>
            <div className="opx-mini-lbl">Mensagens 30d</div>
          </div>
        </div>
        <div className="opx-mini">
          <div className="opx-mini-icon" style={{ background: '#D1FAE5', color: '#059669' }}><TrendingUp size={14} /></div>
          <div>
            <div className="opx-mini-num">{fmtNumber(msgsByType.ia)}</div>
            <div className="opx-mini-lbl">Respostas da IA</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="opx-tabs">
        {[
          { k: 'overview',  l: 'Visão geral' },
          { k: 'pacientes', l: `Contatos (${pacientes.length})` },
          { k: 'pros',      l: `Profissionais (${pros.length})` },
          { k: 'procs',     l: `Serviços (${procs.length})` },
          { k: 'appts',     l: `Agendamentos (${appts.length})` },
          { k: 'team',      l: `Equipe (${users.length})` },
        ].map(t => (
          <button key={t.k} className={`opx-tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {/* Tab: visão geral */}
      {tab === 'overview' && (
        <div className="opx-overview">
          <div className="opx-card">
            <div className="opx-card-head">
              <Award size={14} /> Top profissionais por receita (30d)
            </div>
            <div className="opx-rank">
              {topPros.slice(0, 5).map((p, i) => (
                <div key={p.id} className="opx-rank-row">
                  <div className={`opx-rank-medal medal-${i + 1}`}>
                    {i === 0 ? <Crown size={12} /> : i + 1}
                  </div>
                  <div className="opx-rank-info">
                    <div className="opx-rank-name">{p.name}</div>
                    <div className="opx-rank-sub">{p.specialty || 'Sem especialidade'}</div>
                  </div>
                  <div className="opx-rank-stats">
                    <div className="opx-rank-money">{fmtMoney(p.revenue)}</div>
                    <div className="opx-rank-count">{p.completed} agendamentos</div>
                  </div>
                </div>
              ))}
              {!topPros.length && <div className="opx-card-empty">Nenhum profissional cadastrado.</div>}
            </div>
          </div>

          <div className="opx-card">
            <div className="opx-card-head">
              <ClipboardList size={14} /> Top serviços (30d)
            </div>
            <div className="opx-rank">
              {topProcs.slice(0, 5).map((p, i) => (
                <div key={p.id} className="opx-rank-row">
                  <div className="opx-rank-num">{i + 1}</div>
                  <div className="opx-rank-info">
                    <div className="opx-rank-name">{p.name}</div>
                    <div className="opx-rank-sub">{p.type || 'Serviço'} · {p.duration_min || 30}min</div>
                  </div>
                  <div className="opx-rank-stats">
                    <div className="opx-rank-money">{fmtMoney(p.revenue)}</div>
                    <div className="opx-rank-count">{p.count}x</div>
                  </div>
                </div>
              ))}
              {!topProcs.length && <div className="opx-card-empty">Nenhum serviço.</div>}
            </div>
          </div>

          <div className="opx-card opx-card-wide">
            <div className="opx-card-head">
              <Calendar size={14} /> Agendamentos recentes
            </div>
            <table className="opx-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Contato</th>
                  <th>Profissional</th>
                  <th>Serviço</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {recentAppts.map(a => {
                  const pro = pros.find(p => p.id === a.professional_id)
                  const proc = procs.find(p => p.id === a.procedure_id)
                  const st = STATUS_LABELS[a.status] || STATUS_LABELS.agendado
                  return (
                    <tr key={a.id}>
                      <td>{fmtDate(a.starts_at)} {new Date(a.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{a.patient_name || '—'}</td>
                      <td>{pro?.name || '—'}</td>
                      <td>{proc?.name || '—'}</td>
                      <td><span className="opx-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtMoney(a.price)}</td>
                    </tr>
                  )
                })}
                {!recentAppts.length && (
                  <tr><td colSpan={6} className="opx-table-empty">Sem agendamentos no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Pacientes */}
      {tab === 'pacientes' && (
        <div className="opx-card">
          <div className="opx-list-toolbar">
            <div className="opx-search-box">
              <Search size={13} />
              <input placeholder="Buscar por nome, número ou CPF..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="opx-list-count">{filteredPats.length} de {pacientes.length}</div>
          </div>
          <table className="opx-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Idade</th>
                <th>CPF</th>
                <th>Cadastrado em</th>
              </tr>
            </thead>
            <tbody>
              {filteredPats.slice(0, 100).map(p => {
                return (
                  <tr key={p.id}>
                    <td className="opx-pat-name">
                      <div className="opx-pat-avatar">
                        {p.photo ? <img src={p.photo} alt="" /> : <span>{(p.nome || '?').charAt(0)}</span>}
                      </div>
                      {p.nome || '—'}
                    </td>
                    <td>{p.numero || '—'}</td>
                    <td>{calcAge(p.birthdate) ?? '—'}</td>
                    <td>{p.cpf || '—'}</td>
                    <td>{fmtDate(p.created_at)}</td>
                  </tr>
                )
              })}
              {!filteredPats.length && (
                <tr><td colSpan={5} className="opx-table-empty">Nenhum contato encontrado.</td></tr>
              )}
            </tbody>
          </table>
          {filteredPats.length > 100 && (
            <div className="opx-table-foot">Mostrando 100 de {filteredPats.length} — use o filtro pra refinar.</div>
          )}
        </div>
      )}

      {/* Tab: Profissionais */}
      {tab === 'pros' && (
        <div className="opx-card">
          <table className="opx-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Especialidade</th>
                <th>Registro</th>
                <th>Agendamentos 30d</th>
                <th>Concluídos</th>
                <th style={{ textAlign: 'right' }}>Receita 30d</th>
              </tr>
            </thead>
            <tbody>
              {topPros.map(p => (
                <tr key={p.id}>
                  <td className="opx-pat-name">
                    <div className="opx-pat-avatar" style={{ background: p.color || '#A78BFA' }}>
                      <span>{(p.name || '?').charAt(0)}</span>
                    </div>
                    {p.name}
                  </td>
                  <td>{p.specialty || '—'}</td>
                  <td>{p.registration_number || '—'}</td>
                  <td>{p.count}</td>
                  <td>{p.completed}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtMoney(p.revenue)}</td>
                </tr>
              ))}
              {!topPros.length && <tr><td colSpan={6} className="opx-table-empty">Nenhum profissional cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Serviços */}
      {tab === 'procs' && (
        <div className="opx-card">
          <table className="opx-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Tipo</th>
                <th>Duração</th>
                <th>Valor padrão</th>
                <th>Vezes 30d</th>
                <th style={{ textAlign: 'right' }}>Receita 30d</th>
              </tr>
            </thead>
            <tbody>
              {topProcs.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td><span className="opx-badge" style={{ background: '#F5F3FF', color: '#7C3AED' }}>{p.type || 'Serviço'}</span></td>
                  <td>{p.duration_min || 30} min</td>
                  <td>{fmtMoney(p.default_price)}</td>
                  <td>{p.count}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtMoney(p.revenue)}</td>
                </tr>
              ))}
              {!topProcs.length && <tr><td colSpan={6} className="opx-table-empty">Nenhum serviço cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Agendamentos */}
      {tab === 'appts' && (
        <div className="opx-card">
          <table className="opx-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Contato</th>
                <th>Profissional</th>
                <th>Serviço</th>
                <th>Status</th>
                <th>Pagamento</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {appts.slice(0, 200).map(a => {
                const pro = pros.find(p => p.id === a.professional_id)
                const proc = procs.find(p => p.id === a.procedure_id)
                const st = STATUS_LABELS[a.status] || STATUS_LABELS.agendado
                return (
                  <tr key={a.id}>
                    <td>{fmtDate(a.starts_at)} {new Date(a.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{a.patient_name || '—'}</td>
                    <td>{pro?.name || '—'}</td>
                    <td>{proc?.name || '—'}</td>
                    <td><span className="opx-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td>{a.payment_status === 'pago' ? '✓ Pago' : a.payment_status === 'pendente' ? '⏱ Pendente' : '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtMoney(a.price)}</td>
                  </tr>
                )
              })}
              {!appts.length && <tr><td colSpan={7} className="opx-table-empty">Sem agendamentos no período.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Equipe */}
      {tab === 'team' && (
        <div className="opx-card">
          <table className="opx-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Perfil</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="opx-pat-name">
                    <div className="opx-pat-avatar"><span>{(u.name || '?').charAt(0)}</span></div>
                    {u.name}
                  </td>
                  <td>{u.email}</td>
                  <td><span className="opx-badge" style={{ background: u.role === 'admin' ? '#EFF6FF' : '#F1F5F9', color: u.role === 'admin' ? '#2563EB' : '#475569' }}>{u.role}</span></td>
                  <td><span className="opx-badge" style={{ background: u.active ? '#F0FDF4' : '#FEF2F2', color: u.active ? '#16A34A' : '#DC2626' }}>{u.active ? 'Ativo' : 'Inativo'}</span></td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={4} className="opx-table-empty">Nenhum usuário.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
