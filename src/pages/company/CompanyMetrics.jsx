import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import LimitReachedModal from '../../components/LimitReachedModal'
import { getEffectiveLimits, upgradeMessage } from '../../lib/planLimits'
import {
  Users, MessageSquare, TrendingUp, Clock, Inbox, BarChart2, RefreshCw,
  Calendar, BellRing, Kanban, Headset, CheckCircle2, XCircle, AlertCircle,
  Phone, Bot, ListChecks, Flag, ChevronRight, Layers, DollarSign, Stethoscope, Lock,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import './Company.css'

// ─── Inferência de origem do lead ─────────────────────────────────────────
// Roda nas primeiras mensagens do cliente. Ordem importa: Indicação ANTES de
// Instagram/Google porque "minha amiga viu no Insta" deve cair em Indicação.
// Frases-gatilho comuns em PT-BR: "vim através de/do/pelo X", "achei no X",
// "vi no X", "encontrei no X", "pesquisei no X", "fui indicado por", etc.
const ORIGEM_PATTERNS = [
  { origem: 'Indicação', re: /\b(indica[cç][aã]o|indic(ou|aram|ada?|ado)|fui\s+indicad|me\s+indic\w*|me\s+passaram|me\s+passou|amig[ao]\s+(me\s+)?(indic|fal|disse|recomend)|conhec\w+\s+(me\s+)?(indic|fal|recomend)|recomend\w+\s+(por|pelo|pela)|por\s+indica|veio\s+por\s+indica)/i },
  { origem: 'Instagram', re: /\b(instagram|\binsta\b|stories?\b|\bstory\b|@[a-z0-9._-]{3,}|\big\b|vi(m)?\s+(no|do|pelo|seu|sua)\s+(insta|instagram|stories?|story|post)|publica[cç][aã]o de voc|reels?\b|atrav[eé]s\s+do\s+(insta|instagram))/i },
  { origem: 'Google',    re: /\b(google|pesqui[sz]\w+|achei\s+no\s+google|encontrei\s+no\s+google|fui\s+no\s+google|busca\s+(no|do)|\bgoogl|\bmaps\b|atrav[eé]s\s+do\s+google|pelo\s+google|na\s+internet|na\s+pesquisa)/i },
  { origem: 'Facebook',  re: /\b(facebook|\bfb\b|atrav[eé]s\s+do\s+(face|facebook)|pelo\s+(face|facebook)|vi(m)?\s+no\s+(face|facebook))/i },
  { origem: 'TikTok',    re: /\btik\s*tok\b|atrav[eé]s\s+do\s+tiktok|pelo\s+tiktok|vi(m)?\s+no\s+tiktok/i },
  { origem: 'YouTube',   re: /\b(youtube|canal\s+d[oae]|v[ií]deo\s+(do|de|deles)|seu\s+canal|atrav[eé]s\s+do\s+youtube|pelo\s+youtube)/i },
  { origem: 'Site',      re: /\b(atrav[eé]s\s+(do|de)\s+site|pelo\s+site|do\s+site|no\s+site|achei\s+no\s+site|encontrei\s+no\s+site|vi(m)?\s+(do|pelo|no)\s+site|site\s+(de\s+voc|da\s+cl[íi]nica|do\s+consult|de\s+v[oô]s)|seu\s+site|via\s+site|p[aá]gina\s+(da|de)\s+voc)/i },
  { origem: 'Anúncio',   re: /\b(an[uú]nci\w*|patrocinad\w+|propaganda|panfleto|outdoor|\btv\b\s+(da|do)|vi\s+um\s+an[uú]ncio|atrav[eé]s\s+do\s+an[uú]ncio|pelo\s+an[uú]ncio)/i },
  { origem: 'WhatsApp Business', re: /\b(perfil\s+do\s+whats|status\s+do\s+whats|cat[áa]logo\s+do\s+whats|whats\s+business|link\s+do\s+whats)/i },
]

function inferOrigem(messages) {
  if (!messages || !messages.length) return null
  const text = messages.map(m => (m.mensagem || '').toLowerCase()).join(' \n ')
  for (const { origem, re } of ORIGEM_PATTERNS) {
    if (re.test(text)) return origem
  }
  return null
}

// Normaliza variações textuais para forma canônica.
// Ex: 'instagram', 'INSTA', 'Vi no insta' → 'Instagram'
//     'conhecido', 'minha amiga indicou', 'Indicação de uma amiga' → 'Indicação'
// Se não casar com nenhum padrão, devolve texto original com Title Case.
function normalizeOrigem(raw) {
  if (!raw || !String(raw).trim() || /desconhecid|n[aã]o informad|sem rastreio/i.test(raw)) {
    return 'WhatsApp · sem rastreio'
  }
  const text = String(raw).trim().toLowerCase()
  for (const { origem, re } of ORIGEM_PATTERNS) {
    if (re.test(text)) return origem
  }
  // fallback: Title Case do texto (capitaliza a primeira letra de cada palavra)
  return raw.trim().replace(/\b(\p{L})(\p{L}*)/gu, (_, a, b) => a.toUpperCase() + b.toLowerCase())
}

// ─── Períodos ────────────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'hoje',   label: 'Hoje' },
  { key: 'ontem',  label: 'Ontem' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mês' },
  { key: 'todos',  label: 'Todos' },
]

function getPeriodRange(period) {
  const now = new Date()
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (period === 'hoje')   return { from: startOf(now), to: null }
  if (period === 'ontem')  { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOf(y), to: new Date(startOf(now) - 1) } }
  if (period === 'semana') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: startOf(d), to: null } }
  if (period === 'mes')    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
  return { from: null, to: null }
}

function periodLabel(period) {
  return ({ hoje: 'hoje', ontem: 'ontem', semana: 'esta semana', mes: 'este mês', todos: 'no total' })[period] || ''
}

function inPeriod(ts, from, to) {
  if (!ts) return false
  const d = new Date(ts)
  if (isNaN(d.getTime())) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return `${h}h ${m}min`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

// Status de lead — agora computado automaticamente pela posição no funil
// Mantém os labels antigos (Curioso/Quente/Interessado/Cliente/Inativo) pra não quebrar
// dados antigos. Novos leads recebem os valores em snake_case abaixo.
const CLASSIF_COLORS = {
  // ── Auto (preferidos)
  'novo':            { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1', label: 'Novo' },
  'em_atendimento':  { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Em atendimento' },
  'agendado':        { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'Agendado' },
  'encerrado':       { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', label: 'Encerrado' },
  'perdido':         { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Perdido' },
  // ── Legados (mantidos pra retro-compat)
  'Curioso':    { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  'Interessado':{ color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  'Quente':     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  'Cliente':    { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  'Inativo':    { color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
}

const STATUS_ORDER = ['novo', 'em_atendimento', 'agendado', 'encerrado', 'perdido']

// Computa status do lead automaticamente. Ordem importa:
//   1. Tem appointment ativo (não cancelado) → 'agendado'
//   2. Conversa encerrada com 'desistiu' ou 'auto_encerrado' → 'perdido'
//   3. Outras conversas encerradas (resolvido, encaminhado) → 'encerrado'
//   4. Alguém respondeu (IA ou humano) → 'em_atendimento'
//   5. Default → 'novo'
function computeLeadStatus({ lead, msgsByPhone, apptsByPhone, convBySession }) {
  const phone = (lead.numero || '').replace(/@.*$/, '').replace(/\D/g, '')
  const myAppts = apptsByPhone[phone] || []
  const hasActiveAppt = myAppts.some(a => a.status && a.status !== 'cancelado')
  if (hasActiveAppt) return 'agendado'

  const conv = convBySession[lead.numero] || convBySession[phone]
  if (conv) {
    if (conv.reason === 'desistiu' || conv.reason === 'auto_encerrado') return 'perdido'
    return 'encerrado'
  }

  const myMsgs = msgsByPhone[phone] || []
  const hasResponse = myMsgs.some(m => {
    const t = (m.type || '').toLowerCase()
    return t === 'ia' || t === 'humano'
  })
  if (hasResponse) return 'em_atendimento'

  return 'novo'
}
const ORIGEM_COLORS = ['#2563EB','#16A34A','#F59E0B','#7C3AED','#DC2626','#0891B2','#D97706','#059669']

const REASON_META = {
  agendado:       { label: 'Agendado',    color: '#16A34A' },
  resolvido:      { label: 'Resolvido',   color: '#2563EB' },
  encaminhado:    { label: 'Encaminhado', color: '#7C3AED' },
  desistiu:       { label: 'Desistiu',    color: '#DC2626' },
  auto_encerrado: { label: 'Expirado',    color: '#6B7280' },
}

const APPT_STATUS = {
  agendado:   { label: 'Agendado',   color: '#2563EB' },
  confirmado: { label: 'Confirmado', color: '#16A34A' },
  concluido:  { label: 'Concluído',  color: '#0891B2' },
  faltou:     { label: 'Não compareceu', color: '#D97706' },
  cancelado:  { label: 'Cancelado',  color: '#DC2626' },
}

const PRIORITY_META = {
  baixa:   { label: 'Baixa',   color: '#6B7280' },
  normal:  { label: 'Normal',  color: '#2563EB' },
  alta:    { label: 'Alta',    color: '#D97706' },
  urgente: { label: 'Urgente', color: '#DC2626' },
}

const TABS = [
  { key: 'overview',    label: 'Visão Geral',  icon: BarChart2 },
  { key: 'atendimento', label: 'Atendimento',  icon: MessageSquare },
  { key: 'equipe',      label: 'Equipe',       icon: Users },
  { key: 'agenda',      label: 'Agenda',       icon: Calendar },
  { key: 'financeiro',  label: 'Financeiro',   icon: DollarSign },
  { key: 'leads',       label: 'Leads',        icon: TrendingUp },
  { key: 'atividades',  label: 'Kanban',       icon: Kanban },
]

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Página principal ────────────────────────────────────────────────────────
// Props opcionais (usadas pelo ADM Análise 360°):
//   companyOverride: substitui session.company (pra ver métricas de outra empresa)
//   hideHeader: esconde o título 'Métricas' + botão Atualizar
export default function CompanyMetrics({ companyOverride = null, hideHeader = false } = {}) {
  const { session } = useAuth()
  const company = companyOverride || session?.company
  const instance      = company?.instance
  const companyId     = company?.id
  const contactsTable = company?.contacts_table
  const aiEnabled     = company?.ai_enabled !== false
  const limits        = getEffectiveLimits(company)
  // No modo ADM (companyOverride), libera todas as abas — admin vê tudo.
  const advancedAllowed = companyOverride ? true : limits.advanced_metrics
  const ADVANCED_TABS  = ['equipe', 'financeiro']

  const [period, setPeriod]   = useState('semana')
  const [tab, setTab]         = useState('overview')
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [limitModal, setLimitModal] = useState(null)

  const [msgs, setMsgs]                 = useState([])
  const [convs, setConvs]               = useState([])
  const [atts, setAtts]                 = useState([])
  const [appts, setAppts]               = useState([])
  const [alerts, setAlerts]             = useState([])
  const [kanbanCards, setKanbanCards]   = useState([])
  const [kanbanColumns, setKanbanColumns] = useState([])
  const [users, setUsers]               = useState([])
  const [sectors, setSectors]           = useState([])
  const [sectorMembers, setSectorMembers] = useState([])
  const [leads, setLeads]               = useState([])
  const [professionals, setProfessionals] = useState([])
  const [procedures, setProcedures]     = useState([])
  const [finTx, setFinTx]               = useState([])
  const [finCats, setFinCats]           = useState([])

  async function load() {
    if (!instance) return
    setLoading(true)
    const queries = [
      supabase.from('mensagens_geral').select('id, numero, type, mensagem, "horaLastMessage", created_at').eq('instancia', instance).order('id', { ascending: false }).limit(20000),
      supabase.from('conversations').select('session_id, reason, closed_at').eq('instancia', instance),
      supabase.from('attendances').select('numero, sector_id, sector_name, sector_color, attendant_name, attendant_email, assumed_at').eq('instancia', instance),
      supabase.from('appointments').select('*, agendas(name, color)').eq('instancia', instance),
      supabase.from('alerts').select('*').eq('instancia', instance),
      supabase.from('kanban_cards').select('*').eq('instancia', instance),
      supabase.from('kanban_columns').select('*').eq('instancia', instance).order('position'),
      supabase.from('users').select('id, name, email, role, active').eq('company_id', companyId),
      supabase.from('sectors').select('*').eq('instancia', instance),
      supabase.from('sector_members').select('user_id, sector_id'),
      supabase.from('professionals').select('*').eq('instancia', instance),
      supabase.from('procedures').select('*').eq('instancia', instance),
      supabase.from('financial_transactions').select('id,tipo,valor,status,categoria_id,vencimento,descricao,contact_nome,forma_pagamento').eq('instancia', instance)
        .gte('vencimento', `${new Date().getFullYear()-1}-01-01`).lte('vencimento', `${new Date().getFullYear()+1}-12-31`),
      supabase.from('financial_categories').select('id,nome,tipo,cor').in('instancia', [instance, '_default_']),
    ]
    if (contactsTable) queries.push(supabase.from(contactsTable).select('*').eq('instancia', instance))

    const results = await Promise.all(queries)
    setMsgs(results[0].data || [])
    setConvs(results[1].data || [])
    setAtts(results[2].data || [])
    setAppts(results[3].data || [])
    setAlerts(results[4].data || [])
    setKanbanCards(results[5].data || [])
    setKanbanColumns(results[6].data || [])
    setUsers((results[7].data || []).filter(u => u.active !== false))
    setSectors(results[8].data || [])
    const sectorIds = new Set((results[8].data || []).map(s => s.id))
    setSectorMembers((results[9].data || []).filter(sm => sectorIds.has(sm.sector_id)))
    setProfessionals(results[10].data || [])
    setProcedures(results[11].data || [])
    setFinTx(results[12].data || [])
    setFinCats(results[13].data || [])
    const leadsData = contactsTable ? (results[14].data || []) : []
    setLeads(leadsData)
    setLastRefresh(new Date())
    setLoading(false)

    // Inferência automática de origem para leads sem origem definida.
    // Lê primeiras mensagens cliente, detecta canal por palavra-chave, atualiza banco silenciosamente.
    if (contactsTable && leadsData.length) {
      const msgsAll = results[0].data || []
      const semOrigem = leadsData.filter(l => !l.origem || l.origem === '' || /desconhecid/i.test(l.origem))
      if (semOrigem.length) {
        const updates = []
        for (const lead of semOrigem) {
          const leadMsgs = msgsAll
            .filter(m => m.numero === lead.numero && (m.type || '').toLowerCase() === 'cliente')
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .slice(0, 5)
          const inferred = inferOrigem(leadMsgs)
          if (inferred) updates.push({ id: lead.id, origem: inferred })
        }
        if (updates.length) {
          await Promise.all(updates.map(u =>
            supabase.from(contactsTable).update({ origem: u.origem }).eq('id', u.id)
          ))
          setLeads(prev => prev.map(l => {
            const u = updates.find(x => x.id === l.id)
            return u ? { ...l, origem: u.origem } : l
          }))
        }
      }

      // Classificação automática de status (novo / em_atendimento / agendado / encerrado / perdido)
      // Roda em todos os leads, atualiza só onde o valor mudou.
      const allMsgs  = results[0].data || []
      const allConvs = results[1].data || []
      const allAppts = results[3].data || []

      const msgsByPhone = {}
      allMsgs.forEach(m => {
        const p = (m.numero || '').replace(/@.*$/, '').replace(/\D/g, '')
        if (!p) return
        if (!msgsByPhone[p]) msgsByPhone[p] = []
        msgsByPhone[p].push(m)
      })
      const apptsByPhone = {}
      allAppts.forEach(a => {
        const p = (a.patient_phone || '').replace(/@.*$/, '').replace(/\D/g, '')
        if (!p) return
        if (!apptsByPhone[p]) apptsByPhone[p] = []
        apptsByPhone[p].push(a)
      })
      const convBySession = {}
      allConvs.forEach(c => { convBySession[c.session_id] = c })

      const statusUpdates = []
      for (const lead of leadsData) {
        const newStatus = computeLeadStatus({ lead, msgsByPhone, apptsByPhone, convBySession })
        const current = lead.classificacao_lead
        // Só atualiza se diferente E (status atual está vazio OU é um valor auto)
        const isAutoValue = !current || STATUS_ORDER.includes(current)
        if (isAutoValue && current !== newStatus) {
          statusUpdates.push({ id: lead.id, classificacao_lead: newStatus })
        }
      }
      if (statusUpdates.length) {
        await Promise.all(statusUpdates.map(u =>
          supabase.from(contactsTable).update({ classificacao_lead: u.classificacao_lead }).eq('id', u.id)
        ))
        setLeads(prev => prev.map(l => {
          const u = statusUpdates.find(x => x.id === l.id)
          return u ? { ...l, classificacao_lead: u.classificacao_lead } : l
        }))
      }
    }
  }

  useEffect(() => { load() }, [instance, companyId, contactsTable])

  // Range do período ativo
  const range = useMemo(() => getPeriodRange(period), [period])

  return (
    <div className="page-enter" style={{ padding: hideHeader ? 0 : '1.5rem' }}>
      {/* Header — só fora do modo embed do ADM */}
      {!hideHeader && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Métricas</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {lastRefresh ? `Atualizado às ${lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Carregando...'}
            </div>
          </div>
          <button className="nx-btn-ghost" style={{ fontSize: 12 }} onClick={load} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>
      )}

      {/* Filtros de período */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            style={{
              padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${period === p.key ? '#2563EB' : 'var(--border)'}`,
              background: period === p.key ? '#2563EB' : '#fff',
              color: period === p.key ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: period === p.key ? '0 1px 4px rgba(37,99,235,0.3)' : 'none',
            }}>{p.label}</button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.filter(t => aiEnabled || t.key !== 'leads' || contactsTable).map(t => {
          const locked = !advancedAllowed && ADVANCED_TABS.includes(t.key)
          return (
            <button key={t.key} onClick={() => {
              if (locked) {
                setLimitModal(upgradeMessage('advanced_metrics', null, limits.plan))
                return
              }
              setTab(t.key)
            }}
              title={locked ? `Disponível a partir do plano Pro` : ''}
              style={{
                padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid #2563EB' : '2px solid transparent',
                color: tab === t.key ? '#2563EB' : (locked ? '#94A3B8' : 'var(--text-secondary)'),
                fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: -1,
                opacity: locked ? 0.6 : 1,
              }}>
              {locked ? <Lock size={12} /> : <t.icon size={14} />} {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview'    && <OverviewTab    {...{ msgs, convs, atts, appts, alerts, kanbanCards, range, period, loading }} />}
      {tab === 'atendimento' && <AtendimentoTab {...{ msgs, convs, atts, range, period, loading }} />}
      {tab === 'equipe'      && <EquipeTab      {...{ msgs, convs, atts, users, sectors, sectorMembers, range, period, loading }} />}
      {tab === 'agenda'      && <AgendaTab      {...{ appts, range, period, loading }} />}
      {tab === 'financeiro'  && <FinanceiroTab  {...{ appts, professionals, procedures, finTx, finCats, range, period, loading }} />}
      {tab === 'leads'       && <LeadsTab       {...{ leads, appts, msgs, range, period, loading, contactsTable }} />}
      {tab === 'atividades'  && <AtividadesTab  {...{ kanbanCards, kanbanColumns, users, range, period, loading }} />}

      <LimitReachedModal
        open={!!limitModal}
        title={limitModal?.title}
        body={limitModal?.body}
        cta={limitModal?.cta}
        planName={limits.plan}
        onClose={() => setLimitModal(null)}
      />
    </div>
  )
}

// ─── Tab: Visão Geral ───────────────────────────────────────────────────────
function OverviewTab({ msgs, convs, atts, appts, alerts, kanbanCards, range, period, loading }) {
  const { from, to } = range
  const m = msgs.filter(x => inPeriod(x.created_at, from, to))
  const c = convs.filter(x => inPeriod(x.closed_at, from, to))

  // Tickets novos: primeiro registro de cada numero dentro do período
  const firstByNumero = useMemo(() => {
    const seen = {}
    const sorted = [...msgs].sort((a, b) => a.id - b.id)
    sorted.forEach(x => { if (!seen[x.numero]) seen[x.numero] = x.created_at })
    return seen
  }, [msgs])
  const ticketsNovos = Object.values(firstByNumero).filter(ts => inPeriod(ts, from, to)).length

  // Tickets ativos: tem mensagem mas não fechado e não atribuído
  const closedSet = new Set(convs.map(c => c.session_id))
  const attSet = new Set(atts.map(a => a.numero))
  const allNumbers = new Set(msgs.map(x => x.numero).filter(Boolean))
  const ticketsAtivos = [...allNumbers].filter(n => !closedSet.has(n) && !attSet.has(n)).length

  // Hoje agendamentos
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
  const apptsHoje = appts.filter(a => {
    const d = new Date(a.starts_at)
    return d >= todayStart && d < todayEnd && a.status !== 'cancelado'
  }).length

  const alertasPend = alerts.filter(a => !a.resolved).length
  const cardsAtrasados = kanbanCards.filter(c => c.due_date && new Date(`${c.due_date}T23:59:59`) < new Date()).length

  // IA vs Humano: conta sessões por tipo de atendimento
  const iaHumano = useMemo(() => {
    const byNumero = {}
    m.forEach(x => {
      if (!x.numero) return
      if (!byNumero[x.numero]) byNumero[x.numero] = { ia: 0, humano: 0 }
      const t = (x.type || '').toLowerCase()
      if (t === 'ia') byNumero[x.numero].ia++
      if (t === 'atendente' || t === 'humano') byNumero[x.numero].humano++
    })
    let soIa = 0, comHumano = 0, semAtend = 0
    Object.values(byNumero).forEach(s => {
      if (s.humano > 0) comHumano++
      else if (s.ia > 0) soIa++
      else semAtend++
    })
    return { soIa, comHumano, semAtend }
  }, [m])

  // Volume mensagens por dia
  const dayVolume = useMemo(() => {
    const map = {}
    m.forEach(x => {
      if (!x.created_at) return
      const d = new Date(x.created_at)
      const k = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => {
      const parse = s => { const [d, mo] = s.split('/'); return new Date(2026, +mo - 1, +d) }
      return parse(a[0]) - parse(b[0])
    })
  }, [m])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Inbox size={18} color="#2563EB" />} bg="#EFF6FF" value={ticketsNovos} label="Tickets novos" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<MessageSquare size={18} color="#7C3AED" />} bg="#F5F3FF" value={ticketsAtivos} label="Tickets ativos" sub="aguardando atendimento" loading={loading} />
        <KpiCard icon={<CheckCircle2 size={18} color="#16A34A" />} bg="#F0FDF4" value={c.length} label="Tickets finalizados" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<Calendar size={18} color="#0891B2" />} bg="#ECFEFF" value={apptsHoje} label="Agendamentos hoje" sub="exceto cancelados" loading={loading} />
        <KpiCard icon={<BellRing size={18} color="#D97706" />} bg="#FFFBEB" value={alertasPend} label="Alertas pendentes" sub="aguardando resolução" loading={loading} alert={alertasPend > 0} />
        <KpiCard icon={<AlertCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={cardsAtrasados} label="Atividades atrasadas" sub="data vencida" loading={loading} alert={cardsAtrasados > 0} />
      </div>

      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Clock size={15} color="#2563EB" />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Mensagens por dia</div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel(period)}</span>
        </div>
        <BarTimeline data={dayVolume} />
      </div>

      {(iaHumano.soIa + iaHumano.comHumano + iaHumano.semAtend) > 0 && (
        <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Bot size={15} color="#7C3AED" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Atendimento — IA vs Humano</div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel(period)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Só IA', value: iaHumano.soIa,     color: '#7C3AED', bg: '#F5F3FF', icon: Bot,      sub: 'sem intervenção humana' },
              { label: 'Com humano', value: iaHumano.comHumano, color: '#16A34A', bg: '#F0FDF4', icon: Headset, sub: 'atendente respondeu' },
              { label: 'Não atendido', value: iaHumano.semAtend, color: '#D97706', bg: '#FFFBEB', icon: Inbox,   sub: 'sem resposta da empresa' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: s.color }}>
                  <s.icon size={14} />
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{loading ? '—' : s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Atendimento ───────────────────────────────────────────────────────
function medianMs(arr) { if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2 }
function p90Ms(arr)    { if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[Math.min(Math.floor(s.length*0.9), s.length-1)] }
function slaColor(ms) {
  if (!ms) return '#94A3B8'
  if (ms < 5*60*1000)  return '#16A34A'
  if (ms < 30*60*1000) return '#D97706'
  return '#DC2626'
}

function AtendimentoTab({ msgs, convs, atts, range, period, loading }) {
  const { from, to } = range
  const closedInPeriod = convs.filter(c => inPeriod(c.closed_at, from, to))

  // Motivos de encerramento
  const reasonsMap = useMemo(() => {
    const map = {}
    closedInPeriod.forEach(c => { map[c.reason || 'outro'] = (map[c.reason || 'outro'] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [closedInPeriod])

  // Indexa mensagens por numero ordenadas asc
  const msgsByNumero = useMemo(() => {
    const map = {}
    msgs.forEach(m => {
      if (!m.numero) return
      if (!map[m.numero]) map[m.numero] = []
      map[m.numero].push(m)
    })
    Object.values(map).forEach(s => s.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
    return map
  }, [msgs])

  // Sessões encerradas como Set (pra pendentes)
  const closedSet = useMemo(() => new Set(convs.map(c => c.session_id)), [convs])

  // Métricas por sessão: tempo até IA, tempo até humano, pendente atual
  const sessionMetrics = useMemo(() => {
    return Object.entries(msgsByNumero).map(([numero, sMsgs]) => {
      const last = sMsgs[sMsgs.length - 1]
      const lastType = (last?.type || '').toLowerCase()
      const isClosed = closedSet.has(numero)
      const isPending = !isClosed && lastType === 'cliente'
      const waitingMs = isPending && last ? (Date.now() - new Date(last.created_at).getTime()) : 0

      const firstCliIdx = sMsgs.findIndex(m => (m.type || '').toLowerCase() === 'cliente')
      let firstIaMs = null, firstHumanMs = null
      if (firstCliIdx >= 0) {
        const t0 = new Date(sMsgs[firstCliIdx].created_at).getTime()
        // Filtra só msgs no período pra alinhar com filtro de tempo
        if (inPeriod(sMsgs[firstCliIdx].created_at, from, to) || (!from && !to)) {
          const fIa = sMsgs.slice(firstCliIdx + 1).find(m => (m.type || '').toLowerCase() === 'ia')
          const fHu = sMsgs.slice(firstCliIdx + 1).find(m => ['atendente', 'humano'].includes((m.type || '').toLowerCase()))
          if (fIa) firstIaMs = new Date(fIa.created_at).getTime() - t0
          if (fHu) firstHumanMs = new Date(fHu.created_at).getTime() - t0
        }
      }
      return { numero, isClosed, isPending, waitingMs, firstIaMs, firstHumanMs, sMsgs, last }
    })
  }, [msgsByNumero, closedSet, from, to])

  // Tempo até IA (mediana + p90)
  const iaTimes = sessionMetrics.map(s => s.firstIaMs).filter(x => x != null && x > 0)
  const medIa = medianMs(iaTimes)
  const p9Ia = p90Ms(iaTimes)

  // Tempo até humano (mediana + p90)
  const humanTimes = sessionMetrics.map(s => s.firstHumanMs).filter(x => x != null && x > 0)
  const medHuman = medianMs(humanTimes)
  const p9Human = p90Ms(humanTimes)

  // Pendentes agora
  const pending = sessionMetrics.filter(s => s.isPending)
  const pending1h = pending.filter(s => s.waitingMs > 3600000).length
  const pending24h = pending.filter(s => s.waitingMs > 86400000).length

  // Tendência diária — tempo médio resposta humana por dia
  const dailyHumanTrend = useMemo(() => {
    const buckets = {}
    sessionMetrics.forEach(s => {
      if (s.firstHumanMs == null || !s.last) return
      const day = new Date(s.last.created_at).toISOString().slice(0, 10)
      if (!buckets[day]) buckets[day] = []
      buckets[day].push(s.firstHumanMs)
    })
    return Object.entries(buckets).sort().map(([day, vals]) => ({ day, median: medianMs(vals), count: vals.length }))
  }, [sessionMetrics])
  const maxTrend = Math.max(1, ...dailyHumanTrend.map(d => d.median))

  // Tempo médio de ticket: closed_at - primeira msg do session_id
  const ticketDurations = useMemo(() => {
    const firstMsg = {}
    msgs.forEach(x => {
      if (!firstMsg[x.numero] || new Date(x.created_at) < new Date(firstMsg[x.numero])) {
        firstMsg[x.numero] = x.created_at
      }
    })
    return closedInPeriod.map(c => {
      const start = firstMsg[c.session_id]
      if (!start || !c.closed_at) return null
      return new Date(c.closed_at).getTime() - new Date(start).getTime()
    }).filter(d => d != null && d > 0)
  }, [closedInPeriod, msgs])
  const avgTicket = ticketDurations.length ? ticketDurations.reduce((a, b) => a + b, 0) / ticketDurations.length : 0

  // Tipos de mensagem
  const typeCounts = useMemo(() => {
    const map = { cliente: 0, atendente: 0, ia: 0, outro: 0 }
    msgs.filter(x => inPeriod(x.created_at, from, to)).forEach(x => {
      const t = (x.type || 'outro').toLowerCase()
      if (map[t] != null) map[t]++; else map.outro++
    })
    return map
  }, [msgs, from, to])

  // Mensagens por hora (heatmap simples)
  const hourCounts = useMemo(() => {
    const arr = Array(24).fill(0)
    msgs.filter(x => inPeriod(x.created_at, from, to)).forEach(x => {
      const d = new Date(x.created_at); if (isNaN(d.getTime())) return
      arr[d.getHours()]++
    })
    return arr
  }, [msgs, from, to])

  // % tickets que viraram atendimento humano
  const numTicketsClosed = closedInPeriod.length
  const closedHadAtt = closedInPeriod.filter(c => atts.some(a => a.numero === c.session_id)).length
  const taxaHumano = numTicketsClosed ? Math.round((closedHadAtt / numTicketsClosed) * 100) : 0

  // Auto-encerrados
  const autoEncerrados = closedInPeriod.filter(c => c.reason === 'auto_encerrado').length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Bot size={18} color="#2563EB" />} bg="#EFF6FF" value={formatDuration(medIa)} label="Resposta da IA (mediana)" sub={`p90: ${formatDuration(p9Ia)}`} loading={loading} />
        <KpiCard icon={<Headset size={18} color="#16A34A" />} bg="#F0FDF4" value={formatDuration(medHuman)} label="Resposta humana (mediana)" sub={`p90: ${formatDuration(p9Human)}`} loading={loading} />
        <KpiCard icon={<Inbox size={18} color="#D97706" />} bg="#FFFBEB" value={pending.length} label="Pendentes agora" sub={`${pending1h} > 1h · ${pending24h} > 24h`} loading={loading} alert={pending1h > 0} />
        <KpiCard icon={<XCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={autoEncerrados} label="Expirados (auto)" sub="ninguém atendeu" loading={loading} alert={autoEncerrados > 0} />
        <KpiCard icon={<Clock size={18} color="#7C3AED" />} bg="#F5F3FF" value={formatDuration(avgTicket)} label="Duração do ticket" sub="abertura → fechamento" loading={loading} />
        <KpiCard icon={<TrendingUp size={18} color="#0891B2" />} bg="#ECFEFF" value={`${taxaHumano}%`} label="Atendimento humano" sub="tickets assumidos" loading={loading} />
      </div>

      {/* Tendência diária — tempo médio resposta humana */}
      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 14 }}>
        <SectionTitle icon={TrendingUp} text="Tempo de resposta humana — dia a dia" right={`${dailyHumanTrend.length} dias`} />
        {dailyHumanTrend.length === 0 ? <Empty /> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, marginTop: 16, paddingBottom: 24, position: 'relative' }}>
            {dailyHumanTrend.map((d, i) => {
              const h = Math.max(4, (d.median / maxTrend) * 90)
              return (
                <div
                  key={i}
                  title={`${d.day} — ${formatDuration(d.median)} (${d.count} conv.)`}
                  style={{
                    flex: 1, height: `${h}%`,
                    background: slaColor(d.median),
                    borderRadius: '4px 4px 0 0',
                    position: 'relative', cursor: 'pointer',
                  }}>
                  {d.median === maxTrend && (
                    <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: slaColor(d.median), whiteSpace: 'nowrap' }}>{formatDuration(d.median)}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {dailyHumanTrend.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8', marginTop: 6 }}>
            <span>{new Date(dailyHumanTrend[0].day + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
            <span>{new Date(dailyHumanTrend[dailyHumanTrend.length - 1].day + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={ListChecks} text="Motivos de encerramento" right={periodLabel(period)} />
          {reasonsMap.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <DonutChart data={reasonsMap.map(([k, v]) => ({ value: v, color: REASON_META[k]?.color || '#94A3B8', label: REASON_META[k]?.label || k }))} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {reasonsMap.map(([k, v]) => {
                  const meta = REASON_META[k] || { label: k, color: '#94A3B8' }
                  const total = reasonsMap.reduce((a, b) => a + b[1], 0)
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
                      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{meta.label}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>{Math.round(v / total * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={MessageSquare} text="Tipos de mensagem" right={periodLabel(period)} />
          {[['cliente', '#94A3B8'], ['atendente', '#16A34A'], ['ia', '#2563EB']].map(([k, color]) => {
            const v = typeCounts[k] || 0
            const total = Object.values(typeCounts).reduce((a, b) => a + b, 0) || 1
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, textTransform: 'capitalize', color: 'var(--text-primary)' }}>{k}</span>
                  <span style={{ fontWeight: 700, color }}>{v}</span>
                </div>
                <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(v / total) * 100}%`, background: color, transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="nx-card" style={{ padding: '1.25rem' }}>
        <SectionTitle icon={Clock} text="Mensagens por hora do dia" right={periodLabel(period)} />
        <HourChart data={hourCounts} />
      </div>
    </div>
  )
}

// ─── Tab: Equipe ────────────────────────────────────────────────────────────
function EquipeTab({ msgs, convs, atts, users, sectors, sectorMembers, range, period, loading }) {
  const { from, to } = range

  // Ranking atendentes
  const ranking = useMemo(() => {
    return users.map(u => {
      const myMsgs = msgs.filter(x => (x.type || '').toLowerCase() === 'atendente' && inPeriod(x.created_at, from, to))
      // Filtrar mensagens do próprio atendente (assumimos que mensagens com type=atendente foram enviadas por algum atendente,
      // e a atribuição vem das attendances; usamos email como liga)
      const myAtts = atts.filter(a => a.attendant_email === u.email)
      const myAttsInPeriod = myAtts.filter(a => inPeriod(a.assumed_at, from, to))
      const myClosedSet = new Set(myAtts.map(a => a.numero))
      const myConvs = convs.filter(c => myClosedSet.has(c.session_id) && inPeriod(c.closed_at, from, to))
      // Mensagens enviadas pelo atendente: assumimos pela proximidade temporal de suas attendances
      const myNumeros = new Set(myAtts.map(a => a.numero))
      const sentMsgs = myMsgs.filter(m => myNumeros.has(m.numero)).length
      return {
        id: u.id, name: u.name, email: u.email,
        tickets: myAttsInPeriod.length,
        finalizados: myConvs.length,
        mensagens: sentMsgs,
      }
    }).sort((a, b) => b.tickets - a.tickets)
  }, [users, atts, convs, msgs, from, to])

  // Por setor
  const bySector = useMemo(() => {
    const map = {}
    atts.filter(a => inPeriod(a.assumed_at, from, to)).forEach(a => {
      const k = a.sector_name || 'Sem setor'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [atts, from, to])

  const totalAttsInPeriod = bySector.reduce((a, b) => a + b[1], 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Users} text="Ranking de atendentes" right={periodLabel(period)} />
          {ranking.length === 0 ? <Empty /> : (
            <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr><th>Atendente</th><th style={{ textAlign: 'right' }}>Tickets</th><th style={{ textAlign: 'right' }}>Finalizados</th><th style={{ textAlign: 'right' }}>Msgs</th></tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.id}>
                    <td className="td-name">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? '#FEF3C7' : '#EFF6FF', border: `1px solid ${i === 0 ? '#FDE68A' : '#BFDBFE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#D97706' : '#2563EB' }}>
                          {i === 0 ? '🏆' : r.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>{r.tickets}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{r.finalizados}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.mensagens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Layers} text="Atendimentos por setor" right={periodLabel(period)} />
          {bySector.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bySector.map(([name, count], i) => {
                const sector = sectors.find(s => s.name === name)
                const color = sector?.color || ORIGEM_COLORS[i % ORIGEM_COLORS.length]
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{name}</span>
                      <span style={{ fontWeight: 700, color }}>{count} ({Math.round(count / totalAttsInPeriod * 100)}%)</span>
                    </div>
                    <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / Math.max(...bySector.map(b => b[1]))) * 100}%`, background: color, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Agenda ────────────────────────────────────────────────────────────
function AgendaTab({ appts, range, period, loading }) {
  const { from, to } = range
  const inRange = appts.filter(a => inPeriod(a.starts_at, from, to))

  const counts = inRange.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc }, {})
  const total = inRange.length
  const noShow = counts.faltou || 0
  const cancelado = counts.cancelado || 0
  const taxaNoShow = total ? Math.round((noShow / total) * 100) : 0
  const taxaCancel = total ? Math.round((cancelado / total) * 100) : 0
  const taxaConfirm = total ? Math.round(((counts.confirmado || 0) + (counts.concluido || 0)) / total * 100) : 0

  const byAgenda = useMemo(() => {
    const map = {}
    inRange.forEach(a => {
      const name = a.agendas?.name || 'Sem nome'
      if (!map[name]) map[name] = { total: 0, color: a.agendas?.color || '#2563EB' }
      map[name].total++
    })
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [inRange])

  const byDayOfWeek = useMemo(() => {
    const arr = Array(7).fill(0)
    inRange.forEach(a => { const d = new Date(a.starts_at); if (!isNaN(d.getTime())) arr[d.getDay()]++ })
    return arr
  }, [inRange])
  const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Calendar size={18} color="#2563EB" />} bg="#EFF6FF" value={total} label="Total" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<CheckCircle2 size={18} color="#16A34A" />} bg="#F0FDF4" value={`${taxaConfirm}%`} label="Confirmação" sub="confirmado + concluído" loading={loading} />
        <KpiCard icon={<AlertCircle size={18} color="#D97706" />} bg="#FFFBEB" value={`${taxaNoShow}%`} label="Não compareceu" sub="contatos que não compareceram" loading={loading} alert={taxaNoShow > 15} />
        <KpiCard icon={<XCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={`${taxaCancel}%`} label="Cancelamento" sub="taxa de cancelamento" loading={loading} alert={taxaCancel > 20} />
      </div>

      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 14 }}>
        <SectionTitle icon={Flag} text="Distribuição por status" right={periodLabel(period)} />
        {total === 0 ? <Empty /> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(APPT_STATUS).map(([k, meta]) => {
              const v = counts[k] || 0
              return (
                <div key={k} style={{ flex: '1 1 130px', padding: '10px 14px', background: meta.color + '11', border: `1px solid ${meta.color}33`, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: meta.color, fontWeight: 700, textTransform: 'uppercase' }}>{meta.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: meta.color, marginTop: 2 }}>{v}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total ? Math.round(v / total * 100) : 0}% do total</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Calendar} text="Por agenda" right={periodLabel(period)} />
          {byAgenda.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byAgenda.map(([name, info]) => {
                const max = Math.max(...byAgenda.map(([, i]) => i.total))
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{name}</span>
                      <span style={{ fontWeight: 700, color: info.color }}>{info.total}</span>
                    </div>
                    <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(info.total / max) * 100}%`, background: info.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={BarChart2} text="Por dia da semana" right={periodLabel(period)} />
          {total === 0 ? <Empty /> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
              {byDayOfWeek.map((v, i) => {
                const max = Math.max(...byDayOfWeek)
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB' }}>{v || ''}</div>
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${max ? (v / max) * 100 : 0}%`, minHeight: v ? 4 : 0, background: '#2563EB', borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{dayLabels[i]}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Financeiro ────────────────────────────────────────────────────────
const FIN_COLORS = ['#059669','#2563EB','#7C3AED','#D97706','#DC2626','#0891B2','#DB2777','#6B7280']

function FinTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0F172A', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', fontSize: 12 }}>
      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', marginBottom: i < payload.length - 1 ? 3 : 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill }} />
          <span style={{ color: '#CBD5E1' }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: p.color || p.fill, marginLeft: 'auto' }}>{fmtMoney(typeof p.value === 'number' ? p.value : 0)}</span>
        </div>
      ))}
    </div>
  )
}

function addMonthsFin(cmStr, n) {
  const [y,m] = cmStr.split('-').map(Number)
  const d = new Date(y, m-1+n, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
const MON_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function monthLblFin(s) { return MON_PT[+s.split('-')[1]-1] }
function cmStrFin() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

function FinanceiroTab({ appts, professionals, procedures, finTx, finCats, range, period, loading }) {
  const { from, to } = range
  const inRange = appts.filter(a => inPeriod(a.starts_at, from, to))

  const faturado      = inRange.filter(a => a.payment_status === 'pago').reduce((s, a) => s + Number(a.price || 0), 0)
  const aReceber      = inRange.filter(a => a.payment_status === 'pendente' && a.status !== 'cancelado' && a.status !== 'faltou').reduce((s, a) => s + Number(a.price || 0), 0)
  const perdidoFaltas = inRange.filter(a => a.status === 'faltou').reduce((s, a) => s + Number(a.price || 0), 0)
  const concluidos    = inRange.filter(a => a.payment_status === 'pago').length
  const ticketMedio   = concluidos ? faturado / concluidos : 0
  const taxaConv      = inRange.length ? (concluidos / inRange.length * 100) : 0

  // Tendência diária de faturamento
  const dailyRevenue = useMemo(() => {
    const endD   = to   ? new Date(to.getFullYear(),   to.getMonth(),   to.getDate())   : new Date()
    const startD = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : new Date(endD.getTime() - 29 * 86400000)
    const days = []
    for (let d = new Date(startD); d <= endD; d = new Date(d.getTime() + 86400000)) {
      const ds = d.toISOString().slice(0, 10)
      const val = inRange.filter(a => (a.starts_at || '').slice(0, 10) === ds && a.payment_status === 'pago')
        .reduce((s, a) => s + Number(a.price || 0), 0)
      const rec = inRange.filter(a => (a.starts_at || '').slice(0, 10) === ds && a.payment_status === 'pendente' && a.status !== 'cancelado').length
      days.push({ label: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`, faturado: val, pendentes: rec })
      if (days.length >= 60) break
    }
    return days
  }, [inRange, from, to])

  // Por profissional
  const byProfessional = useMemo(() => {
    const map = {}
    inRange.filter(a => a.payment_status === 'pago').forEach(a => {
      const id = a.professional_id || 'sem'
      const pro = professionals.find(p => p.id === id)
      const name = pro?.name || (id === 'sem' ? 'Sem profissional' : 'Removido')
      const color = pro?.color || '#6B7280'
      if (!map[id]) map[id] = { name, color, value: 0, count: 0 }
      map[id].value += Number(a.price || 0)
      map[id].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [inRange, professionals])

  // Por procedimento
  const byProcedure = useMemo(() => {
    const map = {}
    inRange.filter(a => a.payment_status === 'pago').forEach(a => {
      const id = a.procedure_id || 'sem'
      const proc = procedures.find(p => p.id === id)
      const name = proc?.name || (id === 'sem' ? 'Sem serviço' : 'Removido')
      if (!map[id]) map[id] = { name, value: 0, count: 0 }
      map[id].value += Number(a.price || 0)
      map[id].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [inRange, procedures])

  const maxProc  = Math.max(1, ...byProcedure.map(x => x.value))

  const hasDailyData = dailyRevenue.some(d => d.faturado > 0)

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<DollarSign size={18} color="#059669" />} bg="#ECFDF5"  value={fmtMoney(faturado)}      label="Faturado"          sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<Clock      size={18} color="#D97706" />} bg="#FFFBEB"  value={fmtMoney(aReceber)}      label="A receber"         sub="agend. pendentes"    loading={loading} alert={aReceber > 0} />
        <KpiCard icon={<TrendingUp size={18} color="#2563EB" />} bg="#EFF6FF"  value={fmtMoney(ticketMedio)}   label="Ticket médio"      sub={`${concluidos} pagamentos`} loading={loading} />
        <KpiCard icon={<XCircle   size={18} color="#DC2626" />} bg="#FEF2F2"  value={fmtMoney(perdidoFaltas)} label="Perdido em faltas" sub="não compareceram" loading={loading} alert={perdidoFaltas > 0} />
        <KpiCard icon={<CheckCircle2 size={18} color="#0891B2" />} bg="#ECFEFF" value={`${taxaConv.toFixed(0)}%`} label="Taxa de conclusão" sub="agendamentos pagos"   loading={loading} />
        <KpiCard icon={<BarChart2 size={18} color="#7C3AED" />} bg="#F5F3FF"  value={inRange.length}          label="Total agendamentos"   sub={periodLabel(period)} loading={loading} />
      </div>

      {/* Tendência diária */}
      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 14 }}>
        <SectionTitle icon={TrendingUp} text="Faturamento diário" right={`${dailyRevenue.length} dias`} />
        {!hasDailyData ? <Empty /> : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={dailyRevenue} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="mGradF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#059669" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={44} />
              <ReTooltip content={<FinTooltip />} />
              <Area type="monotone" dataKey="faturado" stroke="#059669" fill="url(#mGradF)" strokeWidth={2} dot={false} name="Faturado" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Por profissional (BarChart) */}
      <div style={{ marginBottom: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Stethoscope} text="Por profissional" right={periodLabel(period)} />
          {byProfessional.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(byProfessional.length * 36, 120)}>
              <BarChart data={byProfessional} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barSize={14}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={110} />
                <ReTooltip content={<FinTooltip />} cursor={{ fill: '#F8FAFC' }} />
                <Bar dataKey="value" name="Faturado" radius={[0, 6, 6, 0]}>
                  {byProfessional.map((p, i) => (
                    <Cell key={i} fill={p.color || FIN_COLORS[i % FIN_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top serviços */}
      <div className="nx-card" style={{ padding: '1.25rem' }}>
        <SectionTitle icon={ListChecks} text="Top serviços" right={`${byProcedure.length} tipos`} />
        {byProcedure.length === 0 ? <Empty /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {byProcedure.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: FIN_COLORS[i % FIN_COLORS.length] + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: FIN_COLORS[i % FIN_COLORS.length] }}>#{i+1}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{p.name}</span>
                    <span style={{ fontWeight: 700, color: FIN_COLORS[i % FIN_COLORS.length], flexShrink: 0, marginLeft: 8 }}>{fmtMoney(p.value)}</span>
                  </div>
                  <div style={{ height: 5, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(p.value / maxProc) * 100}%`, background: FIN_COLORS[i % FIN_COLORS.length], borderRadius: 10, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{p.count}x · ticket {fmtMoney(p.value / p.count)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Módulo Financeiro (financial_transactions) ── */}
      {finTx.length > 0 && (() => {
        const todayStr = new Date().toISOString().slice(0, 10)
        const cm = cmStrFin()
        const catMap = {}; finCats.forEach(c => { catMap[c.id] = c })

        // Filtra lançamentos pelo período selecionado (ou tudo se 'todos')
        const txPeriod = finTx.filter(t => {
          if (!from && !to) return true
          const v = t.vencimento || ''
          return v >= (from ? from.toISOString().slice(0,10) : '0') && v <= (to ? to.toISOString().slice(0,10) : '9')
        })

        const recPagas  = txPeriod.filter(t => t.tipo==='receita' && t.status==='pago').reduce((s,t)=>s+parseFloat(t.valor||0),0)
        const despPagas = txPeriod.filter(t => t.tipo==='despesa' && t.status==='pago').reduce((s,t)=>s+parseFloat(t.valor||0),0)
        const recPend   = txPeriod.filter(t => t.tipo==='receita' && t.status==='pendente').reduce((s,t)=>s+parseFloat(t.valor||0),0)
        const despPend  = txPeriod.filter(t => t.tipo==='despesa' && t.status==='pendente').reduce((s,t)=>s+parseFloat(t.valor||0),0)
        const saldo     = recPagas - despPagas
        const inadimpl  = finTx.filter(t => t.tipo==='receita' && t.status==='pendente' && (t.vencimento||'') < todayStr).reduce((s,t)=>s+parseFloat(t.valor||0),0)

        // Últimos 6 meses (financial_transactions)
        const months6 = Array.from({length:6},(_,i)=>{
          const m = addMonthsFin(cm, i-5)
          const tx = finTx.filter(t => (t.vencimento||'').startsWith(m) && t.status!=='cancelado')
          let rec=0,desp=0,recR=0,despR=0
          tx.forEach(t=>{const v=parseFloat(t.valor||0);if(t.tipo==='receita'){rec+=v;if(t.status==='pago')recR+=v}else{desp+=v;if(t.status==='pago')despR+=v}})
          return {month: monthLblFin(m), rec, desp, recR, despR, saldo:recR-despR, isCurrent: m===cm}
        })
        const hasMonthData = months6.some(m=>m.rec>0||m.desp>0)

        // Top categorias de receita no período
        const byCatRec = {}
        txPeriod.filter(t=>t.tipo==='receita'&&t.status!=='cancelado').forEach(t=>{
          const k=t.categoria_id||'__sem__'
          if(!byCatRec[k]) byCatRec[k]={nome:catMap[k]?.nome||'Sem categoria',cor:catMap[k]?.cor||'#059669',val:0}
          byCatRec[k].val+=parseFloat(t.valor||0)
        })
        const catRec = Object.values(byCatRec).sort((a,b)=>b.val-a.val).slice(0,5)
        const maxCat = Math.max(1,...catRec.map(c=>c.val))

        // Top categorias de despesa
        const byCatDesp = {}
        txPeriod.filter(t=>t.tipo==='despesa'&&t.status!=='cancelado').forEach(t=>{
          const k=t.categoria_id||'__sem__'
          if(!byCatDesp[k]) byCatDesp[k]={nome:catMap[k]?.nome||'Sem categoria',cor:catMap[k]?.cor||'#E11D48',val:0}
          byCatDesp[k].val+=parseFloat(t.valor||0)
        })
        const catDesp = Object.values(byCatDesp).sort((a,b)=>b.val-a.val).slice(0,5)
        const maxCatD = Math.max(1,...catDesp.map(c=>c.val))

        return (
          <div style={{ marginTop: 20 }}>
            {/* Separador */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{flex:1, height:1, background:'#E2E8F0'}} />
              <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',background:'#0F172A',borderRadius:20}}>
                <DollarSign size={11} color="#fff"/>
                <span style={{fontSize:10,fontWeight:700,color:'#fff',letterSpacing:'0.08em',textTransform:'uppercase'}}>Módulo Financeiro · lançamentos</span>
              </div>
              <div style={{flex:1, height:1, background:'#E2E8F0'}} />
            </div>

            {/* KPIs financeiros */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(165px,1fr))',gap:12,marginBottom:14}}>
              {[
                {label:'Receita recebida',value:recPagas,  color:'#059669',bg:'#ECFDF5',icon:TrendingUp},
                {label:'Despesa paga',    value:despPagas, color:'#E11D48',bg:'#FFF1F2',icon:TrendingUp},
                {label:'Saldo do período',value:saldo,     color:saldo>=0?'#2563EB':'#E11D48',bg:saldo>=0?'#EFF6FF':'#FFF1F2',icon:DollarSign},
                {label:'A receber',       value:recPend,   color:'#0891B2',bg:'#ECFEFF',icon:Clock},
                {label:'A pagar',         value:despPend,  color:'#D97706',bg:'#FFFBEB',icon:Clock},
                {label:'Inadimplência',   value:inadimpl,  color:'#DC2626',bg:'#FEF2F2',icon:AlertCircle},
              ].map(k=>(
                <div key={k.label} className="nx-card" style={{padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:10,borderLeft:`3px solid ${k.color}`}}>
                  <div style={{width:30,height:30,borderRadius:8,background:k.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <k.icon size={14} color={k.color}/>
                  </div>
                  <div>
                    <div style={{fontSize:9.5,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:3}}>{k.label}</div>
                    <div style={{fontSize:15,fontWeight:800,color:k.color,lineHeight:1}}>{fmtMoney(k.value)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trend 6 meses + categorias */}
            <div style={{display:'grid',gridTemplateColumns:'1.2fr 0.8fr 0.8fr',gap:14}}>
              {/* Bar chart 6 meses */}
              <div className="nx-card" style={{padding:'1.25rem'}}>
                <SectionTitle icon={BarChart2} text="Receita × Despesa · 6 meses" right="lançamentos" />
                {!hasMonthData ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={months6} margin={{top:4,right:4,left:-20,bottom:0}} barGap={2} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                      <XAxis dataKey="month" tick={{fontSize:9,fill:'#94A3B8'}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:9,fill:'#94A3B8'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v} width={36}/>
                      <ReTooltip content={<FinTooltip />}/>
                      <Bar dataKey="recR"  name="Receita"  fill="#059669" radius={[3,3,0,0]}/>
                      <Bar dataKey="despR" name="Despesa"  fill="#E11D48" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Categorias receita */}
              <div className="nx-card" style={{padding:'1.25rem'}}>
                <SectionTitle icon={TrendingUp} text="Receitas por categoria" right={periodLabel(period)}/>
                {catRec.length===0 ? <Empty/> : catRec.map((c,i)=>(
                  <div key={i} style={{marginBottom:9}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                      <span style={{fontWeight:600,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:100}}>{c.nome}</span>
                      <span style={{fontWeight:700,color:c.cor,flexShrink:0,marginLeft:6}}>{fmtMoney(c.val)}</span>
                    </div>
                    <div style={{height:5,background:'#F1F5F9',borderRadius:6,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${(c.val/maxCat)*100}%`,background:c.cor,borderRadius:6,transition:'width 0.4s'}}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Categorias despesa */}
              <div className="nx-card" style={{padding:'1.25rem'}}>
                <SectionTitle icon={XCircle} text="Despesas por categoria" right={periodLabel(period)}/>
                {catDesp.length===0 ? <Empty/> : catDesp.map((c,i)=>(
                  <div key={i} style={{marginBottom:9}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                      <span style={{fontWeight:600,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:100}}>{c.nome}</span>
                      <span style={{fontWeight:700,color:c.cor,flexShrink:0,marginLeft:6}}>{fmtMoney(c.val)}</span>
                    </div>
                    <div style={{height:5,background:'#F1F5F9',borderRadius:6,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${(c.val/maxCatD)*100}%`,background:c.cor,borderRadius:6,transition:'width 0.4s'}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Tab: Leads ─────────────────────────────────────────────────────────────
function cleanPhone(p) {
  return (p || '').replace(/@.*$/, '').replace(/\D/g, '')
}

function LeadsTab({ leads, appts, msgs, range, period, loading, contactsTable }) {
  const { from, to } = range
  const navigate = useNavigate()
  const [drillOrigin, setDrillOrigin] = useState(null)
  if (!contactsTable) {
    return <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Tabela de contatos não configurada.</div>
  }
  const filtered = leads.filter(l => inPeriod(l.created_at, from, to) || (!from && !to))

  // Index appointments por telefone (clean)
  const apptsByPhone = useMemo(() => {
    const map = {}
    appts.forEach(a => {
      const p = cleanPhone(a.patient_phone)
      if (!p) return
      if (!map[p]) map[p] = []
      map[p].push(a)
    })
    return map
  }, [appts])

  // Detecta agendamento por palavras-chave nas mensagens enviadas pelo sistema/IA
  const msgApptPhones = useMemo(() => {
    const KEYWORDS = /agendad[oa]|agendamento\s+confirm|hor[aá]rio\s+(foi\s+)?(marcad|confirm|agendad)|seu\s+hor[aá]rio|consulta\s+agendad/i
    const s = new Set()
    msgs.forEach(m => {
      const t = (m.type || '').toLowerCase()
      if (t !== 'ia' && t !== 'humano' && t !== 'bot') return
      if (KEYWORDS.test(m.mensagem || '')) {
        s.add(cleanPhone(m.numero))
      }
    })
    return s
  }, [msgs])

  // Index leads → appointments
  const leadsWithAppt = useMemo(() => {
    return filtered.map(l => {
      const phone = cleanPhone(l.numero)
      const myAppts = apptsByPhone[phone] || []
      const hasAppt = myAppts.length > 0 || msgApptPhones.has(phone)
      const concluded = myAppts.filter(a => a.status === 'concluido')
      const revenue = concluded.reduce((s, a) => s + Number(a.price || 0), 0)
      return { ...l, appts: myAppts, hasAppt, concluded: concluded.length, revenue }
    })
  }, [filtered, apptsByPhone, msgApptPhones])

  const totalLeads    = filtered.length
  const comContato    = filtered.filter(l => l.primeiro_contato === 'sim').length
  const semResposta   = filtered.filter(l => l.primeiro_contato === 'sim' && !l.ultima_mensagem).length
  const comUltimaMsg  = filtered.filter(l => !!l.ultima_mensagem).length
  const agendaram     = leadsWithAppt.filter(l => l.hasAppt).length
  const concluiram    = leadsWithAppt.filter(l => l.concluded > 0).length
  const receitaTotal  = leadsWithAppt.reduce((s, l) => s + l.revenue, 0)
  const conversao     = totalLeads ? (agendaram / totalLeads * 100) : 0
  const ticketMedio   = concluiram ? (receitaTotal / concluiram) : 0

  // Tempo médio até primeiro contato (mensagem mais antiga - lead.created_at)
  const tempoMedioContato = useMemo(() => {
    const msgsByPhone = {}
    msgs.forEach(m => {
      if ((m.type || '').toLowerCase() !== 'cliente') return
      const p = cleanPhone(m.numero)
      const ts = new Date(m.created_at).getTime()
      if (!msgsByPhone[p] || ts < msgsByPhone[p]) msgsByPhone[p] = ts
    })
    let totalMs = 0, count = 0
    filtered.forEach(l => {
      const p = cleanPhone(l.numero)
      const firstMsg = msgsByPhone[p]
      const created = new Date(l.created_at).getTime()
      if (firstMsg && created && firstMsg >= created) {
        totalMs += (firstMsg - created)
        count++
      }
    })
    return count ? totalMs / count : 0
  }, [filtered, msgs])

  // Origem com conversão (agrupada por valor canônico — case/variações fundem)
  const origens = useMemo(() => {
    const map = {}
    leadsWithAppt.forEach(l => {
      const k = normalizeOrigem(l.origem)
      if (!map[k]) map[k] = { name: k, total: 0, agendaram: 0, concluidas: 0, receita: 0 }
      map[k].total++
      if (l.hasAppt) map[k].agendaram++
      map[k].concluidas += l.concluded
      map[k].receita += l.revenue
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [leadsWithAppt])

  // Classificação — mostra todos os 5 status auto na ordem do funil, mesmo zerados
  const classifMap = useMemo(() => {
    const map = {}
    filtered.forEach(l => {
      const k = l.classificacao_lead || 'novo'
      map[k] = (map[k] || 0) + 1
    })
    // Garante que os 5 status auto apareçam mesmo com 0 (na ordem do funil)
    const ordered = STATUS_ORDER.map(s => [s, map[s] || 0])
    // Adiciona valores legados (Curioso, Quente, etc) no final
    Object.entries(map).forEach(([k, v]) => {
      if (!STATUS_ORDER.includes(k)) ordered.push([k, v])
    })
    return ordered
  }, [filtered])
  const maxClassif = Math.max(1, ...classifMap.map(([, v]) => v))

  // Volume diário (últimos 14 dias ou range completo)
  const dailyVolume = useMemo(() => {
    const days = []
    const end = to || new Date()
    const start = from || new Date(Date.now() - 13 * 86400000)
    const dayMs = 86400000
    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + dayMs)) {
      const next = new Date(d.getTime() + dayMs)
      const dayLeads = filtered.filter(l => {
        const c = new Date(l.created_at)
        return c >= d && c < next
      }).length
      days.push({ date: new Date(d), count: dayLeads })
      if (days.length > 60) break
    }
    return days
  }, [filtered, from, to])
  const maxDaily = Math.max(1, ...dailyVolume.map(d => d.count))

  // Leads sem resposta — actionable
  const sleepingLeads = useMemo(() => {
    return filtered
      .filter(l => l.primeiro_contato === 'sim' && !l.ultima_mensagem)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
  }, [filtered])

  // ── Meta Ads ────────────────────────────────────────────────────────────────
  const adPagos     = useMemo(() => filtered.filter(l => !!l.ad_click_id), [filtered])
  const adOrganicos = useMemo(() => filtered.filter(l => !l.ad_click_id), [filtered])

  const adConversaoPagos = adPagos.length
    ? (leadsWithAppt.filter(l => !!l.ad_click_id && l.hasAppt).length / adPagos.length * 100)
    : 0

  const adTopCampanhas = useMemo(() => {
    const map = {}
    adPagos.forEach(l => {
      const k = l.ad_title || l.ad_headline || '(sem nome)'
      if (!map[k]) map[k] = { nome: k, total: 0, plataforma: l.ad_platform || '' }
      map[k].total++
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [adPagos])

  const PERIODOS = [
    { label: 'Madrugada', icon: '🌙', range: [0, 6] },
    { label: 'Manhã',     icon: '☀️', range: [6, 12] },
    { label: 'Tarde',     icon: '🌤️', range: [12, 18] },
    { label: 'Noite',     icon: '🌆', range: [18, 24] },
  ]
  const adPorPeriodo = useMemo(() => {
    return PERIODOS.map(p => {
      const [h0, h1] = p.range
      const inRange = l => {
        const h = new Date(l.created_at).getHours()
        return h >= h0 && h < h1
      }
      return {
        ...p,
        pagos: adPagos.filter(inRange).length,
        organicos: adOrganicos.filter(inRange).length,
      }
    })
  }, [adPagos, adOrganicos])

  function fmtAge(ts) {
    const ms = Date.now() - new Date(ts).getTime()
    const hours = Math.floor(ms / 3600000)
    if (hours < 1) return `${Math.floor(ms / 60000)}min`
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }
  function fmtMsCurta(ms) {
    if (!ms) return '—'
    const h = Math.floor(ms / 3600000)
    if (h < 1) return `${Math.floor(ms / 60000)}min`
    if (h < 24) return `${h}h ${Math.floor((ms % 3600000) / 60000)}min`
    return `${Math.floor(h / 24)}d ${h % 24}h`
  }

  return (
    <div>
      {/* KPIs — 6 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Users size={18} color="#2563EB" />} bg="#EFF6FF" value={totalLeads} label="Total de leads" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<MessageSquare size={18} color="#16A34A" />} bg="#F0FDF4" value={comContato} label="Leads contactados" sub={`${totalLeads ? Math.round(comContato / totalLeads * 100) : 0}% do total`} loading={loading} />
        <KpiCard icon={<Calendar size={18} color="#7C3AED" />} bg="#F5F3FF" value={agendaram} label="Viraram agendamento" sub={`${conversao.toFixed(1)}% de conversão`} loading={loading} />
        <KpiCard icon={<DollarSign size={18} color="#059669" />} bg="#ECFDF5" value={fmtMoney(receitaTotal)} label="Receita atribuída" sub={`ticket médio ${fmtMoney(ticketMedio)}`} loading={loading} />
        <KpiCard icon={<Clock size={18} color="#0891B2" />} bg="#ECFEFF" value={fmtMsCurta(tempoMedioContato)} label="Tempo até 1º contato" sub="lead → 1ª mensagem" loading={loading} />
        <KpiCard icon={<Inbox size={18} color="#F59E0B" />} bg="#FFFBEB" value={semResposta} label="Sem resposta" sub="aguardando retorno" loading={loading} alert={semResposta > 0} />
      </div>

      {/* Funil */}
      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 14 }}>
        <SectionTitle icon={TrendingUp} text="Funil de conversão" right={periodLabel(period)} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, alignItems: 'stretch', marginTop: 12 }}>
          {[
            { lbl: 'Leads recebidos',     val: totalLeads,    color: '#2563EB', bg: '#EFF6FF' },
            { lbl: 'Contactados',         val: comContato,    color: '#0891B2', bg: '#ECFEFF' },
            { lbl: 'Trocaram msg',        val: comUltimaMsg,  color: '#7C3AED', bg: '#F5F3FF' },
            { lbl: 'Agendaram',           val: agendaram,     color: '#D97706', bg: '#FFFBEB' },
            { lbl: 'Compareceram',        val: concluiram,    color: '#16A34A', bg: '#F0FDF4' },
          ].map((s, i, arr) => {
            const pct = totalLeads ? (s.val / totalLeads * 100) : 0
            const prev = i > 0 ? arr[i - 1].val : null
            const stepConv = prev && prev > 0 ? (s.val / prev * 100) : null
            return (
              <div key={s.lbl} style={{
                background: s.bg, borderRadius: 10, padding: '14px 12px',
                display: 'flex', flexDirection: 'column', gap: 4,
                position: 'relative', minHeight: 96,
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: s.color }}>
                  {String(i + 1).padStart(2, '0')} · {s.lbl}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.02em' }}>
                  {s.val}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {pct.toFixed(1)}% do topo
                </div>
                {stepConv !== null && (
                  <div style={{ fontSize: 10, color: stepConv >= 50 ? '#16A34A' : stepConv >= 25 ? '#D97706' : '#DC2626', fontWeight: 700, marginTop: 'auto' }}>
                    ↳ {stepConv.toFixed(1)}% da etapa anterior
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Volume diário (sparkline) */}
      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 14 }}>
        <SectionTitle icon={BarChart2} text="Volume diário de novos leads" right={`${dailyVolume.length} dias`} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, marginTop: 16, paddingBottom: 24, position: 'relative' }}>
          {dailyVolume.map((d, i) => {
            const h = d.count === 0 ? 2 : Math.max(4, (d.count / maxDaily) * 90)
            const isToday = new Date().toDateString() === d.date.toDateString()
            return (
              <div key={i} style={{
                flex: 1, height: `${h}%`,
                background: isToday ? 'linear-gradient(180deg, #2563EB, #1D4ED8)' : (d.count > 0 ? '#3B82F6' : '#E5E7EB'),
                borderRadius: '4px 4px 0 0',
                position: 'relative',
                cursor: 'pointer',
              }}
              title={`${d.date.toLocaleDateString('pt-BR')} — ${d.count} leads`}>
                {d.count > 0 && d.count === maxDaily && (
                  <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: '#1D4ED8' }}>{d.count}</div>
                )}
              </div>
            )
          })}
        </div>
        {dailyVolume.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8', marginTop: 6 }}>
            <span>{dailyVolume[0]?.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
            <span>{dailyVolume[dailyVolume.length - 1]?.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
          </div>
        )}
      </div>

      {/* Origem com conversão (tabela rica) */}
      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 14 }}>
        <SectionTitle icon={BarChart2} text="Origens — qual canal mais converte?" right={`${origens.length} canais`} />
        {origens.length === 0 ? <Empty /> : (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 100px 120px 1fr', gap: 8, padding: '8px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>
              <div>Canal</div>
              <div style={{ textAlign: 'right' }}>Leads</div>
              <div style={{ textAlign: 'right' }}>Agendou</div>
              <div style={{ textAlign: 'right' }}>Conv.</div>
              <div style={{ textAlign: 'right' }}>Receita</div>
              <div></div>
            </div>
            {origens.map((o, i) => {
              const conv = o.total ? (o.agendaram / o.total * 100) : 0
              const color = ORIGEM_COLORS[i % ORIGEM_COLORS.length]
              const isSelected = drillOrigin === o.name
              return (
                <div key={o.name} onClick={() => setDrillOrigin(isSelected ? null : o.name)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 100px 120px 1fr', gap: 8, padding: '10px 12px', alignItems: 'center', borderBottom: '1px solid #F8FAFC', fontSize: 12.5, cursor: 'pointer', background: isSelected ? '#EFF6FF' : undefined, transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {o.name}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 700 }}>{o.total}</div>
                  <div style={{ textAlign: 'right', color: '#7C3AED', fontWeight: 600 }}>{o.agendaram}</div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: conv >= 30 ? '#F0FDF4' : conv >= 15 ? '#FFFBEB' : '#FEF2F2',
                      color: conv >= 30 ? '#16A34A' : conv >= 15 ? '#D97706' : '#DC2626',
                    }}>{conv.toFixed(0)}%</span>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.receita)}</div>
                  <div style={{ height: 6, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(o.total / origens[0].total * 100)}%`, background: color }} />
                  </div>
                </div>
              )
            })}
            {drillOrigin && (() => {
              const drillLeads = leadsWithAppt.filter(l => normalizeOrigem(l.origem) === drillOrigin)
              return (
                <div style={{ marginTop: 12, borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>
                    {drillOrigin} — {drillLeads.length} leads
                  </div>
                  {drillLeads.map(l => {
                    const phone = cleanPhone(l.numero)
                    const dias = Math.floor((Date.now() - new Date(l.created_at)) / 86400000)
                    return (
                      <div key={l.id || l.numero} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #F8FAFC', fontSize: 12 }}>
                        <span style={{ flex: 1, fontWeight: 600 }}>{l.nome || phone}</span>
                        <span style={{ color: '#94A3B8', fontSize: 11 }}>{phone}</span>
                        <span style={{ color: '#94A3B8', fontSize: 11 }}>{dias}d</span>
                        {l.hasAppt && <span style={{ fontSize: 10, fontWeight: 700, background: '#F0FDF4', color: '#16A34A', borderRadius: 4, padding: '2px 6px' }}>Agendou</span>}
                        <button onClick={e => { e.stopPropagation(); navigate('/painel/conversas?contact=' + phone) }}
                          style={{ fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                          Ver conversa →
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* Classificação + Sem resposta — 2 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle
            icon={Flag}
            text="Status do lead (auto)"
            right={<span title="Classificação automática baseada no fluxo: novo (sem resposta) → em atendimento (IA/humano respondeu) → agendado → encerrado/perdido" style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>auto</span>}
          />
          {classifMap.length === 0 ? <Empty /> : classifMap.map(([k, v]) => {
            const cs = CLASSIF_COLORS[k] || { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' }
            const label = cs.label || k
            const pct = totalLeads ? (v / totalLeads * 100) : 0
            return (
              <div key={k} style={{ marginBottom: 10, opacity: v === 0 ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: cs.color, background: cs.bg, border: `1px solid ${cs.border}`, borderRadius: 20, padding: '2px 10px', fontSize: 11 }}>{label}</span>
                  <span style={{ fontWeight: 700 }}>{v} <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 11 }}>({pct.toFixed(0)}%)</span></span>
                </div>
                <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(v / maxClassif) * 100}%`, background: cs.color, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle
            icon={AlertCircle}
            text="Leads sem resposta — ação recomendada"
            right={sleepingLeads.length > 0 ? <span style={{ color: '#DC2626', fontWeight: 700 }}>{sleepingLeads.length} pendentes</span> : <span>tudo em dia</span>}
          />
          {sleepingLeads.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#16A34A', fontSize: 13, fontWeight: 600 }}>
              <CheckCircle2 size={20} style={{ marginBottom: 6 }} /><br />
              Sem leads pendentes nesse período
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {sleepingLeads.map(l => {
                const age = fmtAge(l.created_at)
                const urgent = (Date.now() - new Date(l.created_at).getTime()) > 86400000 * 2 // > 2 dias
                return (
                  <div key={l.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: urgent ? '#FEF2F2' : '#FFFBEB',
                    border: `1px solid ${urgent ? '#FECACA' : '#FDE68A'}`,
                    borderRadius: 8, padding: '8px 12px', fontSize: 12.5,
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: urgent ? '#DC2626' : '#D97706',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{(l.nome || '?').charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nome || cleanPhone(l.numero)}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        {l.origem ? `via ${l.origem} · ` : ''}aguardando há {age}
                      </div>
                    </div>
                    {urgent && (
                      <span style={{ background: '#DC2626', color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Urgente</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Meta Ads ─────────────────────────────────────────────────────── */}
      {(adPagos.length > 0 || adOrganicos.length > 0) && (
        <div style={{ marginTop: 14 }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#1877F2,#E1306C)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.17 6.35L14.5 11.5h2l-4 5.5V13h-2l4-5.5v1.85h-1.83z"/></svg>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Meta Ads · Pago × Orgânico</div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8' }}>{adPagos.length + adOrganicos.length} leads no período</span>
          </div>

          {/* 3 KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Leads pagos',      value: adPagos.length,     sub: `${totalLeads ? Math.round(adPagos.length/totalLeads*100) : 0}% do total`, color: '#1877F2', bg: '#EFF6FF', border: '#BFDBFE' },
              { label: 'Leads orgânicos',  value: adOrganicos.length, sub: `${totalLeads ? Math.round(adOrganicos.length/totalLeads*100) : 0}% do total`, color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
              { label: 'Conversão pago',   value: `${adConversaoPagos.toFixed(0)}%`, sub: 'pagos → agendamento', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
            ].map(c => (
              <div key={c.label} className="nx-card" style={{ padding: '14px 16px', border: `1px solid ${c.border}`, background: c.bg }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.color, marginTop: 4 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* barra pago × orgânico */}
          {(adPagos.length + adOrganicos.length) > 0 && (() => {
            const tot = adPagos.length + adOrganicos.length
            const pctPago = (adPagos.length / tot * 100).toFixed(1)
            const pctOrg  = (adOrganicos.length / tot * 100).toFixed(1)
            return (
              <div className="nx-card" style={{ padding: '1rem 1.25rem', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: '#1877F2' }}>⬤ Pago {pctPago}%</span>
                  <span style={{ color: '#16A34A' }}>Orgânico {pctOrg}% ⬤</span>
                </div>
                <div style={{ height: 10, borderRadius: 8, overflow: 'hidden', display: 'flex', background: '#F1F5F9' }}>
                  <div style={{ width: `${pctPago}%`, background: 'linear-gradient(90deg,#1877F2,#3B9EFF)', transition: 'width 0.4s' }} />
                  <div style={{ flex: 1, background: 'linear-gradient(90deg,#22C55E,#16A34A)', transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Top campanhas */}
            <div className="nx-card" style={{ padding: '1.25rem' }}>
              <SectionTitle icon={BarChart2} text="Top campanhas · criativo" right={`${adTopCampanhas.length} campanhas`} />
              {adTopCampanhas.length === 0 ? <Empty /> : adTopCampanhas.map((c, i) => {
                const maxC = adTopCampanhas[0].total
                const colors = ['#1877F2','#3B82F6','#60A5FA','#93C5FD','#BFDBFE']
                return (
                  <div key={c.nome} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#0F172A', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                        <span style={{ fontSize: 10, color: '#94A3B8', marginRight: 4 }}>#{i+1}</span>{c.nome}
                      </span>
                      <span style={{ fontWeight: 700, color: colors[i], flexShrink: 0 }}>{c.total}</span>
                    </div>
                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(c.total/maxC)*100}%`, background: colors[i], borderRadius: 10, transition: 'width 0.3s' }} />
                    </div>
                    {c.plataforma && (
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{c.plataforma}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Quando os leads chegam */}
            <div className="nx-card" style={{ padding: '1.25rem' }}>
              <SectionTitle icon={BarChart2} text="Quando os leads chegam" right="pago × orgânico" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {adPorPeriodo.map(p => {
                  const tot = p.pagos + p.organicos
                  const pctPago = tot ? Math.round(p.pagos / tot * 100) : 0
                  return (
                    <div key={p.label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 13, marginBottom: 2 }}>{p.icon} <span style={{ fontWeight: 700, color: '#0F172A', fontSize: 12 }}>{p.label}</span></div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>{tot}</div>
                      <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>leads no período</div>
                      {tot > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ height: 5, borderRadius: 6, overflow: 'hidden', display: 'flex', background: '#E2E8F0' }}>
                            <div style={{ width: `${pctPago}%`, background: '#1877F2', transition: 'width 0.3s' }} />
                            <div style={{ flex: 1, background: '#22C55E' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, marginTop: 3, color: '#94A3B8', fontWeight: 600 }}>
                            <span style={{ color: '#1877F2' }}>{p.pagos} pago</span>
                            <span style={{ color: '#16A34A' }}>{p.organicos} org.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Atividades ────────────────────────────────────────────────────────
function AtividadesTab({ kanbanCards, kanbanColumns, users, range, period, loading }) {
  const { from, to } = range
  const cards = kanbanCards
  const inPeriodCards = cards.filter(c => inPeriod(c.created_at, from, to) || (!from && !to))
  const total = inPeriodCards.length
  const atrasados = cards.filter(c => c.due_date && new Date(`${c.due_date}T23:59:59`) < new Date()).length
  const semAtribuir = cards.filter(c => !c.assigned_user_id).length
  const urgentes = cards.filter(c => c.priority === 'urgente').length

  const byColumn = useMemo(() => {
    return kanbanColumns.map(col => ({
      name: col.name,
      color: col.color,
      count: cards.filter(c => c.column_id === col.id).length,
    })).sort((a, b) => b.count - a.count)
  }, [kanbanColumns, cards])

  const byUser = useMemo(() => {
    const map = {}
    cards.forEach(c => {
      const k = c.assigned_user_name || 'Sem atribuição'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [cards])

  const byPriority = useMemo(() => {
    const map = {}
    cards.forEach(c => { map[c.priority || 'normal'] = (map[c.priority || 'normal'] || 0) + 1 })
    return ['urgente', 'alta', 'normal', 'baixa'].map(p => [p, map[p] || 0])
  }, [cards])

  const maxCol = Math.max(1, ...byColumn.map(c => c.count))
  const maxUser = Math.max(1, ...byUser.map(([, v]) => v))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Kanban size={18} color="#2563EB" />} bg="#EFF6FF" value={cards.length} label="Total de cards" sub="todos os cards" loading={loading} />
        <KpiCard icon={<AlertCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={atrasados} label="Atrasados" sub="data vencida" loading={loading} alert={atrasados > 0} />
        <KpiCard icon={<Flag size={18} color="#D97706" />} bg="#FFFBEB" value={urgentes} label="Urgentes" sub="prioridade urgente" loading={loading} alert={urgentes > 0} />
        <KpiCard icon={<Users size={18} color="#6B7280" />} bg="#F3F4F6" value={semAtribuir} label="Sem atribuição" sub="aguardando designação" loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Layers} text="Por coluna" right="todas" />
          {byColumn.length === 0 ? <Empty /> : byColumn.map(col => (
            <div key={col.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{col.name}</span>
                <span style={{ fontWeight: 700, color: col.color }}>{col.count}</span>
              </div>
              <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(col.count / maxCol) * 100}%`, background: col.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Users} text="Por atendente" right="todos" />
          {byUser.length === 0 ? <Empty /> : byUser.map(([name, count], i) => (
            <div key={name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{name}</span>
                <span style={{ fontWeight: 700, color: ORIGEM_COLORS[i % ORIGEM_COLORS.length] }}>{count}</span>
              </div>
              <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(count / maxUser) * 100}%`, background: ORIGEM_COLORS[i % ORIGEM_COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="nx-card" style={{ padding: '1.25rem', marginTop: 14 }}>
        <SectionTitle icon={Flag} text="Por prioridade" right="todos" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {byPriority.map(([k, v]) => {
            const meta = PRIORITY_META[k]
            return (
              <div key={k} style={{ padding: '10px 12px', background: meta.color + '11', border: `1px solid ${meta.color}33`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: meta.color, fontWeight: 700, textTransform: 'uppercase' }}>{meta.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: meta.color, marginTop: 2 }}>{v}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ─────────────────────────────────────────────────
function KpiCard({ icon, bg, value, label, sub, loading, alert }) {
  return (
    <div className="nx-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        {alert && <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 8px' }}>Atenção</span>}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{loading ? '—' : value}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, text, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <Icon size={15} color="#2563EB" />
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{text}</div>
      {right && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{right}</span>}
    </div>
  )
}

function Empty() {
  return <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Sem dados</div>
}

function BarTimeline({ data }) {
  if (data.length === 0) return <Empty />
  const max = Math.max(...data.map(d => d[1]))
  const BAR_H = 90
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {data.map(([k, v]) => (
          <div key={k} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#2563EB', minWidth: 0 }}>{v}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: BAR_H }}>
        {data.map(([k, v]) => (
          <div key={k} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', minWidth: 0 }}>
            <div style={{ width: '100%', height: `${Math.max((v / max) * 100, 5)}%`, background: '#2563EB', borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
        {data.map(([k]) => (
          <div key={k} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</div>
        ))}
      </div>
    </div>
  )
}

function HourChart({ data }) {
  const max = Math.max(...data, 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div title={`${i}h: ${v} mensagens`} style={{
              width: '100%',
              height: `${Math.max((v / max) * 100, v ? 4 : 0)}%`,
              background: v > max * 0.7 ? '#DC2626' : v > max * 0.4 ? '#D97706' : '#2563EB',
              borderRadius: '3px 3px 0 0', opacity: v ? 0.85 : 0.2,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
        {data.map((_, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>{i % 3 === 0 ? `${i}h` : ''}</div>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ data }) {
  const total = data.reduce((a, b) => a + b.value, 0)
  if (total === 0) return null
  const SIZE = 120
  const RADIUS = 50
  const CIRC = 2 * Math.PI * RADIUS
  let acc = 0
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#F1F5F9" strokeWidth={14} />
      {data.map((d, i) => {
        const portion = d.value / total
        const dash = portion * CIRC
        const offset = -acc * CIRC
        acc += portion
        return (
          <circle key={i}
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none" stroke={d.color} strokeWidth={14}
            strokeDasharray={`${dash} ${CIRC - dash}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dasharray 0.4s' }}
          />
        )
      })}
      <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: '#0F172A' }}>{total}</text>
      <text x={SIZE / 2} y={SIZE / 2 + 12} textAnchor="middle" style={{ fontSize: 10, fill: '#64748B' }}>total</text>
    </svg>
  )
}
