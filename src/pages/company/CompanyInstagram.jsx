import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Instagram, Search, Send, Sparkles, UserCheck, UserPlus,
  CheckCircle2, Inbox, Archive, Heart, MessageCircle,
  X, MoreHorizontal, Calendar, Headset, Lock, FileText,
  Image as ImageIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './CompanyInstagram.css'

const CONV_TABLE = 'mensagens_geral'

function getMessageContent(row) {
  return (row.mensagem || '').replace(/^\*[^*]+\*:\n/, '').trim()
}
function getMessageType(row) { return (row.type || 'human').toLowerCase() }
function parseTimestamp(val) {
  if (!val) return null
  if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
    const [date, time] = val.split(' ')
    const [d, m, y] = date.split('/')
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).toISOString()
  }
  return val
}
function getTimestamp(row) { return parseTimestamp(row.horaLastMessage) || row.created_at || null }

function isToolMessage(row) {
  const type = getMessageType(row)
  const content = row.mensagem || ''
  if (type === 'tool') return true
  if (type === 'ia' && /^Calling \w+ with input:/i.test(content.trim())) return true
  if (type === 'ia' && content.length > 800) return true
  return false
}

function detectMedia(b64) {
  if (!b64 || b64.length < 10) return null
  if (b64.startsWith('T2dn')) return { type: 'audio', mime: 'audio/ogg' }
  if (b64.startsWith('//uQ') || b64.startsWith('SUQz')) return { type: 'audio', mime: 'audio/mpeg' }
  if (b64.startsWith('GkXf')) return { type: 'audio', mime: 'audio/webm' }
  if (b64.startsWith('/9j/')) return { type: 'image', mime: 'image/jpeg' }
  if (b64.startsWith('iVBOR')) return { type: 'image', mime: 'image/png' }
  if (b64.startsWith('UklGR')) return { type: 'image', mime: 'image/webp' }
  if (b64.startsWith('R0lGOD')) return { type: 'image', mime: 'image/gif' }
  if (b64.startsWith('JVBERi')) return { type: 'pdf', mime: 'application/pdf' }
  return null
}

function formatMsgTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return hhmm
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Ontem ${hhmm}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm}`
}

function formatContactTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diffMin = Math.floor((now - d) / 60000)
  const diffH = Math.floor(diffMin / 60)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  if (diffH < 24) return `${diffH}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Avatar com gradient pseudo-aleatório baseado no handle
const GRADIENTS = [
  'linear-gradient(135deg, #F472B6, #EC4899)',
  'linear-gradient(135deg, #FBBF24, #FB923C)',
  'linear-gradient(135deg, #A78BFA, #6366F1)',
  'linear-gradient(135deg, #34D399, #06B6D4)',
  'linear-gradient(135deg, #F87171, #DC2626)',
  'linear-gradient(135deg, #60A5FA, #3B82F6)',
  'linear-gradient(135deg, #C084FC, #9333EA)',
  'linear-gradient(135deg, #2DD4BF, #0D9488)',
]
function gradientFor(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]
}
function handleFromSession(sid) {
  if (!sid) return ''
  return sid.replace(/@.*$/, '').replace(/^@/, '')
}

const REASONS = [
  { value: 'agendado',       label: 'Agendado',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  { value: 'resolvido',      label: 'Resolvido',   color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'encaminhado',    label: 'Encaminhado', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { value: 'desistiu',       label: 'Desistiu',    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { value: 'auto_encerrado', label: 'Expirado',    color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
]
const MANUAL_REASONS = REASONS.filter(r => r.value !== 'auto_encerrado')

export default function CompanyInstagram() {
  const { session } = useAuth()
  const igEnabled = session?.company?.instagram_enabled === true
  const igConfigured = !!session?.company?.instagram_webhook_path

  // Empresa precisa estar ativa E ter o path do n8n cadastrado.
  // Sem path, o setup técnico ainda não foi finalizado.
  if (!igEnabled || !igConfigured) return <InstagramLockedScreen company={session?.company} />
  return <InstagramInbox />
}

const N8N_BASE = 'https://n8n.nexladesenvolvimento.com.br/webhook'

function InstagramInbox() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const instance     = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia
  const isAdmin      = session?.user?.role === 'admin'
  const userSector   = session?.user?.sector
  const aiEnabled    = session?.company?.ai_enabled !== false
  const igPath       = session?.company?.instagram_webhook_path
  const igWebhookUrl = igPath ? `${N8N_BASE}/${igPath}` : null

  const [contacts, setContacts]               = useState([])
  const [closedMap, setClosedMap]             = useState({})
  const [attendancesMap, setAttendancesMap]   = useState({})
  const [savedContacts, setSavedContacts]     = useState({})
  const [assuming, setAssuming]               = useState(null)
  const [tab, setTab]                         = useState('recepcao')
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [search, setSearch]                   = useState('')
  const [selected, setSelected]               = useState(null)
  const [messages, setMessages]               = useState([])
  const [loadingMsgs, setLoadingMsgs]         = useState(false)
  const [msgText, setMsgText]                 = useState('')
  const [sending, setSending]                 = useState(false)
  const [closeModal, setCloseModal]           = useState(null)
  const [reason, setReason]                   = useState('')
  const [closing, setClosing]                 = useState(false)
  const [toast, setToast]                     = useState(null)
  const [lightbox, setLightbox]               = useState(null)

  const bottomRef    = useRef(null)
  const selectedRef  = useRef(null)
  useEffect(() => { selectedRef.current = selected }, [selected])

  // Contatos salvos
  useEffect(() => {
    if (!instance) return
    supabase.from('saved_contacts').select('*').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}; data.forEach(c => { map[c.numero] = c })
          setSavedContacts(map)
        }
      })
  }, [instance])

  // Atendimentos ativos
  useEffect(() => {
    if (!instance) return
    supabase.from('attendances').select('*').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}; data.forEach(r => { map[r.numero] = r })
          setAttendancesMap(map)
        }
      })
    const ch = supabase.channel(`ig-attendances-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setAttendancesMap(prev => { const n = { ...prev }; delete n[p.old.numero]; return n })
          } else if (p.new) {
            setAttendancesMap(prev => ({ ...prev, [p.new.numero]: p.new }))
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega contatos Instagram
  useEffect(() => {
    if (!instance) return
    setLoadingContacts(true)
    supabase.from(CONV_TABLE).select('*')
      .eq('instancia', instance)
      .eq('aplicativo', 'instagram')
      .order('id', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          const seen = new Set()
          const unique = []
          for (const row of data) {
            const sid = row.numero
            if (!sid || seen.has(sid)) continue
            seen.add(sid)
            unique.push({
              session_id: sid,
              handle: handleFromSession(sid),
              lastTs: getTimestamp(row),
              lastPreview: getMessageContent(row).slice(0, 80),
            })
          }
          setContacts(unique)
        }
        setLoadingContacts(false)
      })
  }, [instance])

  // Conversas encerradas
  useEffect(() => {
    if (!instance) return
    supabase.from('conversations').select('session_id, reason').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}; data.forEach(r => { map[r.session_id] = r.reason || 'resolvido' })
          setClosedMap(map)
        }
      })
  }, [instance])

  // Realtime: novas mensagens
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`ig-msgs-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: CONV_TABLE, filter: `instancia=eq.${instance}` },
        (p) => {
          const row = p.new
          if (!row || isToolMessage(row)) return
          if (row.aplicativo !== 'instagram') return
          const sid = row.numero
          if (!sid) return
          const ts = getTimestamp(row)
          const preview = getMessageContent(row).slice(0, 80)

          setClosedMap(prev => {
            if (!prev[sid]) return prev
            supabase.from('conversations').delete().eq('session_id', sid).eq('instancia', instance)
            supabase.from('attendances').delete().eq('numero', sid).eq('instancia', instance)
            setAttendancesMap(at => { const n = { ...at }; delete n[sid]; return n })
            const next = { ...prev }; delete next[sid]; return next
          })

          setContacts(prev => {
            const existing = prev.find(c => c.session_id === sid)
            if (existing) {
              return [
                { ...existing, lastTs: ts, lastPreview: preview },
                ...prev.filter(c => c.session_id !== sid)
              ]
            }
            return [{ session_id: sid, handle: handleFromSession(sid), lastTs: ts, lastPreview: preview }, ...prev]
          })

          if (selectedRef.current?.session_id === sid) {
            setMessages(msgs => [...msgs, {
              id: row.id,
              type: getMessageType(row),
              content: getMessageContent(row),
              base64: row.base64 || null,
              recipient_id: row.recipient_id || null,
              ts,
            }])
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega mensagens da conversa selecionada
  useEffect(() => {
    if (!selected || !instance) return
    setLoadingMsgs(true)
    setMessages([])
    supabase.from(CONV_TABLE).select('*')
      .eq('instancia', instance)
      .eq('numero', selected.session_id)
      .eq('aplicativo', 'instagram')
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setMessages(data.filter(r => !isToolMessage(r)).map(r => ({
            id: r.id,
            type: getMessageType(r),
            content: getMessageContent(r),
            base64: r.base64 || null,
            recipient_id: r.recipient_id || null,
            ts: getTimestamp(r),
          })))
        }
        setLoadingMsgs(false)
      })
  }, [selected, instance])

  // Pega o recipient_id mais recente da conversa (vindo do cliente, gravado pelo n8n).
  // Necessário pra Meta API saber quem é o destinatário no Instagram.
  function getRecipientId() {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].recipient_id) return messages[i].recipient_id
    }
    return null
  }

  useEffect(() => {
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingMsgs])

  async function handleAssume(contact, e) {
    e?.stopPropagation()
    if (attendancesMap[contact.session_id] || assuming === contact.session_id) return
    setAssuming(contact.session_id)
    const name = session?.user?.name || 'Atendente'
    const sectorLabel = userSector ? ` (${userSector.name})` : ''

    await supabase.from('attendances').upsert({
      numero: contact.session_id,
      instancia: instance,
      sector_id: userSector?.id || null,
      sector_name: userSector?.name || null,
      sector_color: userSector?.color || '#EC4899',
      attendant_name: name,
      attendant_email: session?.user?.email,
      assumed_at: new Date().toISOString(),
    }, { onConflict: 'numero,instancia' })

    const assumeMsg = `▶ Atendimento assumido por ${name}${sectorLabel}`

    // Busca o recipient_id mais recente dessa conversa (preenchido pelo n8n
    // nas mensagens recebidas do cliente). Necessário pra Meta API.
    const { data: lastMsg } = await supabase.from(CONV_TABLE)
      .select('recipient_id')
      .eq('instancia', instance)
      .eq('numero', contact.session_id)
      .eq('aplicativo', 'instagram')
      .not('recipient_id', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    const recipientId = lastMsg?.recipient_id || null

    await supabase.from(CONV_TABLE).insert({
      instancia: instance,
      numero: contact.session_id,
      mensagem: assumeMsg,
      type: 'atendente',
      aplicativo: 'instagram',
      recipient_id: recipientId,
    })

    // Notifica n8n que a conversa foi assumida (para IA travar) — sem message para não enviar aviso ao cliente
    if (igWebhookUrl) fetch(igWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: contact.session_id,
        handle: contact.handle,
        recipient_id: recipientId,
        instancia: instance,
        api_instancia: apiInstancia,
        ai_enabled: aiEnabled,
        company: session?.company?.name,
        sender_name: name,
        sender_email: session?.user?.email,
        is_assume_event: true,
        aplicativo: 'instagram',
      }),
    }).catch(e => console.warn('webhook assumir IG:', e))

    setAttendancesMap(prev => ({
      ...prev,
      [contact.session_id]: {
        numero: contact.session_id, instancia: instance,
        sector_id: userSector?.id, sector_name: userSector?.name,
        sector_color: userSector?.color || '#EC4899',
        attendant_name: name, attendant_email: session?.user?.email,
      }
    }))
    setTab('meu-setor')
    setAssuming(null)
  }

  async function handleSend() {
    if (sending || !selected) return
    if (!msgText.trim()) return
    setSending(true)
    try {
      if (!attendancesMap[selected.session_id] && !closedMap[selected.session_id]) {
        const name = session?.user?.name || 'Atendente'
        const newAtt = {
          numero: selected.session_id, instancia: instance,
          sector_id: userSector?.id || null,
          sector_name: userSector?.name || null,
          sector_color: userSector?.color || '#EC4899',
          attendant_name: name, attendant_email: session?.user?.email,
          assumed_at: new Date().toISOString(),
        }
        await supabase.from('attendances').upsert(newAtt, { onConflict: 'numero,instancia' })
        setAttendancesMap(prev => ({ ...prev, [selected.session_id]: newAtt }))
        setTab('meu-setor')
      }
      const text = msgText.trim()
      setMsgText('')

      // Pega o recipient_id mais recente da conversa (vindo do cliente).
      // Cache local primeiro; se não tiver, busca no banco.
      let recipientId = getRecipientId()
      if (!recipientId) {
        const { data: lastMsg } = await supabase.from(CONV_TABLE)
          .select('recipient_id')
          .eq('instancia', instance)
          .eq('numero', selected.session_id)
          .eq('aplicativo', 'instagram')
          .not('recipient_id', 'is', null)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        recipientId = lastMsg?.recipient_id || null
      }

      const { error: insErr } = await supabase.from(CONV_TABLE).insert({
        instancia: instance,
        numero: selected.session_id,
        mensagem: text,
        type: 'atendente',
        aplicativo: 'instagram',
        recipient_id: recipientId,
      })
      if (insErr) console.error('insert mensagens_geral IG:', insErr)

      if (igWebhookUrl) fetch(igWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: selected.session_id,
          handle: selected.handle,
          recipient_id: recipientId,
          instancia: instance,
          api_instancia: apiInstancia,
          ai_enabled: aiEnabled,
          company: session?.company?.name,
          sender_name: session?.user?.name,
          sender_email: session?.user?.email,
          aplicativo: 'instagram',
        }),
      }).catch(e => console.warn('webhook IG:', e))
    } finally {
      setSending(false)
    }
  }

  async function handleClose() {
    if (!reason || !closeModal) return
    setClosing(true)
    const { error } = await supabase.from('conversations').insert({
      session_id: closeModal.session_id,
      instancia: instance,
      reason,
      closed_at: new Date().toISOString(),
    })
    setClosing(false)
    if (error) return
    const closedId = closeModal.session_id
    setClosedMap(prev => ({ ...prev, [closedId]: reason }))
    supabase.from('attendances').delete().eq('numero', closedId).eq('instancia', instance)
    setAttendancesMap(prev => { const n = { ...prev }; delete n[closedId]; return n })
    if (selected?.session_id === closedId) setSelected(null)
    setCloseModal(null)
    setReason('')
    setTab('finalizados')
    const label = REASONS.find(r => r.value === reason)?.label || reason
    setToast({ message: `Conversa finalizada — ${label}`, color: REASONS.find(r => r.value === reason)?.color || '#16A34A' })
    setTimeout(() => setToast(null), 3500)
  }

  const closed = new Set(Object.keys(closedMap))
  const recepcao    = contacts.filter(c => !closed.has(c.session_id) && !attendancesMap[c.session_id])
  const meuSetor    = contacts.filter(c => !closed.has(c.session_id) && attendancesMap[c.session_id] &&
    (isAdmin || !userSector || attendancesMap[c.session_id].sector_id === userSector.id))
  const finalizados = contacts.filter(c => closed.has(c.session_id))

  const tabList = [
    { id: 'recepcao',    label: 'Recepção',    icon: Inbox,      count: recepcao.length },
    { id: 'meu-setor',   label: 'Meu setor',   icon: UserCheck,  count: meuSetor.length },
    { id: 'finalizados', label: 'Finalizados', icon: Archive,    count: finalizados.length },
  ]
  const visibleContacts = (
    tab === 'recepcao' ? recepcao :
    tab === 'meu-setor' ? meuSetor :
    finalizados
  ).filter(c => !search.trim() || c.handle.toLowerCase().includes(search.toLowerCase()))

  const isClosed = selected && closedMap[selected.session_id]
  const isAttended = selected && attendancesMap[selected.session_id]

  return (
    <div className="ig-inbox">
      {/* Sidebar de DMs */}
      <aside className="ig-side">
        <div className="ig-side-head">
          <div className="ig-side-title-row">
            <div className="ig-side-logo">
              <Instagram size={18} />
            </div>
            <div>
              <div className="ig-side-title">Direct</div>
              <div className="ig-side-sub">Mensagens do Instagram</div>
            </div>
          </div>

          <div className="ig-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Buscar por @usuário"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch('')} className="ig-search-clear"><X size={12} /></button>}
          </div>

          <div className="ig-tabs">
            {tabList.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  className={`ig-tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  <Icon size={13} />
                  <span>{t.label}</span>
                  {t.count > 0 && <span className="ig-tab-count">{t.count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="ig-list">
          {loadingContacts ? (
            <div className="ig-empty">Carregando...</div>
          ) : visibleContacts.length === 0 ? (
            <div className="ig-empty">
              <div className="ig-empty-icon">
                <MessageCircle size={26} />
              </div>
              <div className="ig-empty-title">
                {tab === 'recepcao' && 'Nenhuma DM aguardando'}
                {tab === 'meu-setor' && 'Nada no seu setor'}
                {tab === 'finalizados' && 'Sem conversas encerradas'}
              </div>
              <div className="ig-empty-sub">
                {tab === 'recepcao' && 'A IA está cuidando ou ninguém escreveu ainda.'}
                {tab === 'meu-setor' && 'Conversas que você assumir aparecem aqui.'}
                {tab === 'finalizados' && 'O histórico fica registrado quando você finalizar.'}
              </div>
            </div>
          ) : (
            visibleContacts.map(c => {
              const att = attendancesMap[c.session_id]
              const isSelected = selected?.session_id === c.session_id
              const cleanNum = c.handle
              const saved = savedContacts[cleanNum]
              const displayName = saved?.nome || `@${c.handle}`
              return (
                <button
                  key={c.session_id}
                  className={`ig-dm-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelected(c)}
                >
                  <div className="ig-avatar" style={{ background: gradientFor(c.handle) }}>
                    {saved?.photo
                      ? <img src={saved.photo} alt="" />
                      : (saved?.nome || c.handle).charAt(0).toUpperCase()}
                  </div>
                  <div className="ig-dm-content">
                    <div className="ig-dm-row-top">
                      <span className="ig-dm-name">{displayName}</span>
                      <span className="ig-dm-time">{formatContactTime(c.lastTs)}</span>
                    </div>
                    <div className="ig-dm-row-bottom">
                      <span className="ig-dm-preview">{c.lastPreview || 'sem mensagem'}</span>
                      {att && (
                        <span className="ig-dm-tag" style={{
                          background: `${att.sector_color || '#EC4899'}1F`,
                          color: att.sector_color || '#EC4899',
                        }}>
                          <Headset size={9} />
                          {att.sector_name || att.attendant_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {tab === 'recepcao' && !att && (
                    <button
                      className="ig-assume-mini"
                      onClick={(e) => handleAssume(c, e)}
                      disabled={assuming === c.session_id}
                      title="Assumir conversa"
                    >
                      {assuming === c.session_id ? '...' : 'Assumir'}
                    </button>
                  )}
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Painel da conversa */}
      <main className="ig-chat">
        {!selected ? (
          <div className="ig-chat-empty">
            <div className="ig-chat-empty-icon">
              <Instagram size={40} />
            </div>
            <h3>Suas mensagens</h3>
            <p>Selecione uma conversa pra começar a responder seus contatos do Instagram.</p>
          </div>
        ) : (
          <>
            {/* Header da conversa */}
            <header className="ig-chat-head">
              {(() => {
                const cleanNum = selected.handle
                const saved = savedContacts[cleanNum]
                return (
                  <>
                    <div
                      className="ig-avatar md"
                      style={{ background: gradientFor(selected.handle), cursor: saved ? 'pointer' : 'default' }}
                      onClick={() => saved && navigate(`/painel/contatos/${saved.id}`)}
                    >
                      {saved?.photo
                        ? <img src={saved.photo} alt="" />
                        : (saved?.nome || selected.handle).charAt(0).toUpperCase()}
                    </div>
                    <div className="ig-chat-head-info">
                      <div className="ig-chat-head-name">{saved?.nome || `@${selected.handle}`}</div>
                      <div className="ig-chat-head-meta">
                        {saved && <span>@{selected.handle}</span>}
                        {!loadingMsgs && <span>{messages.length} mensagem(ns)</span>}
                      </div>
                    </div>
                  </>
                )
              })()}
              <div className="ig-chat-head-actions">
                {!isClosed && (
                  <>
                    <button
                      className="ig-action-btn"
                      onClick={() => navigate(`/painel/agenda?numero=${selected.handle}`)}
                      title="Agendar"
                    >
                      <Calendar size={14} />
                      <span>Agendar</span>
                    </button>
                    <button
                      className="ig-action-btn"
                      onClick={() => { setCloseModal(selected); setReason('') }}
                      title="Finalizar conversa"
                    >
                      <CheckCircle2 size={14} />
                      <span>Finalizar</span>
                    </button>
                  </>
                )}
                {isClosed && (() => {
                  const rs = REASONS.find(r => r.value === closedMap[selected.session_id])
                  return rs ? (
                    <span className="ig-status-pill" style={{ color: rs.color, background: rs.bg, borderColor: rs.border }}>
                      {rs.label}
                    </span>
                  ) : null
                })()}
              </div>
            </header>

            {/* Banner de status (IA / assumir) */}
            {!isClosed && !isAttended && (
              <div className={`ig-banner ${aiEnabled ? 'ai' : 'await'}`}>
                <div className="ig-banner-info">
                  {aiEnabled ? (
                    <>
                      <Sparkles size={15} />
                      <span>Conversa sob atendimento da <strong>IA</strong></span>
                    </>
                  ) : (
                    <>
                      <Inbox size={15} />
                      <span>Conversa aguardando atendimento</span>
                    </>
                  )}
                </div>
                <button
                  className="ig-banner-cta"
                  onClick={(e) => handleAssume(selected, e)}
                  disabled={assuming === selected.session_id}
                >
                  <UserCheck size={13} />
                  {assuming === selected.session_id ? 'Assumindo...' : 'Assumir conversa'}
                </button>
              </div>
            )}

            {/* Mensagens */}
            <div className="ig-chat-body">
              {loadingMsgs ? (
                <div className="ig-loading">Carregando mensagens...</div>
              ) : messages.length === 0 ? (
                <div className="ig-chat-no-msgs">
                  <Heart size={20} />
                  <span>Sem mensagens ainda</span>
                </div>
              ) : (
                messages.map((m, i) => {
                  const t = (m.type || '').toLowerCase()
                  const isClient = t === 'cliente' || t === 'human'
                  const isIA = t === 'ia'
                  const isAtt = t === 'atendente' || t === 'humano'
                  const sideClass = isClient ? 'left' : 'right'
                  const isAssumeMsg = m.content?.startsWith('▶ Atendimento assumido')
                  const media = detectMedia(m.base64)
                  return (
                    <div key={m.id || i} className={`ig-msg-row ${sideClass}`}>
                      {isAssumeMsg ? (
                        <div className="ig-msg-system">
                          <UserCheck size={11} />
                          <span>{m.content.replace('▶ ', '')}</span>
                        </div>
                      ) : (
                        <div className={`ig-bubble ${isClient ? 'client' : isIA ? 'ai' : 'att'} ${media ? 'has-media' : ''}`}>
                          {isIA && (
                            <span className="ig-bubble-tag">
                              <Sparkles size={9} /> IA
                            </span>
                          )}
                          {isAtt && (
                            <span className="ig-bubble-tag att">
                              <Headset size={9} /> Atendente
                            </span>
                          )}

                          {media?.type === 'image' && (
                            <img
                              className="ig-bubble-image"
                              src={`data:${media.mime};base64,${m.base64}`}
                              alt="imagem"
                              onClick={() => setLightbox(`data:${media.mime};base64,${m.base64}`)}
                            />
                          )}
                          {media?.type === 'audio' && (
                            <audio
                              className="ig-bubble-audio"
                              controls
                              src={`data:${media.mime};base64,${m.base64}`}
                            />
                          )}
                          {media?.type === 'pdf' && (
                            <a
                              className="ig-bubble-pdf"
                              href={`data:${media.mime};base64,${m.base64}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileText size={16} />
                              <span>Abrir PDF</span>
                            </a>
                          )}

                          {m.content && <div className="ig-bubble-text">{m.content}</div>}
                          <div className="ig-bubble-time">{formatMsgTime(m.ts)}</div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            {!isClosed ? (
              <div className="ig-composer">
                <div className="ig-composer-inner">
                  <input
                    type="text"
                    placeholder="Mande uma mensagem..."
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={sending}
                  />
                  <button
                    className="ig-send"
                    onClick={handleSend}
                    disabled={!msgText.trim() || sending}
                  >
                    {sending ? '...' : <Send size={16} />}
                  </button>
                </div>
                <div className="ig-composer-hint">
                  <Lock size={10} />
                  Mensagem enviada via Instagram Direct · Enter pra enviar
                </div>
              </div>
            ) : (
              <div className="ig-closed-bar">
                <Archive size={13} />
                <span>Conversa encerrada. Se @{selected.handle} mandar nova mensagem, um novo ticket será aberto.</span>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal de finalização */}
      {closeModal && (
        <div className="ig-modal-backdrop" onClick={() => !closing && setCloseModal(null)}>
          <div className="ig-modal" onClick={e => e.stopPropagation()}>
            <div className="ig-modal-head">
              <div>
                <h4>Finalizar conversa</h4>
                <p>com <strong>@{closeModal.handle}</strong></p>
              </div>
              <button className="ig-modal-close" onClick={() => !closing && setCloseModal(null)}><X size={16} /></button>
            </div>
            <div className="ig-modal-body">
              <div className="ig-modal-label">Como foi essa conversa?</div>
              <div className="ig-modal-options">
                {MANUAL_REASONS.map(r => (
                  <button
                    key={r.value}
                    className={`ig-modal-option ${reason === r.value ? 'selected' : ''}`}
                    style={reason === r.value ? {
                      background: r.bg, color: r.color, borderColor: r.border,
                    } : {}}
                    onClick={() => setReason(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="ig-modal-actions">
                <button className="ig-modal-cancel" onClick={() => setCloseModal(null)} disabled={closing}>
                  Cancelar
                </button>
                <button className="ig-modal-confirm" onClick={handleClose} disabled={!reason || closing}>
                  {closing ? 'Finalizando...' : 'Finalizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="ig-toast" style={{ background: toast.color }}>
          {toast.message}
        </div>
      )}

      {/* Lightbox de imagem */}
      {lightbox && createPortal(
        <div className="ig-lightbox" onClick={() => setLightbox(null)}>
          <button className="ig-lightbox-close" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
          <img src={lightbox} alt="" onClick={e => e.stopPropagation()} />
        </div>,
        document.body
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela de bloqueio (empresa sem Instagram ativo)
// ─────────────────────────────────────────────────────────────────────────────
function InstagramLockedScreen({ company }) {
  const { session } = useAuth()
  const [ticketState, setTicketState] = useState('idle') // idle | sending | sent | error
  const [ticketErr, setTicketErr] = useState('')

  async function openSupportTicket() {
    if (ticketState === 'sending' || ticketState === 'sent') return
    setTicketState('sending')
    setTicketErr('')

    const userId   = session?.user?.id
    const userName = session?.user?.name || 'Cliente'
    const subject  = 'Liberação do Instagram Direct'
    const message  =
      `Olá, time da NexSac! 👋\n\n` +
      `Sou da empresa ${company?.name || ''} e gostaria de liberar o ` +
      `Instagram Direct na plataforma.\n\n` +
      `Podemos avançar com o setup (Meta Business API + n8n)?`

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        company_id: company?.id,
        subject,
        status: 'open',
        created_by_user_id: userId,
        created_by_name: userName,
        last_sender: 'company',
      })
      .select()
      .single()

    if (error || !ticket) {
      setTicketErr('Não rolou abrir o ticket agora. Tenta de novo daqui a pouco.')
      setTicketState('error')
      return
    }

    await supabase.from('support_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'company',
      sender_user_id: userId,
      sender_name: userName,
      message,
    })

    setTicketState('sent')
  }

  return (
    <div className="ig-locked">
      <div className="ig-locked-bg">
        <div className="ig-locked-orb ig-locked-orb-1" />
        <div className="ig-locked-orb ig-locked-orb-2" />
        <div className="ig-locked-orb ig-locked-orb-3" />
      </div>

      <div className="ig-locked-content">
        <div className="ig-locked-badge">
          <Lock size={11} />
          <span>Recurso disponível mediante setup</span>
        </div>

        <h1 className="ig-locked-title">
          <span>Que tal trazer seu</span>
          <span className="ig-locked-grad">Instagram Direct</span>
          <span>pra dentro da plataforma?</span>
        </h1>

        <p className="ig-locked-sub">
          Pra ativar o Instagram aqui na sua empresa, a gente precisa configurar a integração
          com a Meta Business API e conectar com a IA. <strong>Fala com o time</strong> que a gente
          libera o setup pra você.
        </p>

        {/* Preview pequeno do que vem */}
        <div className="ig-locked-preview">
          <div className="ig-locked-preview-window">
            <div className="ig-locked-preview-bar">
              <Instagram size={14} />
              <span>Direct</span>
              <span className="ig-locked-preview-dot" />
              <span className="ig-locked-preview-handle">@suaempresa</span>
            </div>
            <div className="ig-locked-preview-body">
              <div className="ig-locked-preview-dm">
                <div className="ig-locked-preview-avatar" style={{ background: 'linear-gradient(135deg, #F472B6, #EC4899)' }}>A</div>
                <div className="ig-locked-preview-text">
                  <strong>ana_silva</strong>
                  <span>Vocês fazem botox?</span>
                </div>
                <div className="ig-locked-preview-time">2min</div>
              </div>
              <div className="ig-locked-preview-dm">
                <div className="ig-locked-preview-avatar" style={{ background: 'linear-gradient(135deg, #FBBF24, #FB923C)' }}>J</div>
                <div className="ig-locked-preview-text">
                  <strong>joao.fit</strong>
                  <span>Olá! Queria agendar...</span>
                </div>
                <div className="ig-locked-preview-time">14min</div>
              </div>
              <div className="ig-locked-preview-dm">
                <div className="ig-locked-preview-avatar" style={{ background: 'linear-gradient(135deg, #A78BFA, #6366F1)' }}>M</div>
                <div className="ig-locked-preview-text">
                  <strong>mariazinha</strong>
                  <span>Obrigada! Foi ótimo.</span>
                </div>
                <div className="ig-locked-preview-time">1h</div>
              </div>
            </div>
          </div>
          <div className="ig-locked-preview-overlay">
            <div className="ig-locked-preview-overlay-icon">
              <Lock size={26} />
            </div>
          </div>
        </div>

        {/* O que vem por aí */}
        <div className="ig-locked-features">
          <div className="ig-locked-feature">
            <div className="ig-locked-feature-icon" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#EC4899' }}>
              <MessageCircle size={16} />
            </div>
            <div>
              <div className="ig-locked-feature-title">Direct unificado</div>
              <div className="ig-locked-feature-desc">DM do Insta na mesma caixa do WhatsApp</div>
            </div>
          </div>
          <div className="ig-locked-feature">
            <div className="ig-locked-feature-icon" style={{ background: 'rgba(247, 119, 55, 0.12)', color: '#F77737' }}>
              <Sparkles size={16} />
            </div>
            <div>
              <div className="ig-locked-feature-title">IA atende e qualifica</div>
              <div className="ig-locked-feature-desc">Mesma inteligência do WhatsApp respondendo no Insta</div>
            </div>
          </div>
          <div className="ig-locked-feature">
            <div className="ig-locked-feature-icon" style={{ background: 'rgba(131, 58, 180, 0.12)', color: '#833AB4' }}>
              <Calendar size={16} />
            </div>
            <div>
              <div className="ig-locked-feature-title">Agenda integrada</div>
              <div className="ig-locked-feature-desc">Contatos agendam pelo Insta como pelo WhatsApp</div>
            </div>
          </div>
        </div>

        {/* CTA */}
        {ticketState === 'sent' ? (
          <div className="ig-locked-success">
            <div className="ig-locked-success-icon">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="ig-locked-success-title">Pedido enviado pro time!</div>
              <div className="ig-locked-success-sub">
                A gente vai responder pelo chat de suporte aqui na plataforma — abre ele no canto inferior direito pra acompanhar.
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="ig-locked-cta"
            onClick={openSupportTicket}
            disabled={ticketState === 'sending'}
          >
            <MessageCircle size={16} />
            <span>
              {ticketState === 'sending' ? 'Abrindo ticket...' : 'Falar com o time pra liberar'}
            </span>
            {ticketState !== 'sending' && <span className="ig-locked-cta-arrow">→</span>}
          </button>
        )}

        {ticketErr && <div className="ig-locked-error">{ticketErr}</div>}

        <div className="ig-locked-note">
          {ticketState === 'sent'
            ? 'Setup costuma ficar pronto em até 48h úteis · Acompanhe pelo chat de suporte'
            : 'A gente cuida da configuração técnica · Setup costuma ficar pronto em até 48h úteis'}
        </div>
      </div>
    </div>
  )
}
