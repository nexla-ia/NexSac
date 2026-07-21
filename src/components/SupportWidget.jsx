import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Send, Plus, ArrowLeft, Image as ImageIcon, Paperclip,
  CheckCircle2, Clock, MessageCircle, Loader2, Download, ZoomIn,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import './SupportWidget.css'

const STATUS_LABELS = {
  open:     { label: 'Aguardando',  color: '#D97706', bg: '#FEF3C7' },
  answered: { label: 'Respondido',  color: '#2563EB', bg: '#DBEAFE' },
  closed:   { label: 'Encerrado',   color: '#16A34A', bg: '#D1FAE5' },
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 1) return 'Ontem'
  if (diff < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function SupportWidget({ session, open, onClose, onUnreadChange }) {
  const [view, setView] = useState('list') // list | chat | new
  const [tickets, setTickets] = useState([])
  const [activeTicket, setActiveTicket] = useState(null)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const companyId = session?.company?.id
  const userId = session?.user?.id
  const userName = session?.user?.name

  // Carrega tickets da empresa
  async function loadTickets() {
    if (!companyId) return
    setLoading(true)
    const { data: tks } = await supabase.from('support_tickets')
      .select('*')
      .eq('company_id', companyId)
      .order('last_message_at', { ascending: false })
      .limit(50)
    setTickets(tks || [])

    // Conta não lidas (mensagens do ADM ainda não lidas pela empresa)
    const ticketIds = (tks || []).map(t => t.id)
    if (ticketIds.length) {
      const { count } = await supabase.from('support_messages')
        .select('id', { count: 'exact', head: true })
        .in('ticket_id', ticketIds)
        .eq('sender_type', 'adm')
        .eq('read_by_company', false)
      setUnreadTotal(count || 0)
    } else {
      setUnreadTotal(0)
    }
    setLoading(false)
  }

  useEffect(() => { loadTickets() }, [companyId])

  // Realtime: novas mensagens
  useEffect(() => {
    if (!companyId) return
    const ch = supabase.channel(`support-company-${companyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, () => {
        loadTickets()
        if (activeTicket) refreshActiveTicket()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `company_id=eq.${companyId}` }, () => {
        loadTickets()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [companyId, activeTicket?.id])

  // Quando o widget é aberto, volta pra lista e recarrega
  useEffect(() => {
    if (open) {
      setView('list')
      setActiveTicket(null)
      loadTickets()
    }
  }, [open])

  // Propaga contagem de não-lidas pro parent (sidebar)
  useEffect(() => {
    if (onUnreadChange) onUnreadChange(unreadTotal)
  }, [unreadTotal, onUnreadChange])

  function refreshActiveTicket() {
    if (activeTicket?.id) {
      // Re-fetch ticket from current state — chat component refetches messages on its own
    }
  }

  if (!open) return null

  return createPortal(
    <div className="sw-overlay" onClick={onClose}>
      <div className="sw-panel" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sw-header">
              {view === 'chat' && (
                <button className="sw-back" onClick={() => { setActiveTicket(null); setView('list') }}>
                  <ArrowLeft size={16} />
                  <span className="sw-btn-label">Voltar</span>
                </button>
              )}
              <div className="sw-header-info">
                <div className="sw-header-title">
                  {view === 'chat' ? (activeTicket?.subject || 'Chamado') : view === 'new' ? 'Conta pra gente' : 'Suporte NexSac'}
                </div>
                <div className="sw-header-sub">
                  {view === 'chat'
                    ? <span className="sw-status-pill" style={{
                        color: STATUS_LABELS[activeTicket?.status]?.color || '#64748B',
                        background: STATUS_LABELS[activeTicket?.status]?.bg || '#F1F5F9',
                      }}>{STATUS_LABELS[activeTicket?.status]?.label || activeTicket?.status}</span>
                    : view === 'new'
                    ? 'sem rodeios, a gente vai junto.'
                    : 'gente de verdade do outro lado.'}
                </div>
              </div>
              <button className="sw-close" onClick={onClose} aria-label="Fechar">
                <X size={16} />
                <span className="sw-btn-label">Fechar</span>
              </button>
            </div>

            {/* Body */}
            {view === 'list' && (
              <TicketList
                tickets={tickets}
                loading={loading}
                onOpenTicket={(t) => { setActiveTicket(t); setView('chat') }}
                onNew={() => setView('new')}
              />
            )}
            {view === 'chat' && activeTicket && (
              <TicketChat
                ticket={activeTicket}
                userId={userId}
                userName={userName}
                senderType="company"
                onTicketUpdated={(t) => setActiveTicket(t)}
              />
            )}
            {view === 'new' && (
              <NewTicketForm
                companyId={companyId}
                userId={userId}
                userName={userName}
                onCreated={(ticket) => { setActiveTicket(ticket); setView('chat'); loadTickets() }}
                onCancel={() => setView('list')}
              />
            )}
      </div>
    </div>,
    document.body
  )
}

// ─── Lista de tickets ───────────────────────────────────────────────────────
function TicketList({ tickets, loading, onOpenTicket, onNew }) {
  return (
    <div className="sw-list">
      {loading ? (
        <div className="sw-empty"><Loader2 size={20} className="sw-spin" /></div>
      ) : tickets.length === 0 ? (
        <div className="sw-empty">
          <MessageCircle size={36} />
          <h4>Tudo tranquilo por aqui</h4>
          <p>Sem chamados abertos. Quando precisar, tá aqui o canal — gente atende, não bot.</p>
        </div>
      ) : (
        <div className="sw-tickets">
          {tickets.map(t => {
            const st = STATUS_LABELS[t.status] || { label: t.status, color: '#64748B', bg: '#F1F5F9' }
            return (
              <button key={t.id} className="sw-ticket" onClick={() => onOpenTicket(t)}>
                <div className="sw-ticket-line">
                  <span className="sw-ticket-subject">{t.subject}</span>
                  <span className="sw-ticket-time">{formatTime(t.last_message_at)}</span>
                </div>
                <div className="sw-ticket-meta">
                  <span className="sw-status-pill" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  {t.last_sender === 'adm' && t.status === 'answered' && (
                    <span className="sw-ticket-new">Resposta nova</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
      <button className="sw-new-btn" onClick={onNew}>
        <Plus size={16} /> Novo chamado
      </button>
    </div>
  )
}

// ─── Form de novo ticket ────────────────────────────────────────────────────
function NewTicketForm({ companyId, userId, userName, onCreated, onCancel }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  async function submit() {
    if (!subject.trim() || !message.trim()) { setErr('Conta resumido e descreve o problema'); return }
    setSaving(true); setErr('')
    const { data: ticket, error } = await supabase.from('support_tickets').insert({
      company_id: companyId,
      subject: subject.trim(),
      status: 'open',
      created_by_user_id: userId,
      created_by_name: userName,
      last_sender: 'company',
    }).select().single()
    if (error) { setSaving(false); setErr('Erro: ' + error.message + ' — confirme que rodou supabase/migrations/20260430_support.sql.'); return }
    await supabase.from('support_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'company',
      sender_user_id: userId,
      sender_name: userName,
      message: message.trim(),
    })
    setSaving(false)
    onCreated(ticket)
  }
  return (
    <div className="sw-form">
      <div className="sw-field">
        <label>Em uma linha, o que tá rolando?</label>
        <input
          className="sw-input"
          placeholder="Ex: WhatsApp caiu e não reconecta"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          autoFocus
        />
      </div>
      <div className="sw-field">
        <label>Conta com calma</label>
        <textarea
          className="sw-textarea"
          placeholder="Quando começou? O que você tentou? Print ajuda — pode anexar dentro do chat depois."
          rows={6}
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
      </div>
      {err && <div className="sw-error">{err}</div>}
      <div className="sw-form-actions">
        <button className="sw-btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="sw-btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Enviando...' : <>Abrir chamado <Send size={13} /></>}
        </button>
      </div>
    </div>
  )
}

// ─── Chat de ticket ─────────────────────────────────────────────────────────
function TicketChat({ ticket, userId, userName, senderType, onTicketUpdated }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [imagePreview, setImagePreview] = useState(null) // base64 sem prefixo
  const [imagePrefix, setImagePrefix] = useState('')     // data:image/...;base64,
  const [otherTyping, setOtherTyping] = useState(false)
  const [lightbox, setLightbox] = useState(null) // src da imagem em foco
  const fileRef = useRef(null)
  const bodyRef = useRef(null)
  const presenceCh = useRef(null)
  const lastTypingSent = useRef(0)
  const typingClearTimeout = useRef(null)

  const readField = senderType === 'company' ? 'read_by_company' : 'read_by_adm'
  const otherType = senderType === 'company' ? 'adm' : 'company'

  async function loadMessages() {
    const { data } = await supabase.from('support_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])

    // Marca msgs do outro lado como lidas
    const unreadIds = (data || [])
      .filter(m => m.sender_type === otherType && !m[readField])
      .map(m => m.id)
    if (unreadIds.length) {
      await supabase.from('support_messages').update({ [readField]: true }).in('id', unreadIds)
    }
  }

  useEffect(() => { loadMessages() }, [ticket.id])

  // Escape fecha lightbox
  useEffect(() => {
    if (!lightbox) return
    const onKey = e => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

  // Realtime das mensagens deste ticket
  useEffect(() => {
    const ch = supabase.channel(`support-msg-${ticket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, () => loadMessages())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, () => loadMessages())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ticket.id])

  // Canal efêmero de presence/typing — não persiste no banco
  useEffect(() => {
    const ch = supabase.channel(`support-typing-${ticket.id}`, {
      config: { broadcast: { self: false } }
    })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.from && payload.from !== senderType) {
        setOtherTyping(true)
        if (typingClearTimeout.current) clearTimeout(typingClearTimeout.current)
        typingClearTimeout.current = setTimeout(() => setOtherTyping(false), 3500)
      }
    })
    ch.on('broadcast', { event: 'typing_stop' }, ({ payload }) => {
      if (payload?.from && payload.from !== senderType) {
        if (typingClearTimeout.current) clearTimeout(typingClearTimeout.current)
        setOtherTyping(false)
      }
    })
    ch.subscribe()
    presenceCh.current = ch
    return () => {
      supabase.removeChannel(ch)
      if (typingClearTimeout.current) clearTimeout(typingClearTimeout.current)
    }
  }, [ticket.id, senderType])

  // Auto-scroll para baixo (incluindo quando indicator de typing aparece)
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages.length, otherTyping])

  function pickImage(file) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Imagem muito grande. Máx 2MB.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const match = /^data:(image\/[^;]+);base64,(.*)$/.exec(result)
      if (match) {
        setImagePrefix(`data:${match[1]};base64,`)
        setImagePreview(match[2])
      }
    }
    reader.readAsDataURL(file)
  }

  // Envia broadcast de typing (throttled — máximo 1 vez por segundo)
  function notifyTyping() {
    if (!presenceCh.current) return
    const now = Date.now()
    if (now - lastTypingSent.current < 1000) return
    lastTypingSent.current = now
    presenceCh.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: senderType, name: userName, at: now }
    })
  }

  function notifyStopTyping() {
    if (!presenceCh.current) return
    presenceCh.current.send({
      type: 'broadcast',
      event: 'typing_stop',
      payload: { from: senderType }
    })
  }

  async function send() {
    if (!text.trim() && !imagePreview) return
    notifyStopTyping()
    setSending(true)
    const payload = {
      ticket_id: ticket.id,
      sender_type: senderType,
      sender_user_id: userId,
      sender_name: userName,
      message: text.trim() || null,
      image: imagePreview ? `${imagePrefix}${imagePreview}` : null,
    }
    const { error } = await supabase.from('support_messages').insert(payload)
    setSending(false)
    if (error) { alert('Erro: ' + error.message); return }
    setText('')
    setImagePreview(null)
    setImagePrefix('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function closeTicket() {
    if (!confirm('Marcar este chamado como resolvido?')) return
    await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', ticket.id)
    onTicketUpdated?.({ ...ticket, status: 'closed' })
  }

  return (
    <>
      <div className="sw-chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="sw-empty"><Clock size={20} /><p>Carregando...</p></div>
        )}
        {messages.map((m, idx) => {
          const mine = m.sender_type === senderType
          // Read receipt: só mostra na última mensagem MINHA, e só se o outro lado já leu
          const isLastMine = mine && !messages.slice(idx + 1).some(x => x.sender_type === senderType)
          const otherReadField = senderType === 'company' ? 'read_by_adm' : 'read_by_company'
          const wasSeen = isLastMine && m[otherReadField] === true
          return (
            <div key={m.id} className={`sw-msg ${mine ? 'mine' : 'theirs'}`}>
              {!mine && <div className="sw-msg-author">{m.sender_name || (m.sender_type === 'adm' ? 'Suporte' : 'Empresa')}</div>}
              <div className="sw-msg-bubble">
                {m.image && (
                  <img src={m.image} alt="anexo" className="sw-msg-image" onClick={() => setLightbox(m.image)} />
                )}
                {m.message && <div className="sw-msg-text">{m.message}</div>}
              </div>
              <div className="sw-msg-time">
                {formatTime(m.created_at)}
                {wasSeen && <span className="sw-msg-seen"> · Visto</span>}
              </div>
            </div>
          )
        })}
        {otherTyping && (
          <div className="sw-msg theirs sw-msg-typing">
            <div className="sw-msg-author">{senderType === 'company' ? 'Suporte' : 'Empresa'}</div>
            <div className="sw-msg-bubble sw-typing-bubble">
              <span className="sw-typing-dot" />
              <span className="sw-typing-dot" />
              <span className="sw-typing-dot" />
            </div>
            <div className="sw-msg-time sw-msg-typing-label">digitando...</div>
          </div>
        )}
      </div>

      <div className="sw-chat-input">
        {imagePreview && (
          <div className="sw-img-preview">
            <img src={`${imagePrefix}${imagePreview}`} alt="" />
            <button onClick={() => { setImagePreview(null); setImagePrefix(''); if (fileRef.current) fileRef.current.value = '' }}>
              <X size={12} />
            </button>
          </div>
        )}
        <div className="sw-chat-input-row">
          <button className="sw-attach" onClick={() => fileRef.current?.click()} title="Anexar imagem">
            <Paperclip size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => pickImage(e.target.files?.[0])}
          />
          <textarea
            className="sw-textarea-inline"
            placeholder="Digite sua mensagem..."
            rows={1}
            value={text}
            onChange={e => {
              setText(e.target.value)
              if (e.target.value.length > 0) notifyTyping()
              else notifyStopTyping()
            }}
            onBlur={() => notifyStopTyping()}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button className="sw-send" onClick={send} disabled={sending || (!text.trim() && !imagePreview)}>
            <Send size={16} />
          </button>
        </div>
        {senderType === 'company' && ticket.status !== 'closed' && (
          <button className="sw-close-ticket" onClick={closeTicket}>
            <CheckCircle2 size={12} /> Marcar como resolvido
          </button>
        )}
      </div>

      {lightbox && createPortal(
        <div className="sw-lightbox" onClick={() => setLightbox(null)}>
          <button className="sw-lightbox-close" onClick={() => setLightbox(null)} aria-label="Fechar">
            <X size={20} />
          </button>
          <a
            href={lightbox}
            download={`anexo-${Date.now()}.png`}
            onClick={e => e.stopPropagation()}
            className="sw-lightbox-download"
            title="Baixar imagem">
            <Download size={18} />
          </a>
          <img
            src={lightbox}
            alt="anexo"
            className="sw-lightbox-img"
            onClick={e => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  )
}

export { TicketChat }
