import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import EmojiPicker from 'emoji-picker-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Users, ChevronLeft, Send, Mic, Square, Paperclip, Trash2, Film, FileText, BellOff, Bell, ChevronRight, Loader2, Phone, X, MessageCircle, UserPlus, Check, Pencil, Search, Sparkles } from 'lucide-react'
import { useContactTags, TagList, TagPicker, TagFilter, buildTagFilter } from '../../components/Tags'
import QuickMessages from '../../components/QuickMessages'
import './Company.css'

function getMutedGroups(instance) {
  try { return JSON.parse(localStorage.getItem(`muted_groups_${instance}`) || '[]') } catch { return [] }
}
function setMutedGroups(instance, arr) {
  localStorage.setItem(`muted_groups_${instance}`, JSON.stringify(arr))
}

const CONV_TABLE = 'mensagens_geral'

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

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return hhmm
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${hhmm}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm}`
}

function parseTs(row) {
  const raw = row.horaLastMessage || row.created_at
  if (!raw) return null
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [date, time] = raw.split(' ')
    const [d, m, y] = date.split('/')
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).toISOString()
  }
  return raw
}

function groupLabel(g, customNames = {}) {
  if (customNames[g.idgrupo]) return customNames[g.idgrupo]
  if (g.nomegrupo) return g.nomegrupo
  return g.idgrupo.replace('@g.us', '')
}

function senderLabel(row) {
  const numero = (row.numero || '').replace(/@.*$/, '')
  if (row.nome) return numero ? `${row.nome} · ${numero}` : row.nome
  return numero
}

function detectMedia(b64) {
  if (!b64 || b64.length < 10) return null
  // Data URI: extrai mime e retorna com raw = parte pura do base64
  if (b64.startsWith('data:')) {
    const m = b64.match(/^data:([^;]+);base64,(.+)/)
    if (!m) return null
    const mime = m[1]
    const raw = m[2]
    const kind = mime.startsWith('image/') ? 'image'
      : mime.startsWith('audio/') ? 'audio'
      : mime.startsWith('video/') ? 'video'
      : mime === 'application/pdf' ? 'pdf'
      : null
    if (!kind) return null
    return { type: kind, mime, src: b64, raw }
  }
  // Base64 puro — detecta pelo header
  const mk = (type, mime) => ({ type, mime, src: `data:${mime};base64,${b64}`, raw: b64 })
  if (b64.startsWith('T2dn')) return mk('audio', 'audio/ogg')
  if (b64.startsWith('//uQ') || b64.startsWith('SUQz')) return mk('audio', 'audio/mpeg')
  if (b64.startsWith('GkXf')) return mk('audio', 'audio/webm')
  if (b64.startsWith('/9j/')) return mk('image', 'image/jpeg')
  if (b64.startsWith('iVBOR')) return mk('image', 'image/png')
  if (b64.startsWith('UklGR')) return mk('image', 'image/webp')
  if (b64.startsWith('R0lGOD')) return mk('image', 'image/gif')
  if (b64.startsWith('JVBERi')) return mk('pdf', 'application/pdf')
  try {
    if (b64.length > 100 && atob(b64.slice(0, 16)).slice(4, 8) === 'ftyp') return mk('video', 'video/mp4')
  } catch {}
  return null
}

export default function CompanyGroups() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const instance = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia
  const instanceOwner = session?.company?.numero_base || null
  const [groups, setGroups] = useState([])
  const [customNames, setCustomNames] = useState({}) // idgrupo → nome customizado (renomear na plataforma)
  const [renameModal, setRenameModal] = useState(null) // { idgrupo, value }
  const [savingRename, setSavingRename] = useState(false)
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [readsMap, setReadsMap] = useState({})     // idgrupo → last_read_at ISO
  const [readsLoaded, setReadsLoaded] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState({}) // idgrupo → number
  const initialCountsDone = useRef(false)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState(null)
  const [recordTime, setRecordTime] = useState(0)
  const [attachedFile, setAttachedFile] = useState(null)
  const [mutedGroups, setMutedGroupsState] = useState(() => getMutedGroups(instance))
  const [contextMenu, setContextMenu] = useState(null) // { x, y, group }
  const [tagFilter, setTagFilter] = useState([])
  const { tagsOf, assignments: tagAssignments } = useContactTags(instance)
  const [groupInfo, setGroupInfo] = useState(null)
  const [groupInfoLoading, setGroupInfoLoading] = useState(false)
  const [groupInfoOpen, setGroupInfoOpen] = useState(false)
  const [activeMember, setActiveMember] = useState(null)
  const [savingContact, setSavingContact] = useState(null)
  const [savedContact, setSavedContact] = useState(null)
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false)
  const [loadingMoreMsgs, setLoadingMoreMsgs] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const msgRefs = useRef({})
  const [openResultIds, setOpenResultIds] = useState(() => new Set())
  const [loadingResultIds, setLoadingResultIds] = useState(() => new Set())
  const [showEmoji, setShowEmoji] = useState(false)
  const [mentionMembers, setMentionMembers] = useState([])   // lista de membros para mention
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const mentionRef = useRef(null)
  const bottomRef = useRef(null)
  const chatBodyRef = useRef(null)
  const skipScrollRef = useRef(false)
  const selectedRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordStartRef = useRef(null)
  const recordTimerRef = useRef(null)
  const fileInputRef = useRef(null)
  const emojiPickerRef = useRef(null)
  selectedRef.current = selected

  // Fecha emoji picker ao clicar fora
  useEffect(() => {
    if (!showEmoji) return
    function handleOutside(e) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setShowEmoji(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showEmoji])

  // Fecha mention dropdown ao clicar fora
  useEffect(() => {
    if (!mentionOpen) return
    function handleOutside(e) {
      if (mentionRef.current && !mentionRef.current.contains(e.target)) setMentionOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [mentionOpen])

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

  // Calcula contagem inicial de não lidos nos grupos
  useEffect(() => {
    if (initialCountsDone.current || !readsLoaded || loading || !groups.length || !instance) return
    initialCountsDone.current = true
    const unread = groups.filter(g => {
      const lr = readsMap[g.idgrupo]
      return !lr || (g.lastTs && new Date(g.lastTs) > new Date(lr))
    })
    if (!unread.length) return
    Promise.all(
      unread.map(g =>
        supabase.from(CONV_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('instancia', instance)
          .eq('idgrupo', g.idgrupo)
          .ilike('type', 'cliente')
          .gt('created_at', readsMap[g.idgrupo] || '1970-01-01T00:00:00Z')
          .then(({ count }) => [g.idgrupo, count || 0])
      )
    ).then(pairs => {
      const counts = {}
      pairs.forEach(([gid, cnt]) => { if (cnt > 0) counts[gid] = cnt })
      setUnreadCounts(counts)
    })
  }, [readsLoaded, loading, groups, readsMap, instance])

  function handleSelectGroup(g) {
    setSelected(g)
    setGroupInfoOpen(false)
    setGroupInfo(null)
    setMentionMembers([])
    setMentionOpen(false)
    if (unreadCounts[g.idgrupo]) {
      setUnreadCounts(prev => { const n = { ...prev }; delete n[g.idgrupo]; return n })
      const now = new Date().toISOString()
      setReadsMap(prev => ({ ...prev, [g.idgrupo]: now }))
      if (session?.user?.email) {
        supabase.from('conversation_reads').upsert({
          instancia: instance,
          session_id: g.idgrupo,
          user_email: session.user.email,
          last_read_at: now,
        }, { onConflict: 'instancia,session_id,user_email' }).then(() => {})
      }
    }
  }

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    supabase.from(CONV_TABLE)
      .select('id, idgrupo, nomegrupo, mensagem, numero, nome, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .not('idgrupo', 'is', null)
      .order('id', { ascending: false })
      .limit(20000)
      .then(({ data, error }) => {
        if (error || !data) { setLoading(false); return }
        const seen = new Set()
        const unique = []
        for (const row of data) {
          if (!row.idgrupo || seen.has(row.idgrupo)) continue
          seen.add(row.idgrupo)
          unique.push({
            idgrupo: row.idgrupo,
            nomegrupo: row.nomegrupo || null,
            lastMsg: row.mensagem || '',
            lastTs: parseTs(row),
            lastSenderRow: row,
          })
        }
        setGroups(unique)
        setLoading(false)
      })
  }, [instance])

  // Nomes customizados (renomear grupo só na plataforma)
  useEffect(() => {
    if (!instance) return
    supabase.from('group_custom_names').select('idgrupo, custom_name').eq('instancia', instance)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.idgrupo] = r.custom_name })
        setCustomNames(map)
      })
  }, [instance])

  async function handleSaveRename() {
    if (!renameModal || savingRename) return
    const name = renameModal.value.trim()
    setSavingRename(true)
    const { error } = name
      ? await supabase.from('group_custom_names')
          .upsert({ instancia: instance, idgrupo: renameModal.idgrupo, custom_name: name }, { onConflict: 'instancia,idgrupo' })
      : await supabase.from('group_custom_names').delete().eq('instancia', instance).eq('idgrupo', renameModal.idgrupo)
    setSavingRename(false)
    if (!error) {
      setCustomNames(prev => {
        const next = { ...prev }
        if (name) next[renameModal.idgrupo] = name
        else delete next[renameModal.idgrupo]
        return next
      })
      setRenameModal(null)
    }
  }

  const MSG_PAGE = 50

  useEffect(() => {
    if (!selected || !instance) return
    setLoadingMsgs(true)
    setMessages([])
    setHasMoreMsgs(false)
    supabase.from(CONV_TABLE)
      .select('id, numero, nome, type, mensagem, base64, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .eq('idgrupo', selected.idgrupo)
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
      .then(({ data, error }) => {
        if (!error && data) {
          setMessages([...data].reverse())
          setHasMoreMsgs(data.length === MSG_PAGE)
        }
        setLoadingMsgs(false)
      })
  }, [selected?.idgrupo, instance])

  useEffect(() => {
    if (skipScrollRef.current) { skipScrollRef.current = false; return }
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingMsgs])

  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`groups-rt-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: CONV_TABLE, filter: `instancia=eq.${instance}` },
        (p) => {
          const row = p.new
          if (!row?.idgrupo) return
          const incomingType = (row.type || '').toLowerCase()
          const isClientMsg = incomingType === 'cliente' || incomingType === 'human'
          if (isClientMsg && selectedRef.current?.idgrupo !== row.idgrupo) {
            setUnreadCounts(prev => ({ ...prev, [row.idgrupo]: (prev[row.idgrupo] || 0) + 1 }))
          }
          setGroups(prev => {
            const updated = {
              idgrupo: row.idgrupo,
              nomegrupo: row.nomegrupo || null,
              lastMsg: row.mensagem || '',
              lastTs: parseTs(row),
              lastSenderRow: row,
            }
            const exists = prev.find(g => g.idgrupo === row.idgrupo)
            if (exists) return [updated, ...prev.filter(g => g.idgrupo !== row.idgrupo)]
            return [updated, ...prev]
          })
          if (selectedRef.current?.idgrupo === row.idgrupo) {
            setMessages(msgs => [...msgs, row])
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

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

  function discardAudio() { setRecordedAudio(null); setRecordTime(0) }

  async function handlePickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    const MAX = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > MAX) return
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    const base64 = btoa(bin)
    const kind = file.type.startsWith('image/') ? 'image'
      : file.type === 'application/pdf' ? 'pdf'
      : file.type.startsWith('video/') ? 'video'
      : 'file'
    setAttachedFile({ base64, mime: file.type || 'application/octet-stream', name: file.name, size: file.size, kind })
  }

  function discardFile() { setAttachedFile(null) }

  async function handleSend() {
    let audio = recordedAudio
    if (recording) audio = await stopRecording({ persistPreview: false })
    const text = msgText.trim()
    if (!text && !audio && !attachedFile) return
    if (!selected || sending) return
    setSending(true)
    const filePrefix = attachedFile
      ? (attachedFile.kind === 'image' ? '🖼️ ' : attachedFile.kind === 'pdf' ? '📄 ' : attachedFile.kind === 'video' ? '🎬 ' : '📎 ') + attachedFile.name
      : null
    const mensagemPayload = audio
      ? (text || '🎤 Áudio')
      : attachedFile
        ? (text ? `${filePrefix}\n${text}` : filePrefix)
        : text
    const mediaBase64 = audio?.base64 || attachedFile?.base64 || null
    setMsgText('')
    setRecordedAudio(null)
    setRecordTime(0)
    setAttachedFile(null)
    try {
      const hora = new Date().toISOString()
      await supabase.from(CONV_TABLE).insert({
        instancia: instance,
        numero: instanceOwner || selected.idgrupo,
        idgrupo: selected.idgrupo,
        nomegrupo: selected.nomegrupo || null,
        mensagem: mensagemPayload,
        base64: mediaBase64,
        type: 'atendente',
        nome: session?.user?.name || null,
        horaLastMessage: hora,
        created_at: hora,
      })
      if (/@\d+/.test(text)) {
        // Mensagem com menção → só para infogrupo
        fetch('https://n8n.nexladesenvolvimento.com.br/webhook/infogrupo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evento:       'mencao',
            instancia:    instance,
            apikey:       apiInstancia,
            idgrupo:      selected.idgrupo,
            nomegrupo:    selected.nomegrupo || null,
            mensagem:     text,
            sender_name:  session?.user?.name,
            sender_email: session?.user?.email,
          }),
        }).catch(e => console.warn('webhook mencao:', e))
      } else {
        // Mensagem normal → envioNexla
        fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            mensagem: mensagemPayload,
            audio_base64: audio?.base64 || null,
            audio_mime: audio?.mime || null,
            audio_duration: audio?.duration || null,
            file_base64: attachedFile?.base64 || null,
            file_mime: attachedFile?.mime || null,
            file_name: attachedFile?.name || null,
            file_kind: attachedFile?.kind || null,
            number: selected.idgrupo,
            session_id: selected.idgrupo,
            numero: instanceOwner || selected.idgrupo,
            idgrupo: selected.idgrupo,
            nomegrupo: selected.nomegrupo || null,
            instancia: instance,
            api_instancia: apiInstancia,
            sender_name: session?.user?.name,
            sender_email: session?.user?.email,
            company: session?.company?.name,
            ai_enabled: false,
          }),
        }).catch(e => console.warn('webhook grupo:', e))
      }
    } finally {
      setSending(false)
    }
  }

  async function loadMoreMessages() {
    if (loadingMoreMsgs || !selected) return
    const oldestId = messages[0]?.id
    if (!oldestId) return
    setLoadingMoreMsgs(true)
    const prevScrollHeight = chatBodyRef.current?.scrollHeight || 0
    const { data } = await supabase.from(CONV_TABLE)
      .select('id, numero, nome, type, mensagem, base64, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .eq('idgrupo', selected.idgrupo)
      .lt('id', oldestId)
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
    if (data && data.length > 0) {
      const older = [...data].reverse()
      skipScrollRef.current = true
      setMessages(prev => [...older, ...prev])
      setHasMoreMsgs(data.length === MSG_PAGE)
      requestAnimationFrame(() => {
        if (chatBodyRef.current)
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - prevScrollHeight
      })
    } else {
      setHasMoreMsgs(false)
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

  async function jumpToMessage(dbId) {
    if (!dbId || !selected || !instance) return
    if (messages.some(m => m.id === dbId)) { scrollToMessage(dbId); return }
    setLoadingMoreMsgs(true)
    skipScrollRef.current = true
    const prevScrollHeight = chatBodyRef.current?.scrollHeight || 0
    const oldestId = messages[0]?.id
    const { data, error } = await supabase.from(CONV_TABLE)
      .select('id, numero, nome, type, mensagem, base64, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .eq('idgrupo', selected.idgrupo)
      .gte('id', dbId)
      .lt('id', oldestId || Number.MAX_SAFE_INTEGER)
      .order('id', { ascending: true })
      .limit(500)
    if (!error && data?.length) {
      setHasMoreMsgs(true)
      setMessages(prev => {
        const seenIds = new Set(prev.map(m => m.id))
        return [...data.filter(m => !seenIds.has(m.id)), ...prev]
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

  // Busca por palavras no histórico inteiro do grupo (não só o que está carregado)
  useEffect(() => {
    if (!searchOpen || !selected || !instance) return
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const esc = q.replace(/[\\%_]/g, s => '\\' + s)
    const timer = setTimeout(() => {
      supabase.from(CONV_TABLE)
        .select('id, numero, nome, type, mensagem, "horaLastMessage", created_at')
        .eq('instancia', instance)
        .eq('idgrupo', selected.idgrupo)
        .ilike('mensagem', `%${esc}%`)
        .order('id', { ascending: false })
        .limit(80)
        .then(({ data }) => {
          setSearchResults(data || [])
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

  // Mesmo esquema "de mentira" da tela de Conversas: nunca busca/grava nada
  // de verdade — só alterna se o texto real (que já veio junto com o
  // áudio/pdf, escondido) aparece ou não. Abrir finge um processamento
  // (delay randômico 5-6s); fechar é instantâneo.
  function getRealResultText(msg, kind) {
    const rawContent = msg.mensagem || ''
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

  function renderResultBlock(msg, kind, isAtd) {
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
            {getRealResultText(msg, kind)}
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

  function toggleMute(idgrupo) {
    const current = getMutedGroups(instance)
    const next = current.includes(idgrupo)
      ? current.filter(g => g !== idgrupo)
      : [...current, idgrupo]
    setMutedGroups(instance, next)
    setMutedGroupsState(next)
    setContextMenu(null)
  }

  function handleContextMenu(e, group) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, group })
  }

  async function fetchGroupInfo() {
    if (groupInfoLoading || !selected) return
    setGroupInfoLoading(true)
    setGroupInfoOpen(true)
    setGroupInfo(null)
    try {
      const res = await fetch('https://n8n.nexladesenvolvimento.com.br/webhook/infogrupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instancia: instance,
          apikey:    apiInstancia,
          idgrupo:   selected.idgrupo,
        }),
      })
      const data = await res.json()
      setGroupInfo(data)
    } catch (e) {
      setGroupInfo({ error: 'Não foi possível carregar os dados do grupo.' })
    } finally {
      setGroupInfoLoading(false)
    }
  }

  async function fetchMentionMembers() {
    if (!selected) return
    // Reutiliza cache se já buscou antes para esse grupo
    if (mentionMembers.length > 0) { setMentionOpen(true); return }
    setMentionLoading(true)
    setMentionOpen(true)
    try {
      const res = await fetch('https://n8n.nexladesenvolvimento.com.br/webhook/infogrupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instancia: instance, apikey: apiInstancia, idgrupo: selected.idgrupo }),
      })
      const data = await res.json()
      setMentionMembers(Array.isArray(data) ? data : [])
    } catch { setMentionMembers([]) }
    finally { setMentionLoading(false) }
  }

  function handleMentionSelect(member) {
    const numero = (member.phoneNumber || '').replace(/@.*$/, '')
    setMsgText(prev => {
      // Substitui o @ solto pelo @numero
      if (prev.endsWith('@')) return prev.slice(0, -1) + '@' + numero + ' '
      return prev + '@' + numero + ' '
    })
    setMentionOpen(false)
  }

  function handleMsgChange(e) {
    const val = e.target.value
    setMsgText(val)
    // Detecta @ no final (após espaço ou início)
    const atMatch = val.match(/(^|[\s])@$/)
    if (atMatch) {
      fetchMentionMembers()
    } else if (mentionOpen && !val.includes('@')) {
      setMentionOpen(false)
    }
  }

  async function handleSaveMember(numero) {
    if (savingContact === numero) return
    setSavingContact(numero)
    try {
      // Cria uma entrada básica de contato na lista de mensagens para aparecer em Conversas
      const sessionId = numero + '@s.whatsapp.net'
      await supabase.from('mensagens_geral').upsert({
        instancia: instance,
        numero: sessionId,
        nome: numero,
        mensagem: '',
        type: 'contato_salvo',
        horaLastMessage: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        created_at: new Date().toISOString(),
        aplicativo: 'whatsapp',
      }, { onConflict: 'instancia,numero,created_at', ignoreDuplicates: true })
      setSavedContact(numero)
      setTimeout(() => setSavedContact(null), 2500)
    } finally {
      setSavingContact(null)
    }
  }

  const hasSelected = !!selected

  const tagMatch = buildTagFilter(tagFilter, tagAssignments)
  const filteredGroups = tagFilter.length > 0
    ? groups.filter(g => tagMatch(g.idgrupo))
    : groups

  return (
    <>
    <div className={`contacts-root${hasSelected ? ' has-selected' : ''}`}>

      {/* Lista de grupos */}
      <div className="contacts-list">
        <div className="contacts-list-header">
          <div className="contacts-list-title">Grupos</div>
          <TagFilter instancia={instance} value={tagFilter} onChange={setTagFilter} />
        </div>
        <div className="contacts-list-body">
          {loading && (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              Carregando grupos…
            </div>
          )}
          {!loading && filteredGroups.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              {groups.length === 0 ? 'Nenhum grupo encontrado' : 'Nenhum grupo com essa etiqueta'}
            </div>
          )}
          {filteredGroups.map(g => {
            const isMuted = mutedGroups.includes(g.idgrupo)
            const unread = unreadCounts[g.idgrupo] || 0
            return (
              <div
                key={g.idgrupo}
                className={`contact-item${selected?.idgrupo === g.idgrupo ? ' selected' : ''}${unread ? ' unread' : ''}`}
                onClick={() => handleSelectGroup(g)}
                onContextMenu={e => handleContextMenu(e, g)}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: '#E0E7FF', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, position: 'relative',
                }}>
                  <Users size={18} color="#4F46E5" />
                  {isMuted && (
                    <div style={{ position: 'absolute', bottom: -2, right: -2, background: '#6B7280', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BellOff size={8} color="#fff" />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: unread ? 800 : 600, fontSize: 13.5, color: isMuted ? 'var(--text-muted)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {groupLabel(g, customNames)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: unread ? '#2563EB' : 'var(--text-muted)', fontWeight: unread ? 700 : 400 }}>
                        {formatTime(g.lastTs)}
                      </span>
                      {unread > 0 && (
                        <div style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#2563EB', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                          {unread > 99 ? '99+' : unread}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {g.lastSenderRow && <strong style={{ fontWeight: 600 }}>{senderLabel(g.lastSenderRow)}: </strong>}
                    {g.lastMsg}
                  </div>
                  {(() => { const gt = tagsOf(g.idgrupo); return gt.length > 0 ? <TagList tags={gt} size="xs" style={{ marginTop: 4 }} /> : null })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Painel de mensagens */}
      <div className="chat-panel" style={{ position: 'relative' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)' }}>
            <Users size={40} strokeWidth={1.2} />
            <span style={{ fontSize: 14 }}>Selecione um grupo</span>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <button
                className="chat-back-mobile nx-btn-ghost"
                onClick={() => setSelected(null)}
                style={{ display: 'none' }}
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Users size={17} color="#4F46E5" />
                </div>
                <button
                  onClick={fetchGroupInfo}
                  title="Ver integrantes do grupo"
                  style={{
                    minWidth: 0, background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {groupLabel(selected, customNames)}
                    <ChevronRight size={14} color="#6B7280" style={{ flexShrink: 0 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#2563EB' }}>
                    Ver integrantes
                  </div>
                </button>
                <button
                  onClick={() => setRenameModal({ idgrupo: selected.idgrupo, value: customNames[selected.idgrupo] || selected.nomegrupo || '' })}
                  title="Renomear grupo (só nesta plataforma)"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
                >
                  <Pencil size={13} />
                </button>
              </div>
              <button
                onClick={() => setSearchOpen(v => !v)}
                title="Buscar no grupo"
                style={{
                  background: searchOpen ? '#EFF6FF' : 'none', border: 'none', cursor: 'pointer',
                  color: searchOpen ? '#2563EB' : 'var(--text-muted)', padding: 7, borderRadius: 8, flexShrink: 0,
                }}
              >
                <Search size={15} />
              </button>
              <TagPicker
                instancia={instance}
                numero={selected.idgrupo}
                userEmail={session?.user?.email}
                anchor="bottom-right"
              />
            </div>

            {searchOpen && (
              <div style={{ borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}>
                <div style={{ padding: '10px 18px', display: 'flex', gap: 8 }}>
                  <input
                    className="nx-input"
                    autoFocus
                    style={{ flex: 1 }}
                    placeholder="Buscar mensagens nesse grupo..."
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
                    {!searchLoading && searchResults.map(r => (
                      <div
                        key={r.id}
                        onClick={() => handleSearchResultClick(r)}
                        style={{ padding: '9px 18px', cursor: 'pointer', borderBottom: '1px solid #F8FAFC' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5' }}>{senderLabel(r)}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTime(parseTs(r))}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.mensagem}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Painel de integrantes do grupo */}
            {groupInfoOpen && (
              <div style={{
                position: 'absolute', top: 0, right: 0, bottom: 0,
                width: 280, background: '#fff', borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', zIndex: 20,
                boxShadow: '-4px 0 16px rgba(15,23,42,0.08)',
              }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Integrantes</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{groupLabel(selected, customNames)}</div>
                  </div>
                  <button onClick={() => setGroupInfoOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                  {groupInfoLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 16px', color: 'var(--text-muted)' }}>
                      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: 13 }}>Buscando integrantes…</span>
                    </div>
                  )}
                  {!groupInfoLoading && groupInfo?.error && (
                    <div style={{ padding: '16px', fontSize: 13, color: '#DC2626' }}>{groupInfo.error}</div>
                  )}
                  {!groupInfoLoading && groupInfo && !groupInfo.error && (() => {
                    const members = Array.isArray(groupInfo) ? groupInfo : []
                    if (members.length === 0) return (
                      <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-muted)' }}>Nenhum integrante retornado.</div>
                    )
                    // Admins primeiro
                    const sorted = [...members].sort((a, b) => {
                      const aA = !!a.admin; const bA = !!b.admin
                      return bA - aA
                    })
                    return sorted.map((m, i) => {
                      const numero = (m.phoneNumber || '').replace(/@.*$/, '')
                      const isAdmin = !!m.admin
                      const isSuperAdmin = m.admin === 'superadmin'
                      const isActive = activeMember === numero
                      return (
                        <div key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                          <div
                            onClick={() => setActiveMember(isActive ? null : numero)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 16px', cursor: 'pointer',
                              background: isActive ? '#F5F3FF' : 'transparent',
                              transition: 'background .15s',
                            }}
                          >
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                              background: isSuperAdmin ? '#FEF3C7' : isAdmin ? '#EDE9FE' : '#F1F5F9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: isSuperAdmin ? '#92400E' : isAdmin ? '#7C3AED' : '#6B7280',
                            }}>
                              <Phone size={13} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                +{numero}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '2px 7px', flexShrink: 0,
                              color: isSuperAdmin ? '#92400E' : isAdmin ? '#7C3AED' : '#6B7280',
                              background: isSuperAdmin ? '#FEF3C7' : isAdmin ? '#EDE9FE' : '#F1F5F9',
                              border: `1px solid ${isSuperAdmin ? '#FDE68A' : isAdmin ? '#DDD6FE' : '#E2E8F0'}`,
                            }}>
                              {isSuperAdmin ? 'Dono' : isAdmin ? 'Admin' : 'Membro'}
                            </span>
                          </div>

                          {/* Mini-menu de ações */}
                          {isActive && (
                            <div style={{
                              display: 'flex', gap: 8, padding: '8px 16px 10px',
                              background: '#F5F3FF',
                            }}>
                              <button
                                onClick={() => navigate(`/painel/conversas?contact=${numero}`)}
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  padding: '7px 10px', borderRadius: 8, border: '1px solid #C4B5FD',
                                  background: '#fff', color: '#7C3AED', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                <MessageCircle size={13} /> Conversar
                              </button>
                              <button
                                onClick={() => handleSaveMember(numero)}
                                disabled={savingContact === numero}
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  padding: '7px 10px', borderRadius: 8, border: '1px solid #BBF7D0',
                                  background: '#fff', color: '#16A34A', fontSize: 12, fontWeight: 600,
                                  cursor: savingContact === numero ? 'default' : 'pointer',
                                }}
                              >
                                {savedContact === numero
                                  ? <><Check size={13} /> Salvo!</>
                                  : savingContact === numero
                                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</>
                                    : <><UserPlus size={13} /> Salvar</>
                                }
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                  <button onClick={fetchGroupInfo} disabled={groupInfoLoading} style={{
                    width: '100%', padding: '8px', border: '1px solid var(--border)',
                    borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 600,
                    color: 'var(--text-secondary)', cursor: groupInfoLoading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    {groupInfoLoading ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Atualizando…</> : '↻ Atualizar lista'}
                  </button>
                </div>
              </div>
            )}

            <div ref={chatBodyRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!loadingMsgs && hasMoreMsgs && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
                  <button onClick={loadMoreMessages} disabled={loadingMoreMsgs} style={{
                    fontSize: 12, padding: '5px 14px', borderRadius: 20,
                    border: '1px solid var(--border)', background: '#fff',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }}>
                    {loadingMoreMsgs ? 'Carregando...' : 'Carregar mensagens anteriores'}
                  </button>
                </div>
              )}
              {loadingMsgs && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  Carregando mensagens…
                </div>
              )}
              {messages.map(msg => {
                const type = (msg.type || '').toLowerCase()
                const isAtendente = type === 'atendente' || type === 'humano'
                const ts = parseTs(msg)
                const media = detectMedia(msg.base64)
                const rawContent = msg.mensagem || ''
                const fileLineMatch = rawContent.match(/^(🎤 Áudio|🖼️ [^\n]+|📄 [^\n]+|🎬 [^\n]+|📎 [^\n]+)(\n([\s\S]*))?$/)
                const fileLine = fileLineMatch?.[1] || null
                const isPlaceholder = !!fileLine
                // PDF e imagem nunca mostram texto junto — só a mídia (igual Conversas)
                const suppressCaption = media?.type === 'pdf' || media?.type === 'image'
                const displayContent = suppressCaption ? '' : (isPlaceholder ? (fileLineMatch[3]?.trim() || '') : rawContent)
                return (
                  <div key={msg.id} className={`msg-row ${isAtendente ? 'client' : 'ai'}`}
                    ref={el => { if (el) msgRefs.current[msg.id] = el }}
                    style={{
                      borderRadius: 10, transition: 'background-color 0.4s',
                      background: highlightId === msg.id ? 'rgba(79,70,229,0.14)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAtendente ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                      {!isAtendente && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#4F46E5', marginBottom: 3, marginLeft: 2 }}>
                          {senderLabel(msg)}
                        </span>
                      )}
                      <div className="msg-bubble" style={{ maxWidth: '100%', wordBreak: 'break-word', padding: media?.type === 'image' ? 4 : undefined }}>
                        {media?.type === 'audio' && (
                          <div>
                            <audio controls src={media.src} style={{ maxWidth: 240, height: 32 }} />
                            {renderResultBlock(msg, 'transcript', isAtendente)}
                          </div>
                        )}
                        {media?.type === 'image' && (
                          <img src={media.src} alt="imagem"
                            style={{ maxWidth: 240, maxHeight: 280, borderRadius: 8, display: 'block' }} />
                        )}
                        {media?.type === 'video' && (
                          <video controls src={media.src}
                            style={{ maxWidth: 240, borderRadius: 8, display: 'block' }} />
                        )}
                        {media?.type === 'pdf' && (() => {
                          const fileName = (fileLine || '').replace(/^📄\s*/, '').trim() || 'documento.pdf'
                          return (
                            <div>
                              <a href={media.src} download={fileName} target="_blank" rel="noreferrer"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 10,
                                  background: '#FEF2F2', border: '1px solid #FECACA',
                                  borderRadius: 8, padding: '10px 14px', textDecoration: 'none',
                                  minWidth: 200,
                                }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: 6, background: '#FEE2E2',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#DC2626', fontWeight: 700, fontSize: 10, flexShrink: 0,
                                }}>PDF</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {fileName}
                                  </div>
                                  <div style={{ fontSize: 10.5, color: '#6B7280' }}>Clique para baixar/abrir</div>
                                </div>
                              </a>
                              {renderResultBlock(msg, 'summary', isAtendente)}
                            </div>
                          )
                        })()}
                        {!media && displayContent && (
                          <span style={{ whiteSpace: 'pre-wrap' }}>
                            {renderTextWithLinks(displayContent, {
                              color: (msg.type || '').toLowerCase() === 'atendente' || (msg.type || '').toLowerCase() === 'humano'
                                ? 'rgba(255,255,255,0.9)' : '#2563EB',
                              textDecoration: 'underline',
                            })}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        {formatTime(ts)}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Barra de envio */}
            <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)' }}>
              {/* Preview: arquivo anexado */}
              {attachedFile && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#F8FAFF', border: '1px solid #BFDBFE',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                }}>
                  {attachedFile.kind === 'image' ? (
                    <img src={`data:${attachedFile.mime};base64,${attachedFile.base64}`} alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                  ) : attachedFile.kind === 'video' ? (
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Film size={20} />
                    </div>
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: attachedFile.kind === 'pdf' ? '#FEE2E2' : '#E5E7EB', color: attachedFile.kind === 'pdf' ? '#DC2626' : '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={20} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {attachedFile.size >= 1024 * 1024
                        ? (attachedFile.size / (1024 * 1024)).toFixed(1) + ' MB'
                        : (attachedFile.size / 1024).toFixed(0) + ' KB'}
                      {' · '}{attachedFile.kind === 'pdf' ? 'PDF' : attachedFile.kind === 'image' ? 'Imagem' : attachedFile.kind === 'video' ? 'Vídeo' : 'Arquivo'}
                    </div>
                  </div>
                  <button onClick={discardFile} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    <Trash2 size={11} /> Remover
                  </button>
                </div>
              )}

              {/* Preview: áudio gravado */}
              {recordedAudio && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                }}>
                  <audio controls src={`data:${recordedAudio.mime};base64,${recordedAudio.base64}`} style={{ flex: 1, height: 32 }} />
                  <button onClick={discardAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    <Trash2 size={11} /> Descartar
                  </button>
                </div>
              )}

              {/* Indicador de gravação */}
              {recording && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                  fontSize: 12, color: '#DC2626', fontWeight: 600,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', animation: 'pulse-dot 1.2s infinite' }} />
                  Gravando... {String(Math.floor(recordTime / 60)).padStart(2, '0')}:{String(recordTime % 60).padStart(2, '0')}
                  <button onClick={() => stopRecording()} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    <Square size={11} /> Parar
                  </button>
                </div>
              )}

              {/* Input row */}
              <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
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
                {/* Dropdown de @ menção */}
                {mentionOpen && (
                  <div ref={mentionRef} style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 120,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 6px 24px rgba(15,23,42,0.12)', zIndex: 9999,
                    maxHeight: 220, overflowY: 'auto',
                  }}>
                    <div style={{ padding: '8px 12px 6px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid #F1F5F9' }}>
                      Mencionar integrante
                    </div>
                    {mentionLoading && (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Buscando integrantes…
                      </div>
                    )}
                    {!mentionLoading && mentionMembers.length === 0 && (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Nenhum integrante encontrado
                      </div>
                    )}
                    {mentionMembers.map((m, i) => {
                      const numero = (m.phoneNumber || '').replace(/@.*$/, '')
                      const isAdmin = !!m.admin
                      return (
                        <div key={i} onClick={() => handleMentionSelect(m)} style={{
                          padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                          borderBottom: '1px solid #F8FAFC',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: isAdmin ? '#EDE9FE' : '#F1F5F9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isAdmin ? '#7C3AED' : '#6B7280', fontSize: 11,
                          }}>
                            <Phone size={11} />
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            +{numero}
                          </span>
                          {isAdmin && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', background: '#EDE9FE', borderRadius: 99, padding: '1px 6px' }}>
                              {m.admin === 'superadmin' ? 'Dono' : 'Admin'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <input
                  className="nx-input chat-composer-input"
                  style={{ flex: 1 }}
                  placeholder={attachedFile ? 'Mensagem opcional para acompanhar o arquivo…' : recordedAudio ? 'Mensagem opcional para acompanhar o áudio…' : 'Mensagem para o grupo…'}
                  value={msgText}
                  onChange={handleMsgChange}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setMentionOpen(false); return }
                    if (e.key === 'Enter' && !e.shiftKey) handleSend()
                  }}
                  disabled={sending || recording}
                />
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf,video/*" style={{ display: 'none' }} onChange={handlePickFile} />
                {!recording && !recordedAudio && !attachedFile && (
                  <>
                    <button
                      onClick={() => setShowEmoji(v => !v)}
                      title="Emojis"
                      style={{
                        padding: '0 12px', flexShrink: 0,
                        background: showEmoji ? '#FEF9C3' : '#fff',
                        border: `1px solid ${showEmoji ? '#FDE047' : 'var(--border)'}`,
                        borderRadius: 8, fontSize: 17, lineHeight: 1,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
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
                      style={{ padding: '0 14px', flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, color: '#6B7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <Paperclip size={15} />
                    </button>
                    <button
                      onClick={startRecording}
                      title="Gravar áudio"
                      style={{ padding: '0 14px', flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, color: '#6B7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <Mic size={15} />
                    </button>
                  </>
                )}
                <button
                  className="nx-btn-primary"
                  style={{ padding: '0 16px', flexShrink: 0 }}
                  onClick={handleSend}
                  disabled={(!msgText.trim() && !recordedAudio && !attachedFile && !recording) || sending}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {contextMenu && createPortal(
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 99997 }} onClick={() => setContextMenu(null)} />
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 99998,
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
          padding: 4, minWidth: 180,
        }}>
          <button
            onClick={() => toggleMute(contextMenu.group.idgrupo)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 12px', border: 'none',
              background: 'none', cursor: 'pointer', borderRadius: 6,
              fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #F3F4F6)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {mutedGroups.includes(contextMenu.group.idgrupo)
              ? <><Bell size={14} color="#16A34A" /> Ativar notificações</>
              : <><BellOff size={14} color="#6B7280" /> Silenciar grupo</>}
          </button>
          <button
            onClick={() => {
              setRenameModal({ idgrupo: contextMenu.group.idgrupo, value: customNames[contextMenu.group.idgrupo] || contextMenu.group.nomegrupo || '' })
              setContextMenu(null)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 12px', border: 'none',
              background: 'none', cursor: 'pointer', borderRadius: 6,
              fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #F3F4F6)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <Pencil size={14} color="#6B7280" /> Renomear grupo
          </button>
        </div>
      </>,
      document.body
    )}

    {renameModal && createPortal(
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
      }} onClick={() => !savingRename && setRenameModal(null)}>
        <div className="nx-card" style={{ width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Renomear grupo</div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setRenameModal(null)}><X size={16} /></button>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Só muda o nome exibido aqui na plataforma — não altera o nome real do grupo no WhatsApp.
            </div>
            <input className="nx-input" autoFocus placeholder="Nome do grupo"
              value={renameModal.value}
              onChange={e => setRenameModal(p => ({ ...p, value: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
            />
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setRenameModal(null)}>Cancelar</button>
            <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={savingRename} onClick={handleSaveRename}>
              {savingRename ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    , document.body)}
    </>
  )
}
