import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../../components/ConfirmModal'
import {
  Plus, X, Trash2, Pencil, Calendar, User as UserIcon, Flag,
  GripVertical, MoreVertical, Tag, ChevronRight, MessageCircle, ExternalLink, Link2,
} from 'lucide-react'
import './Company.css'

const COLUMN_COLORS = ['#6B7280', '#2563EB', '#7C3AED', '#16A34A', '#D97706', '#DC2626', '#0891B2', '#DB2777']
const PRIORITIES = [
  { value: 'baixa',    label: 'Baixa',    color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  { value: 'normal',   label: 'Normal',   color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'alta',     label: 'Alta',     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'urgente',  label: 'Urgente',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
]

const DEFAULT_COLUMNS = [
  { name: 'A Fazer',     color: '#6B7280' },
  { name: 'Em Andamento', color: '#2563EB' },
  { name: 'Concluído',   color: '#16A34A' },
]

function fmtDateInput(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function dueBadge(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T23:59:59`)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const cardDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((cardDay - today) / 86400000)
  let color, bg, border, label
  if (diff < 0) { color = '#DC2626'; bg = '#FEF2F2'; border = '#FECACA'; label = `Atrasado · ${cardDay.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` }
  else if (diff === 0) { color = '#D97706'; bg = '#FFFBEB'; border = '#FDE68A'; label = 'Hoje' }
  else if (diff === 1) { color = '#2563EB'; bg = '#EFF6FF'; border = '#BFDBFE'; label = 'Amanhã' }
  else if (diff <= 7) { color = '#0891B2'; bg = '#ECFEFF'; border = '#A5F3FC'; label = cardDay.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
  else { color = '#6B7280'; bg = '#F3F4F6'; border = '#E5E7EB'; label = cardDay.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
  return { color, bg, border, label }
}

export default function CompanyKanban() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const instance = session?.company?.instance
  const companyId = session?.company?.id
  const isAdmin = session?.user?.role === 'admin'

  const [columns, setColumns]     = useState([])
  const [cards, setCards]         = useState([])
  const [users, setUsers]         = useState([])
  const [contacts, setContacts]   = useState([])
  const [loading, setLoading]     = useState(true)

  const [comments, setComments]           = useState([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment]       = useState('')
  const [savingComment, setSavingComment] = useState(false)
  const [filter, setFilter]       = useState({ assignee: 'todos', priority: 'todas', due: 'todos' })

  const [columnModal, setColumnModal] = useState(null)
  const [columnErr, setColumnErr]     = useState('')
  const [savingColumn, setSavingColumn] = useState(false)

  const [cardModal, setCardModal]     = useState(null)
  const [cardErr, setCardErr]         = useState('')
  const [savingCard, setSavingCard]   = useState(false)
  const [confirmDeleteCol, setConfirmDeleteCol] = useState(null)
  const [confirmDeleteCard, setConfirmDeleteCard] = useState(false)
  const [deletingNow, setDeletingNow] = useState(false)

  const dragCard = useRef(null)
  const [dragOver, setDragOver] = useState({ columnId: null, position: null })

  // Carrega tudo
  useEffect(() => {
    if (!instance) return
    setLoading(true)
    Promise.all([
      supabase.from('kanban_columns').select('*').eq('instancia', instance).order('position'),
      supabase.from('kanban_cards').select('*').eq('instancia', instance).order('position'),
      supabase.from('users').select('id, name, email, active').eq('company_id', companyId),
      supabase.from('saved_contacts').select('id, nome, numero').eq('instancia', instance).order('nome'),
    ]).then(([{ data: c }, { data: ca }, { data: u }, { data: ct }]) => {
      if (c) setColumns(c)
      if (ca) setCards(ca)
      if (u) setUsers(u.filter(x => x.active !== false))
      if (ct) setContacts(ct)
      setLoading(false)
    })
  }, [instance, companyId])

  // Realtime
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`kanban-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') setColumns(prev => prev.filter(c => c.id !== p.old.id))
          else if (p.new) setColumns(prev => {
            const ex = prev.find(c => c.id === p.new.id)
            return (ex ? prev.map(c => c.id === p.new.id ? p.new : c) : [...prev, p.new]).sort((a, b) => a.position - b.position)
          })
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') setCards(prev => prev.filter(c => c.id !== p.old.id))
          else if (p.new) setCards(prev => {
            const ex = prev.find(c => c.id === p.new.id)
            return ex ? prev.map(c => c.id === p.new.id ? p.new : c) : [...prev, p.new]
          })
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega comentários quando abre um card existente
  useEffect(() => {
    if (!cardModal?.id) { setComments([]); setNewComment(''); return }
    setLoadingComments(true)
    supabase.from('kanban_card_comments')
      .select('*').eq('card_id', cardModal.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setComments(data || []); setLoadingComments(false) })
  }, [cardModal?.id])

  // Coluna CRUD
  function openNewColumn() {
    setColumnModal({ name: '', color: COLUMN_COLORS[0] })
    setColumnErr('')
  }
  function openEditColumn(c) {
    setColumnModal({ ...c })
    setColumnErr('')
  }
  async function handleSaveColumn() {
    if (!columnModal.name?.trim()) { setColumnErr('Nome é obrigatório'); return }
    setSavingColumn(true)
    const isNew = !columnModal.id
    const maxPos = columns.length ? Math.max(...columns.map(c => c.position || 0)) : 0
    const payload = {
      name: columnModal.name.trim(),
      color: columnModal.color,
      instancia: instance,
      ...(isNew ? { position: maxPos + 1 } : {}),
    }
    const { error } = isNew
      ? await supabase.from('kanban_columns').insert(payload)
      : await supabase.from('kanban_columns').update(payload).eq('id', columnModal.id)
    setSavingColumn(false)
    if (error) { setColumnErr('Erro: ' + error.message); return }
    setColumnModal(null)
  }
  function handleDeleteColumn(col) {
    setConfirmDeleteCol(col)
  }
  async function confirmDeleteColumn() {
    if (!confirmDeleteCol) return
    setDeletingNow(true)
    // Cascade manual: apaga os cards primeiro pra não cair em FK constraint.
    const { error: cardsErr } = await supabase
      .from('kanban_cards').delete().eq('column_id', confirmDeleteCol.id)
    if (cardsErr) {
      setDeletingNow(false)
      alert('Não rolou apagar os cards da coluna: ' + cardsErr.message)
      return
    }
    const { error: colErr } = await supabase
      .from('kanban_columns').delete().eq('id', confirmDeleteCol.id)
    if (colErr) {
      setDeletingNow(false)
      alert('Não rolou apagar a coluna: ' + colErr.message + '\nProvavelmente é RLS — confere as policies da tabela kanban_columns.')
      return
    }
    // Otimista: tira do estado local na hora caso o realtime demore
    setColumns(prev => prev.filter(c => c.id !== confirmDeleteCol.id))
    setCards(prev => prev.filter(c => c.column_id !== confirmDeleteCol.id))
    setDeletingNow(false)
    setConfirmDeleteCol(null)
  }
  async function createDefaults() {
    setSavingColumn(true)
    await supabase.from('kanban_columns').insert(
      DEFAULT_COLUMNS.map((c, i) => ({ ...c, instancia: instance, position: i + 1 }))
    )
    setSavingColumn(false)
  }

  // Card CRUD
  function openNewCard(columnId) {
    setCardModal({
      column_id: columnId,
      title: '', description: '',
      assigned_user_id: null, assigned_user_name: null,
      due_date: '', priority: 'normal',
      contact_id: null, contact_nome: '',
    })
    setCardErr('')
  }
  function openEditCard(c) {
    setCardModal({ ...c, due_date: c.due_date || '' })
    setCardErr('')
  }
  async function handleSaveCard() {
    if (!cardModal.title?.trim()) { setCardErr('Título é obrigatório'); return }
    setSavingCard(true)
    const isNew = !cardModal.id
    const colCards = cards.filter(c => c.column_id === cardModal.column_id)
    const maxPos = colCards.length ? Math.max(...colCards.map(c => c.position || 0)) : 0
    const payload = {
      column_id: cardModal.column_id,
      instancia: instance,
      title: cardModal.title.trim(),
      description: cardModal.description?.trim() || null,
      assigned_user_id: cardModal.assigned_user_id || null,
      assigned_user_name: cardModal.assigned_user_name || null,
      due_date: cardModal.due_date || null,
      priority: cardModal.priority || 'normal',
      contact_id: cardModal.contact_id || null,
      contact_nome: cardModal.contact_nome?.trim() || null,
      ...(isNew ? { position: maxPos + 1, created_by_email: session?.user?.email } : {}),
    }
    const { error } = isNew
      ? await supabase.from('kanban_cards').insert(payload)
      : await supabase.from('kanban_cards').update(payload).eq('id', cardModal.id)
    setSavingCard(false)
    if (error) { setCardErr('Erro: ' + error.message); return }
    setCardModal(null)
  }
  function handleDeleteCard() {
    if (!cardModal?.id) return
    setConfirmDeleteCard(true)
  }
  async function confirmDeleteCardAction() {
    if (!cardModal?.id) return
    setDeletingNow(true)
    await supabase.from('kanban_cards').delete().eq('id', cardModal.id)
    setDeletingNow(false)
    setConfirmDeleteCard(false)
    setCardModal(null)
  }

  async function handleAddComment() {
    if (!newComment.trim() || !cardModal?.id) return
    setSavingComment(true)
    const { data } = await supabase.from('kanban_card_comments').insert({
      card_id: cardModal.id,
      instancia: instance,
      author_name: session?.user?.name || session?.user?.email || 'Usuário',
      author_email: session?.user?.email || null,
      body: newComment.trim(),
    }).select().single()
    if (data) setComments(prev => [...prev, data])
    setNewComment('')
    setSavingComment(false)
  }

  // Drag & drop
  function onDragStart(e, card) {
    dragCard.current = card
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOverCol(e, columnId) {
    e.preventDefault()
    setDragOver(prev => prev.columnId === columnId ? prev : { columnId, position: null })
  }
  function onDragOverCard(e, columnId, position) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver({ columnId, position })
  }
  async function onDrop(columnId) {
    const card = dragCard.current
    dragCard.current = null
    setDragOver({ columnId: null, position: null })
    if (!card) return

    const targetCards = cards.filter(c => c.column_id === columnId && c.id !== card.id).sort((a, b) => a.position - b.position)
    const overPos = dragOver.position
    let newPos
    if (overPos == null || targetCards.length === 0) {
      newPos = targetCards.length ? Math.max(...targetCards.map(c => c.position || 0)) + 1 : 1
    } else {
      const before = targetCards[overPos - 1]?.position
      const after = targetCards[overPos]?.position
      if (before != null && after != null) newPos = (before + after) / 2
      else if (after != null) newPos = after - 0.5
      else if (before != null) newPos = before + 1
      else newPos = 1
    }

    setCards(prev => prev.map(c => c.id === card.id ? { ...c, column_id: columnId, position: newPos } : c))
    await supabase.from('kanban_cards').update({ column_id: columnId, position: newPos }).eq('id', card.id)
  }

  // Filtros
  const visibleCards = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
    return cards.filter(c => {
      if (filter.assignee === 'meus' && c.assigned_user_id !== session?.user?.id) return false
      if (filter.assignee === 'sem' && c.assigned_user_id) return false
      if (filter.assignee !== 'todos' && filter.assignee !== 'meus' && filter.assignee !== 'sem' && c.assigned_user_id !== filter.assignee) return false
      if (filter.priority !== 'todas' && c.priority !== filter.priority) return false
      if (filter.due !== 'todos') {
        if (filter.due === 'sem-prazo') { if (c.due_date) return false }
        else {
          if (!c.due_date) return false
          const due = new Date(c.due_date + 'T23:59:59')
          if (filter.due === 'atrasado' && due >= today) return false
          if (filter.due === 'hoje' && (due < today || due >= tomorrow)) return false
          if (filter.due === 'semana' && (due < today || due >= weekEnd)) return false
        }
      }
      return true
    })
  }, [cards, filter, session?.user?.id])

  const cardsByCol = useMemo(() => {
    const m = {}
    visibleCards.forEach(c => {
      if (!m[c.column_id]) m[c.column_id] = []
      m[c.column_id].push(c)
    })
    Object.values(m).forEach(arr => arr.sort((a, b) => (a.position || 0) - (b.position || 0)))
    return m
  }, [visibleCards])

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)' }}>
            Kanban
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${columns.length} coluna(s) — ${cards.length} card(s)`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="nx-select" style={{ fontSize: 12 }}
            value={filter.assignee} onChange={e => setFilter(p => ({ ...p, assignee: e.target.value }))}>
            <option value="todos">Todos os atendentes</option>
            <option value="meus">Meus cards</option>
            <option value="sem">Sem atribuição</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="nx-select" style={{ fontSize: 12 }}
            value={filter.priority} onChange={e => setFilter(p => ({ ...p, priority: e.target.value }))}>
            <option value="todas">Todas prioridades</option>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select className="nx-select" style={{ fontSize: 12 }}
            value={filter.due} onChange={e => setFilter(p => ({ ...p, due: e.target.value }))}>
            <option value="todos">Todos os prazos</option>
            <option value="atrasado">Atrasados</option>
            <option value="hoje">Hoje</option>
            <option value="semana">Esta semana</option>
            <option value="sem-prazo">Sem prazo</option>
          </select>
          {isAdmin && (
            <button className="nx-btn-primary" onClick={openNewColumn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 14px' }}>
              <Plus size={13} /> Nova coluna
            </button>
          )}
        </div>
      </div>

      {!loading && columns.length === 0 ? (
        <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Tag size={28} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>Nenhuma coluna criada ainda.</div>
          {isAdmin ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="nx-btn-primary" onClick={createDefaults} disabled={savingColumn}>
                Usar padrão (A Fazer / Em Andamento / Concluído)
              </button>
              <button className="nx-btn-ghost" onClick={openNewColumn}>Criar manualmente</button>
            </div>
          ) : (
            <div style={{ fontSize: 12 }}>Solicite ao administrador para criar as colunas.</div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', gap: 14, paddingBottom: 8 }}>
          {columns.map(col => {
            const colCards = cardsByCol[col.id] || []
            const isDragTarget = dragOver.columnId === col.id
            return (
              <div key={col.id}
                onDragOver={(e) => onDragOverCol(e, col.id)}
                onDrop={() => onDrop(col.id)}
                style={{
                  width: 290, flexShrink: 0,
                  background: '#F8FAFC', border: `1px solid ${isDragTarget ? col.color : 'var(--border)'}`,
                  borderRadius: 10, padding: 10,
                  display: 'flex', flexDirection: 'column', maxHeight: '100%',
                  transition: 'border-color 0.15s',
                }}>
                {/* Header coluna */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '4px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {col.name}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#E2E8F0', color: '#64748B' }}>
                      {colCards.length}
                    </span>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEditColumn(col)} title="Editar coluna"
                        style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', padding: 3 }}>
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => handleDeleteColumn(col)} title="Excluir coluna"
                        style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', padding: 3 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 2px 2px' }}>
                  {colCards.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
                      Sem cards
                    </div>
                  )}
                  {colCards.map((card, idx) => {
                    const due = dueBadge(card.due_date)
                    const prio = PRIORITIES.find(p => p.value === card.priority) || PRIORITIES[1]
                    return (
                      <div key={card.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, card)}
                        onDragOver={(e) => onDragOverCard(e, col.id, idx)}
                        onClick={() => openEditCard(card)}
                        style={{
                          background: '#fff', borderRadius: 8,
                          border: `1px solid var(--border)`,
                          borderLeft: `3px solid ${prio.color}`,
                          padding: '9px 11px', cursor: 'grab',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: card.description ? 4 : 6 }}>
                          {card.title}
                        </div>
                        {card.description && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {card.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          {due && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5,
                              color: due.color, background: due.bg, border: `1px solid ${due.border}`,
                            }}>
                              <Calendar size={9} /> {due.label}
                            </span>
                          )}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5,
                            color: prio.color, background: prio.bg, border: `1px solid ${prio.border}`,
                          }}>
                            <Flag size={9} /> {prio.label}
                          </span>
                          {card.contact_nome && (
                            <span
                              onClick={e => { e.stopPropagation(); if (card.contact_id) navigate(`/painel/contatos/${card.contact_id}`) }}
                              title={card.contact_id ? 'Abrir ficha do contato' : ''}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                                color: '#0891B2', background: '#ECFEFF', border: '1px solid #A5F3FC',
                                cursor: card.contact_id ? 'pointer' : 'default',
                              }}>
                              <Link2 size={9} /> {card.contact_nome.split(' ')[0]}
                            </span>
                          )}
                          {card.assigned_user_name && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              marginLeft: 'auto',
                              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                              color: '#fff', background: '#2563EB',
                            }}>
                              <UserIcon size={9} /> {card.assigned_user_name.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add card */}
                <button onClick={() => openNewCard(col.id)}
                  style={{
                    marginTop: 8, padding: '7px 10px', borderRadius: 6,
                    background: 'transparent', border: '1px dashed var(--border)',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = col.color; e.currentTarget.style.color = col.color }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <Plus size={12} /> Adicionar card
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal coluna */}
      {columnModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{columnModal.id ? 'Editar coluna' : 'Nova coluna'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setColumnModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome da coluna</label>
                <input className="nx-input" autoFocus placeholder="Ex: A Fazer, Em Revisão..."
                  value={columnModal.name} onChange={e => setColumnModal(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Cor</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLUMN_COLORS.map(c => (
                    <button key={c} onClick={() => setColumnModal(p => ({ ...p, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: columnModal.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {columnErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{columnErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setColumnModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveColumn} disabled={savingColumn}>
                  {savingColumn ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      <ConfirmModal
        open={!!confirmDeleteCol}
        variant="delete"
        title="Excluir coluna"
        message={`Tem certeza que deseja excluir a coluna "${confirmDeleteCol?.name || ''}"? Todos os cards dentro dela serão removidos junto. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir coluna"
        loading={deletingNow}
        onConfirm={confirmDeleteColumn}
        onCancel={() => setConfirmDeleteCol(null)}
      />

      <ConfirmModal
        open={confirmDeleteCard}
        variant="delete"
        title="Excluir card"
        message="Tem certeza que deseja excluir este card? Essa ação não pode ser desfeita."
        confirmLabel="Excluir card"
        loading={deletingNow}
        onConfirm={confirmDeleteCardAction}
        onCancel={() => setConfirmDeleteCard(false)}
      />

      {/* Modal card */}
      {cardModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{cardModal.id ? 'Editar card' : 'Novo card'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setCardModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Coluna</label>
                <select className="nx-select" value={cardModal.column_id}
                  onChange={e => setCardModal(p => ({ ...p, column_id: e.target.value }))}>
                  {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Título</label>
                <input className="nx-input" autoFocus placeholder="O que precisa ser feito?"
                  value={cardModal.title} onChange={e => setCardModal(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Descrição (opcional)</label>
                <textarea className="nx-input" rows={3} placeholder="Detalhes da atividade..."
                  value={cardModal.description || ''}
                  onChange={e => setCardModal(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Atribuir a</label>
                  <select className="nx-select" value={cardModal.assigned_user_id || ''}
                    onChange={e => {
                      const u = users.find(x => x.id === e.target.value)
                      setCardModal(p => ({
                        ...p,
                        assigned_user_id: u?.id || null,
                        assigned_user_name: u?.name || null,
                      }))
                    }}>
                    <option value="">Sem atribuição</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Vencimento</label>
                  <input className="nx-input" type="date" value={cardModal.due_date || ''}
                    onChange={e => setCardModal(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Prioridade</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PRIORITIES.map(p => {
                    const active = cardModal.priority === p.value
                    return (
                      <button key={p.value}
                        onClick={() => setCardModal(c => ({ ...c, priority: p.value }))}
                        style={{
                          padding: '5px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          border: `1.5px solid ${active ? p.color : 'var(--border)'}`,
                          background: active ? p.bg : 'transparent',
                          color: active ? p.color : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        <Flag size={11} /> {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Vínculo com paciente */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Link2 size={11} /> Contato vinculado (opcional)
                </label>
                <div style={{ position: 'relative' }}>
                  <input className="nx-input"
                    placeholder="Buscar contato por nome..."
                    value={cardModal.contact_nome || ''}
                    onChange={e => setCardModal(p => ({ ...p, contact_nome: e.target.value, contact_id: null }))}
                  />
                  {cardModal.contact_id && (
                    <button onClick={() => setCardModal(p => ({ ...p, contact_id: null, contact_nome: '' }))}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                        display: 'inline-flex', alignItems: 'center',
                      }}>
                      <X size={13} />
                    </button>
                  )}
                  {!cardModal.contact_id && (() => {
                    const q = (cardModal.contact_nome || '').trim().toLowerCase()
                    if (q.length < 2) return null
                    const matches = contacts.filter(c => c.nome?.toLowerCase().includes(q)).slice(0, 6)
                    if (matches.length === 0) return null
                    return (
                      <div style={{
                        marginTop: 4, background: '#fff', border: '1px solid var(--border)',
                        borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                        position: 'relative', zIndex: 10,
                      }}>
                        <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                          Contatos encontrados
                        </div>
                        {matches.map(c => (
                          <button key={c.id} type="button"
                            onClick={() => setCardModal(p => ({ ...p, contact_id: c.id, contact_nome: c.nome }))}
                            style={{
                              width: '100%', textAlign: 'left', padding: '8px 10px',
                              background: 'transparent', border: 'none', borderBottom: '1px solid #F1F5F9',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: 'inherit',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{c.numero}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {cardModal.contact_id && (
                  <button onClick={() => navigate(`/painel/contatos/${cardModal.contact_id}`)}
                    style={{ marginTop: 6, fontSize: 11, color: '#0891B2', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                    <ExternalLink size={11} /> Ver ficha completa do contato
                  </button>
                )}
              </div>

              {/* Comentários (apenas ao editar) */}
              {cardModal.id && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MessageCircle size={11} /> Comentários{comments.length > 0 ? ` (${comments.length})` : ''}
                  </div>
                  {loadingComments ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando...</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {comments.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem comentários ainda.</div>
                      )}
                      {comments.map(cm => (
                        <div key={cm.id} style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{cm.author_name}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {new Date(cm.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{cm.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea className="nx-input" rows={2}
                      placeholder="Adicionar comentário... (Ctrl+Enter para enviar)"
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment() }}
                      style={{ flex: 1, resize: 'vertical', minHeight: 56 }} />
                    <button onClick={handleAddComment} disabled={savingComment || !newComment.trim()}
                      className="nx-btn-primary"
                      style={{ padding: '9px 16px', fontSize: 12, whiteSpace: 'nowrap', opacity: !newComment.trim() ? 0.5 : 1 }}>
                      {savingComment ? '...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {cardErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{cardErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                {cardModal.id && (
                  <button onClick={handleDeleteCard}
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={13} /> Excluir
                  </button>
                )}
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setCardModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveCard} disabled={savingCard}>
                  {savingCard ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}
