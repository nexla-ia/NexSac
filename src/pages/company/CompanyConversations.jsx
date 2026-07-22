import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import EmojiPicker from 'emoji-picker-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { MessageSquare, Bot, User, PhoneCall, CheckCircle2, X, Send, Headset, Sparkles, Inbox, UserCheck, Archive, Mic, Square, Trash2, Paperclip, FileText, Image as ImageIcon, Calendar, UserPlus, BookUser, Lock, ArrowRightLeft, ChevronLeft, Pencil, Film, Reply, Search, Clock, MailOpen, Loader2 } from 'lucide-react'
import { useContactTags, TagPicker, TagList, TagFilter, stripPhoneSuffix, buildTagFilter } from '../../components/Tags'
import QuickMessages from '../../components/QuickMessages'
import { canonSession, numeroVariants } from '../../lib/phone'
import './Company.css'

const CONV_TABLE = 'mensagens_geral'

function formatPhone(val) {
  return (val || '').replace(/@.*$/, '')
}

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

const INJECTED_PROMPT_RE = /responda em portugu[eê]s|de forma objetiva|solicite\s|n[aã]o informar|indicar que|apresentaremos|breve explica[çc][aã]o|orienta[çc][õo]es gerais|avalia[çc][aã]o pr[eé]-operat/i

const URL_REGEX = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]{2,})/gi

function renderTextWithLinks(text, linkStyle) {
  const parts = text.split(URL_REGEX)
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0
      const href = part.startsWith('http') ? part : `https://${part}`
      return <a key={i} href={href} target="_blank" rel="noreferrer noopener" style={linkStyle}>{part}</a>
    }
    return part
  })
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
  // MP4/MOV/3GP: verifica marcador 'ftyp' no offset 4
  try {
    if (b64.length > 100 && atob(b64.slice(0, 16)).slice(4, 8) === 'ftyp') {
      return { type: 'video', mime: 'video/mp4' }
    }
  } catch {}
  return null
}

function toImgSrc(val) {
  if (!val) return null
  if (val.startsWith('data:') || val.startsWith('http')) return val
  const media = detectMedia(val)
  const mime = media?.mime || 'image/jpeg'
  return `data:${mime};base64,${val}`
}

function isToolMessage(row) {
  const type = getMessageType(row)
  const content = row.mensagem || ''
  if (type === 'tool') return true
  if (type === 'ia' && /^Calling \w+ with input:/i.test(content.trim())) return true
  if (type === 'ia' && content.length > 800) return true
  if (type === 'cliente' && content.length > 200 && INJECTED_PROMPT_RE.test(content)) return true
  return false
}

function formatMsgTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return hhmm
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${hhmm}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm}`
}

function formatApptShort(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d >= today && d < new Date(today.getTime() + 86400000)) return `hoje ${hh}`
  if (d >= tomorrow && d < new Date(tomorrow.getTime() + 86400000)) return `amanhã ${hh}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hh}`
}

function formatContactTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const diffMin = Math.floor((now - date) / 60000)
  const diffH = Math.floor(diffMin / 60)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  if (diffH < 24) return `${diffH}h`
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Motivos padrão — usados só pra semear conversation_close_reasons na 1ª vez
// (ou restaurar sob demanda). A lista efetiva mostrada na UI vem do banco,
// então cada empresa pode editar nome/cor ou adicionar motivos próprios.
const DEFAULT_REASONS = [
  { value: 'agendado',       label: 'Agendado',    color: '#16A34A' },
  { value: 'resolvido',      label: 'Resolvido',   color: '#2563EB' },
  { value: 'encaminhado',    label: 'Encaminhado', color: '#7C3AED' },
  { value: 'desistiu',       label: 'Desistiu',    color: '#DC2626' },
  { value: 'auto_encerrado', label: 'Expirado',    color: '#6B7280' },
]

function reasonStyle(color) {
  const c = color || '#6B7280'
  return { bg: c + '14', border: c + '55' }
}

const AUTO_CLOSE_HOURS = 2
const TEXT_LIMIT = 400

const SPEEDS = [1, 1.5, 2]

function AudioPlayer({ src, style = {} }) {
  const ref = useRef(null)
  const [speed, setSpeed] = useState(1)
  function changeSpeed(s) {
    setSpeed(s)
    if (ref.current) ref.current.playbackRate = s
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, ...style }}>
      <audio ref={ref} controls src={src} style={{ width:260, maxWidth:'100%', height:32, display:'block' }} />
      <div style={{ display:'flex', gap:4 }}>
        {SPEEDS.map(s => (
          <button key={s} onClick={() => changeSpeed(s)}
            style={{
              fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, cursor:'pointer',
              border: speed === s ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              background: speed === s ? '#EFF6FF' : 'transparent',
              color: speed === s ? '#2563EB' : '#64748B',
            }}>
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CompanyConversations() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const instance      = session?.company?.instance
  const apiInstancia  = session?.company?.api_instancia
  const contactsTable = session?.company?.contacts_table

  const isAdmin = session?.user?.role === 'admin'
  const userSector = session?.user?.sector // { id, name, color } or null
  const aiEnabled = session?.company?.ai_enabled !== false

  const [contacts, setContacts]         = useState([])
  const [closedMap, setClosedMap]       = useState({}) // session_id → reason
  const [attendancesMap, setAttendancesMap] = useState({}) // numero → attendance record
  const [assuming, setAssuming]         = useState(null)
  const [transferModal, setTransferModal] = useState(null)
  const [transferringTo, setTransferringTo] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [companyUsers, setCompanyUsers] = useState([]) // outros atendentes pra transferir
  const [tab, setTab]                 = useState('recepcao')
  const [selectedIds, setSelectedIds] = useState(() => new Set()) // session_id → marcado (bulk actions)
  const [bulkMarkingRead, setBulkMarkingRead] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [search, setSearch]           = useState('')
  const [tagFilter, setTagFilter]     = useState([])
  const { tagsOf, assignments: tagAssignments } = useContactTags(instance)
  const [selected, setSelected]       = useState(null)
  const [messages, setMessages]       = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false)
  const [loadingMoreMsgs, setLoadingMoreMsgs] = useState(false)
  const [closeModal, setCloseModal]   = useState(null)
  const [reason, setReason]           = useState('')
  const [closing, setClosing]         = useState(false)
  const [reasons, setReasons]         = useState([]) // motivos de encerramento (editáveis, vêm do banco)
  const [manageReasonsOpen, setManageReasonsOpen] = useState(false)
  const [editingReasonId, setEditingReasonId]     = useState(null)
  const [editingReasonLabel, setEditingReasonLabel] = useState('')
  const [editingReasonColor, setEditingReasonColor] = useState('#6B7280')
  const [addingReason, setAddingReason]   = useState(false)
  const [newReasonLabel, setNewReasonLabel] = useState('')
  const [newReasonColor, setNewReasonColor] = useState('#2563EB')
  const [savingReason, setSavingReason]   = useState(false)
  const [toast, setToast]             = useState(null)
  const [msgText, setMsgText]         = useState('')
  const [sending, setSending]         = useState(false)
  const [closedLoaded, setClosedLoaded] = useState(false)
  const [lightbox, setLightbox]       = useState(null)
  const [recording, setRecording]     = useState(false)
  const [recordedAudio, setRecordedAudio] = useState(null) // { base64, mime, duration }
  const [recordTime, setRecordTime]   = useState(0)
  const [attachedFile, setAttachedFile] = useState(null) // { base64, mime, name, size, kind: 'image'|'pdf'|'file' }
  const [savedContacts, setSavedContacts] = useState({}) // numero (só dígitos) → { id, nome, notes }
  const [clientesMap, setClientesMap]     = useState({}) // numero (só dígitos) → { nome, pushname, ... }
  const [futureAppts, setFutureAppts]     = useState({}) // numero (só dígitos) → { starts_at, status, agenda_name }
  const [contextMenu, setContextMenu] = useState(null) // { x, y, contact }
  const [saveContactModal, setSaveContactModal] = useState(null) // { numero, nome, notes }
  const [savingContact, setSavingContact] = useState(false)
  const [editingMsgId, setEditingMsgId]   = useState(null)
  const [editingText, setEditingText]     = useState('')
  const [savingEdit, setSavingEdit]       = useState(false)
  const [deletingMsgId, setDeletingMsgId] = useState(null)
  const [togglingAwaiting, setTogglingAwaiting] = useState(false)
  const [expandedMsgIds, setExpandedMsgIds] = useState(() => new Set())
  const [openResultIds, setOpenResultIds] = useState(() => new Set())
  const [loadingResultIds, setLoadingResultIds] = useState(() => new Set())
  const [showEmoji, setShowEmoji]         = useState(false)
  const emojiPickerRef                    = useRef(null)
  const [readsMap, setReadsMap]           = useState({}) // session_id → last_read_at ISO
  const [readsLoaded, setReadsLoaded]     = useState(false)
  const [unreadCounts, setUnreadCounts]   = useState({}) // session_id → number
  const [replyTo, setReplyTo]             = useState(null) // mensagem sendo respondida/citada
  const [highlightId, setHighlightId]     = useState(null) // id de mensagem pra piscar ao pular
  const [searchOpen, setSearchOpen]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const msgRefs = useRef({})
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const recordTimerRef   = useRef(null)
  const recordStartRef   = useRef(0)
  const fileInputRef     = useRef(null)
  const composerInputRef = useRef(null)
  const bottomRef    = useRef(null)
  const chatBodyRef  = useRef(null)
  const skipScrollRef = useRef(false)
  const selectedRef  = useRef(null)
  const sentCacheRef = useRef([])
  const autoCloseDone = useRef(false)
  const initialCountsDone = useRef(false)

  useEffect(() => { selectedRef.current = selected }, [selected])

  // Fecha emoji picker ao clicar fora
  useEffect(() => {
    if (!showEmoji) return
    function handleClick(e) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showEmoji])

  // Carrega leituras do usuário atual
  useEffect(() => {
    if (!instance || !session?.user?.email) return
    supabase.from('conversation_reads')
      .select('session_id, last_read_at')
      .eq('instancia', instance)
      .eq('user_email', session.user.email)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.session_id] = r.last_read_at })
          setReadsMap(map)
        }
        setReadsLoaded(true)
      })
  }, [instance, session?.user?.email])

  // Calcula contagem inicial de não lidos (roda uma vez após contatos e leituras carregados)
  // Uma única query cobrindo todos os contatos, em vez de 1 COUNT por contato
  // (o N+1 antigo disparava dezenas/centenas de queries em paralelo e deixava
  // tudo mais lento, inclusive o carregamento das mensagens da conversa aberta).
  useEffect(() => {
    if (initialCountsDone.current || !readsLoaded || loadingContacts || !contacts.length || !instance) return
    initialCountsDone.current = true
    const unread = contacts.filter(c => {
      const lr = readsMap[c.session_id]
      return !lr || (c.lastTs && new Date(c.lastTs) > new Date(lr))
    })
    if (!unread.length) return
    const EPOCH = '1970-01-01T00:00:00Z'
    const thresholds = new Map(unread.map(c => [c.session_id, new Date(readsMap[c.session_id] || EPOCH).getTime()]))
    const minThreshold = new Date(Math.min(...[...thresholds.values()])).toISOString()
    supabase.from(CONV_TABLE)
      .select('numero, created_at')
      .eq('instancia', instance)
      .ilike('type', 'cliente')
      .is('idgrupo', null)
      .gt('created_at', minThreshold)
      .then(({ data }) => {
        const counts = {}
        ;(data || []).forEach(row => {
          const sid = canonSession(row.numero)
          const th = thresholds.get(sid)
          if (th === undefined) return
          if (new Date(row.created_at).getTime() > th) counts[sid] = (counts[sid] || 0) + 1
        })
        setUnreadCounts(counts)
      })
  }, [readsLoaded, loadingContacts, contacts, readsMap, instance])

  // Carrega agendamentos futuros (próximo por contato)
  useEffect(() => {
    if (!instance) return
    const now = new Date().toISOString()
    supabase.from('appointments')
      .select('contact_numero, starts_at, status, agenda_id, agendas(name)')
      .eq('instancia', instance)
      .gte('starts_at', now)
      .neq('status', 'cancelado')
      .neq('status', 'concluido')
      .order('starts_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(a => {
            if (!a.contact_numero) return
            if (!map[a.contact_numero]) map[a.contact_numero] = {
              starts_at: a.starts_at, status: a.status,
              agenda_name: a.agendas?.name || '',
            }
          })
          setFutureAppts(map)
        }
      })

    const ch = supabase.channel(`convs-appts-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `instancia=eq.${instance}` },
        () => {
          const ts = new Date().toISOString()
          supabase.from('appointments')
            .select('contact_numero, starts_at, status, agendas(name)')
            .eq('instancia', instance)
            .gte('starts_at', ts)
            .neq('status', 'cancelado')
            .neq('status', 'concluido')
            .order('starts_at', { ascending: true })
            .then(({ data }) => {
              if (data) {
                const map = {}
                data.forEach(a => {
                  if (!a.contact_numero) return
                  if (!map[a.contact_numero]) map[a.contact_numero] = {
                    starts_at: a.starts_at, status: a.status,
                    agenda_name: a.agendas?.name || '',
                  }
                })
                setFutureAppts(map)
              }
            })
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega contatos salvos
  useEffect(() => {
    if (!instance) return
    supabase.from('saved_contacts').select('*').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(c => { map[c.numero] = c })
          setSavedContacts(map)
        }
      })
    const ch = supabase.channel(`convs-saved-contacts-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_contacts', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setSavedContacts(prev => { const n = { ...prev }; delete n[p.old.numero]; return n })
          } else if (p.new) {
            setSavedContacts(prev => ({ ...prev, [p.new.numero]: p.new }))
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega contacts_table (clientes) para fallback de nome/pushname
  useEffect(() => {
    if (!instance || !contactsTable) return
    supabase.from(contactsTable).select('numero, nome, foto').eq('instancia', instance)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach(c => {
          if (c.numero) map[c.numero.replace(/\D/g, '')] = c
        })
        setClientesMap(map)
      })
  }, [instance, contactsTable])

  // Abre conversa via ?contact=xxxx (vindo da página Contatos)
  useEffect(() => {
    const target = searchParams.get('contact')
    if (!target || loadingContacts) return
    const sessionId = canonSession(target)
    const cleanTarget = formatPhone(sessionId)
    const existing = contacts.find(c => c.session_id === sessionId || c.phone === cleanTarget)
    if (existing) {
      setSelected(existing)
      // Se está finalizada, força aba certa para visualizar
      if (closedMap[existing.session_id]) setTab('finalizados')
      else if (attendancesMap[existing.session_id]) setTab('meu-setor')
      else setTab('recepcao')
    } else {
      const synthetic = { session_id: sessionId, phone: cleanTarget, lastTs: null }
      setContacts(prev => [synthetic, ...prev])
      setSelected(synthetic)
      setTab('recepcao')
    }
    searchParams.delete('contact')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, loadingContacts])

  // Fecha menu de contexto ao clicar fora
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  function openSaveContact(contact) {
    const numero = contact.phone.replace(/\D/g, '')
    const existing = savedContacts[numero]
    setSaveContactModal({
      id: existing?.id || null,
      numero,
      nome: existing?.nome || '',
      notes: existing?.notes || '',
    })
    setContextMenu(null)
  }

  async function handleSaveContact() {
    if (!saveContactModal?.nome.trim()) return
    setSavingContact(true)
    const { id, numero, nome, notes } = saveContactModal
    const { error } = id
      ? await supabase.from('saved_contacts').update({ nome: nome.trim(), notes: notes?.trim() || null }).eq('id', id)
      : await supabase.from('saved_contacts').insert({
          numero, instancia: instance,
          nome: nome.trim(), notes: notes?.trim() || null,
          created_by_email: session?.user?.email,
        })
    setSavingContact(false)
    if (!error) setSaveContactModal(null)
    else setToast({ message: 'Erro ao salvar: ' + error.message, color: '#DC2626' })
  }

  // Carrega atendimentos ativos (quem está em qual setor + atendente)
  useEffect(() => {
    if (!instance) return
    supabase.from('attendances').select('*').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.numero] = r })
          setAttendancesMap(map)
        }
      })
  }, [instance])

  // Carrega outros usuários da empresa pra opção de transferir conversa
  useEffect(() => {
    const companyId = session?.company?.id
    if (!companyId) return
    supabase.from('users').select('id, name, email, role').eq('company_id', companyId)
      .then(({ data }) => setCompanyUsers(data || []))
  }, [session?.company?.id])

  // Realtime: attendances
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`convs-attendances-${instance}`)
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

  // Carrega todos os contatos únicos da mensagens_geral (apenas WhatsApp)
  useEffect(() => {
    if (!instance) return
    setLoadingContacts(true)
    supabase.from(CONV_TABLE).select('id, numero, idgrupo, type, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .order('id', { ascending: false })
      .limit(50000)
      .then(({ data, error }) => {
        if (!error && data) {
          const seen = new Set()
          const unique = []
          // Indexa quem teve resposta de atendente humano em algum momento (só msgs individuais)
          const hasOutsideHuman = new Set()
          for (const row of data) {
            if (row.idgrupo) continue
            const t = (row.type || '').toLowerCase()
            if ((t === 'atendente' || t === 'humano') && row.numero && !row.numero.includes('@g.us')) {
              hasOutsideHuman.add(canonSession(row.numero))
            }
          }
          // Canonicaliza (junta com/sem o 9 extra) pra não rachar a conversa em duas
          for (const row of data) {
            if (!row.numero || row.numero.includes('@g.us')) continue  // ignora grupos do WhatsApp
            if (row.idgrupo) continue                                  // mensagem de grupo → tela de grupos
            const sid = canonSession(row.numero)
            if (seen.has(sid)) continue
            seen.add(sid)
            unique.push({
              session_id: sid,
              phone: formatPhone(sid),
              lastTs: getTimestamp(row),
              outsideAssumed: hasOutsideHuman.has(sid),
            })
          }
          setContacts(unique)
        }
        setLoadingContacts(false)
      })
  }, [instance])

  // Carrega sessões encerradas com motivo
  useEffect(() => {
    if (!instance) return
    supabase.from('conversations').select('session_id, reason').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.session_id] = r.reason || 'resolvido' })
          setClosedMap(map)
        }
        setClosedLoaded(true)
      })
  }, [instance])

  // Auto-encerra tickets sem atividade após AUTO_CLOSE_HOURS horas
  useEffect(() => {
    if (autoCloseDone.current || loadingContacts || !closedLoaded || !instance || !contacts.length) return
    autoCloseDone.current = true

    const cutoff = Date.now() - AUTO_CLOSE_HOURS * 3600_000
    const toClose = contacts.filter(c =>
      !closedMap[c.session_id] &&
      c.lastTs &&
      new Date(c.lastTs).getTime() < cutoff
    )
    if (!toClose.length) return

    toClose.forEach(c => {
      supabase.from('conversations').upsert({
        session_id: c.session_id,
        instancia: instance,
        reason: 'auto_encerrado',
        closed_at: new Date().toISOString(),
      }, { onConflict: 'session_id,instancia', ignoreDuplicates: true }).then(() => {})
      supabase.from('attendances').delete().eq('numero', c.session_id).eq('instancia', instance).then(() => {})
    })

    setClosedMap(prev => {
      const next = { ...prev }
      toClose.forEach(c => { next[c.session_id] = 'auto_encerrado' })
      return next
    })
    setAttendancesMap(prev => {
      const next = { ...prev }
      toClose.forEach(c => { delete next[c.session_id] })
      return next
    })
  }, [loadingContacts, closedLoaded, contacts, closedMap, instance])

  // Realtime: nova mensagem
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`convs-msgs-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: CONV_TABLE, filter: `instancia=eq.${instance}` },
        (p) => {
          const row = p.new
          if (!row || isToolMessage(row)) return
          // Ignora mensagens que não são do WhatsApp (Instagram tem tela separada)
          if (row.aplicativo && row.aplicativo !== 'whatsapp') return
          // Mensagem de grupo → tela de grupos, não toca aqui
          if (row.idgrupo) return
          if (!row.numero || row.numero.includes('@g.us')) return
          const sid = canonSession(row.numero)
          const incomingType = (row.type || '').toLowerCase()
          const ts = getTimestamp(row)

          // Reabre ticket encerrado: remove do closed e limpa attendance
          setClosedMap(prev => {
            if (!prev[sid]) return prev
            supabase.from('conversations').delete().eq('session_id', sid).eq('instancia', instance)
            supabase.from('attendances').delete().eq('numero', sid).eq('instancia', instance)
            setAttendancesMap(at => { const n = { ...at }; delete n[sid]; return n })
            const next = { ...prev }; delete next[sid]; return next
          })

          const isClientMsg = incomingType === 'cliente' || incomingType === 'human'
          if (isClientMsg && selectedRef.current?.session_id !== sid) {
            setUnreadCounts(prev => ({ ...prev, [sid]: (prev[sid] || 0) + 1 }))
          }
          // Cliente respondeu → limpa "aguardando paciente" automaticamente
          if (isClientMsg) {
            setAttendancesMap(prev => {
              if (!prev[sid]?.awaiting_client) return prev
              supabase.from('attendances').update({ awaiting_client: false }).eq('numero', sid).eq('instancia', instance).then(() => {})
              return { ...prev, [sid]: { ...prev[sid], awaiting_client: false } }
            })
          }

          setContacts(prev => {
            const exists = prev.find(c => c.session_id === sid)
            const isOutsideHuman = incomingType === 'atendente' || incomingType === 'humano'
            if (exists) {
              return [
                { ...exists, lastTs: ts, outsideAssumed: exists.outsideAssumed || isOutsideHuman },
                ...prev.filter(c => c.session_id !== sid)
              ]
            }
            return [{ session_id: sid, phone: formatPhone(sid), lastTs: ts, outsideAssumed: isOutsideHuman }, ...prev]
          })

          if (selectedRef.current?.session_id === sid) {
            const sentNome = sentCacheRef.current.find(
              s => s.content === getMessageContent(row) && (Date.now() - s.at) < 30000
            )?.nome || null
            setMessages(msgs => {
              if (msgs.some(m => m.id === row.id)) return msgs
              return [...msgs, {
                id: row.id,
                id_mensagem: row.id_mensagem || null,
                type: getMessageType(row),
                content: getMessageContent(row),
                base64: row.base64 || null,
                nome: sentNome || row.nome || null,
                ts,
                quoted_id_mensagem: row.quoted_id_mensagem || null,
                quoted_text: row.quoted_text || null,
              }]
            })
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Realtime: conversa encerrada por outro usuário
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`convs-closed-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `instancia=eq.${instance}` },
        (p) => {
          if (!p.new) return
          setClosedMap(prev => ({ ...prev, [p.new.session_id]: p.new.reason || 'resolvido' }))
          setSelected(prev => prev?.session_id === p.new.session_id ? null : prev)
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  const MSG_PAGE = 50

  // Carrega mensagens da conversa selecionada (apenas as 50 mais recentes)
  useEffect(() => {
    if (!selected || !instance) return
    setLoadingMsgs(true)
    setMessages([])
    setHasMoreMsgs(false)
    supabase.from(CONV_TABLE).select('id, id_mensagem, numero, nome, type, mensagem, base64, "horaLastMessage", created_at, quoted_id_mensagem, quoted_text, transcript, summary')
      .eq('instancia', instance)
      .in('numero', numeroVariants(selected.session_id))
      .is('idgrupo', null)
      .or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
      .then(({ data, error }) => {
        if (!error && data) {
          const sorted = [...data].reverse()
          setHasMoreMsgs(data.length === MSG_PAGE)
          setMessages(sorted.filter(r => !isToolMessage(r)).map(r => ({
            id: r.id,
            id_mensagem: r.id_mensagem || null,
            type: getMessageType(r),
            content: getMessageContent(r),
            base64: r.base64 || null,
            nome: r.nome || null,
            ts: getTimestamp(r),
            quoted_id_mensagem: r.quoted_id_mensagem || null,
            quoted_text: r.quoted_text || null,
            transcript: r.transcript || null,
            summary: r.summary || null,
          })))
        }
        setLoadingMsgs(false)
      })
  }, [selected, instance])

  async function loadMoreMessages() {
    if (loadingMoreMsgs || !hasMoreMsgs || !selected || !instance) return
    const oldestId = messages[0]?.id
    if (!oldestId) return
    setLoadingMoreMsgs(true)
    const prevScrollHeight = chatBodyRef.current?.scrollHeight || 0
    const { data, error } = await supabase.from(CONV_TABLE)
      .select('id, id_mensagem, numero, nome, type, mensagem, base64, "horaLastMessage", created_at, quoted_id_mensagem, quoted_text, transcript, summary')
      .eq('instancia', instance)
      .in('numero', numeroVariants(selected.session_id))
      .is('idgrupo', null)
      .or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .lt('id', oldestId)
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
    if (!error && data) {
      const sorted = [...data].reverse()
      setHasMoreMsgs(data.length === MSG_PAGE)
      const older = sorted.filter(r => !isToolMessage(r)).map(r => ({
        id: r.id,
        id_mensagem: r.id_mensagem || null,
        type: getMessageType(r),
        content: getMessageContent(r),
        base64: r.base64 || null,
        nome: r.nome || null,
        ts: getTimestamp(r),
        quoted_id_mensagem: r.quoted_id_mensagem || null,
        quoted_text: r.quoted_text || null,
            transcript: r.transcript || null,
            summary: r.summary || null,
      }))
      skipScrollRef.current = true
      setMessages(prev => [...older, ...prev])
      requestAnimationFrame(() => {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - prevScrollHeight
        }
      })
    }
    setLoadingMoreMsgs(false)
  }

  function scrollToMessage(dbId) {
    requestAnimationFrame(() => {
      msgRefs.current[dbId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(dbId)
      setTimeout(() => setHighlightId(prev => (prev === dbId ? null : prev)), 1600)
    })
  }

  // Pula pra uma mensagem: se já está carregada, só rola até ela; senão busca
  // o intervalo faltante no banco (considera as variantes do número — §1.1) e prepend.
  async function jumpToMessage(dbId) {
    if (!dbId || !selected || !instance) return
    if (messages.some(m => m.id === dbId)) { scrollToMessage(dbId); return }
    setLoadingMoreMsgs(true)
    skipScrollRef.current = true
    const prevScrollHeight = chatBodyRef.current?.scrollHeight || 0
    const oldestId = messages[0]?.id
    const { data, error } = await supabase.from(CONV_TABLE)
      .select('id, id_mensagem, numero, nome, type, mensagem, base64, "horaLastMessage", created_at, quoted_id_mensagem, quoted_text, transcript, summary')
      .eq('instancia', instance)
      .in('numero', numeroVariants(selected.session_id))
      .is('idgrupo', null)
      .or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .gte('id', dbId)
      .lt('id', oldestId || Number.MAX_SAFE_INTEGER)
      .order('id', { ascending: true })
      .limit(500)
    if (!error && data?.length) {
      const older = data.filter(r => !isToolMessage(r)).map(r => ({
        id: r.id,
        id_mensagem: r.id_mensagem || null,
        type: getMessageType(r),
        content: getMessageContent(r),
        base64: r.base64 || null,
        nome: r.nome || null,
        ts: getTimestamp(r),
        quoted_id_mensagem: r.quoted_id_mensagem || null,
        quoted_text: r.quoted_text || null,
            transcript: r.transcript || null,
            summary: r.summary || null,
      }))
      setHasMoreMsgs(true)
      setMessages(prev => {
        const seenIds = new Set(prev.map(m => m.id))
        return [...older.filter(m => !seenIds.has(m.id)), ...prev]
      })
      requestAnimationFrame(() => {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - prevScrollHeight
        }
        scrollToMessage(dbId)
      })
    }
    setLoadingMoreMsgs(false)
  }

  // Busca por palavras no histórico inteiro da conversa (não só o que está carregado)
  useEffect(() => {
    if (!searchOpen || !selected || !instance) return
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const esc = q.replace(/[\\%_]/g, s => '\\' + s)
    const timer = setTimeout(() => {
      supabase.from(CONV_TABLE)
        .select('id, mensagem, type, nome, "horaLastMessage", created_at')
        .eq('instancia', instance)
        .in('numero', numeroVariants(selected.session_id))
        .is('idgrupo', null)
        .or('aplicativo.eq.whatsapp,aplicativo.is.null')
        .ilike('mensagem', `%${esc}%`)
        .order('id', { ascending: false })
        .limit(80)
        .then(({ data }) => {
          setSearchResults((data || []).filter(r => !isToolMessage(r)))
          setSearchLoading(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchOpen, selected, instance])

  function handleSearchResultClick(row) {
    jumpToMessage(row.id)
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
  }

  useEffect(() => {
    if (skipScrollRef.current) { skipScrollRef.current = false; return }
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingMsgs])

  // Scroll para o fim ao abrir edição (evita textarea ficar atrás do compositor)
  useEffect(() => {
    if (editingMsgId) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [editingMsgId])

  // Estilo WhatsApp: com a conversa aberta, já dá pra começar a digitar sem
  // precisar clicar na barra antes — qualquer tecla "de texto" foca o
  // composer e entra na mensagem, contanto que não tenha outro campo focado.
  useEffect(() => {
    if (!selected || closedMap[selected.session_id] || !canRespond(selected)) return
    if (saveContactModal || closeModal || transferModal || manageReasonsOpen) return
    function handleGlobalKeydown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length !== 1) return // só caracteres imprimíveis (ignora Enter, Tab, setas, etc.)
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return
      setMsgText(prev => prev + e.key)
      composerInputRef.current?.focus()
    }
    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  }, [selected, closedMap, attendancesMap, isAdmin, session?.user?.email, saveContactModal, closeModal, transferModal, manageReasonsOpen])

  // Limpa a seleção ao trocar de aba (seleção só faz sentido em Recepção/Setores)
  useEffect(() => { setSelectedIds(new Set()) }, [tab])

  function toggleSelect(sid, e) {
    e?.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(sid) ? next.delete(sid) : next.add(sid)
      return next
    })
  }

  function toggleSelectAll(list) {
    setSelectedIds(prev => prev.size === list.length && list.length > 0
      ? new Set()
      : new Set(list.map(c => c.session_id)))
  }

  // Marca em massa as conversas selecionadas como lidas
  async function handleBulkMarkRead() {
    const ids = [...selectedIds]
    if (!ids.length || bulkMarkingRead) return
    setBulkMarkingRead(true)
    const now = new Date().toISOString()
    setUnreadCounts(prev => {
      const next = { ...prev }
      ids.forEach(sid => { delete next[sid] })
      return next
    })
    setReadsMap(prev => {
      const next = { ...prev }
      ids.forEach(sid => { next[sid] = now })
      return next
    })
    if (session?.user?.email) {
      await Promise.all(ids.map(sid => supabase.from('conversation_reads').upsert({
        instancia: instance, session_id: sid, user_email: session.user.email, last_read_at: now,
      }, { onConflict: 'instancia,session_id,user_email' })))
    }
    setBulkMarkingRead(false)
    // Mantém a seleção (não fecha nem desmarca nada) — só limpa quando o
    // usuário clicar em "Cancelar" ou finalizar as conversas de propósito.
    setToast({ message: `${ids.length} conversa(s) marcada(s) como lida(s)`, color: '#16A34A' })
    setTimeout(() => setToast(null), 3000)
  }

  function handleSelectContact(c) {
    setSelected(c)
    setReplyTo(null)
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    if (!unreadCounts[c.session_id]) return
    setUnreadCounts(prev => { const n = { ...prev }; delete n[c.session_id]; return n })
    const now = new Date().toISOString()
    setReadsMap(prev => ({ ...prev, [c.session_id]: now }))
    if (session?.user?.email) {
      supabase.from('conversation_reads').upsert({
        instancia: instance,
        session_id: c.session_id,
        user_email: session.user.email,
        last_read_at: now,
      }, { onConflict: 'instancia,session_id,user_email' }).then(() => {})
    }
  }

  async function handleAssume(contact, e) {
    e?.stopPropagation()
    if (attendancesMap[contact.session_id] || assuming === contact.session_id) return
    setAssuming(contact.session_id)
    const name = session?.user?.name || 'Atendente'
    const sectorLabel = userSector ? ` (${userSector.name})` : ''

    // INSERT sem ON CONFLICT UPDATE — se outro atendente assumiu primeiro,
    // o banco retorna erro 23505 (unique violation) e abortamos silenciosamente.
    const { error: insertErr } = await supabase.from('attendances').insert({
      numero: contact.session_id,
      instancia: instance,
      sector_id: userSector?.id || null,
      sector_name: userSector?.name || null,
      sector_color: userSector?.color || '#6B7280',
      attendant_name: name,
      attendant_email: session?.user?.email,
      assumed_at: new Date().toISOString(),
    })
    if (insertErr) {
      setAssuming(null)
      if (insertErr.code === '23505') {
        setToast({ message: 'Essa conversa já foi assumida por outro atendente.', color: '#DC2626' })
        setTimeout(() => setToast(null), 4000)
      }
      return
    }

    const assumeMsg = `▶ Atendimento assumido por ${name}${sectorLabel}`
    await supabase.rpc('send_mensagem_geral', {
      p_instancia: instance,
      p_numero: contact.session_id,
      p_mensagem: assumeMsg,
      p_type: 'atendente',
      p_hora: new Date().toISOString(),
    })

    // Notifica n8n que a conversa foi assumida (para IA travar) — sem message para não enviar aviso ao cliente
    fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: contact.session_id,
        phone: contact.phone,
        instancia: instance,
        api_instancia: apiInstancia,
        ai_enabled: session?.company?.ai_enabled !== false,
        company: session?.company?.name,
        sender_name: name,
        sender_email: session?.user?.email,
        is_assume_event: true,
      }),
    }).catch(e => console.warn('webhook assumir:', e))

    setAttendancesMap(prev => ({
      ...prev,
      [contact.session_id]: {
        numero: contact.session_id, instancia: instance,
        sector_id: userSector?.id, sector_name: userSector?.name,
        sector_color: userSector?.color || '#6B7280',
        attendant_name: name, attendant_email: session?.user?.email,
      }
    }))
    setTab('meu-setor')
    setAssuming(null)
  }

  async function handlePullConversation(contact) {
    const att = attendancesMap[contact.session_id]
    if (!att) return
    const meName = session?.user?.name || 'Atendente'
    const meEmail = session?.user?.email

    const { data: memberData } = await supabase
      .from('sector_members')
      .select('sector_id, sectors(id, name, color)')
      .eq('user_id', session?.user?.id)
      .maybeSingle()
    const mySector = memberData?.sectors || null

    const updated = {
      attendant_name:  meName,
      attendant_email: meEmail,
      sector_id:    mySector?.id ?? att.sector_id ?? null,
      sector_name:  mySector?.name ?? att.sector_name ?? null,
      sector_color: mySector?.color ?? att.sector_color ?? '#6B7280',
    }

    const { error } = await supabase
      .from('attendances')
      .update(updated)
      .eq('numero', contact.session_id)
      .eq('instancia', instance)

    if (error) {
      setToast({ message: 'Erro ao puxar conversa: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
      return
    }

    const prevName = att.attendant_name || 'outro atendente'
    await supabase.rpc('send_mensagem_geral', {
      p_instancia: instance,
      p_numero: contact.session_id,
      p_mensagem: `↩ Atendimento retomado por ${meName} (era de ${prevName})`,
      p_type: 'atendente',
      p_hora: new Date().toISOString(),
    })

    setAttendancesMap(prev => ({
      ...prev,
      [contact.session_id]: { ...(prev[contact.session_id] || {}), ...updated },
    }))
    setToast({ message: `Conversa puxada para você`, color: '#16A34A' })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleTransfer() {
    if (!transferModal || !transferringTo || transferring) return
    const target = companyUsers.find(u => u.email === transferringTo)
    if (!target) return
    setTransferring(true)

    // Tenta achar o setor do novo atendente
    const { data: memberData } = await supabase
      .from('sector_members')
      .select('sector_id, sectors(id, name, color)')
      .eq('user_id', target.id)
      .maybeSingle()
    const targetSector = memberData?.sectors || null

    const updated = {
      attendant_name: target.name,
      attendant_email: target.email,
      sector_id:    targetSector?.id ?? null,
      sector_name:  targetSector?.name ?? null,
      sector_color: targetSector?.color ?? '#6B7280',
    }

    const { error } = await supabase
      .from('attendances')
      .update(updated)
      .eq('numero', transferModal.session_id)
      .eq('instancia', instance)

    if (error) {
      setTransferring(false)
      setToast({ message: 'Erro ao transferir: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
      return
    }

    // Mensagem-marco no histórico
    const meName = session?.user?.name || 'Atendente'
    const handoverMsg = `↪ Atendimento transferido por ${meName} para ${target.name}`
    await supabase.rpc('send_mensagem_geral', {
      p_instancia: instance,
      p_numero: transferModal.session_id,
      p_mensagem: handoverMsg,
      p_type: 'atendente',
      p_hora: new Date().toISOString(),
    })

    setAttendancesMap(prev => ({
      ...prev,
      [transferModal.session_id]: {
        ...(prev[transferModal.session_id] || {}),
        ...updated,
      },
    }))
    setTransferring(false)
    setTransferModal(null)
    setTransferringTo('')
    setToast({ message: `Conversa transferida pra ${target.name}`, color: '#7C3AED' })
    setTimeout(() => setToast(null), 3500)
  }

  async function startRecording() {
    if (recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm'
      const mr = new MediaRecorder(stream, { mimeType })
      mr._stream = stream
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorderRef.current = mr
      recordStartRef.current = Date.now()
      mr.start()
      setRecording(true)
      setRecordTime(0)
      recordTimerRef.current = setInterval(() => {
        setRecordTime(Math.floor((Date.now() - recordStartRef.current) / 1000))
      }, 500)
    } catch (e) {
      console.error('Erro ao acessar microfone:', e)
      setToast({ message: 'Não foi possível acessar o microfone', color: '#DC2626' })
      setTimeout(() => setToast(null), 3000)
    }
  }

  function stopRecording({ persistPreview = true } = {}) {
    return new Promise(resolve => {
      const mr = mediaRecorderRef.current
      if (!mr) return resolve(null)
      mr.onstop = async () => {
        const mimeType = mr.mimeType
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const buf = await blob.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        const base64 = btoa(bin)
        const duration = Math.floor((Date.now() - recordStartRef.current) / 1000)
        const audioData = { base64, mime: mimeType, duration }
        if (persistPreview) setRecordedAudio(audioData)
        mr._stream?.getTracks().forEach(t => t.stop())
        resolve(audioData)
      }
      mr.stop()
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
      setRecording(false)
    })
  }

  function discardAudio() {
    setRecordedAudio(null)
    setRecordTime(0)
  }

  async function handlePickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    const MAX = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > MAX) {
      setToast({ message: isVideo ? 'Vídeo muito grande (máx 50 MB)' : 'Arquivo muito grande (máx 15 MB)', color: '#DC2626' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    const base64 = btoa(bin)
    const kind = file.type.startsWith('image/') ? 'image'
      : file.type === 'application/pdf' ? 'pdf'
      : file.type.startsWith('video/') ? 'video'
      : 'file'
    setAttachedFile({ base64, mime: file.type || 'application/octet-stream', name: file.name, size: file.size, kind })
  }

  function discardFile() {
    setAttachedFile(null)
  }

  // Helper: usuário atual pode responder essa conversa?
  // Regra: dono da conversa OU admin OU conversa ainda sem atendimento.
  function canRespond(contact) {
    if (!contact) return false
    if (closedMap[contact.session_id]) return false
    const att = attendancesMap[contact.session_id]
    if (!att) return true
    if (isAdmin) return true
    return att.attendant_email === session?.user?.email
  }

  async function handleSend() {
    if (sending || !selected) return
    if (!canRespond(selected)) {
      const att = attendancesMap[selected.session_id]
      setToast({
        message: `Conversa em atendimento por ${att?.attendant_name || 'outro atendente'}. Peça pra ele transferir ou finalize antes.`,
        color: '#DC2626',
      })
      setTimeout(() => setToast(null), 4000)
      return
    }
    let audio = recordedAudio
    if (recording) {
      audio = await stopRecording({ persistPreview: false })
    }
    if (!msgText.trim() && !audio && !attachedFile) return
    setSending(true)
    try {
      // Auto-assume se ainda não está atribuído a ninguém
      if (!attendancesMap[selected.session_id] && !closedMap[selected.session_id]) {
        const name = session?.user?.name || 'Atendente'
        const newAtt = {
          numero: selected.session_id, instancia: instance,
          sector_id: userSector?.id || null,
          sector_name: userSector?.name || null,
          sector_color: userSector?.color || '#6B7280',
          attendant_name: name, attendant_email: session?.user?.email,
          assumed_at: new Date().toISOString(),
        }
        await supabase.from('attendances').upsert(newAtt, { onConflict: 'numero,instancia' })
        setAttendancesMap(prev => ({ ...prev, [selected.session_id]: newAtt }))
        setTab('meu-setor')
      }
      const text = msgText.trim()
      const file = attachedFile
      const quoting = replyTo
      setMsgText('')
      setRecordedAudio(null)
      setRecordTime(0)
      setAttachedFile(null)
      setReplyTo(null)

      const filePrefix = file
        ? (file.kind === 'image' ? '🖼️ ' : file.kind === 'pdf' ? '📄 ' : file.kind === 'video' ? '🎬 ' : '📎 ') + file.name
        : null
      const mensagemPayload = audio
        ? (text || '🎤 Áudio')
        : file
          ? (text ? `${filePrefix}\n${text}` : filePrefix)
          : text
      const mediaBase64 = audio?.base64 || file?.base64 || null
      const senderName = session?.user?.name || null
      sentCacheRef.current = [
        { content: mensagemPayload, nome: senderName, at: Date.now() },
        ...sentCacheRef.current.filter(s => Date.now() - s.at < 30000),
      ]
      const { error: insErr } = await supabase.rpc('send_mensagem_geral', {
        p_instancia: instance,
        p_numero: selected.session_id,
        p_mensagem: mensagemPayload,
        p_type: 'atendente',
        p_hora: new Date().toISOString(),
        p_base64: mediaBase64,
        p_nome: senderName,
        p_quoted: quoting?.id_mensagem || null,
      })
      if (insErr) console.error('send_mensagem_geral:', insErr)

      // Resposta citando mensagem usa webhook dedicado (precisa do quoted.key na Evolution);
      // envio normal segue pelo envioNexla. Aguarda o retorno com id_mensagem pra gravar no banco.
      const webhookUrl = quoting
        ? 'https://n8n.nexladesenvolvimento.com.br/webhook/respondermensagem'
        : 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla'
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mensagem: mensagemPayload,
          audio_base64: audio?.base64 || null,
          audio_mime: audio?.mime || null,
          audio_duration: audio?.duration || null,
          file_base64: file?.base64 || null,
          file_mime: file?.mime || null,
          file_name: file?.name || null,
          file_kind: file?.kind || null,
          session_id: selected.session_id,
          phone: selected.phone,
          instancia: instance,
          api_instancia: apiInstancia,
          ai_enabled: session?.company?.ai_enabled !== false,
          company: session?.company?.name,
          sender_name: session?.user?.name,
          sender_email: session?.user?.email,
          ...(quoting ? {
            quoted_id: quoting.id_mensagem || null,
            quoted_text: quoting.content || '',
            quoted_fromMe: quoting.type !== 'cliente',
            quoted_remoteJid: selected.session_id,
          } : {}),
        }),
      })
        .then(r => r.text())
        .then(async text => {
          const [instResp, msgResp, msgId] = text.trim().split('\n').map(l => l.trim())
          if (!msgId || !instResp || !msgResp) return
          // Acha a linha pelo conteúdo da mensagem + instancia + numero (mais recente)
          const { data: row } = await supabase
            .from('mensagens_geral')
            .select('id')
            .eq('instancia', instResp)
            .eq('numero', selected.session_id)
            .eq('mensagem', msgResp)
            .eq('type', 'atendente')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (row?.id) {
            supabase.from('mensagens_geral')
              .update({ id_mensagem: msgId })
              .eq('id', row.id)
              .then(() => {})
          }
        })
        .catch(e => console.warn('webhook envio:', e))
    } finally {
      setSending(false)
    }
  }

  async function handleSaveEdit(msg) {
    const newText = editingText.trim()
    if (!newText || savingEdit) return
    setSavingEdit(true)
    try {
      // Busca id_mensagem atualizado do banco (pode ter sido preenchido pelo n8n após o envio)
      const { data: fresh } = await supabase
        .from('mensagens_geral')
        .select('id_mensagem')
        .eq('id', msg.id)
        .maybeSingle()
      const id_mensagem = fresh?.id_mensagem || msg.id_mensagem

      const res = await fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexlaeditar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msg.id,
          id_mensagem,
          message: newText,
          session_id: selected?.session_id,
          phone: selected?.phone,
          instancia: instance,
          api_instancia: apiInstancia,
          ai_enabled: session?.company?.ai_enabled !== false,
          company: session?.company?.name,
          sender_name: session?.user?.name,
          sender_email: session?.user?.email,
        }),
      })
      if (!res.ok) throw new Error('status ' + res.status)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: newText } : m))
      setEditingMsgId(null)
      setEditingText('')
      setToast({ message: 'Mensagem editada', color: '#16A34A' })
      setTimeout(() => setToast(null), 2500)
    } catch (e) {
      setToast({ message: 'Erro ao editar: ' + e.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
    } finally {
      setSavingEdit(false)
    }
  }

  // Visual "de mentira": nunca busca/grava nada de verdade. O texto é gerado
  // localmente a partir da própria mensagem (o texto que já veio junto com o
  // áudio/pdf/imagem, escondido pelo suppressCaption) — sem precisar de banco.
  // O botão só alterna se ele aparece ou não. Abrir finge um processamento
  // (delay randômico 5-6s); fechar é instantâneo.
  function getFakeResultText(msg, kind) {
    const rawContent = msg.content || ''
    const fileLineMatch = rawContent.match(/^(🎤 Áudio|🖼️ [^\n]+|📄 [^\n]+|🎬 [^\n]+|📎 [^\n]+)(\n([\s\S]*))?$/)
    const real = (fileLineMatch ? fileLineMatch[3]?.trim() : rawContent) || ''
    if (real) return real
    return kind === 'transcript' ? 'Sem transcrição disponível para este áudio.' : 'Sem resumo disponível para este arquivo.'
  }

  function handleOpenResult(msgId) {
    if (openResultIds.has(msgId) || loadingResultIds.has(msgId)) return
    setLoadingResultIds(prev => new Set(prev).add(msgId))
    const delay = 5000 + Math.random() * 1000
    setTimeout(() => {
      setLoadingResultIds(prev => { const n = new Set(prev); n.delete(msgId); return n })
      setOpenResultIds(prev => new Set(prev).add(msgId))
    }, delay)
  }

  function handleCloseResult(msgId) {
    setOpenResultIds(prev => { const n = new Set(prev); n.delete(msgId); return n })
  }

  // Renderiza o bloco (card aberto OU botão fechado) pra áudio/imagem/pdf
  function renderResultBlock(msg, kind) {
    const isAtd = msg.type === 'atendente'
    const label = kind === 'transcript' ? 'Transcrição' : 'Resumo'
    const actionLabel = kind === 'transcript' ? 'Transcrever' : 'Resumir'
    const loadingLabel = kind === 'transcript' ? 'Transcrevendo...' : 'Resumindo...'
    const isOpen = openResultIds.has(msg.id)
    const isLoading = loadingResultIds.has(msg.id)
    if (isOpen) {
      return (
        <div style={{
          marginTop: 6, borderRadius: 8, padding: '8px 10px',
          background: isAtd ? 'rgba(255,255,255,0.14)' : '#F5F3FF',
          border: `1px solid ${isAtd ? 'rgba(255,255,255,0.3)' : '#DDD6FE'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 3 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
              color: isAtd ? 'rgba(255,255,255,0.85)' : '#7C3AED',
            }}>
              <Sparkles size={10} /> {label}
            </span>
            <button onClick={() => handleCloseResult(msg.id)} title="Ocultar"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'inline-flex', color: isAtd ? 'rgba(255,255,255,0.7)' : '#7C3AED', opacity: 0.7,
              }}>
              <X size={12} />
            </button>
          </div>
          <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', color: isAtd ? 'rgba(255,255,255,0.95)' : 'var(--text-secondary)' }}>
            {getFakeResultText(msg, kind)}
          </div>
        </div>
      )
    }
    return (
      <button
        onClick={() => handleOpenResult(msg.id)}
        disabled={isLoading}
        style={{
          marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          cursor: isLoading ? 'default' : 'pointer',
          border: `1px solid ${isAtd ? 'rgba(255,255,255,0.5)' : '#CBD5E1'}`,
          background: isAtd ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: isAtd ? '#fff' : 'var(--text-secondary)',
          opacity: isLoading ? 0.75 : 1,
        }}
      >
        {isLoading ? (
          <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> {loadingLabel}</>
        ) : (<><Sparkles size={11} /> {actionLabel}</>)}
      </button>
    )
  }

  async function handleDeleteMessage(msg) {
    if (deletingMsgId) return
    setDeletingMsgId(msg.id)
    try {
      // Busca id_mensagem atualizado do banco (pode ter sido preenchido pelo n8n
      // depois do envio, já que o estado local pode estar desatualizado)
      const { data: fresh } = await supabase
        .from('mensagens_geral')
        .select('id_mensagem')
        .eq('id', msg.id)
        .maybeSingle()
      const id_mensagem = fresh?.id_mensagem || msg.id_mensagem

      const { error } = await supabase.from('mensagens_geral')
        .update({ mensagem: '🚫 Mensagem apagada', base64: null })
        .eq('id', msg.id)
      if (error) throw error
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '🚫 Mensagem apagada', base64: null } : m))
      fetch('https://n8n.nexladesenvolvimento.com.br/webhook/apagarmeg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_mensagem,
          fromMe: true,
          api: apiInstancia,
          instancia: instance,
          numero: selected?.phone,
          remoteJid: selected?.session_id,
          numero_empresa: session?.company?.numero_base ? `${session.company.numero_base}@s.whatsapp.net` : null,
        }),
      }).catch(e => console.warn('webhook excluir:', e))
    } catch (e) {
      setToast({ message: 'Erro ao apagar: ' + e.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
    } finally {
      setDeletingMsgId(null)
    }
  }

  // Marca uma conversa como não lida manualmente: joga o last_read_at pro passado
  // (persiste no banco — na próxima carga o contador de não lidos recalcula certo).
  async function handleMarkUnread(contact) {
    setContextMenu(null)
    const farPast = '1970-01-01T00:00:00Z'
    setReadsMap(prev => ({ ...prev, [contact.session_id]: farPast }))
    setUnreadCounts(prev => ({ ...prev, [contact.session_id]: prev[contact.session_id] || 1 }))
    if (session?.user?.email) {
      await supabase.from('conversation_reads').upsert({
        instancia: instance,
        session_id: contact.session_id,
        user_email: session.user.email,
        last_read_at: farPast,
      }, { onConflict: 'instancia,session_id,user_email' })
    }
  }

  async function handleToggleAwaitingClient() {
    if (!selected || togglingAwaiting) return
    const att = attendancesMap[selected.session_id]
    if (!att) return
    setTogglingAwaiting(true)
    const next = !att.awaiting_client
    const { error } = await supabase.from('attendances')
      .update({ awaiting_client: next })
      .eq('numero', selected.session_id).eq('instancia', instance)
    setTogglingAwaiting(false)
    if (!error) {
      setAttendancesMap(prev => ({ ...prev, [selected.session_id]: { ...prev[selected.session_id], awaiting_client: next } }))
    }
  }

  async function handleReopen(contact) {
    if (!contact || !instance) return
    await supabase.from('conversations').delete().eq('session_id', contact.session_id).eq('instancia', instance)
    await supabase.from('attendances').delete().eq('numero', contact.session_id).eq('instancia', instance)
    setClosedMap(prev => { const n = { ...prev }; delete n[contact.session_id]; return n })
    setAttendancesMap(prev => { const n = { ...prev }; delete n[contact.session_id]; return n })
    setTab('recepcao')
    setToast({ message: 'Conversa reaberta', color: '#16A34A' })
    setTimeout(() => setToast(null), 2500)
  }

  // Carrega motivos de encerramento; semeia os padrão na 1ª vez (linha sentinela
  // __seeded__ evita ressemear o que a empresa apagou de propósito depois).
  async function loadReasons() {
    if (!instance) return
    const { data } = await supabase.from('conversation_close_reasons')
      .select('*').eq('instancia', instance).order('created_at', { ascending: true })
    const rows = (data || []).filter(r => r.value !== '__seeded__')
    const seeded = (data || []).some(r => r.value === '__seeded__')
    const withStyle = list => list.map(r => ({ ...r, ...reasonStyle(r.color) }))
    if (rows.length === 0 && !seeded) {
      const seedDate = '2020-01-01T00:00:00Z'
      await supabase.from('conversation_close_reasons').insert(
        [...DEFAULT_REASONS, { value: '__seeded__', label: '', color: '#000000' }]
          .map(r => ({ ...r, instancia: instance, created_at: seedDate }))
      )
      const { data: fresh } = await supabase.from('conversation_close_reasons')
        .select('*').eq('instancia', instance).order('created_at', { ascending: true })
      setReasons(withStyle((fresh || []).filter(r => r.value !== '__seeded__')))
    } else {
      setReasons(withStyle(rows))
    }
  }

  useEffect(() => { loadReasons() }, [instance])

  function slugifyReason(label) {
    const noDiacritics = label.toLowerCase().trim().normalize('NFD').split('').filter(ch => {
      const code = ch.codePointAt(0)
      return code < 0x0300 || code > 0x036f // remove marcas de acento (combining diacritics)
    }).join('')
    return noDiacritics.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `motivo_${Date.now()}`
  }

  async function handleAddReason() {
    const label = newReasonLabel.trim()
    if (!label || savingReason) return
    setSavingReason(true)
    const { error } = await supabase.from('conversation_close_reasons')
      .insert({ instancia: instance, value: slugifyReason(label), label, color: newReasonColor })
    setSavingReason(false)
    if (error) {
      setToast({ message: 'Erro ao adicionar motivo: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
      return
    }
    setNewReasonLabel('')
    setAddingReason(false)
    loadReasons()
  }

  function startEditReason(r) {
    setEditingReasonId(r.id)
    setEditingReasonLabel(r.label)
    setEditingReasonColor(r.color || '#6B7280')
  }

  async function handleSaveReason() {
    const label = editingReasonLabel.trim()
    if (!label || savingReason || !editingReasonId) return
    setSavingReason(true)
    const { error } = await supabase.from('conversation_close_reasons')
      .update({ label, color: editingReasonColor })
      .eq('id', editingReasonId)
    setSavingReason(false)
    if (error) {
      setToast({ message: 'Erro ao salvar motivo: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
      return
    }
    setEditingReasonId(null)
    loadReasons()
  }

  async function handleDeleteReason(r) {
    if (r.value === 'auto_encerrado') return // reservado ao sistema (auto-encerramento)
    await supabase.from('conversation_close_reasons').delete().eq('id', r.id)
    loadReasons()
  }

  async function handleRestoreDefaultReasons() {
    const existing = new Set(reasons.map(r => r.value))
    const missing = DEFAULT_REASONS.filter(r => !existing.has(r.value))
    if (!missing.length) return
    await supabase.from('conversation_close_reasons')
      .insert(missing.map(r => ({ ...r, instancia: instance })))
    loadReasons()
  }

  async function handleClose() {
    if (!reason || !closeModal) return
    setClosing(true)

    // Modo em massa: fecha todas as conversas selecionadas de uma vez, com o mesmo motivo
    if (closeModal.bulk) {
      const ids = [...selectedIds]
      const now = new Date().toISOString()
      await Promise.all(ids.map(sid => supabase.from('conversations').insert({
        session_id: sid, instancia: instance, reason, closed_at: now,
      })))
      await Promise.all(ids.map(sid => supabase.from('attendances').delete().eq('numero', sid).eq('instancia', instance)))
      setClosedMap(prev => {
        const next = { ...prev }
        ids.forEach(sid => { next[sid] = reason })
        return next
      })
      setAttendancesMap(prev => {
        const next = { ...prev }
        ids.forEach(sid => { delete next[sid] })
        return next
      })
      if (selected && ids.includes(selected.session_id)) setSelected(null)
      setSelectedIds(new Set())
      setClosing(false)
      setCloseModal(null)
      setReason('')
      setTab('finalizados')
      const label = reasons.find(r => r.value === reason)?.label || reason
      setToast({ message: `${ids.length} conversa(s) finalizada(s) — ${label}`, color: reasons.find(r => r.value === reason)?.color || '#16A34A' })
      setTimeout(() => setToast(null), 3500)
      return
    }

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
    const label = reasons.find(r => r.value === reason)?.label || reason
    setToast({ message: `Conversa finalizada — ${label}`, color: reasons.find(r => r.value === reason)?.color || '#16A34A' })
    setTimeout(() => setToast(null), 3500)
  }

  // Resolve nome do contato: saved_contacts > clientes.nome > clientes.pushname > telefone
  function resolveName(phone) {
    const clean = (phone || '').replace(/\D/g, '')
    return savedContacts[clean]?.nome
        || clientesMap[clean]?.nome
        || clientesMap[clean]?.pushname
        || phone
  }

  const closed = new Set(Object.keys(closedMap))
  const recepcao    = contacts.filter(c => !closed.has(c.session_id) && !attendancesMap[c.session_id])
  const meuSetor    = contacts.filter(c => !closed.has(c.session_id) && attendancesMap[c.session_id] &&
    (isAdmin || !userSector || attendancesMap[c.session_id].sector_id === userSector.id))
  const finalizados = contacts.filter(c => closed.has(c.session_id))

  const tabList = [
    { id: 'recepcao',    label: 'Recepção',              icon: Inbox,      count: recepcao.length },
    { id: 'meu-setor',  label: isAdmin ? 'Setores' : 'Meu setor', icon: UserCheck, count: meuSetor.length },
    { id: 'finalizados', label: 'Finalizados',            icon: Archive,    count: finalizados.length },
  ]

  const currentList = tab === 'recepcao' ? recepcao : tab === 'meu-setor' ? meuSetor : finalizados
  const tagMatch = buildTagFilter(tagFilter, tagAssignments)
  const filtered = currentList
    .filter(c => {
      if (!search) return true
      const cleanNum = c.phone.replace(/\D/g, '')
      const nome = resolveName(c.phone)
      const searchDigits = search.replace(/\D/g, '')
      const phoneMatch = searchDigits.length > 0 && cleanNum.includes(searchDigits)
      const nameMatch = nome.toLowerCase().includes(search.toLowerCase())
      return phoneMatch || nameMatch
    })
    .filter(c => tagMatch(c.phone))
  const isClosed = selected ? closed.has(selected.session_id) : false

  return (
    <div className={`contacts-root ${selected ? 'has-selected' : ''}`}>
      <div className="contacts-list">
        {/* Abas */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          {tabList.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(null) }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid #2563EB' : '2px solid transparent',
                color: tab === t.id ? '#2563EB' : 'var(--text-muted)',
                fontSize: 11, fontWeight: tab === t.id ? 700 : 500,
                transition: 'all 0.15s',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 20, padding: '0 4px',
                  background: tab === t.id ? '#2563EB' : '#E2E8F0',
                  color: tab === t.id ? '#fff' : 'var(--text-muted)',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="contacts-list-header" style={{ paddingTop: 10 }}>
          <input
            className="contacts-search"
            placeholder="Buscar por telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <TagFilter instancia={instance} value={tagFilter} onChange={setTagFilter} />
          </div>
          {tab !== 'finalizados' && filtered.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                  onChange={() => toggleSelectAll(filtered)}
                />
                Selecionar todas
              </label>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB' }}>{selectedIds.size} selecionada(s)</span>
              )}
            </div>
          )}
          {selectedIds.size > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={handleBulkMarkRead}
                disabled={bulkMarkingRead}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
                  padding: '5px 10px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF',
                  color: '#2563EB', cursor: bulkMarkingRead ? 'default' : 'pointer', opacity: bulkMarkingRead ? 0.6 : 1,
                }}
              >
                <MailOpen size={12} /> Marcar como lida
              </button>
              <button
                onClick={() => { setCloseModal({ bulk: true, count: selectedIds.size }); setReason('') }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
                  padding: '5px 10px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4',
                  color: '#16A34A', cursor: 'pointer',
                }}
              >
                <CheckCircle2 size={12} /> Finalizar selecionadas
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
                  padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div className="contacts-list-body">
          {loadingContacts && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
          )}
          {!loadingContacts && filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhuma conversa aqui.
            </div>
          )}
          {filtered.map(c => {
            const att = attendancesMap[c.session_id]
            const isAssuming = assuming === c.session_id
            const closedReason = closedMap[c.session_id]
            const rs = closedReason ? reasons.find(r => r.value === closedReason) : null
            const cleanNum = c.phone.replace(/\D/g, '')
            const saved = savedContacts[cleanNum]
            const cliente = clientesMap[cleanNum]
            const displayName = saved?.nome || cliente?.nome || cliente?.pushname || null
            const nextAppt = futureAppts[cleanNum]
            return (
              <div
                key={c.session_id}
                className={`contact-item ${selected?.session_id === c.session_id ? 'selected' : ''} ${unreadCounts[c.session_id] ? 'unread' : ''}`}
                onClick={() => handleSelectContact(c)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, contact: c })
                }}
              >
                {tab !== 'finalizados' && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.session_id)}
                    onClick={e => e.stopPropagation()}
                    onChange={e => toggleSelect(c.session_id, e)}
                    style={{ marginRight: 8, flexShrink: 0, cursor: 'pointer' }}
                  />
                )}
                {(() => {
                  const contactPhoto = toImgSrc(saved?.photo) || toImgSrc(cliente?.foto)
                  return (
                    <div className="contact-avatar" style={contactPhoto ? { background: 'transparent', overflow: 'hidden' } : {}}>
                      {contactPhoto
                        ? <img src={contactPhoto} alt={displayName || c.phone} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : displayName
                          ? <span style={{ fontWeight: 700, fontSize: 12, color: '#2563EB' }}>{displayName.charAt(0).toUpperCase()}</span>
                          : <User size={14} style={{ opacity: 0.4 }} />}
                    </div>
                  )
                })()}
                <div className="contact-info" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <div className="contact-name" style={{ fontWeight: unreadCounts[c.session_id] ? 800 : displayName ? 600 : 400 }}>
                      {displayName || c.phone}
                    </div>
                    {displayName && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.phone}</span>
                    )}
                    <TagList tags={tagsOf(c.phone)} max={2} size="sm" />
                    {nextAppt && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                        color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE',
                        lineHeight: '16px',
                      }}>
                        <Calendar size={9} /> {formatApptShort(nextAppt.starts_at)}
                      </span>
                    )}
                    {tab === 'recepcao' && c.outsideAssumed && (
                      <span title="Alguém respondeu direto pelo WhatsApp, fora da plataforma" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', lineHeight: '16px' }}>
                        <PhoneCall size={9} /> Atendido fora
                      </span>
                    )}
                    {tab === 'recepcao' && aiEnabled && !c.outsideAssumed && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', lineHeight: '16px' }}>
                        <Sparkles size={9} /> IA
                      </span>
                    )}
                    {tab === 'meu-setor' && att && (
                      <>
                        {att.sector_name && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: '#fff', background: att.sector_color || '#6B7280', lineHeight: '16px' }}>
                            {att.sector_name}
                          </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', lineHeight: '16px' }}>
                          <Headset size={9} /> {att.attendant_name?.split(' ')[0]}
                        </span>
                        {att.awaiting_client && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', lineHeight: '16px' }}>
                            <Clock size={9} /> Aguardando paciente
                          </span>
                        )}
                      </>
                    )}
                    {tab === 'finalizados' && rs && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`, lineHeight: '16px' }}>{rs.label}</span>
                    )}
                  </div>
                  {tab === 'recepcao' && (
                    <button
                      onClick={e => handleAssume(c, e)}
                      disabled={isAssuming}
                      style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#16A34A', color: '#fff', border: 'none', cursor: 'pointer', opacity: isAssuming ? 0.6 : 1 }}
                    >
                      <Headset size={10} />
                      {isAssuming ? 'Assumindo...' : 'Assumir atendimento'}
                    </button>
                  )}
                </div>
                <div className="contact-meta">
                  {c.lastTs && <div className="contact-time" style={{ fontWeight: unreadCounts[c.session_id] ? 700 : 400, color: unreadCounts[c.session_id] ? '#2563EB' : undefined }}>{formatContactTime(c.lastTs)}</div>}
                  {unreadCounts[c.session_id] > 0 && (
                    <div style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#2563EB', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', marginTop: 3 }}>
                      {unreadCounts[c.session_id] > 99 ? '99+' : unreadCounts[c.session_id]}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="chat-panel">
        {!selected ? (
          <div className="chat-empty">
            <MessageSquare size={32} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 14 }}>Selecione uma conversa</div>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <button
                type="button"
                className="chat-back-mobile"
                onClick={() => setSelected(null)}
                aria-label="Voltar para a lista">
                <ChevronLeft size={20} />
              </button>
              {(() => {
                const cleanNum = selected.phone.replace(/\D/g, '')
                const saved = savedContacts[cleanNum]
                const cliente = clientesMap[cleanNum]
                const headerName = saved?.nome || cliente?.nome || cliente?.pushname || null
                return (
                  <>
                    {(() => {
                      const headerPhoto = toImgSrc(saved?.photo) || toImgSrc(cliente?.foto)
                      return (
                        <div className="contact-avatar"
                          style={{
                            width: 38, height: 38,
                            background: headerPhoto ? 'transparent' : undefined,
                            overflow: 'hidden',
                            cursor: saved ? 'pointer' : 'default',
                          }}
                          onClick={() => saved && navigate(`/painel/contatos/${saved.id}`)}
                          title={saved ? 'Abrir ficha do contato' : ''}
                        >
                          {headerPhoto
                            ? <img src={headerPhoto} alt={headerName || selected.phone} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : headerName
                              ? <span style={{ fontWeight: 700, fontSize: 14, color: '#2563EB' }}>{headerName.charAt(0).toUpperCase()}</span>
                              : <User size={14} style={{ opacity: 0.4 }} />}
                        </div>
                      )
                    })()}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)', cursor: saved ? 'pointer' : 'default' }}
                        onClick={() => saved && navigate(`/painel/contatos/${saved.id}`)}
                      >
                        {headerName || selected.phone}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {headerName && <span style={{ fontFamily: 'monospace' }}>{selected.phone}</span>}
                        {!loadingMsgs && <span>{messages.length} mensagem(ns)</span>}
                      </div>
                    </div>
                  </>
                )
              })()}
              <button
                className="nx-btn-ghost"
                title="Buscar na conversa"
                onClick={() => setSearchOpen(v => !v)}
                style={{
                  padding: '7px 10px', display: 'flex', alignItems: 'center',
                  color: searchOpen ? '#2563EB' : undefined,
                  background: searchOpen ? '#EFF6FF' : undefined,
                }}
              >
                <Search size={14} />
              </button>
              {!isClosed && (() => {
                const cleanNum = selected.phone.replace(/\D/g, '')
                const saved = savedContacts[cleanNum]
                const nome = saved?.nome || ''
                const hasContact = !!saved
                return (
                  <>
                    <TagPicker
                      instancia={instance}
                      numero={selected.phone}
                      userEmail={session?.user?.email}
                      anchor="bottom-right"
                    />
                    <button
                      className="nx-btn-ghost"
                      style={{
                        fontSize: 12, padding: '7px 14px',
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: hasContact ? '#16A34A' : '#C9A074',
                        borderColor: hasContact ? '#BBF7D0' : '#F0E0B6',
                        background: hasContact ? '#F0FDF4' : '#FFFBEB',
                      }}
                      title={hasContact ? `Já salvo como ${saved.nome}` : 'Salvar contato pra aparecer com nome'}
                      onClick={() => openSaveContact(selected)}
                    >
                      {hasContact ? <UserCheck size={14} /> : <UserPlus size={14} />}
                      <span className="btn-label">{hasContact ? `Editar ${saved.nome}` : 'Salvar contato'}</span>
                    </button>
                    <button
                      className="nx-btn-ghost"
                      style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, color: '#7C3AED' }}
                      onClick={() => navigate(`/painel/agenda?numero=${cleanNum}${nome ? `&nome=${encodeURIComponent(nome)}` : ''}`)}
                    >
                      <Calendar size={14} /> <span className="btn-label">Agendar</span>
                    </button>
                    {(() => {
                      const att = attendancesMap[selected.session_id]
                      const myEmail = session?.user?.email
                      const isOwner = att?.attendant_email === myEmail
                      const isElse  = att && !isOwner

                      return (
                        <>
                          {/* Transferir — só o dono ou admin vê */}
                          {att && (isOwner || isAdmin) && (
                            <button
                              className="nx-btn-ghost"
                              style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, color: '#0891B2' }}
                              onClick={() => { setTransferModal(selected); setTransferringTo('') }}
                              title="Passar essa conversa pra outro atendente"
                            >
                              <ArrowRightLeft size={14} /> <span className="btn-label">Transferir</span>
                            </button>
                          )}
                          {/* Puxar para mim — quando está com outro atendente */}
                          {isElse && (
                            <button
                              className="nx-btn-ghost"
                              style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, color: '#D97706', borderColor: '#FDE68A', background: '#FFFBEB' }}
                              onClick={() => handlePullConversation(selected)}
                              title={`Puxar de volta de ${att.attendant_name || 'outro atendente'}`}
                            >
                              <Inbox size={14} /> <span className="btn-label">Puxar para mim</span>
                            </button>
                          )}
                        </>
                      )
                    })()}
                    {(() => {
                      const att = attendancesMap[selected.session_id]
                      const isOwner = !att || isAdmin || att.attendant_email === session?.user?.email
                      if (!isOwner) return null
                      return (
                        <>
                          {att && (
                            <button
                              className="nx-btn-ghost"
                              style={{
                                fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6,
                                color: att.awaiting_client ? '#D97706' : undefined,
                                borderColor: att.awaiting_client ? '#FDE68A' : undefined,
                                background: att.awaiting_client ? '#FFFBEB' : undefined,
                              }}
                              title="Marcar que já respondi e estou esperando o cliente"
                              disabled={togglingAwaiting}
                              onClick={handleToggleAwaitingClient}
                            >
                              <Clock size={14} /> <span className="btn-label">{att.awaiting_client ? 'Aguardando paciente' : 'Aguardando resposta?'}</span>
                            </button>
                          )}
                        <button
                          className="nx-btn-ghost"
                          style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => { setCloseModal(selected); setReason('') }}
                        >
                          <CheckCircle2 size={14} /> <span className="btn-label">Finalizar conversa</span>
                        </button>
                        </>
                      )
                    })()}
                  </>
                )
              })()}
              {isClosed && (
                <>
                  <TagPicker
                    instancia={instance}
                    numero={selected.phone}
                    userEmail={session?.user?.email}
                    anchor="bottom-right"
                  />
                  {(() => {
                    const rs = reasons.find(r => r.value === closedMap[selected.session_id])
                    return rs ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                        color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`,
                      }}>{rs.label}</span>
                    ) : null
                  })()}
                </>
              )}
            </div>

            {searchOpen && (
              <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                <div style={{ padding: '10px 18px', display: 'flex', gap: 8 }}>
                  <input
                    className="nx-input"
                    autoFocus
                    style={{ flex: 1 }}
                    placeholder="Buscar mensagens nessa conversa..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setSearchOpen(false)}
                  />
                  <button className="nx-btn-ghost" onClick={() => setSearchOpen(false)} title="Fechar busca">
                    <X size={14} />
                  </button>
                </div>
                {searchQuery.trim() && (
                  <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
                    {searchLoading && (
                      <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--text-muted)' }}>Buscando...</div>
                    )}
                    {!searchLoading && searchResults.length === 0 && (
                      <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--text-muted)' }}>Nenhum resultado.</div>
                    )}
                    {!searchLoading && searchResults.map(r => {
                      const t = (r.type || '').toLowerCase()
                      const isCli = t === 'cliente'
                      const who = isCli
                        ? (resolveName(selected?.phone) !== selected?.phone ? resolveName(selected?.phone) : 'Cliente')
                        : (t === 'atendente' ? (r.nome || 'Atendente') : 'IA')
                      return (
                        <div
                          key={r.id}
                          onClick={() => handleSearchResultClick(r)}
                          style={{
                            padding: '9px 18px', cursor: 'pointer', borderBottom: '1px solid #F8FAFC',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isCli ? '#2563EB' : '#16A34A' }}>{who}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatMsgTime(getTimestamp(r))}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getMessageContent(r)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Banner: conversa assumida por outro atendente (não-dono e não-admin) */}
            {(() => {
              if (isClosed) return null
              const att = attendancesMap[selected.session_id]
              if (!att) return null
              const isOwner = att.attendant_email === session?.user?.email
              if (isOwner || isAdmin) return null
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  background: 'linear-gradient(90deg, #FEF3C7 0%, #FED7AA 100%)',
                  borderBottom: '1px solid #FDBA74',
                  padding: '10px 20px', flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#92400E' }}>
                    <Lock size={14} style={{ color: '#D97706' }} />
                    <span>
                      Conversa em atendimento por <strong>{att.attendant_name}</strong> — você não pode responder.
                      Peça pra ele <strong>transferir</strong> ou aguarde a conversa ser finalizada pra abrir novo ticket.
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Banner Recepção: botão assumir
                Nova lógica: se já tem mensagem de atendente/humano no histórico,
                significa que alguém respondeu por fora (direto no WhatsApp) — mostra
                aviso laranja em vez do banner azul "sob IA". */}
            {(() => {
              if (isClosed || attendancesMap[selected.session_id]) return null
              const respondidaPorFora = messages.some(m => {
                const t = (m.type || '').toLowerCase()
                return t === 'atendente' || t === 'humano'
              })
              if (respondidaPorFora) {
                return (
                  <div className="chat-banner chat-banner-wa">
                    <div className="chat-banner-text">
                      <PhoneCall size={15} style={{ color: '#D97706', flexShrink: 0 }} />
                      <span><span className="chat-banner-long">Conversa atendida </span><strong>direto no WhatsApp</strong> <span className="chat-banner-long">(fora da plataforma) — IA não está mais respondendo</span></span>
                    </div>
                    <button
                      onClick={e => handleAssume(selected, e)}
                      disabled={assuming === selected.session_id}
                      title="Trazer essa conversa pro seu setor pra continuar dentro da plataforma"
                      className="chat-banner-btn"
                      style={{
                        background: 'transparent', color: '#92400E',
                        border: '1.5px solid #D97706',
                        opacity: assuming === selected.session_id ? 0.6 : 1,
                      }}>
                      <UserCheck size={14} />
                      {assuming === selected.session_id ? 'Trazendo...' : 'Trazer pro meu setor'}
                    </button>
                  </div>
                )
              }
              return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: aiEnabled ? '#EFF6FF' : '#F8FAFC',
                borderBottom: `1px solid ${aiEnabled ? '#BFDBFE' : 'var(--border)'}`,
                padding: '10px 20px', flexShrink: 0, gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: aiEnabled ? '#1E40AF' : 'var(--text-secondary)' }}>
                  {aiEnabled ? (
                    <>
                      <Sparkles size={15} style={{ color: '#2563EB' }} />
                      <span>Conversa sob atendimento da <strong>IA</strong></span>
                    </>
                  ) : (
                    <>
                      <Inbox size={15} style={{ color: '#64748B' }} />
                      <span>Conversa aguardando atendimento</span>
                    </>
                  )}
                </div>
                <button
                  onClick={e => handleAssume(selected, e)}
                  disabled={assuming === selected.session_id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#16A34A', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '10px 22px',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
                    opacity: assuming === selected.session_id ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  <Headset size={16} />
                  {assuming === selected.session_id ? 'Assumindo...' : 'Assumir atendimento'}
                </button>
              </div>
              )
            })()}

            {/* Banner Finalizados */}
            {isClosed && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#F8FAFC', borderBottom: '1px solid var(--border)',
                padding: '8px 18px', flexShrink: 0,
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                <Archive size={13} />
                <span style={{ flex: 1 }}>
                  Conversa encerrada. Se o cliente enviar nova mensagem, um novo ticket será aberto automaticamente.
                </span>
                <button
                  onClick={() => handleReopen(selected)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: '#2563EB', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '5px 12px',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <MessageSquare size={11} /> Reabrir conversa
                </button>
              </div>
            )}

            <div className="chat-body" ref={chatBodyRef}>
              {loadingMsgs && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '2rem' }}>
                  Carregando mensagens...
                </div>
              )}
              {!loadingMsgs && hasMoreMsgs && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                  <button
                    onClick={loadMoreMessages}
                    disabled={loadingMoreMsgs}
                    style={{
                      fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)',
                      border: '1px solid var(--border)', borderRadius: 20,
                      padding: '4px 14px', cursor: loadingMoreMsgs ? 'default' : 'pointer',
                      opacity: loadingMoreMsgs ? 0.6 : 1,
                    }}
                  >
                    {loadingMoreMsgs ? 'Carregando...' : 'Carregar mensagens anteriores'}
                  </button>
                </div>
              )}
              {!loadingMsgs && messages.length === 0 && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '2rem' }}>Sem mensagens.</div>
              )}
              {messages.map(msg => {
                const isCliente    = msg.type === 'cliente'
                const isAtendente  = msg.type === 'atendente'
                const isLeft       = isCliente
                const isImage      = isCliente && /^(esta imagem|a imagem|esse documento|este documento|essa imagem|o documento|a foto|essa foto)/i.test(msg.content.trim())
                const labelColor   = isCliente ? 'var(--text-muted)' : isAtendente ? '#16A34A' : '#2563EB'
                const quotedMsg = msg.quoted_id_mensagem
                  ? messages.find(m => m.id_mensagem === msg.quoted_id_mensagem)
                  : null
                return (
                  <div key={msg.id}
                    ref={el => { if (el) msgRefs.current[msg.id] = el }}
                    style={{
                      borderRadius: 10, transition: 'background-color 0.4s',
                      background: highlightId === msg.id ? 'rgba(37,99,235,0.14)' : 'transparent',
                    }}
                  >
                    <div className="msg-label" style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      justifyContent: isLeft ? 'flex-start' : 'flex-end',
                      color: labelColor,
                    }}>
                      {isCliente
                        ? <><User size={10} /> {resolveName(selected?.phone) !== selected?.phone ? resolveName(selected?.phone) : 'Cliente'}</>
                        : isAtendente
                          ? <><Headset size={10} /> {msg.nome || 'Atendente'}</>
                          : <><Bot size={10} /> IA</>}
                    </div>
                    <div className={`msg-row ${isLeft ? 'ai' : 'client'}`}>
                      {(() => {
                        const media = detectMedia(msg.base64)
                        const rawContent = msg.content || ''
                        const fileLineMatch = rawContent.match(/^(🎤 Áudio|🖼️ [^\n]+|📄 [^\n]+|🎬 [^\n]+|📎 [^\n]+)(\n([\s\S]*))?$/)
                        const fileLine = fileLineMatch?.[1] || null
                        const extraText = fileLineMatch?.[3]?.trim() || ''
                        const isPlaceholder = !!fileLine
                        // PDF e imagem nunca mostram a legenda que veio junto — só a mídia
                        // PDF e imagem nunca mostram texto junto — nem legenda no nosso padrão
                        // (📄 arquivo\nlegenda) nem texto solto que veio com a mídia (cliente/atendente)
                        const suppressCaption = media?.type === 'pdf' || media?.type === 'image'
                        const displayContent = suppressCaption ? '' : (isPlaceholder ? extraText : rawContent)
                        const hasOnlyMedia = media && !displayContent
                        const isLongText = !isPlaceholder && displayContent.length > TEXT_LIMIT
                        const isExpanded = expandedMsgIds.has(msg.id)
                        const shownText = isLongText && !isExpanded ? displayContent.slice(0, TEXT_LIMIT).trimEnd() + '…' : displayContent
                        const bubbleStyle = isAtendente
                          ? hasOnlyMedia
                            ? { background: 'transparent', padding: 0, boxShadow: 'none', border: 'none' }
                            : { background: '#16A34A', color: '#fff', borderBottomRightRadius: 4 }
                          : hasOnlyMedia
                            ? { background: 'transparent', padding: 0, boxShadow: 'none', border: 'none' }
                            : {}
                        return (
                          <div className="msg-bubble" style={bubbleStyle}>
                            {(quotedMsg || msg.quoted_text) && (
                              <div
                                onClick={() => quotedMsg && jumpToMessage(quotedMsg.id)}
                                title={quotedMsg ? 'Ir para a mensagem citada' : undefined}
                                style={{
                                  display: 'flex', flexDirection: 'column', gap: 1,
                                  borderLeft: `3px solid ${isAtendente ? 'rgba(255,255,255,0.6)' : '#2563EB'}`,
                                  background: isAtendente ? 'rgba(255,255,255,0.14)' : '#F1F5F9',
                                  borderRadius: 6, padding: '5px 9px', marginBottom: 6,
                                  cursor: quotedMsg ? 'pointer' : 'default',
                                  maxWidth: 260,
                                }}
                              >
                                <span style={{ fontSize: 11, fontWeight: 700, color: isAtendente ? '#fff' : '#2563EB' }}>
                                  {quotedMsg
                                    ? (quotedMsg.type === 'cliente' ? (resolveName(selected?.phone) !== selected?.phone ? resolveName(selected?.phone) : 'Cliente') : quotedMsg.nome || 'Atendente')
                                    : 'Mensagem citada'}
                                </span>
                                <span style={{
                                  fontSize: 12, color: isAtendente ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {(quotedMsg?.content || msg.quoted_text || '').slice(0, 120) || '(mídia)'}
                                </span>
                              </div>
                            )}
                            {media && (() => {
                              const src = `data:${media.mime};base64,${msg.base64}`
                              if (media.type === 'audio') return (
                                <div style={{ marginBottom: hasOnlyMedia ? 0 : 6 }}>
                                  <AudioPlayer src={src} />
                                  {renderResultBlock(msg, 'transcript')}
                                </div>
                              )
                              if (media.type === 'image') return (
                                <img src={src} alt="mídia" style={{ maxWidth: 280, width: '100%', borderRadius: 8, display: 'block', marginBottom: hasOnlyMedia ? 0 : 6, cursor: 'zoom-in' }}
                                  onClick={() => setLightbox(src)} />
                              )
                              if (media.type === 'video') return (
                                <video controls style={{ maxWidth: 280, width: '100%', borderRadius: 8, display: 'block', marginBottom: hasOnlyMedia ? 0 : 6 }}>
                                  <source src={src} type={media.mime} />
                                </video>
                              )
                              if (media.type === 'pdf') {
                                const fileName = (fileLine || '').replace(/^📄\s*/, '').trim() || 'documento.pdf'
                                return (
                                  <div style={{ marginBottom: hasOnlyMedia ? 0 : 6 }}>
                                    <a href={src} download={fileName} target="_blank" rel="noreferrer"
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 10,
                                        background: '#FEF2F2', border: '1px solid #FECACA',
                                        borderRadius: 8, padding: '10px 14px', textDecoration: 'none',
                                        minWidth: 220,
                                      }}>
                                      <div style={{
                                        width: 36, height: 36, borderRadius: 6, background: '#FEE2E2',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#DC2626', fontWeight: 700, fontSize: 11, flexShrink: 0,
                                      }}>PDF</div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {fileName}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#6B7280' }}>Clique para baixar/abrir</div>
                                      </div>
                                    </a>
                                    {renderResultBlock(msg, 'summary')}
                                  </div>
                                )
                              }
                              return null
                            })()}
                            {isImage && !msg.base64 && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 600, color: '#6B7280',
                                background: '#F3F4F6', border: '1px solid #E5E7EB',
                                borderRadius: 6, padding: '2px 8px', marginBottom: 6,
                              }}>🖼️ Imagem enviada</div>
                            )}
                            {fileLine?.startsWith('🎬') && !media && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                background: '#F5F3FF', border: '1px solid #DDD6FE',
                                borderRadius: 8, padding: '10px 14px', marginBottom: extraText ? 6 : 0,
                                minWidth: 200,
                              }}>
                                <div style={{
                                  width: 36, height: 36, borderRadius: 6, background: '#EDE9FE',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#7C3AED', flexShrink: 0,
                                }}>
                                  <Film size={18} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {fileLine.replace(/^🎬\s*/, '')}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#6B7280' }}>Vídeo enviado</div>
                                </div>
                              </div>
                            )}
                            {isAtendente && editingMsgId === msg.id ? (
                              <div>
                                <textarea
                                  autoFocus
                                  value={editingText}
                                  onChange={e => setEditingText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(msg) }
                                    if (e.key === 'Escape') { setEditingMsgId(null); setEditingText('') }
                                  }}
                                  style={{
                                    width: '100%', minHeight: 44, maxHeight: 120, boxSizing: 'border-box',
                                    background: 'rgba(255,255,255,0.15)',
                                    border: '1.5px solid rgba(255,255,255,0.45)',
                                    borderRadius: 8, padding: '8px 10px',
                                    color: '#fff', fontSize: 13.5,
                                    lineHeight: 1.5, resize: 'none',
                                    fontFamily: 'inherit', outline: 'none',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: 6, marginTop: 7, justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={() => { setEditingMsgId(null); setEditingText('') }}
                                    style={{
                                      fontSize: 11, fontWeight: 600, padding: '4px 11px',
                                      borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                                      background: 'transparent', color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                                    }}
                                  >Cancelar</button>
                                  <button
                                    onClick={() => handleSaveEdit(msg)}
                                    disabled={savingEdit}
                                    style={{
                                      fontSize: 11, fontWeight: 700, padding: '4px 13px',
                                      borderRadius: 6, border: 'none',
                                      background: 'rgba(255,255,255,0.92)', color: '#16A34A',
                                      cursor: savingEdit ? 'default' : 'pointer',
                                      opacity: savingEdit ? 0.65 : 1,
                                    }}
                                  >{savingEdit ? 'Salvando...' : 'Salvar'}</button>
                                </div>
                              </div>
                            ) : displayContent ? (
                              <>
                                <span style={{
                                  whiteSpace: 'pre-wrap',
                                  ...(msg.content === '🚫 Mensagem apagada' ? { fontStyle: 'italic', opacity: 0.7 } : {}),
                                }}>
                                  {renderTextWithLinks(shownText, {
                                    color: isAtendente ? 'rgba(255,255,255,0.9)' : '#2563EB',
                                    textDecoration: 'underline',
                                    wordBreak: 'break-all',
                                  })}
                                </span>
                                {isLongText && (
                                  <button
                                    onClick={() => setExpandedMsgIds(prev => {
                                      const next = new Set(prev)
                                      isExpanded ? next.delete(msg.id) : next.add(msg.id)
                                      return next
                                    })}
                                    style={{
                                      display: 'block', marginTop: 4, background: 'none', border: 'none',
                                      padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                      color: isAtendente ? 'rgba(255,255,255,0.85)' : '#2563EB',
                                      textDecoration: 'underline',
                                    }}
                                  >
                                    {isExpanded ? 'Ver menos' : 'Ver mais'}
                                  </button>
                                )}
                              </>
                            ) : null}
                          </div>
                        )
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: isLeft ? 'flex-start' : 'flex-end', gap: 5 }}>
                      {!isClosed && canRespond(selected) && editingMsgId !== msg.id && (
                        <button
                          onClick={() => setReplyTo(msg)}
                          title="Responder citando"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4, border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: 'var(--text-muted)', opacity: 0.55, padding: 0,
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
                        >
                          <Reply size={11} />
                        </button>
                      )}
                      {isAtendente && !msg.base64 && editingMsgId !== msg.id && (
                        <button
                          onClick={() => { setEditingMsgId(msg.id); setEditingText(msg.content || '') }}
                          title="Editar mensagem"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4, border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: 'var(--text-muted)', opacity: 0.55, padding: 0,
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
                        >
                          <Pencil size={10} />
                        </button>
                      )}
                      {isAtendente && editingMsgId !== msg.id && msg.content !== '🚫 Mensagem apagada' && (
                        <button
                          onClick={() => handleDeleteMessage(msg)}
                          disabled={deletingMsgId === msg.id}
                          title="Apagar mensagem"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4, border: 'none',
                            background: 'transparent', cursor: deletingMsgId === msg.id ? 'default' : 'pointer',
                            color: 'var(--text-muted)', opacity: 0.55, padding: 0,
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                      {msg.ts && (
                        <div className="msg-time" style={{ textAlign: isLeft ? 'left' : 'right' }}>
                          {formatMsgTime(msg.ts)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {!isClosed && (
              <div style={{ padding: '12px 18px', borderTop: '0.5px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                {replyTo && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#F1F5F9', border: '1px solid var(--border)', borderLeft: '3px solid #2563EB',
                    borderRadius: 8, padding: '6px 12px', marginBottom: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB' }}>
                        Respondendo a {replyTo.type === 'cliente' ? (resolveName(selected?.phone) !== selected?.phone ? resolveName(selected?.phone) : 'Cliente') : replyTo.nome || 'Atendente'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {replyTo.content || '(mídia)'}
                      </div>
                    </div>
                    <button onClick={() => setReplyTo(null)} title="Cancelar resposta"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
                {attachedFile && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#EFF6FF', border: '1px solid #BFDBFE',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                  }}>
                    {attachedFile.kind === 'image' ? (
                      <img src={`data:${attachedFile.mime};base64,${attachedFile.base64}`}
                        alt={attachedFile.name}
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    ) : attachedFile.kind === 'video' ? (
                      <div style={{
                        width: 44, height: 44, borderRadius: 6,
                        background: '#EDE9FE', color: '#7C3AED',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Film size={20} />
                      </div>
                    ) : (
                      <div style={{
                        width: 44, height: 44, borderRadius: 6,
                        background: attachedFile.kind === 'pdf' ? '#FEE2E2' : '#E5E7EB',
                        color: attachedFile.kind === 'pdf' ? '#DC2626' : '#6B7280',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <FileText size={20} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {attachedFile.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {attachedFile.size >= 1024 * 1024
                          ? (attachedFile.size / (1024 * 1024)).toFixed(1) + ' MB'
                          : (attachedFile.size / 1024).toFixed(0) + ' KB'
                        } · {attachedFile.kind === 'pdf' ? 'PDF' : attachedFile.kind === 'image' ? 'Imagem' : attachedFile.kind === 'video' ? 'Vídeo' : 'Arquivo'}
                      </div>
                    </div>
                    <button onClick={discardFile} title="Remover arquivo"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#FEF2F2', border: '1px solid #FECACA',
                        color: '#DC2626', borderRadius: 6, padding: '5px 10px',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                      }}>
                      <Trash2 size={11} /> Remover
                    </button>
                  </div>
                )}
                {recordedAudio && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#F0FDF4', border: '1px solid #BBF7D0',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                  }}>
                    <AudioPlayer src={`data:${recordedAudio.mime};base64,${recordedAudio.base64}`} style={{ flex: 1 }} />
                    <button onClick={discardAudio} title="Descartar áudio"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#FEF2F2', border: '1px solid #FECACA',
                        color: '#DC2626', borderRadius: 6, padding: '5px 10px',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                      }}>
                      <Trash2 size={11} /> Descartar
                    </button>
                  </div>
                )}
                {recording && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                    fontSize: 12, color: '#DC2626', fontWeight: 600,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', animation: 'pulse-dot 1.2s infinite' }} />
                    Gravando... {String(Math.floor(recordTime / 60)).padStart(2, '0')}:{String(recordTime % 60).padStart(2, '0')}
                    <button onClick={() => stopRecording()} style={{
                      marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: '#DC2626', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>
                      <Square size={11} /> Parar
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, position: 'relative' }}>
                  {/* Emoji picker popup */}
                  {showEmoji && (
                    <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 9999 }}>
                      <EmojiPicker
                        onEmojiClick={({ emoji }) => {
                          setMsgText(prev => prev + emoji)
                          setShowEmoji(false)
                        }}
                        searchPlaceholder="Buscar emoji..."
                        skinTonesDisabled
                        height={380}
                        width={320}
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}
                  <input
                    ref={composerInputRef}
                    className="nx-input chat-composer-input"
                    style={{ flex: 1 }}
                    placeholder={
                      !canRespond(selected) ? "Conversa está com outro atendente — você não pode responder"
                      : recordedAudio ? "Mensagem opcional para acompanhar o áudio..."
                      : attachedFile ? "Mensagem opcional para acompanhar o arquivo..."
                      : "Digite uma mensagem..."
                    }
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={sending || recording || !canRespond(selected)}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf,video/*"
                    style={{ display: 'none' }}
                    onChange={handlePickFile}
                  />
                  {!recording && !recordedAudio && !attachedFile && (
                    <>
                      <button
                        onClick={() => setShowEmoji(v => !v)}
                        title="Emojis"
                        disabled={!canRespond(selected)}
                        style={{
                          padding: '0 12px', flexShrink: 0,
                          background: showEmoji ? '#FEF9C3' : '#fff',
                          border: `1px solid ${showEmoji ? '#FDE047' : 'var(--border)'}`,
                          borderRadius: 8, fontSize: 17, lineHeight: 1,
                          cursor: canRespond(selected) ? 'pointer' : 'not-allowed',
                          opacity: canRespond(selected) ? 1 : 0.45,
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        😊
                      </button>
                      <QuickMessages
                        instancia={instance}
                        onSelect={text => setMsgText(prev => prev ? prev + ' ' + text : text)}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Anexar imagem, PDF ou vídeo"
                        disabled={!canRespond(selected)}
                        style={{
                          padding: '0 14px', flexShrink: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, color: '#6B7280',
                          cursor: canRespond(selected) ? 'pointer' : 'not-allowed',
                          opacity: canRespond(selected) ? 1 : 0.45,
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        <Paperclip size={15} />
                      </button>
                      <button
                        onClick={startRecording}
                        title="Gravar áudio"
                        disabled={!canRespond(selected)}
                        style={{
                          padding: '0 14px', flexShrink: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, color: '#6B7280',
                          cursor: canRespond(selected) ? 'pointer' : 'not-allowed',
                          opacity: canRespond(selected) ? 1 : 0.45,
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        <Mic size={15} />
                      </button>
                    </>
                  )}
                  <button
                    className="nx-btn-primary"
                    style={{ padding: '0 16px', flexShrink: 0 }}
                    onClick={handleSend}
                    disabled={(!msgText.trim() && !recordedAudio && !attachedFile && !recording) || sending || !canRespond(selected)}
                  >
                    <Send size={14} />
                  </button>
                </div>
                <a
                  href={`https://wa.me/${selected.phone}`}
                  target="_blank" rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#25D366', color: '#fff', borderRadius: 8,
                    padding: '9px 18px', fontSize: 13, fontWeight: 600,
                    textDecoration: 'none', boxShadow: '0 1px 4px rgba(37,211,102,0.3)',
                  }}
                >
                  <PhoneCall size={15} /> WhatsApp
                </a>
                {session?.company?.digisac_url && (
                  <a
                    href={session.company.digisac_url}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: '#7C3AED', color: '#fff', borderRadius: 8,
                      padding: '9px 18px', fontSize: 13, fontWeight: 600,
                      textDecoration: 'none', boxShadow: '0 1px 4px rgba(124,58,237,0.3)',
                    }}
                  >
                    <PhoneCall size={15} /> Digisac
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {contextMenu && createPortal(
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 99998,
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
          padding: 4, minWidth: 180,
        }}
        onClick={e => e.stopPropagation()}
        >
          {(() => {
            const cleanNum = contextMenu.contact.phone.replace(/\D/g, '')
            const saved = savedContacts[cleanNum]
            return (
              <button
                onClick={() => openSaveContact(contextMenu.contact)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', border: 'none', background: 'transparent',
                  fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer',
                  borderRadius: 6, textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <User size={13} />
                {saved ? 'Editar contato' : 'Salvar contato'}
              </button>
            )
          })()}
          <button
            onClick={() => handleMarkUnread(contextMenu.contact)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 12px', border: 'none', background: 'transparent',
              fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer',
              borderRadius: 6, textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <MailOpen size={13} />
            Marcar como não lida
          </button>
        </div>
      , document.body)}

      {saveContactModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {saveContactModal.id ? 'Editar contato' : 'Salvar contato'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                  {saveContactModal.numero}
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSaveContactModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome</label>
                <input className="nx-input" autoFocus placeholder="Ex: João Silva"
                  value={saveContactModal.nome}
                  onChange={e => setSaveContactModal(p => ({ ...p, nome: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSaveContact()} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas (opcional)</label>
                <textarea className="nx-input" rows={3} placeholder="Anotações sobre este contato..."
                  value={saveContactModal.notes || ''}
                  onChange={e => setSaveContactModal(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setSaveContactModal(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleSaveContact}
                disabled={!saveContactModal.nome.trim() || savingContact}>
                {savingContact ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {lightbox && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, cursor: 'zoom-out' }}
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="mídia" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
        </div>
      , document.body)}

      {toast && createPortal(
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
          background: '#fff', border: `1.5px solid ${toast.color}`,
          borderRadius: 10, padding: '12px 20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, fontWeight: 600, color: toast.color,
        }}>
          <CheckCircle2 size={16} />
          {toast.message}
        </div>
      , document.body)}

      {transferModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }} onClick={() => !transferring && setTransferModal(null)}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 440, maxHeight: 'calc(100vh - 3rem)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ArrowRightLeft size={16} style={{ color: '#0891B2' }} /> Transferir conversa
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  Pra qual atendente passar essa conversa?
                </div>
              </div>
              <button onClick={() => !transferring && setTransferModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem', flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {(() => {
                const others = companyUsers.filter(u => u.email !== session?.user?.email && u.role !== 'admin')
                if (!others.length) {
                  return (
                    <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                      Não tem outro atendente cadastrado nessa empresa pra receber.
                    </div>
                  )
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {others.map(u => (
                      <label key={u.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        border: `1.5px solid ${transferringTo === u.email ? '#0891B2' : 'var(--border)'}`,
                        background: transferringTo === u.email ? '#ECFEFF' : '#fff',
                        transition: 'all 0.15s',
                      }}>
                        <input type="radio" name="transfer-target" checked={transferringTo === u.email}
                          onChange={() => setTransferringTo(u.email)}
                          style={{ width: 16, height: 16 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.email}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )
              })()}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setTransferModal(null)} disabled={transferring}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center', background: '#0891B2', borderColor: '#0891B2' }}
                onClick={handleTransfer} disabled={!transferringTo || transferring}>
                {transferring ? 'Transferindo...' : 'Transferir conversa'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {closeModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {closeModal.bulk ? `Finalizar ${closeModal.count} conversas` : 'Finalizar conversa'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {closeModal.bulk ? 'Motivo aplicado a todas as selecionadas' : `${closeModal.phone} — qual foi o resultado?`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                  title="Gerenciar motivos"
                  onClick={() => setManageReasonsOpen(true)}><Pencil size={14} /></button>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                  onClick={() => setCloseModal(null)}><X size={16} /></button>
              </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reasons.filter(r => r.value !== 'auto_encerrado').map(r => (
                <label key={r.value} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${reason === r.value ? r.border : 'var(--border)'}`,
                  background: reason === r.value ? r.bg : 'var(--bg-surface)',
                  transition: 'all 0.15s',
                }}>
                  <input type="radio" style={{ display: 'none' }} value={r.value}
                    checked={reason === r.value} onChange={() => setReason(r.value)} />
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: reason === r.value ? r.color : 'var(--border)',
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: reason === r.value ? r.color : 'var(--text-primary)' }}>
                    {r.label}
                  </div>
                </label>
              ))}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setCloseModal(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: reason ? 1 : 0.5 }}
                onClick={handleClose} disabled={!reason || closing}>
                <CheckCircle2 size={13} /> {closing ? 'Finalizando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {manageReasonsOpen && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10001, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }} onClick={() => setManageReasonsOpen(false)}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 420, maxHeight: 'calc(100vh - 3rem)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Motivos de encerramento</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => { setManageReasonsOpen(false); setEditingReasonId(null); setAddingReason(false) }}><X size={16} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem', flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reasons.filter(r => r.value !== 'auto_encerrado').map(r => (
                <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                  {editingReasonId === r.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="color" value={editingReasonColor} onChange={e => setEditingReasonColor(e.target.value)}
                        style={{ width: 30, height: 30, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }} />
                      <input className="nx-input" style={{ flex: 1 }} autoFocus value={editingReasonLabel}
                        onChange={e => setEditingReasonLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveReason()} />
                      <button className="nx-btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setEditingReasonId(null)}>Cancelar</button>
                      <button className="nx-btn-primary" style={{ padding: '6px 10px' }} disabled={!editingReasonLabel.trim() || savingReason} onClick={handleSaveReason}>Salvar</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</div>
                      <button onClick={() => startEditReason(r)} title="Editar" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDeleteReason(r)} title="Excluir" style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {addingReason ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={newReasonColor} onChange={e => setNewReasonColor(e.target.value)}
                    style={{ width: 30, height: 30, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }} />
                  <input className="nx-input" style={{ flex: 1 }} autoFocus placeholder="Nome do motivo"
                    value={newReasonLabel} onChange={e => setNewReasonLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddReason()} />
                  <button className="nx-btn-ghost" style={{ padding: '6px 10px' }} onClick={() => { setAddingReason(false); setNewReasonLabel('') }}>Cancelar</button>
                  <button className="nx-btn-primary" style={{ padding: '6px 10px' }} disabled={!newReasonLabel.trim() || savingReason} onClick={handleAddReason}>Adicionar</button>
                </div>
              ) : (
                <button className="nx-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => setAddingReason(true)}>
                  + Novo motivo
                </button>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button className="nx-btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={handleRestoreDefaultReasons}>
                Restaurar padrões
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
