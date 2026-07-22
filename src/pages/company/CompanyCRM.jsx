import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Plus, X, Search, Clock, AlertTriangle, Phone, Mail,
  UserPlus, Flag, Edit2, Trash2, Check, Loader2, ChevronDown,
  MessageSquare, ArrowRight, Tag, Users, MoreHorizontal,
  Thermometer, GitMerge, StickyNote, Kanban, Filter, List,
  ChevronRight, BookMarked, Zap,
} from 'lucide-react'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:   '#0F172A', blue:  '#2563EB', blueDim: '#EFF6FF',
  slate:  '#475569', muted: '#94A3B8', border:  '#E2E8F0',
  bg:     '#F1F5F9', card:  '#FFFFFF',
  emerald:'#059669', rose:  '#E11D48',
}

const TEMP = {
  frio:   { label: 'Frio',   color: '#0891B2', bg: '#ECFEFF',  dot: '#0891B2', icon: '❄️' },
  morno:  { label: 'Morno',  color: '#D97706', bg: '#FFFBEB',  dot: '#D97706', icon: '🌤️' },
  quente: { label: 'Quente', color: '#DC2626', bg: '#FFF1F2',  dot: '#DC2626', icon: '🔥' },
}

const ORIGENS = ['WhatsApp','Instagram','Google','Facebook','Indicação','TikTok','Site','Parceria','Anúncio','Outro']

const ORIGEM_COLORS = {
  WhatsApp: '#25D366', Instagram: '#E1306C', Google: '#4285F4',
  Facebook: '#1877F2', Indicação: '#7C3AED', TikTok: '#000000',
  Site: '#0891B2', Parceria: '#059669', Anúncio: '#D97706', Outro: '#6B7280',
}

const DEFAULT_STAGES = [
  { nome: 'Novo Lead',        cor: '#64748B', posicao: 0, alerta_dias: 3  },
  { nome: 'Primeiro Contato', cor: '#2563EB', posicao: 1, alerta_dias: 5  },
  { nome: 'Agendou',          cor: '#7C3AED', posicao: 2, alerta_dias: 7  },
  { nome: 'Compareceu',       cor: '#0891B2', posicao: 3, alerta_dias: 14 },
  { nome: 'Retorno',          cor: '#D97706', posicao: 4, alerta_dias: 30 },
  { nome: 'Fidelizado',       cor: '#059669', posicao: 5, alerta_dias: 90 },
  { nome: 'Perdido',          cor: '#DC2626', posicao: 6, alerta_dias: null },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function daysIn(dateStr) {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}
function initials(nome, phone) {
  if (nome) return nome.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
  return (phone || '??').slice(-2)
}
function fmtPhone(p) {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
  if (d.length >= 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9,13)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  return p
}
function relTime(dateStr) {
  if (!dateStr) return null
  const d = daysIn(dateStr)
  if (d === 0) return 'hoje'
  if (d === 1) return 'ontem'
  return `${d}d atrás`
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CompanyCRM() {
  const { session } = useAuth()
  const instance = session?.company?.instance

  const [loading, setLoading]         = useState(true)
  const [funnels, setFunnels]         = useState([])
  const [stages, setStages]           = useState([])
  const [contacts, setContacts]       = useState([])
  const [panelTimeline, setPanelTimeline] = useState([])
  const [panelLoading, setPanelLoading]  = useState(false)
  const [users, setUsers]               = useState([])
  const [kanbanCols, setKanbanCols]     = useState([])
  const [kanbanModal, setKanbanModal]   = useState(null)
  const [savingKanban, setSavingKanban] = useState(false)
  const [activeView, setActiveView]     = useState('board')
  const [lists, setLists]               = useState([])
  const [listModal, setListModal]       = useState(null)
  const [activeList, setActiveList]     = useState(null)
  const [savingList, setSavingList]     = useState(false)
  const [activeFunnel, setActiveFunnel] = useState(null)
  const [search, setSearch]           = useState('')
  const [filterTemp, setFilterTemp]   = useState('todos')
  const [dragging, setDragging]       = useState(null)
  const [dragOver, setDragOver]       = useState(null)
  const [panel, setPanel]             = useState(null)
  const [panelNote, setPanelNote]     = useState('')
  const [newModal, setNewModal]       = useState(false)
  const [newForm, setNewForm]         = useState({ nome:'', phone:'', email:'', origem:'', temperatura:'morno', stage_id:'', observacoes:'' })
  const [saving, setSaving]           = useState(false)
  const [confirmDel, setConfirmDel]   = useState(null)
  const [editingCardId, setEditingCardId] = useState(null) // edição inline do nome direto no card
  const [editingCardName, setEditingCardName] = useState('')

  // ── Load ───────────────────────────────────────────────────────────────────
  async function load() {
    if (!instance) return
    setLoading(true)
    const [{ data: fn }, { data: st }, { data: ct }, { data: kc }, { data: ls }] = await Promise.all([
      supabase.from('crm_funnels').select('*').eq('instancia', instance).order('posicao'),
      supabase.from('crm_stages').select('*').eq('instancia', instance).order('posicao'),
      supabase.from('crm_contacts').select('*').eq('instancia', instance).order('created_at', { ascending: false }),
      supabase.from('kanban_columns').select('id,name,color').eq('instancia', instance).order('position'),
      supabase.from('crm_lists').select('*').eq('instancia', instance).order('created_at'),
    ])
    if (kc) setKanbanCols(kc)
    if (ls) setLists(ls)

    let myFunnels = fn || [], myStages = st || []

    if (myFunnels.length === 0) {
      const { data: nf } = await supabase.from('crm_funnels')
        .insert({ instancia: instance, nome: 'Funil Principal', posicao: 0 }).select().single()
      if (nf) {
        myFunnels = [nf]
        const { data: ns } = await supabase.from('crm_stages')
          .insert(DEFAULT_STAGES.map(s => ({ ...s, funil_id: nf.id, instancia: instance }))).select()
        if (ns) myStages = ns.sort((a,b) => a.posicao - b.posicao)
      }
    }

    setFunnels(myFunnels)
    setStages(myStages)
    setContacts(ct || [])
    setActiveFunnel(prev => prev || myFunnels[0]?.id || null)
    setLoading(false)
  }

  const cleanNum = p => (p||'').replace(/@.*$/,'').replace(/\D/g,'')

  async function loadPanelData(contact) {
    if (!instance || !contact?.phone) return
    setPanelLoading(true)
    const phone = cleanNum(contact.phone)

    const [
      { data: crmIx },
      { data: msgs  },
      { data: appts },
      { data: finTx },
      { data: usrs  },
      { data: kCards },
    ] = await Promise.all([
      supabase.from('crm_interactions').select('*')
        .eq('instancia', instance).eq('phone', phone)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('mensagens_geral')
        .select('id,numero,type,mensagem,created_at')
        .eq('instancia', instance).eq('numero', phone)
        .order('created_at', { ascending: false }).limit(40),
      supabase.from('appointments')
        .select('id,contact_nome,contact_numero,starts_at,status,price,procedure_name:procedures(name)')
        .eq('instancia', instance)
        .order('starts_at', { ascending: false }).limit(30),
      supabase.from('financial_transactions')
        .select('id,tipo,valor,status,descricao,vencimento,contact_nome,forma_pagamento')
        .eq('instancia', instance)
        .order('vencimento', { ascending: false }).limit(50),
      supabase.from('users').select('id,name,email').eq('company_id', session?.company?.id),
      supabase.from('kanban_cards')
        .select('id,title,description,priority,due_date,column_id,assigned_user_name,created_at')
        .eq('crm_contact_id', contact.id)
        .order('created_at', { ascending: false }),
    ])

    if (usrs) setUsers(usrs)

    const myAppts = (appts||[]).filter(a => cleanNum(a.contact_numero) === phone)
    const nome0 = (contact.nome||'').toLowerCase().split(' ')[0]
    const myFin = (finTx||[]).filter(t =>
      nome0 && t.contact_nome && t.contact_nome.toLowerCase().includes(nome0)
    )

    const TYPE_META = {
      nota:         { label:'Nota',          color:'#7C3AED', bg:'#F5F3FF' },
      etapa:        { label:'Etapa',         color:'#2563EB', bg:'#EFF6FF' },
      mensagem:     { label:'Mensagem',      color:'#059669', bg:'#ECFDF5' },
      agendamento:  { label:'Agendamento',   color:'#D97706', bg:'#FFFBEB' },
      financeiro:   { label:'Financeiro',    color:'#0891B2', bg:'#ECFEFF' },
      tarefa:       { label:'Tarefa',        color:'#6B7280', bg:'#F1F5F9' },
      kanban:       { label:'Kanban',        color:'#7C3AED', bg:'#F3E8FF' },
    }

    const APPT_STATUS = { agendado:'Agendado', confirmado:'Confirmado', concluido:'Concluído', faltou:'Não compareceu', cancelado:'Cancelado' }
    const fmtBRL = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

    const timeline = [
      ...(crmIx||[]).map(ix => ({
        id:`crm-${ix.id}`, date: ix.created_at, source:'crm', tipo: ix.tipo,
        conteudo: ix.conteudo, autor: ix.autor_nome, meta: TYPE_META[ix.tipo]||TYPE_META.nota,
      })),
      ...(msgs||[]).map(m => ({
        id:`msg-${m.id}`, date: m.created_at, source:'whatsapp', tipo:'mensagem',
        conteudo: (m.mensagem||'').slice(0,200),
        subtype: (m.type||'').toLowerCase(),
        meta: TYPE_META.mensagem,
      })),
      ...myAppts.map(a => ({
        id:`appt-${a.id}`, date: a.starts_at, source:'agenda', tipo:'agendamento',
        conteudo: `${APPT_STATUS[a.status]||a.status}${a.procedure_name?.name ? ` · ${a.procedure_name.name}` : ''}${a.price ? ` · ${fmtBRL(a.price)}` : ''}`,
        status: a.status,
        meta: TYPE_META.agendamento,
      })),
      ...myFin.map(t => ({
        id:`fin-${t.id}`, date: t.vencimento+'T12:00:00', source:'financeiro', tipo:'financeiro',
        conteudo: `${t.tipo==='receita'?'↑':'↓'} ${t.descricao} · ${fmtBRL(t.valor)} · ${t.status}${t.forma_pagamento?' · '+t.forma_pagamento:''}`,
        fintipo: t.tipo,
        meta: TYPE_META.financeiro,
      })),
      ...(kCards||[]).map(k => {
        const col = kanbanCols.find(c => c.id === k.column_id)
        const PRIO = { baixa:'#6B7280', normal:'#2563EB', alta:'#D97706', urgente:'#DC2626' }
        return {
          id:`kb-${k.id}`, date: k.created_at, source:'kanban', tipo:'kanban',
          conteudo: k.title,
          kbPrio: k.priority,
          kbPrioColor: PRIO[k.priority]||PRIO.normal,
          kbCol: col?.name || 'Kanban',
          kbColColor: col?.color || '#6B7280',
          kbDue: k.due_date,
          kbAssigned: k.assigned_user_name,
          kbDesc: k.description,
          kbId: k.id,
          meta: TYPE_META.kanban,
        }
      }),
    ].sort((a,b) => new Date(b.date) - new Date(a.date))

    setPanelTimeline(timeline)
    setPanelLoading(false)
  }

  async function createKanbanCard() {
    if (!kanbanModal || !panel) return
    if (!kanbanModal.title?.trim()) return
    setSavingKanban(true)
    const col = kanbanCols.find(c => c.id === kanbanModal.column_id) || kanbanCols[0]
    const { data, error } = await supabase.from('kanban_cards').insert({
      instancia: instance,
      column_id: col?.id,
      crm_contact_id: panel.id,
      contact_nome: panel.nome || panel.phone,
      title: kanbanModal.title.trim(),
      description: kanbanModal.description?.trim() || null,
      due_date: kanbanModal.due_date || null,
      priority: kanbanModal.priority || 'normal',
      assigned_user_id: kanbanModal.assigned_user_id || null,
      assigned_user_name: kanbanModal.assigned_user_name || null,
      position: 9999,
      created_by_email: session?.user?.email,
    }).select().single()
    setSavingKanban(false)
    if (error) { alert('Erro ao criar tarefa: ' + error.message); return }
    // Adiciona à timeline otimisticamente
    const PRIO = { baixa:'#6B7280', normal:'#2563EB', alta:'#D97706', urgente:'#DC2626' }
    const entry = {
      id:`kb-${data.id}`, date: data.created_at, source:'kanban', tipo:'kanban',
      conteudo: data.title,
      kbPrio: data.priority, kbPrioColor: PRIO[data.priority]||PRIO.normal,
      kbCol: col?.name||'Kanban', kbColColor: col?.color||'#6B7280',
      kbDue: data.due_date, kbAssigned: data.assigned_user_name,
      kbDesc: data.description, kbId: data.id,
      meta: { label:'Kanban', color:'#7C3AED', bg:'#F3E8FF' },
    }
    setPanelTimeline(p => [entry, ...p])
    // Loga no histórico CRM
    await supabase.from('crm_interactions').insert({
      instancia: instance, phone: cleanNum(panel.phone), tipo:'tarefa',
      conteudo: `Tarefa criada no Kanban: ${data.title}`,
      autor_nome: session?.user?.name || session?.user?.email,
    })
    setKanbanModal(null)
  }

  useEffect(() => { load() }, [instance])
  useEffect(() => { if (panel) { setPanelTimeline([]); loadPanelData(panel) } }, [panel?.id])

  // ── Computed ────────────────────────────────────────────────────────────────
  const funStages = useMemo(
    () => stages.filter(s => s.funil_id === activeFunnel).sort((a,b) => a.posicao - b.posicao),
    [stages, activeFunnel]
  )

  const filteredContacts = useMemo(() => {
    const q = search.toLowerCase().trim()
    return contacts.filter(c => {
      const inFunil = !c.funil_id || c.funil_id === activeFunnel
      if (!inFunil) return false
      if (filterTemp !== 'todos' && c.temperatura !== filterTemp) return false
      if (q && !(c.nome||'').toLowerCase().includes(q) && !(c.phone||'').includes(q) && !(c.email||'').toLowerCase().includes(q)) return false
      return true
    })
  }, [contacts, search, filterTemp, activeFunnel])

  const byStage = useMemo(() => {
    const map = {}
    funStages.forEach(s => { map[s.id] = [] })
    filteredContacts.forEach(c => {
      const key = (c.stage_id && map[c.stage_id] !== undefined) ? c.stage_id : (funStages[0]?.id || '__none__')
      if (map[key]) map[key].push(c)
    })
    return map
  }, [filteredContacts, funStages])

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  function onDragStart(e, contact) {
    setDragging({ id: contact.id, fromStage: contact.stage_id })
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, stageId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(stageId)
  }
  async function onDrop(e, toStageId) {
    e.preventDefault()
    setDragOver(null)
    if (!dragging || dragging.fromStage === toStageId) { setDragging(null); return }

    const now = new Date().toISOString()
    setContacts(prev => prev.map(c => c.id === dragging.id
      ? { ...c, stage_id: toStageId, funil_id: activeFunnel, data_entrada_etapa: now }
      : c
    ))
    const fromStage = stages.find(s => s.id === dragging.fromStage)
    const toStage   = stages.find(s => s.id === toStageId)

    await supabase.from('crm_contacts').update({ stage_id: toStageId, funil_id: activeFunnel, data_entrada_etapa: now }).eq('id', dragging.id)
    await supabase.from('crm_interactions').insert({
      instancia: instance, phone: contacts.find(c=>c.id===dragging.id)?.phone || '',
      tipo: 'etapa',
      conteudo: `Movido de "${fromStage?.nome||'Sem etapa'}" → "${toStage?.nome||'Sem etapa'}"`,
      metadata: { from: dragging.fromStage, to: toStageId },
      autor_nome: session?.user?.name || session?.user?.email,
    })
    setDragging(null)
    if (panel?.id === dragging.id) setPanel(p => ({ ...p, stage_id: toStageId }))
  }

  // ── Contact CRUD ────────────────────────────────────────────────────────────
  async function createContact() {
    if (!newForm.phone.trim()) return
    setSaving(true)
    const { data: nc, error } = await supabase.from('crm_contacts').insert({
      instancia: instance,
      phone: newForm.phone.replace(/\D/g,''),
      nome: newForm.nome.trim() || null,
      email: newForm.email.trim() || null,
      origem: newForm.origem || null,
      temperatura: newForm.temperatura,
      stage_id: newForm.stage_id || funStages[0]?.id || null,
      funil_id: activeFunnel,
      observacoes: newForm.observacoes || null,
      data_entrada_etapa: new Date().toISOString(),
    }).select().single()
    setSaving(false)
    if (error) { alert('Erro: '+error.message); return }
    setContacts(p => [nc, ...p])
    setNewModal(false)
    setNewForm({ nome:'', phone:'', email:'', origem:'', temperatura:'morno', stage_id:'', observacoes:'' })
  }

  async function patchContact(id, changes) {
    await supabase.from('crm_contacts').update(changes).eq('id', id)
    setContacts(p => p.map(c => c.id===id ? {...c,...changes} : c))
    if (panel?.id === id) setPanel(p => ({...p,...changes}))
  }

  const TEMP_CYCLE = ['frio', 'morno', 'quente']
  function cycleTemp(contact) {
    const next = TEMP_CYCLE[(TEMP_CYCLE.indexOf(contact.temperatura) + 1) % TEMP_CYCLE.length]
    patchContact(contact.id, { temperatura: next })
  }

  function startEditCardName(contact, e) {
    e.stopPropagation()
    setEditingCardId(contact.id)
    setEditingCardName(contact.nome || '')
  }
  function commitEditCardName(contact) {
    const v = editingCardName.trim()
    setEditingCardId(null)
    if (v !== (contact.nome || '')) patchContact(contact.id, { nome: v || null })
  }

  async function deleteContact(id) {
    await supabase.from('crm_contacts').delete().eq('id', id)
    setContacts(p => p.filter(c => c.id!==id))
    setConfirmDel(null)
    if (panel?.id === id) setPanel(null)
  }

  async function addNote() {
    if (!panelNote.trim() || !panel) return
    const row = {
      instancia: instance, phone: cleanNum(panel.phone), tipo: 'nota',
      conteudo: panelNote.trim(),
      autor_nome: session?.user?.name || session?.user?.email,
    }
    const { data } = await supabase.from('crm_interactions').insert(row).select().single()
    if (data) {
      const entry = {
        id:`crm-${data.id}`, date: data.created_at, source:'crm', tipo:'nota',
        conteudo: data.conteudo, autor: data.autor_nome,
        meta: { label:'Nota', color:'#7C3AED', bg:'#F5F3FF' },
      }
      setPanelTimeline(p => [entry, ...p])
    }
    setPanelNote('')
  }

  async function saveList() {
    if (!listModal?.nome?.trim()) return
    setSavingList(true)
    if (listModal.id) {
      const { data } = await supabase.from('crm_lists')
        .update({ nome: listModal.nome, filtros: listModal.filtros })
        .eq('id', listModal.id).select().single()
      if (data) { setLists(p => p.map(l => l.id === data.id ? data : l)); setActiveList(data) }
    } else {
      const { data } = await supabase.from('crm_lists')
        .insert({ instancia: instance, nome: listModal.nome, filtros: listModal.filtros })
        .select().single()
      if (data) { setLists(p => [...p, data]); setActiveList(data) }
    }
    setSavingList(false)
    setListModal(null)
  }

  async function deleteList(id) {
    await supabase.from('crm_lists').delete().eq('id', id)
    setLists(p => p.filter(l => l.id !== id))
    if (activeList?.id === id) setActiveList(null)
  }

  function applyListFilter(c, filtros) {
    const f = filtros || {}
    if (f.temperatura && f.temperatura !== 'todos' && c.temperatura !== f.temperatura) return false
    if (f.stage_id && c.stage_id !== f.stage_id) return false
    const dias = daysIn(c.data_entrada_etapa)
    if (f.dias_min && dias < Number(f.dias_min)) return false
    if (f.dias_max && dias > Number(f.dias_max)) return false
    if (f.origem && !(c.origem||'').toLowerCase().includes(f.origem.toLowerCase())) return false
    if (f.tag && !(c.tags||[]).includes(f.tag)) return false
    if (f.responsavel_nome && !(c.responsavel_nome||'').toLowerCase().includes(f.responsavel_nome.toLowerCase())) return false
    if (f.sem_responsavel === true && c.responsavel_id) return false
    return true
  }

  const staleLeads = useMemo(() =>
    contacts.filter(c => {
      const st = stages.find(s => s.id === c.stage_id)
      return st?.alerta_dias && daysIn(c.data_entrada_etapa) > st.alerta_dias
    }).sort((a,b) => daysIn(b.data_entrada_etapa) - daysIn(a.data_entrada_etapa))
  , [contacts, stages])

  const activeListContacts = useMemo(() => {
    if (!activeList) return []
    return contacts.filter(c => applyListFilter(c, activeList.filtros))
  }, [contacts, stages, activeList])

  const totalLeads = filteredContacts.length
  const quentes    = filteredContacts.filter(c => c.temperatura === 'quente').length
  const staleCount = staleLeads.length

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',gap:10,color:C.muted }}>
      <Loader2 size={20} style={{ animation:'spin 1s linear infinite' }} />
      <span style={{ fontSize:14 }}>Carregando CRM...</span>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ height:'calc(100vh - 64px)', display:'flex', flexDirection:'column', overflow:'hidden', background: C.bg, fontFamily:'"Inter",system-ui,sans-serif' }}>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        .crm-card{cursor:grab;transition:box-shadow 0.15s,transform 0.15s}
        .crm-card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.1);transform:translateY(-1px)}
        .crm-card:active{cursor:grabbing}
        .crm-col-drop{background:rgba(37,99,235,0.06)!important;border-color:#93C5FD!important}
        .crm-btn{transition:all 0.15s}
        .crm-btn:hover{opacity:0.85}
      `}</style>

      {/* ── Top Bar ── */}
      <div style={{ background: C.card, borderBottom:`1px solid ${C.border}`, padding:'12px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:32,height:32,borderRadius:9,background:C.navy,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <GitMerge size={15} color="#fff"/>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:C.navy, lineHeight:1 }}>CRM</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>Pipeline de contatos</div>
          </div>
        </div>

        {/* Funil selector */}
        {funnels.length > 1 && (
          <div style={{ display:'flex', gap:4, marginLeft:8 }}>
            {funnels.map(f => (
              <button key={f.id} onClick={() => setActiveFunnel(f.id)} className="crm-btn" style={{
                padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
                background: activeFunnel===f.id ? C.navy : 'transparent',
                color: activeFunnel===f.id ? '#fff' : C.slate,
                border: `1px solid ${activeFunnel===f.id ? C.navy : C.border}`,
              }}>{f.nome}</button>
            ))}
          </div>
        )}

        {/* Stats strip */}
        <div style={{ display:'flex', gap:16, marginLeft:8 }}>
          {[
            { v: totalLeads, l: 'leads',   c: C.blue },
            { v: quentes,    l: '🔥 quentes', c: '#DC2626' },
            { v: staleCount, l: '⚠️ parados', c: '#D97706' },
          ].map(s => (
            <div key={s.l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:s.c, lineHeight:1 }}>{s.v}</div>
              <div style={{ fontSize:9, color:C.muted, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div style={{ flex:1 }} />

        {/* View switcher */}
        <div style={{ display:'flex', gap:2, background:C.bg, borderRadius:10, padding:3 }}>
          {[
            { id:'board',   label:'Board',   Icon:Kanban },
            { id:'alertas', label:`Alertas${staleLeads.length ? ` (${staleLeads.length})` : ''}`, Icon:AlertTriangle, warn: staleLeads.length > 0 },
            { id:'listas',  label:'Listas',  Icon:BookMarked },
          ].map(v => (
            <button key={v.id} onClick={() => setActiveView(v.id)} style={{
              display:'flex', alignItems:'center', gap:5, padding:'5px 11px',
              borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:700,
              background: activeView === v.id ? C.card : 'transparent',
              color: activeView === v.id ? C.navy : v.warn ? '#D97706' : C.muted,
              boxShadow: activeView === v.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition:'all 0.15s',
            }}>
              <v.Icon size={11}/> {v.label}
            </button>
          ))}
        </div>

        {activeView === 'board' && <>
          {/* Search */}
          <div style={{ position:'relative' }}>
            <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:C.muted, pointerEvents:'none' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar lead..."
              style={{ paddingLeft:28, paddingRight:10, height:32, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, outline:'none', width:160, background:C.card, color:C.navy }}/>
          </div>

          {/* Temp filter */}
          <select value={filterTemp} onChange={e=>setFilterTemp(e.target.value)}
            style={{ height:32, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, padding:'0 10px', background:C.card, color:C.navy, outline:'none', cursor:'pointer' }}>
            <option value="todos">Todos</option>
            {Object.entries(TEMP).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </>}

        <button onClick={() => { setNewForm({ nome:'', phone:'', email:'', origem:'', temperatura:'morno', stage_id: funStages[0]?.id||'', observacoes:'' }); setNewModal(true) }}
          className="crm-btn" style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px', height:32, borderRadius:8, background:C.navy, color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:700 }}>
          <UserPlus size={13}/> Novo Lead
        </button>
      </div>

      {/* ── Alertas View ── */}
      {activeView === 'alertas' && (
        <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
          <div style={{ maxWidth:900, margin:'0 auto' }}>
            {staleLeads.length === 0 ? (
              <div style={{ textAlign:'center', padding:'4rem', color:C.muted }}>
                <Check size={40} style={{ marginBottom:12, color:'#059669', opacity:.5 }}/>
                <div style={{ fontSize:15, fontWeight:700, color:C.navy }}>Nenhum lead parado</div>
                <div style={{ fontSize:12, marginTop:4 }}>Todos os leads estão dentro do prazo de cada etapa.</div>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <AlertTriangle size={16} color="#D97706"/>
                  <span style={{ fontWeight:800, fontSize:14, color:C.navy }}>Leads parados além do limite</span>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#FFFBEB', color:'#D97706', fontWeight:700, border:'1px solid #FDE68A' }}>{staleLeads.length}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {staleLeads.map(c => {
                    const stage = stages.find(s => s.id === c.stage_id)
                    const days = daysIn(c.data_entrada_etapa)
                    const over = stage?.alerta_dias ? days - stage.alerta_dias : 0
                    const temp = TEMP[c.temperatura] || TEMP.frio
                    return (
                      <div key={c.id} onClick={() => setPanel(c)}
                        style={{ background:C.card, border:'1.5px solid #FDE68A', borderLeft:'4px solid #D97706', borderRadius:10, padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, transition:'box-shadow 0.15s' }}
                        onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'}
                        onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                        <div style={{ width:38,height:38,borderRadius:'50%',background:stage?.cor||C.slate,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:14,flexShrink:0 }}>
                          {(c.nome||c.phone||'?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>{c.nome||fmtPhone(c.phone)}</div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                            {stage?.nome} · {temp.icon} {temp.label}
                            {c.responsavel_nome && <span> · {c.responsavel_nome}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontWeight:800, fontSize:18, color:'#DC2626', lineHeight:1 }}>{days}d</div>
                          <div style={{ fontSize:9.5, color:'#D97706', fontWeight:700 }}>+{over}d acima do limite</div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                            style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:8,background:'#ECFDF5',border:'1px solid #BBF7D0',color:'#059669',cursor:'pointer',textDecoration:'none' }}>
                            <Phone size={12}/>
                          </a>
                          <button onClick={e=>{e.stopPropagation();setPanel(c)}}
                            style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:8,background:C.bg,border:`1px solid ${C.border}`,color:C.slate,cursor:'pointer' }}>
                            <ChevronRight size={12}/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Listas View ── */}
      {activeView === 'listas' && (
        <div style={{ flex:1, overflow:'hidden', display:'flex' }}>
          {/* Sidebar: saved lists */}
          <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${C.border}`, background:C.card, display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontWeight:800, fontSize:12, color:C.navy, marginBottom:10 }}>Listas salvas</div>
              <button onClick={() => setListModal({ nome:'', filtros:{ temperatura:'todos', stage_id:'', dias_min:'', dias_max:'', origem:'', tag:'', sem_responsavel:false } })}
                style={{ display:'flex',alignItems:'center',gap:6,width:'100%',padding:'7px 10px',borderRadius:8,border:`1.5px dashed ${C.border}`,background:'transparent',color:C.muted,cursor:'pointer',fontSize:11,fontWeight:600 }}>
                <Plus size={11}/> Nova lista
              </button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
              {lists.length === 0 && (
                <div style={{ fontSize:11, color:C.muted, textAlign:'center', padding:'2rem 1rem', lineHeight:1.6 }}>
                  Crie listas com filtros para segmentar seus leads.
                </div>
              )}
              {lists.map(l => {
                const cnt = contacts.filter(c => applyListFilter(c, l.filtros)).length
                return (
                  <div key={l.id}
                    style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', marginBottom:2, display:'flex', alignItems:'center', gap:8,
                      background: activeList?.id === l.id ? '#EFF6FF' : 'transparent',
                      border: `1px solid ${activeList?.id === l.id ? '#BFDBFE' : 'transparent'}`,
                    }}
                    onClick={() => setActiveList(l)}>
                    <Filter size={11} color={activeList?.id === l.id ? C.blue : C.muted}/>
                    <span style={{ flex:1, fontSize:12, fontWeight:600, color: activeList?.id === l.id ? C.blue : C.navy, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.nome}</span>
                    <span style={{ fontSize:10, fontWeight:700, color: activeList?.id === l.id ? C.blue : C.muted, background: activeList?.id === l.id ? '#DBEAFE' : C.bg, padding:'1px 6px', borderRadius:10 }}>{cnt}</span>
                  </div>
                )
              })}
            </div>

            {/* Automações rápidas */}
            <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Automações</div>
              <div style={{ fontSize:11, color:C.slate, display:'flex', alignItems:'center', gap:6, padding:'5px 0' }}>
                <Zap size={11} color="#D97706"/>
                <span>Agenda → "Agendou"</span>
                <span style={{ marginLeft:'auto', fontSize:9.5, padding:'2px 6px', borderRadius:10, background:'#ECFDF5', color:'#059669', fontWeight:700 }}>Ativo</span>
              </div>
            </div>
          </div>

          {/* Main: filter builder + results */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
            {!activeList ? (
              <div style={{ textAlign:'center', padding:'4rem', color:C.muted }}>
                <Filter size={40} style={{ marginBottom:12, opacity:.3 }}/>
                <div style={{ fontSize:14, fontWeight:700, color:C.navy }}>Selecione ou crie uma lista</div>
                <div style={{ fontSize:12, marginTop:4 }}>Listas filtram seus leads por critérios salvos.</div>
              </div>
            ) : (
              <div style={{ maxWidth:860, margin:'0 auto' }}>
                {/* List header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                  <Filter size={15} color={C.blue}/>
                  <span style={{ fontWeight:800, fontSize:16, color:C.navy }}>{activeList.nome}</span>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:C.blueDim, color:C.blue, fontWeight:700 }}>{activeListContacts.length} leads</span>
                  <div style={{ flex:1 }}/>
                  <button onClick={() => setListModal({ ...activeList })} style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.slate, cursor:'pointer', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                    <Edit2 size={11}/> Editar filtros
                  </button>
                  <button onClick={() => { if(confirm('Apagar lista?')) deleteList(activeList.id) }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #FECACA', background:'#FFF1F2', color:'#DC2626', cursor:'pointer', fontSize:11 }}>
                    <Trash2 size={11}/>
                  </button>
                </div>

                {/* Filter pills */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                  {Object.entries(activeList.filtros||{}).map(([k,v]) => {
                    if (!v || v === 'todos' || v === '') return null
                    const labels = { temperatura:'Temp', stage_id:'Etapa', dias_min:'Mín dias', dias_max:'Máx dias', origem:'Origem', tag:'Tag', responsavel_nome:'Responsável', sem_responsavel:'Sem responsável' }
                    const stage = k === 'stage_id' ? stages.find(s=>s.id===v) : null
                    const display = stage?.nome || (k==='sem_responsavel'?'Sem responsável':String(v))
                    return (
                      <span key={k} style={{ fontSize:10.5, padding:'3px 10px', borderRadius:20, background:C.blueDim, color:C.blue, fontWeight:700, border:'1px solid #BFDBFE' }}>
                        {labels[k]||k}: {display}
                      </span>
                    )
                  })}
                </div>

                {/* Results */}
                {activeListContacts.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'3rem', color:C.muted, fontSize:12 }}>Nenhum lead corresponde a esses filtros.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {activeListContacts.map(c => {
                      const stage = stages.find(s => s.id === c.stage_id)
                      const temp = TEMP[c.temperatura] || TEMP.frio
                      const days = daysIn(c.data_entrada_etapa)
                      return (
                        <div key={c.id} onClick={() => setPanel(c)}
                          style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12, transition:'all 0.15s' }}
                          onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,0.07)';e.currentTarget.style.borderColor='#BFDBFE'}}
                          onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.borderColor=C.border}}>
                          <div style={{ width:36,height:36,borderRadius:'50%',background:stage?.cor||C.slate,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:13,flexShrink:0 }}>
                            {(c.nome||c.phone||'?')[0].toUpperCase()}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nome||fmtPhone(c.phone)}</div>
                            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                              {stage?.nome||'—'} · {temp.icon} {temp.label} · {days}d
                              {c.responsavel_nome && <> · {c.responsavel_nome}</>}
                            </div>
                          </div>
                          {(c.tags||[]).slice(0,2).map(t => (
                            <span key={t} style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:C.bg, color:C.slate }}>{t}</span>
                          ))}
                          <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                            style={{ display:'flex',alignItems:'center',justifyContent:'center',width:28,height:28,borderRadius:8,background:'#ECFDF5',border:'1px solid #BBF7D0',color:'#059669',textDecoration:'none' }}>
                            <Phone size={11}/>
                          </a>
                          <ChevronRight size={13} color={C.muted}/>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pipeline Board ── */}
      {activeView === 'board' && <div style={{ flex:1, overflowX:'auto', overflowY:'hidden', display:'flex', gap:12, padding:'16px 20px', alignItems:'flex-start' }}>
        {funStages.map(stage => {
          const cards = byStage[stage.id] || []
          const isOver = dragOver === stage.id
          const stageTotal = cards.length

          return (
            <div key={stage.id}
              onDragOver={e => onDragOver(e, stage.id)}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => onDrop(e, stage.id)}
              className={isOver ? 'crm-col-drop' : ''}
              style={{
                width: 272, flexShrink:0, display:'flex', flexDirection:'column',
                background: isOver ? 'rgba(37,99,235,0.05)' : C.card,
                border: `1.5px solid ${isOver ? '#93C5FD' : C.border}`,
                borderRadius:14, overflow:'hidden', maxHeight:'100%', transition:'all 0.15s',
              }}>

              {/* Column header */}
              <div style={{ padding:'12px 14px 10px', borderBottom:`1px solid ${C.border}`, background:C.card, flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:10,height:10,borderRadius:'50%',background:stage.cor,flexShrink:0 }}/>
                  <span style={{ fontWeight:700, fontSize:12.5, color:C.navy, flex:1 }}>{stage.nome}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:stage.cor, borderRadius:20, padding:'1px 8px', minWidth:20, textAlign:'center' }}>{stageTotal}</span>
                </div>
                {stage.alerta_dias && (
                  <div style={{ fontSize:9.5, color:C.muted, marginTop:4, paddingLeft:18 }}>alerta após {stage.alerta_dias}d</div>
                )}
              </div>

              {/* Cards */}
              <div style={{ flex:1, overflowY:'auto', padding:'8px', display:'flex', flexDirection:'column', gap:7 }}>
                {cards.map(contact => {
                  const days = daysIn(contact.data_entrada_etapa)
                  const stale = stage.alerta_dias && days > stage.alerta_dias
                  const temp = TEMP[contact.temperatura] || TEMP.frio
                  const initStr = initials(contact.nome, contact.phone)
                  const origemColor = ORIGEM_COLORS[contact.origem] || '#6B7280'

                  return (
                    <div key={contact.id}
                      draggable
                      onDragStart={e => onDragStart(e, contact)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setPanel(contact)}
                      className="crm-card"
                      style={{
                        background: stale ? '#FFFBEB' : C.card,
                        border: `1px solid ${stale ? '#FDE68A' : C.border}`,
                        borderRadius:10, padding:'10px 12px',
                        opacity: dragging?.id === contact.id ? 0.4 : 1,
                      }}>

                      <div style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
                        {/* Avatar */}
                        <div style={{
                          width:34,height:34,borderRadius:'50%',flexShrink:0,
                          background:`linear-gradient(135deg, ${stage.cor}22, ${stage.cor}44)`,
                          border:`1.5px solid ${stage.cor}66`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:11,fontWeight:800,color:stage.cor,
                        }}>{initStr}</div>

                        <div style={{ flex:1, minWidth:0 }}>
                          {editingCardId === contact.id ? (
                            <input
                              autoFocus
                              value={editingCardName}
                              onChange={e => setEditingCardName(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              onBlur={() => commitEditCardName(contact)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEditCardName(contact) }
                                if (e.key === 'Escape') { setEditingCardId(null) }
                              }}
                              placeholder="Nome do contato"
                              style={{
                                width:'100%', boxSizing:'border-box', fontWeight:700, fontSize:12.5,
                                color:C.navy, border:`1px solid #93C5FD`, borderRadius:5,
                                padding:'2px 5px', background:'#EFF6FF', outline:'none',
                              }}
                            />
                          ) : (
                            <div
                              onClick={e => startEditCardName(contact, e)}
                              title="Clique para editar o nome"
                              style={{ fontWeight:700, fontSize:12.5, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'text' }}
                            >
                              {contact.nome || fmtPhone(contact.phone) || 'Sem nome'}
                            </div>
                          )}
                          {contact.nome && (
                            <div style={{ fontSize:10.5, color:C.muted, marginTop:1 }}>{fmtPhone(contact.phone)}</div>
                          )}
                        </div>

                        {/* Temperature dot — clique cicla frio → morno → quente */}
                        <div title={`${temp.label} (clique para mudar)`}
                          onClick={e => { e.stopPropagation(); cycleTemp(contact) }}
                          style={{ width:12,height:12,borderRadius:'50%', background:temp.dot, flexShrink:0, marginTop:2, cursor:'pointer', border:'2px solid #fff', boxShadow:`0 0 0 1px ${temp.dot}` }}
                        />
                      </div>

                      {/* Tags row */}
                      <div style={{ display:'flex', gap:5, marginTop:8, flexWrap:'wrap', alignItems:'center' }}>
                        {contact.origem && (
                          <span style={{ fontSize:9.5, fontWeight:700, padding:'2px 7px', borderRadius:20, background:origemColor+'18', color:origemColor }}>
                            {contact.origem}
                          </span>
                        )}
                        {(contact.tags||[]).slice(0,2).map(t => (
                          <span key={t} style={{ fontSize:9.5, padding:'2px 6px', borderRadius:20, background:'#F1F5F9', color:C.slate }}>{t}</span>
                        ))}
                      </div>

                      {/* Footer */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color: stale ? '#D97706' : C.muted }}>
                          {stale ? <AlertTriangle size={10} color="#D97706"/> : <Clock size={10}/>}
                          {days === 0 ? 'hoje' : `${days}d nesta etapa`}
                        </div>
                        {contact.data_ult_contato && (
                          <div style={{ fontSize:9.5, color:C.muted }}>
                            último: {relTime(contact.data_ult_contato)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Add card button */}
                <button onClick={() => { setNewForm(p => ({...p, stage_id: stage.id})); setNewModal(true) }}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', border:`1.5px dashed ${C.border}`, borderRadius:9, background:'transparent', color:C.muted, cursor:'pointer', fontSize:11, width:'100%', transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=stage.cor;e.currentTarget.style.color=stage.cor}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted}}>
                  <Plus size={12}/> Adicionar lead
                </button>
              </div>
            </div>
          )
        })}
      </div>}

      {/* ── Side Panel ── */}
      {panel && (() => {
        const c = contacts.find(x => x.id === panel.id) || panel
        const stage = stages.find(s => s.id === c.stage_id)
        const temp = TEMP[c.temperatura] || TEMP.frio

        return (
          <div style={{
            position:'fixed', top:0, right:0, bottom:0, width:400,
            background:C.card, borderLeft:`1px solid ${C.border}`,
            display:'flex', flexDirection:'column', zIndex:50,
            animation:'slideIn 0.2s ease',
            boxShadow:'-8px 0 32px rgba(0,0,0,0.08)',
          }}>

            {/* Panel header */}
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <div style={{
                width:44,height:44,borderRadius:'50%',
                background:`linear-gradient(135deg,${stage?.cor||'#6B7280'}22,${stage?.cor||'#6B7280'}55)`,
                border:`2px solid ${stage?.cor||'#6B7280'}66`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:15,fontWeight:800,color:stage?.cor||C.slate,flexShrink:0,
              }}>{initials(c.nome, c.phone)}</div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:15, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.nome || fmtPhone(c.phone) || 'Sem nome'}
                </div>
                {c.nome && <div style={{ fontSize:11.5, color:C.muted }}>{fmtPhone(c.phone)}</div>}
              </div>

              <button onClick={() => setPanel(null)} style={{ width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted }}>
                <X size={14}/>
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:16 }}>

              {/* Quick info */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div style={{ background:C.bg, borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:9.5,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4 }}>Temperatura</div>
                  <div style={{ display:'flex', gap:4 }}>
                    {Object.entries(TEMP).map(([k,v]) => (
                      <button key={k} onClick={() => patchContact(c.id, { temperatura:k })}
                        style={{ flex:1, padding:'4px 2px', borderRadius:6, border:`1.5px solid ${c.temperatura===k ? v.color : C.border}`, background:c.temperatura===k ? v.bg : 'transparent', cursor:'pointer', fontSize:11, fontWeight:700, color:c.temperatura===k ? v.color : C.muted, transition:'all 0.15s' }}>
                        {v.icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ background:C.bg, borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:9.5,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4 }}>Etapa</div>
                  <select value={c.stage_id||''} onChange={e => patchContact(c.id, { stage_id:e.target.value, data_entrada_etapa: new Date().toISOString() })}
                    style={{ width:'100%', border:'none', background:'transparent', fontSize:12, fontWeight:700, color:stage?.cor||C.navy, cursor:'pointer', outline:'none' }}>
                    {funStages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
              </div>

              {/* Editable fields */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <PanelField label="Nome" value={c.nome||''} onSave={v => patchContact(c.id,{nome:v})} placeholder="Nome do contato"/>
                <PanelField label="Telefone" value={c.phone||''} onSave={v => patchContact(c.id,{phone:v.replace(/\D/g,'')})} placeholder="55119..."/>
                <PanelField label="E-mail" value={c.email||''} onSave={v => patchContact(c.id,{email:v})} placeholder="email@exemplo.com"/>

                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Origem</div>
                  <select value={c.origem||''} onChange={e => patchContact(c.id,{origem:e.target.value})}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',cursor:'pointer' }}>
                    <option value="">— selecionar —</option>
                    {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Tags</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:5 }}>
                    {(c.tags||[]).map(t => (
                      <span key={t} style={{ display:'flex',alignItems:'center',gap:4,fontSize:10,padding:'3px 8px',borderRadius:20,background:'#F1F5F9',color:C.slate,border:`1px solid ${C.border}` }}>
                        {t}
                        <button onClick={() => patchContact(c.id,{tags:(c.tags||[]).filter(x=>x!==t)})} style={{ border:'none',background:'none',cursor:'pointer',color:C.muted,padding:0,lineHeight:1 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={e=>{e.preventDefault();const v=e.target.tag.value.trim();if(v&&!(c.tags||[]).includes(v)){patchContact(c.id,{tags:[...(c.tags||[]),v]});e.target.tag.value=''}}}>
                    <input name="tag" placeholder="+ adicionar tag" style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',fontSize:11,color:C.navy,background:C.card,outline:'none' }}/>
                  </form>
                </div>

                {/* Responsável */}
                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Responsável</div>
                  <select value={c.responsavel_id||''} onChange={e => {
                    const u = users.find(x => x.id === e.target.value)
                    patchContact(c.id,{responsavel_id: e.target.value||null, responsavel_nome: u?.name||u?.email||null})
                  }}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',cursor:'pointer' }}>
                    <option value="">— sem responsável —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name||u.email}</option>)}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Observações</div>
                  <textarea value={c.observacoes||''} onChange={e => patchContact(c.id,{observacoes:e.target.value})}
                    placeholder="Anotações sobre este lead..." rows={3}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'7px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',resize:'vertical',boxSizing:'border-box' }}/>
                </div>

                {/* Motivo de perda (só se estiver na etapa "Perdido") */}
                {stage?.nome?.toLowerCase().includes('perdido') && (
                  <div>
                    <div style={{ fontSize:10,fontWeight:700,color:'#DC2626',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Motivo de perda</div>
                    <select value={c.motivo_perda||''} onChange={e=>patchContact(c.id,{motivo_perda:e.target.value})}
                      style={{ width:'100%',border:`1px solid #FECACA`,borderRadius:7,padding:'6px 10px',fontSize:12,color:'#DC2626',background:'#FFF1F2',outline:'none',cursor:'pointer' }}>
                      <option value="">— selecionar —</option>
                      {['Preço','Não respondeu','Concorrência','Sem interesse','Sem encaixe na agenda','Outro'].map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Add note */}
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8 }}>Adicionar nota</div>
                <div style={{ display:'flex', gap:7 }}>
                  <textarea value={panelNote} onChange={e=>setPanelNote(e.target.value)} placeholder="Nota rápida..." rows={2}
                    style={{ flex:1,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',resize:'none' }}/>
                  <button onClick={addNote} disabled={!panelNote.trim()}
                    style={{ width:36,height:36,borderRadius:8,background:C.navy,color:'#fff',border:'none',cursor:panelNote.trim()?'pointer':'not-allowed',display:'flex',alignItems:'center',justifyContent:'center',alignSelf:'flex-end',opacity:panelNote.trim()?1:0.4 }}>
                    <Check size={14}/>
                  </button>
                </div>
              </div>

              {/* Timeline unificada */}
              <div>
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em' }}>Histórico completo</div>
                  {panelLoading && <Loader2 size={11} color={C.muted} style={{animation:'spin 1s linear infinite'}}/>}
                  {!panelLoading && panelTimeline.length > 0 && (
                    <span style={{ fontSize:10,color:C.muted }}>· {panelTimeline.length} eventos</span>
                  )}
                </div>

                {/* Legend pills */}
                <div style={{ display:'flex',gap:5,flexWrap:'wrap',marginBottom:12 }}>
                  {[
                    { src:'crm',        label:'Notas/Etapas', color:'#7C3AED' },
                    { src:'whatsapp',   label:'WhatsApp',     color:'#059669' },
                    { src:'agenda',     label:'Agenda',       color:'#D97706' },
                    { src:'financeiro', label:'Financeiro',   color:'#0891B2' },
                    { src:'kanban',     label:'Kanban',       color:'#7C3AED' },
                  ].map(p => {
                    const cnt = panelTimeline.filter(t => t.source === p.src).length
                    if (!cnt) return null
                    return (
                      <span key={p.src} style={{ fontSize:9.5,padding:'2px 8px',borderRadius:20,background:p.color+'15',color:p.color,fontWeight:700,border:`1px solid ${p.color}30` }}>
                        {p.label} ({cnt})
                      </span>
                    )
                  })}
                </div>

                {panelTimeline.length === 0 && !panelLoading && (
                  <div style={{ textAlign:'center',padding:'1.5rem',color:C.muted,fontSize:12 }}>Nenhum histórico encontrado</div>
                )}

                <div style={{ display:'flex',flexDirection:'column',gap:0,position:'relative' }}>
                  {panelTimeline.length > 0 && <div style={{ position:'absolute',left:11,top:4,bottom:0,width:1,background:C.border }}/>}
                  {panelTimeline.map(ev => {
                    const SOURCE_ICON = {
                      crm:        ev.tipo === 'nota' ? StickyNote : ArrowRight,
                      whatsapp:   MessageSquare,
                      agenda:     Flag,
                      financeiro: ev.fintipo === 'receita' ? ArrowRight : ArrowRight,
                      kanban:     Kanban,
                    }
                    const Icon = SOURCE_ICON[ev.source] || StickyNote
                    const m = ev.meta
                    const fmtDate = d => {
                      const dt = new Date(d)
                      return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
                    }
                    const isMsg = ev.source === 'whatsapp'
                    const msgBubble = isMsg && ev.subtype === 'cliente'
                    const isKb = ev.source === 'kanban'

                    return (
                      <div key={ev.id} style={{ display:'flex',gap:10,marginBottom:10,position:'relative' }}>
                        <div style={{ width:22,height:22,borderRadius:'50%',background:m.bg,border:`1.5px solid ${m.color}40`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,zIndex:1,marginTop:1 }}>
                          <Icon size={10} color={m.color}/>
                        </div>
                        <div style={{ flex:1,minWidth:0,paddingTop:0 }}>
                          {isKb ? (
                            <div style={{ background:'#FAF5FF',border:'1px solid #E9D5FF',borderRadius:8,padding:'8px 10px' }}>
                              <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap' }}>
                                <span style={{ fontSize:11,fontWeight:700,color:C.navy }}>{ev.conteudo}</span>
                                <span style={{ fontSize:9.5,padding:'1px 6px',borderRadius:10,background:ev.kbColColor+'20',color:ev.kbColColor,fontWeight:700,border:`1px solid ${ev.kbColColor}40` }}>{ev.kbCol}</span>
                                <span style={{ fontSize:9.5,padding:'1px 6px',borderRadius:10,background:ev.kbPrioColor+'15',color:ev.kbPrioColor,fontWeight:700 }}>
                                  {ev.kbPrio==='urgente'?'🔴':ev.kbPrio==='alta'?'🟡':ev.kbPrio==='normal'?'🔵':'⚪'} {ev.kbPrio}
                                </span>
                              </div>
                              {ev.kbDesc && <div style={{ fontSize:11,color:C.slate,marginBottom:4 }}>{ev.kbDesc}</div>}
                              <div style={{ fontSize:9.5,color:C.muted,display:'flex',gap:10,flexWrap:'wrap' }}>
                                {ev.kbDue && <span>Prazo: {new Date(ev.kbDue+'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                                {ev.kbAssigned && <span>Responsável: {ev.kbAssigned}</span>}
                                <span>{fmtDate(ev.date)}</span>
                              </div>
                            </div>
                          ) : isMsg ? (
                            <div style={{
                              background: msgBubble ? '#ECFDF5' : '#EFF6FF',
                              border:`1px solid ${msgBubble ? '#A7F3D0' : '#BFDBFE'}`,
                              borderRadius: msgBubble ? '0 8px 8px 8px' : '8px 0 8px 8px',
                              padding:'6px 10px', fontSize:11.5, color:C.navy, lineHeight:1.45,
                              wordBreak:'break-word',
                            }}>
                              {ev.conteudo || '(mídia)'}
                              <div style={{ fontSize:9.5,color:C.muted,marginTop:3,textAlign:msgBubble?'left':'right' }}>
                                {ev.subtype==='cliente'?'Cliente':ev.subtype==='ia'?'IA':'Equipe'} · {fmtDate(ev.date)}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize:12,color:ev.source==='financeiro'?(ev.fintipo==='receita'?'#059669':'#DC2626'):C.navy,lineHeight:1.4,wordBreak:'break-word' }}>
                                {ev.conteudo}
                              </div>
                              <div style={{ fontSize:9.5,color:C.muted,marginTop:2 }}>
                                {ev.autor && <span>{ev.autor} · </span>}
                                {fmtDate(ev.date)}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Panel footer */}
            <div style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
              <button onClick={() => setConfirmDel(c)} style={{ display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:8,border:`1px solid #FECACA`,background:'#FFF1F2',color:'#DC2626',cursor:'pointer',fontSize:12,fontWeight:600 }}>
                <Trash2 size={12}/> Remover
              </button>
              <button onClick={() => setKanbanModal({ title:`Follow-up: ${c.nome||c.phone}`, description:'', column_id: kanbanCols[0]?.id||'', due_date:'', priority:'normal', assigned_user_id:'', assigned_user_name:'' })}
                style={{ display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:8,border:`1px solid #E9D5FF`,background:'#FAF5FF',color:'#7C3AED',cursor:'pointer',fontSize:12,fontWeight:600 }}>
                <Kanban size={12}/> Criar tarefa
              </button>
              <div style={{ flex:1 }}/>
              <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer"
                style={{ display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:8,border:`1px solid #BBF7D0`,background:'#ECFDF5',color:'#059669',fontSize:12,fontWeight:700,textDecoration:'none' }}>
                <Phone size={12}/> WhatsApp
              </a>
            </div>
          </div>
        )
      })()}

      {/* ── New Lead Modal ── */}
      {newModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={e=>{if(e.target===e.currentTarget)setNewModal(false)}}>
          <div style={{ background:C.card,borderRadius:16,padding:'24px',width:440,boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
              <div style={{ fontWeight:800,fontSize:16,color:C.navy }}>Novo Lead</div>
              <button onClick={()=>setNewModal(false)} style={{ width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted }}><X size={14}/></button>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              {[
                { label:'Nome',     key:'nome',     placeholder:'Nome do contato', required:false },
                { label:'Telefone', key:'phone',    placeholder:'55 11 9...',       required:true  },
                { label:'E-mail',   key:'email',    placeholder:'email@...',        required:false },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>
                    {f.label}{f.required&&<span style={{color:'#DC2626'}}>*</span>}
                  </label>
                  <input value={newForm[f.key]} onChange={e=>setNewForm(p=>({...p,[f.key]:e.target.value}))}
                    placeholder={f.placeholder}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',boxSizing:'border-box' }}/>
                </div>
              ))}

              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>Origem</label>
                  <select value={newForm.origem} onChange={e=>setNewForm(p=>({...p,origem:e.target.value}))}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',cursor:'pointer',boxSizing:'border-box' }}>
                    <option value="">— selecionar —</option>
                    {ORIGENS.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>Temperatura</label>
                  <select value={newForm.temperatura} onChange={e=>setNewForm(p=>({...p,temperatura:e.target.value}))}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',cursor:'pointer',boxSizing:'border-box' }}>
                    {Object.entries(TEMP).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>Etapa inicial</label>
                <select value={newForm.stage_id} onChange={e=>setNewForm(p=>({...p,stage_id:e.target.value}))}
                  style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',cursor:'pointer',boxSizing:'border-box' }}>
                  {funStages.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display:'flex',gap:8,marginTop:20,justifyContent:'flex-end' }}>
              <button onClick={()=>setNewModal(false)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13,color:C.slate }}>Cancelar</button>
              <button onClick={createContact} disabled={!newForm.phone.trim()||saving}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 20px',borderRadius:8,background:C.navy,color:'#fff',border:'none',cursor:newForm.phone.trim()?'pointer':'not-allowed',fontSize:13,fontWeight:700,opacity:newForm.phone.trim()?1:0.5 }}>
                {saving ? <Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> : <UserPlus size={13}/>}
                Adicionar Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete ── */}
      {/* Modal: lista dinâmica */}
      {listModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:250,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div style={{ background:C.card,borderRadius:14,padding:24,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.25)',maxHeight:'90vh',overflowY:'auto' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <div style={{ fontWeight:800,fontSize:15,color:C.navy,display:'flex',alignItems:'center',gap:8 }}>
                <Filter size={15} color={C.blue}/> {listModal.id ? 'Editar lista' : 'Nova lista'}
              </div>
              <button onClick={()=>setListModal(null)} style={{ background:'none',border:'none',cursor:'pointer',color:C.muted }}><X size={16}/></button>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Nome da lista *</label>
                <input className="nx-input" value={listModal.nome} onChange={e=>setListModal(p=>({...p,nome:e.target.value}))} placeholder="Ex: Leads quentes sem resposta" style={{ width:'100%',boxSizing:'border-box' }}/>
              </div>
              <div style={{ borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:2 }}>
                <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10 }}>Filtros</div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Temperatura</label>
                    <select className="nx-select" value={listModal.filtros?.temperatura||'todos'} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,temperatura:e.target.value}}))} style={{ width:'100%',boxSizing:'border-box' }}>
                      <option value="todos">Todas</option>
                      {Object.entries(TEMP).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Etapa</label>
                    <select className="nx-select" value={listModal.filtros?.stage_id||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,stage_id:e.target.value}}))} style={{ width:'100%',boxSizing:'border-box' }}>
                      <option value="">Todas</option>
                      {stages.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Mín. dias parado</label>
                    <input type="number" className="nx-input" value={listModal.filtros?.dias_min||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,dias_min:e.target.value}}))} placeholder="Ex: 3" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Máx. dias parado</label>
                    <input type="number" className="nx-input" value={listModal.filtros?.dias_max||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,dias_max:e.target.value}}))} placeholder="Ex: 30" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Origem</label>
                    <input className="nx-input" value={listModal.filtros?.origem||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,origem:e.target.value}}))} placeholder="Ex: Instagram" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Tag</label>
                    <input className="nx-input" value={listModal.filtros?.tag||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,tag:e.target.value}}))} placeholder="Ex: VIP" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Responsável</label>
                    <input className="nx-input" value={listModal.filtros?.responsavel_nome||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,responsavel_nome:e.target.value}}))} placeholder="Nome" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:8,paddingTop:18 }}>
                    <input type="checkbox" id="sem_resp" checked={!!listModal.filtros?.sem_responsavel} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,sem_responsavel:e.target.checked}}))}/>
                    <label htmlFor="sem_resp" style={{ fontSize:11,color:C.slate,cursor:'pointer' }}>Sem responsável</label>
                  </div>
                </div>
                {/* Preview count */}
                <div style={{ marginTop:12,padding:'8px 12px',background:C.bg,borderRadius:8,fontSize:12,color:C.slate }}>
                  <span style={{ fontWeight:700,color:C.navy }}>{contacts.filter(c=>applyListFilter(c,listModal.filtros)).length}</span> leads correspondem a esses filtros
                </div>
              </div>
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end',marginTop:20 }}>
              <button onClick={()=>setListModal(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13 }}>Cancelar</button>
              <button onClick={saveList} disabled={savingList||!listModal.nome?.trim()}
                style={{ padding:'8px 18px',borderRadius:8,background:savingList||!listModal.nome?.trim()?C.muted:C.blue,color:'#fff',border:'none',cursor:savingList?'wait':'pointer',fontSize:13,fontWeight:700 }}>
                {savingList ? 'Salvando…' : 'Salvar lista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: criar tarefa no Kanban */}
      {kanbanModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:250,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div style={{ background:C.card,borderRadius:14,padding:24,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <div style={{ fontWeight:800,fontSize:15,color:C.navy,display:'flex',alignItems:'center',gap:8 }}>
                <Kanban size={16} color="#7C3AED"/> Criar tarefa no Kanban
              </div>
              <button onClick={()=>setKanbanModal(null)} style={{ background:'none',border:'none',cursor:'pointer',color:C.muted }}><X size={16}/></button>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Título *</label>
                <input className="nx-input" value={kanbanModal.title} onChange={e=>setKanbanModal(p=>({...p,title:e.target.value}))} placeholder="O que precisa ser feito?" style={{ width:'100%',boxSizing:'border-box' }}/>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Coluna</label>
                <select className="nx-select" value={kanbanModal.column_id} onChange={e=>setKanbanModal(p=>({...p,column_id:e.target.value}))} style={{ width:'100%',boxSizing:'border-box' }}>
                  {kanbanCols.length === 0 && <option value="">— sem colunas —</option>}
                  {kanbanCols.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Prioridade</label>
                  <select className="nx-select" value={kanbanModal.priority} onChange={e=>setKanbanModal(p=>({...p,priority:e.target.value}))} style={{ width:'100%',boxSizing:'border-box' }}>
                    <option value="baixa">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Prazo</label>
                  <input type="date" className="nx-input" value={kanbanModal.due_date} onChange={e=>setKanbanModal(p=>({...p,due_date:e.target.value}))} style={{ width:'100%',boxSizing:'border-box' }}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Responsável</label>
                <select className="nx-select" value={kanbanModal.assigned_user_id||''} onChange={e=>{
                  const u = users.find(x=>x.id===e.target.value)
                  setKanbanModal(p=>({...p,assigned_user_id:e.target.value||null,assigned_user_name:u?.name||u?.email||null}))
                }} style={{ width:'100%',boxSizing:'border-box' }}>
                  <option value="">— sem responsável —</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name||u.email}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Descrição</label>
                <textarea className="nx-input" value={kanbanModal.description||''} onChange={e=>setKanbanModal(p=>({...p,description:e.target.value}))} placeholder="Detalhes da tarefa..." rows={2} style={{ width:'100%',boxSizing:'border-box',resize:'vertical' }}/>
              </div>
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end',marginTop:20 }}>
              <button onClick={()=>setKanbanModal(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13 }}>Cancelar</button>
              <button onClick={createKanbanCard} disabled={savingKanban||!kanbanModal.title?.trim()||!kanbanModal.column_id}
                style={{ padding:'8px 18px',borderRadius:8,background:savingKanban||!kanbanModal.title?.trim()||!kanbanModal.column_id?C.muted:'#7C3AED',color:'#fff',border:'none',cursor:savingKanban?'wait':'pointer',fontSize:13,fontWeight:700 }}>
                {savingKanban ? 'Criando…' : 'Criar tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:C.card,borderRadius:14,padding:'24px',width:360,boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight:800,fontSize:15,color:C.navy,marginBottom:8 }}>Remover lead?</div>
            <div style={{ fontSize:13,color:C.muted,marginBottom:20 }}>
              Isso remove <strong>{confirmDel.nome||fmtPhone(confirmDel.phone)}</strong> do CRM. Não pode ser desfeito.
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={()=>setConfirmDel(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13 }}>Cancelar</button>
              <button onClick={()=>deleteContact(confirmDel.id)} style={{ padding:'8px 16px',borderRadius:8,background:'#DC2626',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700 }}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PanelField — editable inline ──────────────────────────────────────────────
function PanelField({ label, value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const inputRef              = useRef(null)

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    if (val.trim() !== value) onSave(val.trim())
  }

  return (
    <div>
      <div style={{ fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4 }}>{label}</div>
      {editing
        ? <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)}
            onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape'){setVal(value);setEditing(false)}}}
            style={{ width:'100%',border:`1px solid #93C5FD`,borderRadius:7,padding:'6px 10px',fontSize:12,color:'#0F172A',background:'#EFF6FF',outline:'none',boxSizing:'border-box' }}/>
        : <div onClick={()=>setEditing(true)} style={{ padding:'6px 10px',borderRadius:7,border:`1px solid transparent`,fontSize:12,color:val?'#0F172A':'#94A3B8',cursor:'text',transition:'all 0.1s' }}
            onMouseEnter={e=>{e.currentTarget.style.border=`1px solid #E2E8F0`;e.currentTarget.style.background='#F8FAFC'}}
            onMouseLeave={e=>{e.currentTarget.style.border='1px solid transparent';e.currentTarget.style.background='transparent'}}>
            {val || <span style={{color:'#94A3B8',fontStyle:'italic'}}>{placeholder}</span>}
          </div>
      }
    </div>
  )
}
