import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  Plus, Edit2, Trash2, Check, X, Search, Loader2, Lock, Calendar,
  AlertTriangle, ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react'

// ─── Fonts ───────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');`

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  emerald:    '#059669',
  emeraldDim: '#D1FAE5',
  rose:       '#E11D48',
  roseDim:    '#FFE4E6',
  navy:       '#0F172A',
  blue:       '#2563EB',
  blueDim:    '#EFF6FF',
  slate:      '#475569',
  muted:      '#94A3B8',
  border:     '#E2E8F0',
  bg:         '#F8FAFC',
  card:       '#FFFFFF',
}

const sora  = { fontFamily: '"Sora", sans-serif' }
const mono  = { fontFamily: '"DM Mono", monospace' }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtBRL(val, compact = false) {
  const n = parseFloat(val) || 0
  if (compact && Math.abs(n) >= 1000) {
    const k = n / 1000
    return `R$ ${k.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
  }
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function fmtDateBR(s) {
  if (!s) return '—'
  const [y,m,d] = s.split('-')
  return `${d}/${m}/${y}`
}
function monthLabel(s) {
  const [,m] = s.split('-')
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]
}
function monthLabelFull(s) {
  const [y,m] = s.split('-')
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][+m-1]+' '+y
}
function addMonths(s, n) {
  const [y,m] = s.split('-').map(Number)
  const d = new Date(y, m-1+n, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function addMonthsToDate(ds, n) {
  const [y,m,d] = ds.split('-').map(Number)
  const dt = new Date(y, m-1+n, d)
  const last = new Date(dt.getFullYear(), dt.getMonth()+1, 0).getDate()
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`
}
function isOverdue(v, s) { return s === 'pendente' && v < todayStr() }
function daysDiff(ds) {
  return Math.floor((new Date(todayStr()+'T00:00:00') - new Date(ds+'T00:00:00')) / 86400000)
}
const pct = (a,b) => b > 0 ? ((a/b)*100).toFixed(1)+'%' : '—'

const FORMAS = ['PIX','Dinheiro','Cartão Débito','Cartão Crédito','Boleto','Crediário','Transferência','Cheque']
const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ─── Custom recharts tooltip ──────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.navy, border: 'none', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', ...sora }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fff', marginBottom: i < payload.length-1 ? 3 : 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ color: '#CBD5E1', minWidth: 70 }}>{p.name}</span>
          <span style={{ ...mono, fontWeight: 500, color: p.color }}>{fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Label style ─────────────────────────────────────────────────────────────
const lbl = { display: 'block', fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em', ...sora }
const STATUS_MAP = {
  pendente:  { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', label: 'Pendente' },
  pago:      { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', label: 'Pago' },
  cancelado: { bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1', label: 'Cancelado' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon, color, bg, loading, delta }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.25rem 1.4rem', display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1, minWidth: 155, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, borderRadius: '0 0 0 80px', background: bg, opacity: 0.5 }} />
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, ...sora }}>{label}</div>
        {loading
          ? <div style={{ height: 28, width: 100, background: '#F1F5F9', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
          : <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1, ...mono }}>{fmtBRL(value)}</div>
        }
        {delta != null && !loading && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4, ...sora }}>este mês</div>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pendente
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', ...sora }}>
      {s.label}
    </span>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: on ? C.blue : C.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

function NavBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.muted, transition: 'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = '#fff' }}
      onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.muted }}>
      {children}
    </button>
  )
}

function TxRow({ tx, catMap, onPaid, onEdit, onDelete, showDays, last }) {
  const cat = catMap[tx.categoria_id]
  const over = isOverdue(tx.vencimento, tx.status)
  const days = showDays ? daysDiff(tx.vencimento) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: over ? '#FFF7ED' : C.card, borderBottom: last ? 'none' : `1px solid ${C.border}`, transition: 'background 0.1s' }}
      onMouseEnter={e => { if (!over) e.currentTarget.style.background = C.bg }}
      onMouseLeave={e => { e.currentTarget.style.background = over ? '#FFF7ED' : C.card }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: cat?.cor || (tx.tipo === 'receita' ? C.emerald : C.rose) }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: over ? '#92400E' : C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, ...sora }}>{tx.descricao}</span>
          {over && <span style={{ fontSize: 9, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 7px', textTransform: 'uppercase', flexShrink: 0 }}>Vencido</span>}
          {tx.recorrente && <span style={{ fontSize: 9, fontWeight: 700, background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE', borderRadius: 20, padding: '2px 7px', textTransform: 'uppercase', flexShrink: 0 }}>Recorrente</span>}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', ...sora }}>
          {tx.contact_nome && <span>{tx.contact_nome}</span>}
          {cat && <span style={{ color: cat.cor || C.muted }}>● {cat.nome}</span>}
          {tx.centro_custo && <span>· {tx.centro_custo}</span>}
          {tx.forma_pagamento && <span style={{ background: '#F1F5F9', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{tx.forma_pagamento}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'center', minWidth: 86, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: over ? '#D97706' : C.slate, ...mono }}>{fmtDateBR(tx.vencimento)}</div>
        {showDays && days != null && <div style={{ fontSize: 10, color: C.rose, marginTop: 1 }}>{days}d atraso</div>}
        {!showDays && tx.total_parcelas > 1 && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{tx.parcela_atual}/{tx.total_parcelas}</div>}
      </div>
      <div style={{ textAlign: 'right', minWidth: 110, flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tx.tipo === 'receita' ? C.emerald : C.rose, ...mono }}>{fmtBRL(tx.valor)}</div>
      </div>
      {!showDays && <div style={{ minWidth: 80, flexShrink: 0 }}><StatusPill status={tx.status} /></div>}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {tx.status === 'pendente' && onPaid && (
          <button onClick={() => onPaid(tx)} title="Marcar como recebido" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: '#ECFDF5', border: '1px solid #A7F3D0', color: C.emerald, cursor: 'pointer' }}><Check size={13} /></button>
        )}
        {onEdit && <button onClick={() => onEdit(tx)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: C.blueDim, border: `1px solid #BFDBFE`, color: C.blue, cursor: 'pointer' }}><Edit2 size={12} /></button>}
        {onDelete && <button onClick={() => onDelete(tx)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: '#FFF1F2', border: '1px solid #FECDD3', color: C.rose, cursor: 'pointer' }}><Trash2 size={12} /></button>}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CompanyFinanceiro() {
  const { session } = useAuth()
  const instance = session?.company?.instance
  const isAdmin = session?.user?.role === 'admin'

  const [tab, setTab] = useState('visaogeral')
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)

  const [filterMonth, setFilterMonth] = useState(currentMonthStr())
  const [filterStatus, setFilterStatus] = useState('todos')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterForma, setFilterForma] = useState('todos')
  const [dreYear, setDreYear] = useState(new Date().getFullYear())
  const [catPeriod, setCatPeriod] = useState(currentMonthStr())
  const [catTipo, setCatTipo] = useState('receita')

  const [modal, setModal] = useState(null)
  const [modalErr, setModalErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── Access control ────────────────────────────────────────────────────────
  if (!isAdmin) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, ...sora }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={28} color={C.muted} /></div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: C.navy, marginBottom: 6 }}>Acesso restrito</div>
        <div style={{ fontSize: 13, color: C.muted }}>Apenas administradores podem acessar o módulo financeiro.</div>
      </div>
    </div>
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!instance) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const y = new Date().getFullYear()

    // PostgREST corta em 1000 linhas por request — sem paginar, clínicas com
    // muito movimento perdem os lançamentos mais antigos (vencidos!) e os totais
    // ficam errados. Pagina com .range() até trazer tudo.
    async function fetchAllTransactions() {
      const PAGE = 1000
      let all = []
      let from = 0
      while (true) {
        const { data, error } = await supabase.from('financial_transactions').select('*')
          .eq('instancia', instance)
          .gte('vencimento', `${y-1}-01-01`).lte('vencimento', `${y+1}-12-31`)
          .order('vencimento', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw error
        all = all.concat(data || [])
        if (!data || data.length < PAGE) break
        from += PAGE
      }
      return all
    }

    Promise.all([
      fetchAllTransactions(),
      supabase.from('financial_categories').select('*')
        .in('instancia', [instance, '_default_']).order('nome')
        .then(({ data, error }) => { if (error) throw error; return data }),
    ]).then(([tx, cats]) => {
      if (cancelled) return
      setTransactions(tx || [])
      setCategories(cats || [])
      setLoading(false)
    }).catch(err => {
      if (cancelled) return
      setLoadError(err.message || 'Erro ao carregar dados financeiros')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [instance, reloadTick])

  // ── Derived ───────────────────────────────────────────────────────────────
  const catMap = useMemo(() => {
    const m = {}; categories.forEach(c => { m[c.id] = c }); return m
  }, [categories])

  const cm = currentMonthStr()

  const summary = useMemo(() => {
    let aReceber = 0, aPagar = 0, recebido = 0, pago = 0
    transactions.filter(t => t.vencimento?.startsWith(cm)).forEach(t => {
      const v = parseFloat(t.valor) || 0
      if (t.tipo === 'receita') { if (t.status === 'pendente') aReceber += v; if (t.status === 'pago') recebido += v }
      else { if (t.status === 'pendente') aPagar += v; if (t.status === 'pago') pago += v }
    })
    return { aReceber, aPagar, recebido, pago, saldo: recebido - pago }
  }, [transactions, cm])

  const tipoAtual = tab === 'receber' ? 'receita' : 'despesa'
  const filteredTx = useMemo(() => {
    if (tab !== 'receber' && tab !== 'pagar') return []
    const q = filterSearch.toLowerCase().trim()
    return transactions.filter(t => {
      if (t.tipo !== tipoAtual) return false
      if (!t.vencimento?.startsWith(filterMonth)) return false
      if (filterStatus !== 'todos' && t.status !== filterStatus) return false
      if (filterForma !== 'todos' && t.forma_pagamento !== filterForma) return false
      if (q && !(t.descricao||'').toLowerCase().includes(q) && !(t.contact_nome||'').toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => {
      const ao = isOverdue(a.vencimento, a.status) ? 0 : 1, bo = isOverdue(b.vencimento, b.status) ? 0 : 1
      if (ao !== bo) return ao - bo
      return (a.vencimento||'').localeCompare(b.vencimento||'')
    })
  }, [transactions, tab, tipoAtual, filterMonth, filterStatus, filterSearch, filterForma])

  // Fluxo de caixa chart data (10 months)
  const fluxoData = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => {
      const m = addMonths(cm, i - 6)
      const tx = transactions.filter(t => t.vencimento?.startsWith(m) && t.status !== 'cancelado')
      let recPrev = 0, despPrev = 0, recReal = 0, despReal = 0
      tx.forEach(t => {
        const v = parseFloat(t.valor)||0
        if (t.tipo === 'receita') { recPrev += v; if (t.status === 'pago') recReal += v }
        else { despPrev += v; if (t.status === 'pago') despReal += v }
      })
      const isFuture = m > cm
      return { month: monthLabel(m), fullMonth: m, recPrev, despPrev, saldoPrev: recPrev-despPrev, recReal: isFuture ? null : recReal, despReal: isFuture ? null : despReal, saldoReal: isFuture ? null : recReal-despReal, isCurrent: m === cm, isFuture }
    })
  }, [transactions, cm])

  // DRE chart + table data
  const dreData = useMemo(() => {
    let totRec = 0, totDesp = 0
    const months = MONTHS_PT.map((_, i) => {
      const m = `${dreYear}-${String(i+1).padStart(2,'0')}`
      const tx = transactions.filter(t => t.vencimento?.startsWith(m) && t.status !== 'cancelado')
      let rec = 0, desp = 0
      tx.forEach(t => { const v = parseFloat(t.valor)||0; if (t.tipo === 'receita') rec += v; else desp += v })
      totRec += rec; totDesp += desp
      return { month: MONTHS_PT[i], rec, desp, resultado: rec-desp, isCurrent: m === cm }
    })
    // P&L by category for the year
    const txYear = transactions.filter(t => t.vencimento?.startsWith(String(dreYear)) && t.status !== 'cancelado')
    const byRec = {}, byDesp = {}
    txYear.forEach(t => {
      const v = parseFloat(t.valor)||0, key = t.categoria_id || '__sem__'
      if (t.tipo === 'receita') byRec[key] = (byRec[key]||0)+v
      else byDesp[key] = (byDesp[key]||0)+v
    })
    const sort = obj => Object.entries(obj).sort((a,b) => b[1]-a[1])
    return { months, totRec, totDesp, totRes: totRec-totDesp, catRec: sort(byRec), catDesp: sort(byDesp) }
  }, [transactions, dreYear, cm])

  // Aging data
  const agingData = useMemo(() => {
    const today = todayStr()
    const overdue = transactions.filter(t => t.tipo === 'receita' && t.status === 'pendente' && t.vencimento < today)
    const buckets = [
      { label: '1–30 dias', key: '0-30', color: '#F59E0B', items: [] },
      { label: '31–60 dias', key: '31-60', color: '#F97316', items: [] },
      { label: '61–90 dias', key: '61-90', color: '#EF4444', items: [] },
      { label: '90+ dias',  key: '90+',   color: '#7F1D1D', items: [] },
    ]
    overdue.forEach(t => {
      const d = daysDiff(t.vencimento)
      buckets[d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3].items.push(t)
    })
    buckets.forEach(b => { b.total = b.items.reduce((s,t) => s+(parseFloat(t.valor)||0), 0) })
    return buckets
  }, [transactions])

  // Por categoria data
  const catData = useMemo(() => {
    const tx = transactions.filter(t => t.vencimento?.startsWith(catPeriod) && t.tipo === catTipo && t.status !== 'cancelado')
    const total = tx.reduce((s,t) => s+(parseFloat(t.valor)||0), 0)
    const byCat = {}
    tx.forEach(t => {
      const key = t.categoria_id||'__sem__'
      if (!byCat[key]) byCat[key] = { count: 0, total: 0 }
      byCat[key].count++; byCat[key].total += parseFloat(t.valor)||0
    })
    const items = Object.entries(byCat).map(([key, val]) => ({ key, ...val, cat: catMap[key]||null })).sort((a,b) => b.total-a.total)
    const pieData = items.map(item => ({ name: item.cat?.nome||'Sem categoria', value: item.total, color: item.cat?.cor||(catTipo==='receita'?C.emerald:C.rose) }))
    return { total, items, pieData, txCount: tx.length }
  }, [transactions, catPeriod, catTipo, catMap])

  // ── Visão Geral data ──────────────────────────────────────────────────────
  const visaoData = useMemo(() => {
    const thisYear = new Date().getFullYear()
    // Last 6 months bars
    const months6 = Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(cm, i - 5)
      const tx = transactions.filter(t => t.vencimento?.startsWith(m))
      let recPrev = 0, despPrev = 0, recReal = 0, despReal = 0
      tx.forEach(t => {
        if (t.status === 'cancelado') return
        const v = parseFloat(t.valor) || 0
        if (t.tipo === 'receita') { recPrev += v; if (t.status === 'pago') recReal += v }
        else { despPrev += v; if (t.status === 'pago') despReal += v }
      })
      return { month: monthLabel(m), recPrev, despPrev, recReal, despReal, saldo: recReal - despReal, isCurrent: m === cm }
    })
    // YTD
    const ytdTx = transactions.filter(t => t.vencimento?.startsWith(String(thisYear)))
    let ytdRec = 0, ytdDesp = 0
    ytdTx.forEach(t => {
      if (t.status === 'cancelado') return
      const v = parseFloat(t.valor) || 0
      if (t.tipo === 'receita') ytdRec += v; else ytdDesp += v
    })
    // Top contatos this month
    const cmTx = transactions.filter(t => t.vencimento?.startsWith(cm) && t.tipo === 'receita' && t.status !== 'cancelado' && t.contact_nome)
    const topContatos = {}
    cmTx.forEach(t => {
      const k = t.contact_nome.trim()
      if (!topContatos[k]) topContatos[k] = 0
      topContatos[k] += parseFloat(t.valor) || 0
    })
    const topContatosList = Object.entries(topContatos).sort((a,b) => b[1]-a[1]).slice(0, 5)
    // Inadimplência total
    const inadTotal = transactions.filter(t => t.tipo === 'receita' && t.status === 'pendente' && t.vencimento < todayStr())
      .reduce((s,t) => s + (parseFloat(t.valor)||0), 0)
    // Categorias this month pie
    const cmRec = transactions.filter(t => t.vencimento?.startsWith(cm) && t.tipo === 'receita' && t.status !== 'cancelado')
    const byCat = {}
    cmRec.forEach(t => {
      const key = t.categoria_id || '__sem__'
      if (!byCat[key]) byCat[key] = 0
      byCat[key] += parseFloat(t.valor) || 0
    })
    const catPie = Object.entries(byCat).map(([k, v]) => ({
      name: catMap[k]?.nome || 'Sem categoria',
      value: v,
      color: catMap[k]?.cor || C.emerald,
    })).sort((a,b) => b.value - a.value).slice(0, 6)
    return { months6, ytdRec, ytdDesp, ytdSaldo: ytdRec - ytdDesp, topContatosList, inadTotal, catPie }
  }, [transactions, cm, catMap])

  function catsForTipo(t) { return categories.filter(c => c.tipo === t || c.tipo === 'ambos') }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openNew() {
    setModal({ mode: 'new', data: { tipo: tab === 'pagar' ? 'despesa' : 'receita', descricao: '', valor: '', vencimento: todayStr(), categoria_id: '', contact_nome: '', centro_custo: '', forma_pagamento: '', observacoes: '', parcelado: false, num_parcelas: 2, recorrente: false, recorrencia_meses: 3 } })
    setModalErr('')
  }
  function openEdit(tx) {
    setModal({ mode: 'edit', data: { ...tx, valor: tx.valor?.toString()||'', parcelado: false, num_parcelas: 2, recorrente: false, recorrencia_meses: 3 } })
    setModalErr('')
  }

  async function handleSave() {
    const { data: d } = modal
    if (!d.descricao?.trim()) { setModalErr('Descrição é obrigatória.'); return }
    if (!d.valor || isNaN(parseFloat(d.valor)) || parseFloat(d.valor) <= 0) { setModalErr('Informe um valor válido.'); return }
    if (!d.vencimento) { setModalErr('Data de vencimento é obrigatória.'); return }
    setSaving(true); setModalErr('')

    if (modal.mode === 'edit') {
      const payload = { tipo: d.tipo, descricao: d.descricao.trim(), valor: parseFloat(d.valor), vencimento: d.vencimento, categoria_id: d.categoria_id||null, contact_nome: d.contact_nome?.trim()||null, centro_custo: d.centro_custo?.trim()||null, forma_pagamento: d.forma_pagamento||null, observacoes: d.observacoes?.trim()||null, status: d.status }
      const { data: upd, error } = await supabase.from('financial_transactions').update(payload).eq('id', d.id).select().single()
      setSaving(false)
      if (error) { setModalErr('Erro: '+error.message); return }
      setTransactions(prev => prev.map(t => t.id === upd.id ? upd : t)); setModal(null)
      return
    }

    const isParcela = d.parcelado && !d.recorrente
    const isRec = d.recorrente
    const num = isParcela ? Math.max(2,Math.min(24,+d.num_parcelas||2)) : isRec ? Math.max(2,Math.min(24,+d.recorrencia_meses||3)) : 1
    const gParcela = isParcela ? crypto.randomUUID() : null
    const gRec = isRec ? crypto.randomUUID() : null

    const rows = Array.from({ length: num }, (_,i) => ({
      instancia: instance, tipo: d.tipo,
      descricao: isParcela ? `${d.descricao.trim()} (${i+1}/${num})` : d.descricao.trim(),
      valor: parseFloat(d.valor), vencimento: num > 1 ? addMonthsToDate(d.vencimento, i) : d.vencimento,
      categoria_id: d.categoria_id||null, contact_nome: d.contact_nome?.trim()||null, centro_custo: d.centro_custo?.trim()||null,
      forma_pagamento: d.forma_pagamento||null, observacoes: d.observacoes?.trim()||null,
      status: 'pendente', created_by: session?.user?.id||null,
      grupo_parcelas: gParcela, parcela_atual: isParcela ? i+1 : null, total_parcelas: isParcela ? num : null,
      recorrente: isRec||false, recorrencia_tipo: isRec ? 'mensal' : null, grupo_recorrencia: gRec,
    }))
    const { data: ins, error } = await supabase.from('financial_transactions').insert(rows).select()
    setSaving(false)
    if (error) { setModalErr('Erro: '+error.message); return }
    if (ins) setTransactions(prev => [...ins, ...prev]); setModal(null)
  }

  async function handleMarkPaid(tx) {
    const { data: upd } = await supabase.from('financial_transactions').update({ status: 'pago', pagamento_at: todayStr() }).eq('id', tx.id).select().single()
    if (upd) setTransactions(prev => prev.map(t => t.id === upd.id ? upd : t))
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    await supabase.from('financial_transactions').delete().eq('id', confirmDelete.id)
    setTransactions(prev => prev.filter(t => t.id !== confirmDelete.id))
    setDeleting(false); setConfirmDelete(null)
  }

  const md = modal?.data || {}
  const TABS = [
    { key: 'visaogeral', label: '⬡ Visão Geral' },
    { key: 'receber', label: 'A Receber' },
    { key: 'pagar', label: 'A Pagar' },
    { key: 'fluxo', label: 'Fluxo de Caixa' },
    { key: 'dre', label: 'DRE' },
    { key: 'inadimplencia', label: 'Inadimplência' },
    { key: 'categorias', label: 'Por Categoria' },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem', background: C.bg, minHeight: '100vh', ...sora }}>
      <style>{FONTS}{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .fin-tab:hover { color: ${C.navy} !important }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={18} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: C.navy, letterSpacing: '-0.02em' }}>Financeiro</h1>
        </div>
        <div style={{ fontSize: 12, color: C.muted, paddingLeft: 46 }}>
          {loading ? 'Carregando dados...' : `${transactions.length} lançamentos · ${monthLabelFull(cm)}`}
        </div>
      </div>

      {loadError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: C.roseDim, border: `1px solid ${C.rose}`, borderRadius: 10,
          padding: '12px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, color: C.rose, fontWeight: 600 }}>
            Não foi possível carregar os dados financeiros: {loadError}
          </div>
          <button
            onClick={() => setReloadTick(t => t + 1)}
            style={{
              flexShrink: 0, background: C.rose, color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <MetricCard label="A Receber" value={summary.aReceber} icon={ArrowUpCircle} color={C.emerald} bg={C.emeraldDim} loading={loading} delta />
        <MetricCard label="A Pagar" value={summary.aPagar} icon={ArrowDownCircle} color={C.rose} bg={C.roseDim} loading={loading} delta />
        <MetricCard label="Recebido" value={summary.recebido} icon={TrendingUp} color="#0891B2" bg="#CFFAFE" loading={loading} delta />
        <MetricCard label="Saldo do Mês" value={summary.saldo} icon={summary.saldo >= 0 ? TrendingUp : TrendingDown} color={summary.saldo >= 0 ? C.blue : C.rose} bg={summary.saldo >= 0 ? C.blueDim : C.roseDim} loading={loading} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} className="fin-tab" onClick={() => setTab(t.key)} style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: tab === t.key ? 700 : 500, background: 'none', border: 'none', cursor: 'pointer', color: tab === t.key ? C.navy : C.muted, borderBottom: tab === t.key ? `2px solid ${C.navy}` : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap', ...sora }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Visão Geral ── */}
      {tab === 'visaogeral' && (() => {
        const { months6, ytdRec, ytdDesp, ytdSaldo, topContatosList, inadTotal, catPie } = visaoData
        const maxBar = Math.max(1, ...months6.map(m => Math.max(m.recPrev, m.despPrev)))

        const VTooltip = ({ active, payload, label }) => {
          if (!active || !payload?.length) return null
          return (
            <div style={{ background: C.navy, borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', ...sora }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{label}</div>
              {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fff', marginBottom: 2 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill }} />
                  <span style={{ color: '#CBD5E1', minWidth: 60 }}>{p.name}</span>
                  <span style={{ ...mono, fontWeight: 600, color: p.color || p.fill }}>{fmtBRL(p.value)}</span>
                </div>
              ))}
            </div>
          )
        }

        return (
          <div>
            {/* Hero KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Receita YTD',   value: ytdRec,             color: C.emerald, bg: C.emeraldDim, icon: TrendingUp },
                { label: 'Despesa YTD',   value: ytdDesp,            color: C.rose,    bg: C.roseDim,    icon: TrendingDown },
                { label: 'Resultado YTD', value: ytdSaldo,           color: ytdSaldo >= 0 ? C.blue : C.rose, bg: ytdSaldo >= 0 ? C.blueDim : C.roseDim, icon: DollarSign },
                { label: 'Inadimplência', value: inadTotal,          color: '#D97706', bg: '#FEF3C7', icon: AlertTriangle },
                { label: 'A receber mês', value: summary.aReceber,   color: C.emerald, bg: C.emeraldDim, icon: ArrowUpCircle },
                { label: 'A pagar mês',   value: summary.aPagar,     color: C.rose,    bg: C.roseDim,    icon: ArrowDownCircle },
              ].map(k => (
                <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.1rem 1.2rem', display: 'flex', alignItems: 'flex-start', gap: 12, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, borderRadius: '0 0 0 60px', background: k.bg, opacity: 0.6 }} />
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <k.icon size={16} color={k.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, ...sora }}>{k.label}</div>
                    {loading
                      ? <div style={{ height: 22, width: 80, background: '#F1F5F9', borderRadius: 6 }} />
                      : <div style={{ fontSize: 17, fontWeight: 800, color: k.color, lineHeight: 1, ...mono }}>{fmtBRL(k.value)}</div>
                    }
                  </div>
                </div>
              ))}
            </div>

            {/* Receita vs Despesa — últimos 6 meses */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.4rem', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, ...sora }}>Receita × Despesa</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Últimos 6 meses · previsto e realizado</div>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                  {[{ c: C.emerald, l: 'Receita' }, { c: C.rose, l: 'Despesa' }, { c: C.blue, l: 'Saldo real' }].map(x => (
                    <span key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.slate }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: x.c, display: 'inline-block' }} />{x.l}
                    </span>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={months6} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.muted, fontFamily: '"Sora",sans-serif' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: '"DM Mono",monospace' }} axisLine={false} tickLine={false} tickFormatter={v => fmtBRL(v, true)} width={68} />
                  <Tooltip content={<VTooltip />} />
                  <Bar dataKey="recPrev"  name="Receita prev."  fill={C.emerald} fillOpacity={0.25} radius={[4,4,0,0]} />
                  <Bar dataKey="despPrev" name="Despesa prev."  fill={C.rose}    fillOpacity={0.25} radius={[4,4,0,0]} />
                  <Bar dataKey="recReal"  name="Receita real"   fill={C.emerald} radius={[4,4,0,0]} />
                  <Bar dataKey="despReal" name="Despesa real"   fill={C.rose}    radius={[4,4,0,0]} />
                  <Line type="monotone" dataKey="saldo" name="Saldo real" stroke={C.blue} strokeWidth={2.5} dot={{ fill: C.blue, r: 3, strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Categorias pie + Top contatos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Pie categorias */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.4rem' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: C.navy, marginBottom: 4, ...sora }}>Receitas por categoria</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>{monthLabelFull(cm)}</div>
                {catPie.length === 0
                  ? <div style={{ textAlign: 'center', padding: '2rem', color: C.muted, fontSize: 13 }}>Sem dados</div>
                  : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <ResponsiveContainer width={130} height={130}>
                        <PieChart>
                          <Pie data={catPie} cx="50%" cy="50%" innerRadius={32} outerRadius={58}
                            dataKey="value" strokeWidth={0} paddingAngle={2}>
                            {catPie.map((_, i) => <Cell key={i} fill={_.color} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmtBRL(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {catPie.map((c, i) => {
                          const total = catPie.reduce((s,x) => s+x.value,0) || 1
                          return (
                            <div key={i}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3 }}>
                                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                                <span style={{ flex: 1, color: C.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                <span style={{ fontWeight: 700, color: C.navy, ...mono, fontSize: 11 }}>{fmtBRL(c.value)}</span>
                                <span style={{ color: C.muted, fontSize: 10, minWidth: 28, textAlign: 'right' }}>{Math.round(c.value/total*100)}%</span>
                              </div>
                              <div style={{ height: 3, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${(c.value/total)*100}%`, background: c.color }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                }
              </div>

              {/* Top contatos */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.4rem' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: C.navy, marginBottom: 4, ...sora }}>Top clientes · receita</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>{monthLabelFull(cm)}</div>
                {topContatosList.length === 0
                  ? <div style={{ textAlign: 'center', padding: '2rem', color: C.muted, fontSize: 13 }}>Sem dados</div>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {topContatosList.map(([nome, val], i) => {
                        const max = topContatosList[0][1] || 1
                        const pal = [C.emerald, C.blue, '#7C3AED', '#D97706', '#DC2626']
                        return (
                          <div key={nome}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: pal[i] + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: pal[i] }}>{i+1}</div>
                                <span style={{ fontWeight: 600, color: C.navy }}>{nome}</span>
                              </div>
                              <span style={{ fontWeight: 700, color: pal[i], ...mono, fontSize: 12 }}>{fmtBRL(val)}</span>
                            </div>
                            <div style={{ height: 5, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(val/max)*100}%`, background: pal[i], borderRadius: 6, transition: 'width 0.4s' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                }
              </div>
            </div>

            {/* Atalhos rápidos */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: '+ Nova receita', tab: 'receber', color: C.emerald, bg: C.emeraldDim },
                { label: '+ Nova despesa', tab: 'pagar',   color: C.rose,    bg: C.roseDim },
                { label: 'Fluxo de caixa', tab: 'fluxo',  color: C.blue,    bg: C.blueDim },
                { label: 'DRE',            tab: 'dre',     color: C.slate,   bg: '#F1F5F9' },
                { label: 'Inadimplência',  tab: 'inadimplencia', color: '#D97706', bg: '#FEF3C7' },
              ].map(x => (
                <button key={x.tab} onClick={() => setTab(x.tab)} style={{ padding: '9px 16px', borderRadius: 10, border: `1px solid ${x.bg}`, background: x.bg, color: x.color, fontWeight: 700, fontSize: 12, cursor: 'pointer', ...sora }}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── A Receber / A Pagar ── */}
      {(tab === 'receber' || tab === 'pagar') && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ position: 'relative' }}>
              <Calendar size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
              <input type="month" className="nx-input" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ paddingLeft: 28, fontSize: 13, width: 160, ...sora }} />
            </div>
            <select className="nx-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 13, width: 130, ...sora }}>
              <option value="todos">Todos status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select className="nx-select" value={filterForma} onChange={e => setFilterForma(e.target.value)} style={{ fontSize: 13, width: 150, ...sora }}>
              <option value="todos">Todas formas</option>
              {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
              <input className="nx-input" placeholder="Buscar por descrição ou contato..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} style={{ paddingLeft: 28, fontSize: 13, ...sora }} />
            </div>
            <button className="nx-btn-primary" onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13, ...sora }}>
              <Plus size={13} /> Novo lançamento
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: C.muted, gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...
            </div>
          ) : filteredTx.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '3rem', textAlign: 'center', color: C.muted }}>
              <DollarSign size={28} style={{ opacity: 0.15, marginBottom: 10 }} />
              <div style={{ fontSize: 14 }}>
                {loadError ? 'Não foi possível carregar os lançamentos.' : 'Nenhum lançamento neste período.'}
              </div>
              {!loadError && (
                <button className="nx-btn-ghost" onClick={openNew} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <Plus size={13} /> Criar lançamento
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {filteredTx.map((tx, i) => (
                <TxRow key={tx.id} tx={tx} catMap={catMap} onPaid={handleMarkPaid} onEdit={openEdit} onDelete={setConfirmDelete} last={i === filteredTx.length-1} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Fluxo de Caixa ── */}
      {tab === 'fluxo' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.navy, marginBottom: 4 }}>Fluxo de Caixa — 10 meses</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Receitas vs despesas previstas · linha tracejada = meses futuros</div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={fluxoData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.emerald} stopOpacity={0.18}/>
                    <stop offset="95%" stopColor={C.emerald} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradDesp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.rose} stopOpacity={0.14}/>
                    <stop offset="95%" stopColor={C.rose} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.muted, fontFamily: '"Sora", sans-serif' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.muted, fontFamily: '"DM Mono", monospace' }} axisLine={false} tickLine={false} tickFormatter={v => fmtBRL(v, true)} width={72} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="recPrev" stroke={C.emerald} strokeWidth={2} fill="url(#gradRec)" name="Receitas" dot={false} strokeDasharray={(d) => d?.isFuture ? '4 4' : ''} />
                <Area type="monotone" dataKey="despPrev" stroke={C.rose} strokeWidth={2} fill="url(#gradDesp)" name="Despesas" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Fluxo table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: `1px solid ${C.border}` }}>
                    {['Mês','Rec. Prevista','Desp. Prevista','Saldo Prev.','Rec. Recebida','Desp. Paga','Saldo Real'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h==='Mês'?'left':'right', fontWeight: 700, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', ...sora }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fluxoData.map(row => (
                    <tr key={row.fullMonth} style={{ borderBottom: `1px solid #F8FAFC`, background: row.isCurrent ? C.blueDim : 'transparent' }}>
                      <td style={{ padding: '9px 14px', fontWeight: row.isCurrent ? 700 : 500, color: row.isCurrent ? C.blue : C.navy, whiteSpace: 'nowrap', ...sora }}>
                        {row.month}{row.isCurrent && <span style={{ fontSize: 9, background: '#BFDBFE', color: C.blue, borderRadius: 20, padding: '2px 6px', marginLeft: 6, fontWeight: 700 }}>Atual</span>}
                      </td>
                      {[
                        [row.recPrev, C.emerald], [row.despPrev, C.rose], [row.saldoPrev, row.saldoPrev>=0?C.blue:C.rose],
                        [row.recReal, C.emerald], [row.despReal, C.rose], [row.saldoReal, row.saldoReal>=0?C.blue:C.rose],
                      ].map(([val, color], i) => (
                        <td key={i} style={{ padding: '9px 14px', textAlign: 'right', ...mono, fontWeight: 600, color: val == null ? '#CBD5E1' : color, fontSize: 12.5 }}>
                          {val == null ? '—' : fmtBRL(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── DRE ── */}
      {tab === 'dre' && (
        <div>
          {/* Year nav + DRE label */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, letterSpacing: '-0.01em' }}>Demonstração do Resultado do Exercício</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Receitas · Despesas · Resultado · Margem</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NavBtn onClick={() => setDreYear(y => y-1)}><ChevronLeft size={14} /></NavBtn>
              <span style={{ fontWeight: 700, fontSize: 16, color: C.navy, minWidth: 48, textAlign: 'center', ...mono }}>{dreYear}</span>
              <NavBtn onClick={() => setDreYear(y => y+1)}><ChevronRight size={14} /></NavBtn>
            </div>
          </div>

          {/* DRE bar chart */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, ...sora }}>Receitas {dreYear}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.emerald, ...mono }}>{fmtBRL(dreData.totRec)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, ...sora }}>Despesas {dreYear}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.rose, ...mono }}>{fmtBRL(dreData.totDesp)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, ...sora }}>Resultado {dreYear}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: dreData.totRes >= 0 ? C.blue : C.rose, ...mono }}>{fmtBRL(dreData.totRes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, ...sora }}>Margem {dreYear}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: dreData.totRec > 0 && dreData.totRes >= 0 ? C.blue : C.rose, ...mono }}>
                  {dreData.totRec > 0 ? ((dreData.totRes/dreData.totRec)*100).toFixed(1)+'%' : '—'}
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={dreData.months} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.muted, fontFamily: '"Sora", sans-serif' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.muted, fontFamily: '"DM Mono", monospace' }} axisLine={false} tickLine={false} tickFormatter={v => fmtBRL(v, true)} width={72} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="rec" fill={C.emerald} name="Receitas" radius={[4,4,0,0]} maxBarSize={28}
                  fillOpacity={0.85} />
                <Bar dataKey="desp" fill={C.rose} name="Despesas" radius={[4,4,0,0]} maxBarSize={28}
                  fillOpacity={0.85} />
                <Line dataKey="resultado" stroke={C.blue} strokeWidth={2.5} dot={{ r: 3, fill: C.blue, strokeWidth: 0 }} name="Resultado" activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* P&L statement */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { title: 'Receitas por Categoria', data: dreData.catRec, color: C.emerald, total: dreData.totRec },
              { title: 'Despesas por Categoria', data: dreData.catDesp, color: C.rose, total: dreData.totDesp },
            ].map(({ title, data, color, total }) => (
              <div key={title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color }}>✦ {title}</span>
                  <span style={{ fontWeight: 800, fontSize: 13, color, ...mono }}>{fmtBRL(total)}</span>
                </div>
                {data.length === 0
                  ? <div style={{ padding: '1.5rem', textAlign: 'center', color: C.muted, fontSize: 13 }}>Sem dados em {dreYear}</div>
                  : data.map(([key, val]) => {
                      const cat = catMap[key]
                      const p = total > 0 ? (val/total*100) : 0
                      return (
                        <div key={key} style={{ padding: '9px 16px', borderBottom: `1px solid #F8FAFC` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat?.cor||C.muted, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 12, color: C.navy, fontWeight: 500 }}>{cat?.nome||'Sem categoria'}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color, ...mono }}>{fmtBRL(val)}</span>
                            <span style={{ fontSize: 10, color: C.muted, minWidth: 36, textAlign: 'right' }}>{p.toFixed(0)}%</span>
                          </div>
                          <div style={{ height: 3, background: '#F1F5F9', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${p}%`, background: cat?.cor||color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      )
                    })
                }
              </div>
            ))}
          </div>

          {/* DRE month table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: `1px solid ${C.border}` }}>
                    {['Mês','Receitas','Despesas','Resultado','Margem'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h==='Mês'?'left':'right', fontWeight: 700, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', ...sora }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dreData.months.map((row, i) => {
                    const m = row.rec>0&&row.rec>0 ? ((row.resultado/row.rec)*100).toFixed(1) : null
                    const has = row.rec>0||row.desp>0
                    return (
                      <tr key={i} style={{ borderBottom: i<11?`1px solid #F8FAFC`:'none', background: row.isCurrent ? C.blueDim : 'transparent' }}>
                        <td style={{ padding: '9px 16px', fontWeight: row.isCurrent?700:500, color: row.isCurrent?C.blue:C.navy, ...sora }}>
                          {MONTHS_PT[i]}{row.isCurrent && <span style={{ fontSize: 9, background: '#BFDBFE', color: C.blue, borderRadius: 20, padding: '2px 6px', marginLeft: 6, fontWeight: 700 }}>Atual</span>}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', ...mono, color: has&&row.rec>0?C.emerald:'#CBD5E1', fontWeight: 600, fontSize: 12.5 }}>{row.rec>0?fmtBRL(row.rec):'—'}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', ...mono, color: has&&row.desp>0?C.rose:'#CBD5E1', fontWeight: 600, fontSize: 12.5 }}>{row.desp>0?fmtBRL(row.desp):'—'}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', ...mono, fontWeight: 700, fontSize: 12.5, color: !has?'#CBD5E1':row.resultado>=0?C.emerald:C.rose }}>{has?fmtBRL(row.resultado):'—'}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', ...mono, fontWeight: 600, fontSize: 12.5, color: m!=null?(parseFloat(m)>=0?C.blue:C.rose):'#CBD5E1' }}>{m!=null?m+'%':'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F1F5F9', borderTop: `2px solid ${C.border}` }}>
                    <td style={{ padding: '10px 16px', fontWeight: 800, fontSize: 12.5, color: C.navy, ...sora }}>Total {dreYear}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', ...mono, fontWeight: 800, color: C.emerald, fontSize: 12.5 }}>{fmtBRL(dreData.totRec)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', ...mono, fontWeight: 800, color: C.rose, fontSize: 12.5 }}>{fmtBRL(dreData.totDesp)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', ...mono, fontWeight: 800, color: dreData.totRes>=0?C.blue:C.rose, fontSize: 12.5 }}>{fmtBRL(dreData.totRes)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', ...mono, fontWeight: 700, color: C.muted, fontSize: 12.5 }}>
                      {dreData.totRec>0 ? ((dreData.totRes/dreData.totRec)*100).toFixed(1)+'%' : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Inadimplência ── */}
      {tab === 'inadimplencia' && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.navy, marginBottom: 4 }}>Aging — Contas a Receber Vencidas</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>Distribuição de inadimplência por tempo de vencimento</div>

          {/* Aging chart */}
          {agingData.some(b => b.total > 0) && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', marginBottom: 20 }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={agingData.map(b => ({ name: b.label, total: b.total, color: b.color }))} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.muted, fontFamily: '"DM Mono", monospace' }} axisLine={false} tickLine={false} tickFormatter={v => fmtBRL(v, true)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.muted, fontFamily: '"Sora", sans-serif' }} axisLine={false} tickLine={false} width={78} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="total" name="Em atraso" radius={[0,6,6,0]} maxBarSize={32}>
                    {agingData.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Aging bucket cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            {agingData.map(b => (
              <div key={b.key} style={{ background: C.card, border: `1px solid ${b.total>0?b.color+'55':C.border}`, borderRadius: 14, padding: '1.1rem 1.3rem', flex: 1, minWidth: 130 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: b.total>0?b.color:C.border }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: b.total>0?b.color:C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', ...sora }}>{b.label}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: b.total>0?b.color:C.muted, ...mono }}>{fmtBRL(b.total)}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3, ...sora }}>{b.items.length} lançamento(s)</div>
              </div>
            ))}
          </div>

          {agingData.every(b => b.items.length === 0) ? (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 14, padding: '2.5rem', textAlign: 'center' }}>
              <Check size={28} color={C.emerald} style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 700, fontSize: 15, color: '#065F46', marginBottom: 4 }}>Sem inadimplência</div>
              <div style={{ fontSize: 13, color: C.emerald }}>Todas as contas a receber estão em dia.</div>
            </div>
          ) : (
            agingData.filter(b => b.items.length > 0).map(b => (
              <div key={b.key} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: b.color }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: b.color, ...sora }}>{b.label} — {fmtBRL(b.total)}</span>
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                  {b.items.map((tx, i) => (
                    <TxRow key={tx.id} tx={tx} catMap={catMap} onPaid={handleMarkPaid} onEdit={openEdit} showDays last={i===b.items.length-1} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Por Categoria ── */}
      {tab === 'categorias' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <input type="month" className="nx-input" value={catPeriod} onChange={e => setCatPeriod(e.target.value)} style={{ fontSize: 13, width: 160, ...sora }} />
            <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, flexShrink: 0 }}>
              {[{ v: 'receita', label: 'Receitas', c: C.emerald }, { v: 'despesa', label: 'Despesas', c: C.rose }].map(opt => (
                <button key={opt.v} onClick={() => setCatTipo(opt.v)} style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: catTipo===opt.v?opt.c:'#F8FAFC', color: catTipo===opt.v?'#fff':C.muted, transition: 'all 0.15s', ...sora }}>{opt.label}</button>
              ))}
            </div>
          </div>

          {catData.items.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '3rem', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              Nenhum lançamento de {catTipo==='receita'?'receita':'despesa'} em {monthLabelFull(catPeriod)}.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'start' }}>
              {/* Pie chart */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', width: 280 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 2, ...sora }}>Distribuição</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, ...sora }}>{monthLabelFull(catPeriod)}</div>
                <PieChart width={234} height={200}>
                  <Pie data={catData.pieData} cx={117} cy={100} innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                    {catData.pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(val) => [fmtBRL(val), '']} contentStyle={{ background: C.navy, border: 'none', borderRadius: 8, color: '#fff', fontFamily: '"DM Mono", monospace', fontSize: 12 }} />
                </PieChart>
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.muted, ...sora }}>Total</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: catTipo==='receita'?C.emerald:C.rose, ...mono }}>{fmtBRL(catData.total)}</div>
                </div>
              </div>

              {/* Bars list */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', padding: '10px 16px', background: '#F8FAFC', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', ...sora }}>Categoria</span>
                  <span style={{ minWidth: 48, textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', ...sora }}>Qtd</span>
                  <span style={{ minWidth: 120, textAlign: 'right', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', ...sora }}>Total</span>
                  <span style={{ minWidth: 56, textAlign: 'right', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', ...sora }}>%</span>
                </div>
                {catData.items.map((item, i) => {
                  const p = catData.total > 0 ? (item.total/catData.total*100) : 0
                  const color = catTipo==='receita'?C.emerald:C.rose
                  const bar = item.cat?.cor || color
                  return (
                    <div key={item.key} style={{ padding: '11px 16px', borderBottom: i<catData.items.length-1?`1px solid #F8FAFC`:'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: bar, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.navy, ...sora }}>{item.cat?.nome||'Sem categoria'}</span>
                        <span style={{ minWidth: 48, textAlign: 'center', fontSize: 12, color: C.muted }}>{item.count}</span>
                        <span style={{ minWidth: 120, textAlign: 'right', fontSize: 13, fontWeight: 700, color, ...mono }}>{fmtBRL(item.total)}</span>
                        <span style={{ minWidth: 56, textAlign: 'right', fontSize: 12, color: C.muted, ...mono }}>{p.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p}%`, background: bar, borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', background: '#F8FAFC', borderTop: `2px solid ${C.border}` }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.navy, ...sora }}>Total</span>
                  <span style={{ minWidth: 48, textAlign: 'center', fontSize: 12, color: C.muted }}>{catData.txCount}</span>
                  <span style={{ minWidth: 120, textAlign: 'right', fontSize: 13, fontWeight: 800, color: catTipo==='receita'?C.emerald:C.rose, ...mono }}>{fmtBRL(catData.total)}</span>
                  <span style={{ minWidth: 56, textAlign: 'right', fontSize: 12, color: C.muted }}>100%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      {modal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(6px)', padding: '1.5rem' }}>
          <div style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)', ...sora }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>{modal.mode==='edit'?'Editar lançamento':'Novo lançamento'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }} onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Tipo */}
              <div>
                <label style={lbl}>Tipo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{v:'receita',label:'Receita',c:C.emerald},{v:'despesa',label:'Despesa',c:C.rose}].map(opt => (
                    <button key={opt.v} type="button" onClick={() => setModal(p => ({...p, data:{...p.data,tipo:opt.v,categoria_id:''}}))}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: md.tipo===opt.v?opt.c:'#F8FAFC', color: md.tipo===opt.v?'#fff':C.muted }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label style={lbl}>Descrição *</label>
                <input className="nx-input" autoFocus placeholder="Ex: Venda João, Aluguel..." value={md.descricao||''} onChange={e => setModal(p => ({...p,data:{...p.data,descricao:e.target.value}}))} />
              </div>

              {/* Valor + Vencimento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Valor (R$) *</label>
                  <input className="nx-input" type="number" min="0" step="0.01" placeholder="0,00" value={md.valor||''} onChange={e => setModal(p => ({...p,data:{...p.data,valor:e.target.value}}))} />
                </div>
                <div>
                  <label style={lbl}>Vencimento *</label>
                  <input className="nx-input" type="date" value={md.vencimento||''} onChange={e => setModal(p => ({...p,data:{...p.data,vencimento:e.target.value}}))} />
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label style={lbl}>Categoria</label>
                <select className="nx-select" value={md.categoria_id||''} onChange={e => setModal(p => ({...p,data:{...p.data,categoria_id:e.target.value}}))}>
                  <option value="">Sem categoria</option>
                  {catsForTipo(md.tipo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              {/* Forma de pagamento */}
              <div>
                <label style={lbl}>Forma de pagamento</label>
                <select className="nx-select" value={md.forma_pagamento||''} onChange={e => setModal(p => ({...p,data:{...p.data,forma_pagamento:e.target.value}}))}>
                  <option value="">Não informado</option>
                  {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              {/* Cliente + Centro de custo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Cliente / Contato</label>
                  <input className="nx-input" placeholder="Nome" value={md.contact_nome||''} onChange={e => setModal(p => ({...p,data:{...p.data,contact_nome:e.target.value}}))} />
                </div>
                <div>
                  <label style={lbl}>Centro de custo</label>
                  <input className="nx-input" placeholder="Ex: Loja, Admin" value={md.centro_custo||''} onChange={e => setModal(p => ({...p,data:{...p.data,centro_custo:e.target.value}}))} />
                </div>
              </div>

              {/* Status (edit only) */}
              {modal.mode === 'edit' && (
                <div>
                  <label style={lbl}>Status</label>
                  <select className="nx-select" value={md.status||'pendente'} onChange={e => setModal(p => ({...p,data:{...p.data,status:e.target.value}}))}>
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              )}

              {/* Parcelas / Recorrência (new only) */}
              {modal.mode === 'new' && (
                <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: md.parcelado?10:0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.slate, flex: 1 }}>Parcelado?</span>
                      <Toggle on={md.parcelado||false} onChange={v => setModal(p => ({...p,data:{...p.data,parcelado:v,recorrente:v?false:p.data.recorrente}}))} />
                    </div>
                    {md.parcelado && (
                      <div>
                        <label style={lbl}>Nº de parcelas (2–24)</label>
                        <input className="nx-input" type="number" min="2" max="24" value={md.num_parcelas||2} onChange={e => setModal(p => ({...p,data:{...p.data,num_parcelas:+e.target.value||2}}))} style={{ width: 100 }} />
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Serão criados {md.num_parcelas} lançamentos com vencimentos mensais.</div>
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: md.recorrente?10:0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.slate, flex: 1 }}>Recorrente?</span>
                      <Toggle on={md.recorrente||false} onChange={v => setModal(p => ({...p,data:{...p.data,recorrente:v,parcelado:v?false:p.data.parcelado}}))} />
                    </div>
                    {md.recorrente && (
                      <div>
                        <label style={lbl}>Repetir por</label>
                        <select className="nx-select" value={md.recorrencia_meses||3} onChange={e => setModal(p => ({...p,data:{...p.data,recorrencia_meses:+e.target.value}}))}>
                          {[2,3,6,12,24].map(n => <option key={n} value={n}>{n} meses</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Cria {md.recorrencia_meses||3} cópias mensais idênticas (ex: aluguel).</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Observações */}
              <div>
                <label style={lbl}>Observações</label>
                <textarea className="nx-input" rows={2} placeholder="Informações adicionais (opcional)" value={md.observacoes||''} onChange={e => setModal(p => ({...p,data:{...p.data,observacoes:e.target.value}}))} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}` }}>
              {modalErr && <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.rose, marginBottom: 12 }}>{modalErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Confirm delete ── */}
      {confirmDelete && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(6px)', padding: '1.5rem' }}>
          <div style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 400, boxShadow: '0 25px 60px rgba(0,0,0,0.2)', ...sora }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.rose }}>Excluir lançamento</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }} onClick={() => setConfirmDelete(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', fontSize: 14, color: C.slate }}>
              Excluir <strong>"{confirmDelete.descricao}"</strong> de <strong style={{ ...mono }}>{fmtBRL(confirmDelete.valor)}</strong>? Esta ação não pode ser desfeita.
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: C.rose, color: '#fff', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
