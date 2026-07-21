import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../../components/ConfirmModal'
import LimitReachedModal from '../../components/LimitReachedModal'
import { getEffectiveLimits, reachedLimit, upgradeMessage, formatLimit } from '../../lib/planLimits'
import {
  Calendar, Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight,
  Clock, User as UserIcon, Phone, ListChecks, CheckCircle2, XCircle, AlertCircle, Settings,
  MessageSquare, History, Lock, Repeat, Users, Bell
} from 'lucide-react'
import './Company.css'

const AGENDA_COLORS = ['#2563EB', '#16A34A', '#7C3AED', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#059669']
const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90]
const REMINDER_OFFSET_OPTIONS = [
  { minutes: 30, label: '30 min antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 180, label: '3 horas antes' },
  { minutes: 1440, label: '1 dia antes' },
  { minutes: 2880, label: '2 dias antes' },
  { minutes: 10080, label: '7 dias antes' },
]
const DAYS_OF_WEEK = [
  { num: 0, label: 'Dom', full: 'Domingo' },
  { num: 1, label: 'Seg', full: 'Segunda' },
  { num: 2, label: 'Ter', full: 'Terça' },
  { num: 3, label: 'Qua', full: 'Quarta' },
  { num: 4, label: 'Qui', full: 'Quinta' },
  { num: 5, label: 'Sex', full: 'Sexta' },
  { num: 6, label: 'Sáb', full: 'Sábado' },
]

const STATUS_OPTIONS = [
  { value: 'agendado',   label: 'Agendado',   color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: Calendar },
  { value: 'confirmado', label: 'Confirmado', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle2 },
  { value: 'concluido',  label: 'Concluído',  color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', icon: ListChecks },
  { value: 'faltou',     label: 'Não compareceu', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: AlertCircle },
  { value: 'cancelado',  label: 'Cancelado',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: XCircle },
]

function getMonday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // ajusta para segunda-feira
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function fmtDate(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtDateInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTimeInput(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Converte UTC timestamp para data/hora na timezone da clínica (independente do browser)
function toClinicTz(dateOrStr, tzOffset) {
  const tz = tzOffset || '-03:00'
  const sign = tz[0] === '-' ? -1 : 1
  const [h, m] = tz.slice(1).split(':').map(Number)
  const shifted = new Date(new Date(dateOrStr).getTime() + sign * (h * 60 + m) * 60000)
  const yr  = shifted.getUTCFullYear()
  const mo  = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hh  = String(shifted.getUTCHours()).padStart(2, '0')
  const mm  = String(shifted.getUTCMinutes()).padStart(2, '0')
  return { dateStr: `${yr}-${mo}-${day}`, timeStr: `${hh}:${mm}` }
}

function parseTimeStr(s) {
  if (!s) return [0, 0]
  const [h, m] = s.split(':').map(Number)
  return [h || 0, m || 0]
}

function timeToMinutes(s) {
  const [h, m] = parseTimeStr(s)
  return h * 60 + m
}

function minutesToTime(min) {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Normaliza número de WhatsApp pro formato da Evolution API.
 * O session_id da Evolution é "55<DDD><8 dígitos>@s.whatsapp.net" — sem o 9
 * extra que a Anatel mandou colocar em 2012. Se o usuário digitar com o 9,
 * a gente remove pra bater com o saved_contacts.
 *   "(69) 99269-5898"      → "556992695898"
 *   "5569992695898"        → "556992695898"  (remove 9 extra)
 *   "556992695898"         → "556992695898"  (já tá certo)
 *   "69992695898"          → "556992695898"  (sem 55, adiciona)
 */
function normalizeWhatsAppNumber(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (!d) return ''
  // Adiciona 55 se veio só com DDD + número (11 ou 10 dígitos)
  if (d.length === 11 || d.length === 10) d = '55' + d
  // Remove o 9 extra: 13 dígitos, começa com 55, e o 5º dígito é 9
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
    d = '55' + d.slice(2, 4) + d.slice(5)
  }
  return d
}

function formatPhoneDisplay(num) {
  const d = normalizeWhatsAppNumber(num)
  if (d.length !== 12) return num || ''
  return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
}

/**
 * Chave de busca por telefone — descarta 55 e 9 extra, pra match começar do DDD.
 * Usado nas sugestões da agenda: usuário digita "699926..." ou "5569992...",
 * ambos viram "69926..." e bate contra o saved_contacts.
 */
function phoneSearchKey(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 4) d = d.slice(2)
  if (d.length >= 3 && d[2] === '9') d = d.slice(0, 2) + d.slice(3)
  return d
}

export default function CompanyAgenda() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const instance = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia

  const [tab, setTab]                 = useState('calendario')
  const [agendas, setAgendas]         = useState([])
  const [appointments, setAppointments] = useState([])
  const [savedContacts, setSavedContacts] = useState([])
  const [chatContacts,  setChatContacts]  = useState([]) // contatos que já conversaram (de mensagens_geral)
  const [availableGroups, setAvailableGroups] = useState([]) // grupos WhatsApp da instância
  const [professionals, setProfessionals] = useState([])
  const [procedures, setProcedures]   = useState([])
  const [selectedAgendaId, setSelectedAgendaId] = useState(null)
  const [weekStart, setWeekStart]     = useState(getMonday(new Date()))
  const [loading, setLoading]         = useState(true)

  const [agendaModal, setAgendaModal] = useState(null)
  const [agendaErr, setAgendaErr]     = useState('')
  const [savingAgenda, setSavingAgenda] = useState(false)
  const [limitModal, setLimitModal]   = useState(null)

  const limits = getEffectiveLimits(session?.company)

  const [apptModal, setApptModal]     = useState(null)
  const [apptErr, setApptErr]         = useState('')
  const [savingAppt, setSavingAppt]   = useState(false)
  const [patientHistory, setPatientHistory] = useState([])
  const [patientAppts, setPatientAppts] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [confirmDeleteAgenda, setConfirmDeleteAgenda] = useState(null)
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(false)
  const [deletingNow, setDeletingNow] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverSlot, setDragOverSlot] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, appt }
  const [confirmDeleteApptDirect, setConfirmDeleteApptDirect] = useState(null)
  const [recipSearch, setRecipSearch] = useState('')
  const [useCustomMsg, setUseCustomMsg] = useState(false)
  const [customMsg, setCustomMsg] = useState('')
  const [reminderPresets, setReminderPresets] = useState([])
  const [newPresetName, setNewPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [agendaBlocks, setAgendaBlocks] = useState([])
  const [blockModal, setBlockModal] = useState(null)
  const [unblockConfirm, setUnblockConfirm] = useState(null)
  const [savingBlock, setSavingBlock] = useState(false)

  // Carrega agendas + agendamentos + contatos
  useEffect(() => {
    if (!instance) return
    setLoading(true)
    Promise.all([
      supabase.from('agendas').select('*').eq('instancia', instance).order('name'),
      supabase.from('saved_contacts').select('id, nome, numero').eq('instancia', instance).order('nome'),
      supabase.from('professionals').select('*').eq('instancia', instance).order('name'),
      supabase.from('procedures').select('*').eq('instancia', instance).order('name'),
      // Números que já conversaram (mensagens_geral) — pega só os 500 mais recentes
      supabase.from('mensagens_geral').select('numero, created_at').eq('instancia', instance)
        .order('created_at', { ascending: false }).limit(500),
      // Grupos da instância
      supabase.from('mensagens_geral').select('idgrupo, nomegrupo').eq('instancia', instance)
        .not('idgrupo', 'is', null).order('id', { ascending: false }).limit(10000),
    ]).then(([{ data: ag }, { data: sc }, { data: pros }, { data: procs }, { data: mg }, { data: grps }]) => {
      if (ag) {
        setAgendas(ag)
        if (!selectedAgendaId && ag.length) setSelectedAgendaId(ag[0].id)
      }
      if (sc) setSavedContacts(sc)
      if (pros) setProfessionals(pros.filter(p => p.active !== false))
      if (procs) setProcedures(procs.filter(p => p.active !== false))

      // Monta lista de contatos distintos da mensagens_geral (mais recente primeiro),
      // merging com saved_contacts pra trazer o nome quando existir.
      if (mg) {
        const nameByNumber = {}
        ;(sc || []).forEach(c => {
          const k = normalizeWhatsAppNumber(c.numero)
          if (k) nameByNumber[k] = c.nome
        })
        const seen = new Set()
        const list = []
        mg.forEach(r => {
          const norm = normalizeWhatsAppNumber(r.numero)
          if (!norm || norm.length < 10) return
          // Ignora session_ids de grupos (@g.us)
          if ((r.numero || '').includes('@g.us')) return
          if (seen.has(norm)) return
          seen.add(norm)
          list.push({
            numero: norm,
            nome:   nameByNumber[norm] || null, // pode ser null = sem cadastro
            saved:  !!nameByNumber[norm],
            lastTs: r.created_at,
          })
        })
        setChatContacts(list)
      }

      if (grps) {
        const seenG = new Set()
        const groupList = []
        for (const row of grps) {
          if (!row.idgrupo || seenG.has(row.idgrupo)) continue
          seenG.add(row.idgrupo)
          groupList.push({ idgrupo: row.idgrupo, nomegrupo: row.nomegrupo || row.idgrupo.replace('@g.us', '') })
        }
        setAvailableGroups(groupList)
      }

      setLoading(false)
    })
  }, [instance])

  // Carrega agendamentos da semana
  useEffect(() => {
    if (!instance) return
    const from = new Date(weekStart); from.setHours(0, 0, 0, 0)
    const to = addDays(weekStart, 7); to.setHours(0, 0, 0, 0)
    supabase.from('appointments').select('*')
      .eq('instancia', instance)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .then(({ data }) => { if (data) setAppointments(data) })
  }, [instance, weekStart])

  // Fecha context menu ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!ctxMenu) return
    function close() { setCtxMenu(null) }
    function onKey(e) { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [!!ctxMenu])

  // Realtime para agendamentos
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`appointments-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setAppointments(prev => prev.filter(a => a.id !== p.old.id))
          } else if (p.new) {
            setAppointments(prev => {
              const exists = prev.find(a => a.id === p.new.id)
              if (exists) return prev.map(a => a.id === p.new.id ? p.new : a)
              return [...prev, p.new]
            })
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  function openNewAgenda() {
    if (reachedLimit(agendas.length, limits.agendas)) {
      setLimitModal(upgradeMessage('agendas', limits.agendas, limits.plan))
      return
    }
    setAgendaModal({
      name: '', color: AGENDA_COLORS[0],
      working_days: [1, 2, 3, 4, 5],
      start_time: '08:00', end_time: '18:00',
      slot_minutes: 30,
      professional_id: null,
    })
    setAgendaErr('')
  }

  function openEditAgenda(a) {
    setAgendaModal({ ...a })
    setAgendaErr('')
  }

  async function handleSaveAgenda() {
    if (!agendaModal.name?.trim()) { setAgendaErr('Nome é obrigatório'); return }
    if (!agendaModal.working_days?.length) { setAgendaErr('Selecione ao menos um dia'); return }
    if (timeToMinutes(agendaModal.end_time) <= timeToMinutes(agendaModal.start_time)) {
      setAgendaErr('Horário final deve ser depois do inicial'); return
    }
    setSavingAgenda(true)
    const payload = {
      name: agendaModal.name.trim(),
      color: agendaModal.color,
      working_days: agendaModal.working_days,
      start_time: agendaModal.start_time,
      end_time: agendaModal.end_time,
      slot_minutes: agendaModal.slot_minutes,
      professional_id: agendaModal.professional_id || null,
      instancia: instance,
    }
    const { data, error } = agendaModal.id
      ? await supabase.from('agendas').update(payload).eq('id', agendaModal.id).select().single()
      : await supabase.from('agendas').insert(payload).select().single()
    setSavingAgenda(false)
    if (error) { setAgendaErr('Erro: ' + error.message); return }
    setAgendas(prev => {
      const exists = prev.find(a => a.id === data.id)
      if (exists) return prev.map(a => a.id === data.id ? data : a)
      return [...prev, data]
    })
    if (!selectedAgendaId) setSelectedAgendaId(data.id)
    setAgendaModal(null)
  }

  function handleDeleteAgenda(agenda) {
    setConfirmDeleteAgenda(agenda)
  }
  async function confirmDeleteAgendaAction() {
    if (!confirmDeleteAgenda) return
    setDeletingNow(true)
    const id = confirmDeleteAgenda.id
    await supabase.from('agendas').delete().eq('id', id)
    setAgendas(prev => prev.filter(a => a.id !== id))
    setAppointments(prev => prev.filter(a => a.agenda_id !== id))
    if (selectedAgendaId === id) setSelectedAgendaId(agendas.find(a => a.id !== id)?.id || null)
    setDeletingNow(false)
    setConfirmDeleteAgenda(null)
  }

  // Presets de lembrete da empresa (combos reutilizáveis, ex.: "7 dias e 1 dia antes")
  useEffect(() => {
    if (!instance) return
    supabase.from('reminder_presets').select('*').eq('instancia', instance)
      .order('created_at', { ascending: true })
      .then(({ data }) => setReminderPresets(data || []))
  }, [instance])

  // Bloqueios de horário (ausência/almoço/férias)
  function loadAgendaBlocks() {
    if (!instance) return
    supabase.from('agenda_blocks').select('*').eq('instancia', instance)
      .then(({ data }) => setAgendaBlocks(data || []))
  }
  useEffect(() => { loadAgendaBlocks() }, [instance])

  function blockAt(date, hhmm) {
    if (!selectedAgendaId) return null
    const tz = session?.company?.timezone || '-03:00'
    const dt = new Date(`${fmtDateInput(date)}T${hhmm}:00${tz}`).getTime()
    return agendaBlocks.find(b =>
      b.agenda_id === selectedAgendaId &&
      dt >= new Date(b.starts_at).getTime() &&
      dt < new Date(b.ends_at).getTime()
    ) || null
  }

  async function handleCreateBlock() {
    if (!blockModal || !selectedAgendaId || savingBlock) return
    const tz = session?.company?.timezone || '-03:00'
    const startDate = blockModal.date_start
    const endDate = blockModal.date_end || blockModal.date_start
    const startTime = blockModal.all_day ? '00:00' : (blockModal.time_start || '00:00')
    const endTime = blockModal.all_day ? '23:59' : (blockModal.time_end || '23:59')
    const startsAt = new Date(`${startDate}T${startTime}:00${tz}`)
    const endsAt = new Date(`${endDate}T${endTime}:00${tz}`)
    if (endsAt <= startsAt) { setBlockModal(p => ({ ...p, error: 'O fim precisa ser depois do início.' })); return }
    setSavingBlock(true)
    const { error } = await supabase.from('agenda_blocks').insert({
      instancia: instance,
      agenda_id: selectedAgendaId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: blockModal.reason?.trim() || 'Bloqueado',
      created_by_email: session?.user?.email,
    })
    setSavingBlock(false)
    if (error) { setBlockModal(p => ({ ...p, error: error.message })); return }
    setBlockModal(null)
    loadAgendaBlocks()
  }

  async function handleUnblock() {
    if (!unblockConfirm) return
    await supabase.from('agenda_blocks').delete().eq('id', unblockConfirm.id)
    setUnblockConfirm(null)
    loadAgendaBlocks()
  }

  function openNewAppt(date, hhmm, prefill = {}) {
    if (!selectedAgendaId) return
    const ag = agendas.find(a => a.id === selectedAgendaId)
    setApptModal({
      agenda_id: selectedAgendaId,
      contact_nome: prefill.nome || '',
      contact_numero: prefill.numero || '',
      extra_recipients: [],
      date: fmtDateInput(date),
      time: hhmm,
      duration_minutes: ag?.slot_minutes || 30,
      status: 'agendado',
      notes: '',
      professional_id: ag?.professional_id || null,
      procedure_id: null,
      price: 0,
      payment_status: 'pendente',
      recurrence: null,
      recurrence_count: 4,
      reminders: [],
      reminder_offsets: session?.company?.reminder_enabled && session?.company?.reminder_offset_minutes
        ? [session.company.reminder_offset_minutes]
        : [],
    })
    setApptErr('')
    setPatientHistory([])
  }

  // Pré-preenche pelo query param (vindo do botão "Agendar" no chat)
  useEffect(() => {
    const numero = searchParams.get('numero')
    const nome = searchParams.get('nome')
    if (numero && agendas.length && selectedAgendaId) {
      const now = new Date()
      const slot = now.getHours().toString().padStart(2, '0') + ':00'
      openNewAppt(now, slot, { numero, nome: nome || '' })
      setTab('calendario')
      searchParams.delete('numero'); searchParams.delete('nome')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, agendas, selectedAgendaId])

  // Carrega últimas mensagens + agendamentos anteriores do paciente quando o modal abre
  useEffect(() => {
    const normNum = normalizeWhatsAppNumber(apptModal?.contact_numero)
    if (!normNum || normNum.length < 10 || !instance) {
      setPatientHistory([])
      setPatientAppts([])
      return
    }
    setLoadingHistory(true)
    Promise.all([
      supabase.from('mensagens_geral').select('id, mensagem, type, "horaLastMessage", created_at')
        .eq('instancia', instance)
        .like('numero', `${normNum}%`)
        .order('id', { ascending: false }).limit(5),
      supabase.from('appointments').select('id, starts_at, status, procedure_id, notes')
        .eq('instancia', instance)
        .eq('contact_numero', normNum)
        .order('starts_at', { ascending: false }).limit(20),
    ]).then(([{ data: mgs }, { data: aps }]) => {
      if (mgs) setPatientHistory(mgs.reverse())
      if (aps) setPatientAppts(aps.filter(a => a.id !== apptModal?.id))
      setLoadingHistory(false)
    })
  }, [apptModal?.contact_numero, instance])

  function openEditAppt(a) {
    const tz = session?.company?.timezone || '-03:00'
    const { dateStr, timeStr } = toClinicTz(a.starts_at, tz)
    setApptModal({
      ...a,
      extra_recipients: a.extra_recipients || [],
      reminders: a.reminders || [],
      reminder_offsets: (a.reminders || []).map(r => r.offset_minutes),
      date: dateStr,
      time: timeStr,
      _prevStatus: a.status,
      _prevStartsAt: a.starts_at,
    })
    setApptErr('')
    setPatientHistory([])
    setPatientAppts([])
  }

  async function handleSaveAppt() {
    if (!apptModal.contact_nome?.trim()) { setApptErr('Nome do cliente é obrigatório'); return }
    if (!apptModal.date || !apptModal.time) { setApptErr('Data e hora são obrigatórios'); return }
    // Ancora o horário ao fuso da clínica, não do browser
    const tz = session?.company?.timezone || '-03:00'
    const startsAt = new Date(`${apptModal.date}T${apptModal.time}:00${tz}`)
    const duration = parseInt(apptModal.duration_minutes) || 30
    const endsAt = new Date(startsAt.getTime() + duration * 60000)

    // Bloqueio de horário (ausência/almoço/férias) — não deixa agendar em cima
    const blockConflict = agendaBlocks.find(b =>
      b.agenda_id === apptModal.agenda_id &&
      startsAt.getTime() < new Date(b.ends_at).getTime() &&
      new Date(b.starts_at).getTime() < endsAt.getTime()
    )
    if (blockConflict) {
      setApptErr(`Esse horário está bloqueado (${blockConflict.reason || 'sem motivo'}). Desbloqueie antes de agendar.`)
      return
    }

    // Dia da semana no fuso da clínica (não do browser)
    function dayInTz(date) {
      const sign = tz[0] === '-' ? -1 : 1
      const [h, m] = tz.slice(1).split(':').map(Number)
      return new Date(date.getTime() + sign * (h * 60 + m) * 60000).getUTCDay()
    }

    // Conflito de horário na mesma agenda
    const agendaConflict = appointments.find(a => {
      if (a.id === apptModal.id) return false
      if (a.agenda_id !== apptModal.agenda_id) return false
      if (a.status === 'cancelado') return false
      const aStart = new Date(a.starts_at).getTime()
      const aEnd = aStart + (a.duration_minutes || 30) * 60000
      return startsAt.getTime() < aEnd && aStart < endsAt.getTime()
    })
    if (agendaConflict) {
      const cTime = new Date(agendaConflict.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      setApptErr(`Conflito de horário: ${agendaConflict.contact_nome} já está marcado às ${cTime} nesta agenda.`)
      return
    }

    // Validação: dia/horário do profissional
    if (apptModal.professional_id) {
      const pro = professionals.find(p => p.id === apptModal.professional_id)
      if (pro) {
        const dayOfWeek = dayInTz(startsAt)
        const workingDays = pro.working_days || [1, 2, 3, 4, 5]
        if (!workingDays.includes(dayOfWeek)) {
          const dayLabel = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dayOfWeek]
          setApptErr(`${pro.name} não atende ${dayLabel.toLowerCase()}. Dias disponíveis: ${workingDays.map(d => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]).join(', ')}`)
          return
        }
        const { timeStr: apptTimeStr } = toClinicTz(startsAt, tz)
        const [apptH, apptM] = apptTimeStr.split(':').map(Number)
        const apptStart = apptH * 60 + apptM
        const apptEnd = apptStart + duration
        const proStart = parseInt(pro.start_time?.split(':')[0] || 8) * 60 + parseInt(pro.start_time?.split(':')[1] || 0)
        const proEnd = parseInt(pro.end_time?.split(':')[0] || 18) * 60 + parseInt(pro.end_time?.split(':')[1] || 0)
        if (apptStart < proStart || apptEnd > proEnd) {
          setApptErr(`${pro.name} atende das ${pro.start_time?.slice(0,5)} às ${pro.end_time?.slice(0,5)}. Horário fora do expediente.`)
          return
        }
        // Validação: intervalo (pausa/almoço)
        if (pro.break_start && pro.break_end) {
          const breakStart = parseInt(pro.break_start.split(':')[0]) * 60 + parseInt(pro.break_start.split(':')[1] || 0)
          const breakEnd = parseInt(pro.break_end.split(':')[0]) * 60 + parseInt(pro.break_end.split(':')[1] || 0)
          if (apptStart < breakEnd && breakStart < apptEnd) {
            setApptErr(`${pro.name} está em intervalo das ${pro.break_start.slice(0,5)} às ${pro.break_end.slice(0,5)}. Escolha outro horário.`)
            return
          }
        }
      }

      // Validação: conflito com outro agendamento do mesmo profissional
      const conflict = appointments.find(a => {
        if (a.id === apptModal.id) return false
        if (a.professional_id !== apptModal.professional_id) return false
        if (a.status === 'cancelado') return false
        const aStart = new Date(a.starts_at).getTime()
        const aEnd = aStart + (a.duration_minutes || 30) * 60000
        return startsAt.getTime() < aEnd && aStart < endsAt.getTime()
      })
      if (conflict) {
        const cStart = new Date(conflict.starts_at)
        const cTime = cStart.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        setApptErr(`Conflito de horário: ${conflict.contact_nome} já está marcado às ${cTime} com este profissional.`)
        return
      }
    }

    setSavingAppt(true)
    const numero = normalizeWhatsAppNumber(apptModal.contact_numero) || null
    const payload = {
      agenda_id: apptModal.agenda_id,
      instancia: instance,
      contact_nome: apptModal.contact_nome.trim(),
      contact_numero: numero,
      starts_at: startsAt.toISOString(),
      duration_minutes: parseInt(apptModal.duration_minutes) || 30,
      status: apptModal.status,
      notes: apptModal.notes?.trim() || null,
      created_by_email: session?.user?.email,
    }
    // Auto-marcar como pago se status virou 'concluido'
    let paymentStatus = apptModal.payment_status || 'pendente'
    let paidAt = apptModal.paid_at || null
    if (apptModal.status === 'concluido' && paymentStatus !== 'pago') {
      paymentStatus = 'pago'
      paidAt = new Date().toISOString()
    }

    payload.professional_id = apptModal.professional_id || null
    payload.procedure_id = apptModal.procedure_id || null
    payload.extra_recipients = apptModal.extra_recipients?.length ? apptModal.extra_recipients : null
    payload.price = parseFloat(apptModal.price) || 0
    // Preserva sent_at dos lembretes já disparados; novos offsets entram com sent_at nulo
    const prevReminders = apptModal.reminders || []
    payload.reminders = (apptModal.reminder_offsets || []).map(min => ({
      offset_minutes: min,
      sent_at: prevReminders.find(r => r.offset_minutes === min)?.sent_at || null,
    }))
    payload.payment_status = paymentStatus
    payload.paid_at = paidAt

    const isNew = !apptModal.id
    const prevStatus = apptModal._prevStatus
    const prevStartsAt = apptModal._prevStartsAt
    const { error } = isNew
      ? await supabase.from('appointments').insert(payload)
      : await supabase.from('appointments').update(payload).eq('id', apptModal.id)
    setSavingAppt(false)
    if (error) { setApptErr('Erro: ' + error.message); return }

    // Agendamentos recorrentes (somente ao criar)
    if (isNew && apptModal.recurrence) {
      const count = Math.min(parseInt(apptModal.recurrence_count) || 4, 52)
      const extras = []
      for (let i = 1; i < count; i++) {
        let next
        if (apptModal.recurrence === 'mensal') {
          next = new Date(startsAt)
          next.setMonth(next.getMonth() + i)
        } else {
          const days = apptModal.recurrence === 'semanal' ? 7 : 14
          next = new Date(startsAt.getTime() + i * days * 86400000)
        }
        extras.push({ ...payload, starts_at: next.toISOString() })
      }
      if (extras.length) await supabase.from('appointments').insert(extras)
    }

    // ─── Mensagens automáticas pro paciente (chat interno + WhatsApp) ─────
    if (numero) {
      const sessionId = `${numero}@s.whatsapp.net`
      const dateStr   = startsAt.toLocaleString('pt-BR',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const firstName = (payload.contact_nome || '').split(' ')[0] || 'tudo bem'
      const dateChanged = !isNew && prevStartsAt &&
        new Date(prevStartsAt).getTime() !== startsAt.getTime()
      const statusChanged = !isNew && prevStatus && prevStatus !== payload.status

      // Texto patient-friendly por tipo de evento
      let patientMsg = null
      if (useCustomMsg && customMsg.trim()) {
        patientMsg = customMsg.trim()
      } else if (isNew && payload.status !== 'cancelado') {
        const proc = procedures.find(x => x.id === payload.procedure_id)
        patientMsg = proc?.reminder_message?.trim()
          ? proc.reminder_message.replace(/\{nome\}/gi, firstName).replace(/\{data\}/gi, dateStr)
          : `Olá ${firstName}! 📅 Seu agendamento foi marcado para *${dateStr}*. Qualquer dúvida é só responder aqui!`
      } else if (statusChanged && payload.status === 'cancelado') {
        patientMsg = `Olá ${firstName}, infelizmente seu agendamento de ${dateStr} foi cancelado. Em caso de dúvidas, entre em contato.`
      } else if (statusChanged && payload.status === 'confirmado') {
        patientMsg = `Olá ${firstName}! ✅ Seu agendamento de *${dateStr}* está confirmado. Até lá!`
      } else if (dateChanged && payload.status !== 'cancelado') {
        const prevStr = new Date(prevStartsAt).toLocaleString('pt-BR',
          { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        patientMsg = `Olá ${firstName}! ✏️ Seu agendamento foi remarcado de ${prevStr} para *${dateStr}*. Se não puder, me avisa por aqui!`
      }
      // concluído / faltou: nenhum envio (são eventos pós-consulta)

      if (patientMsg) {
        // 1) Loga no chat interno (aparece na thread de Conversas)
        await supabase.rpc('send_mensagem_geral', {
          p_instancia: instance,
          p_numero:    sessionId,
          p_mensagem:  patientMsg,
          p_type:      'atendente',
          p_hora:      new Date().toISOString(),
          p_base64:    null,
        })

        // 2) Dispara pelo webhook do n8n → Evolution → WhatsApp do paciente
        fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message:        patientMsg,
            session_id:     sessionId,
            phone:          numero,
            instancia:      instance,
            api_instancia:  apiInstancia,
            company:        session?.company?.name,
            sender_name:    session?.user?.name,
            sender_email:   session?.user?.email,
          }),
        }).catch(e => console.warn('webhook agendamento:', e))
      }
    }
    setApptModal(null)
  }

  function handleDeleteAppt() {
    if (!apptModal?.id) return
    setConfirmDeleteAppt(true)
  }
  async function confirmDeleteApptAction() {
    if (!apptModal?.id) return
    setDeletingNow(true)
    await supabase.from('appointments').delete().eq('id', apptModal.id)
    setDeletingNow(false)
    setConfirmDeleteAppt(false)
    setApptModal(null)
  }

  const selectedAgenda = agendas.find(a => a.id === selectedAgendaId)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Slots de horário com base na agenda selecionada
  const slots = useMemo(() => {
    if (!selectedAgenda) return []
    const start = timeToMinutes(selectedAgenda.start_time)
    const end = timeToMinutes(selectedAgenda.end_time)
    const step = selectedAgenda.slot_minutes
    const arr = []
    for (let m = start; m < end; m += step) arr.push(minutesToTime(m))
    return arr
  }, [selectedAgenda])

  function apptAt(day, hhmm) {
    if (!selectedAgenda) return null
    const tz = session?.company?.timezone || '-03:00'
    // Ancora o slot na timezone da clínica (não do browser)
    const slotStart = new Date(`${fmtDateInput(day)}T${hhmm}:00${tz}`).getTime()
    const slotEnd   = slotStart + (selectedAgenda.slot_minutes || 30) * 60_000
    // Aceita agendamento cujo starts_at cai DENTRO do intervalo do slot
    return appointments.find(a => {
      if (a.agenda_id !== selectedAgenda.id) return false
      const t = new Date(a.starts_at).getTime()
      return t >= slotStart && t < slotEnd
    })
  }

  function isWorkingDay(day) {
    if (!selectedAgenda) return false
    return (selectedAgenda.working_days || []).includes(day.getDay())
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)' }}>Agenda</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${agendas.length} agenda(s) — ${appointments.length} agendamento(s) nesta semana`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setTab('calendario')}
            className={tab === 'calendario' ? 'nx-btn-primary' : 'nx-btn-ghost'}
            style={{ fontSize: 12, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} /> Calendário
          </button>
          <button onClick={() => setTab('agendas')}
            className={tab === 'agendas' ? 'nx-btn-primary' : 'nx-btn-ghost'}
            style={{ fontSize: 12, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Settings size={13} /> Agendas
          </button>
        </div>
      </div>

      {tab === 'agendas' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              {agendas.length} de {formatLimit(limits.agendas)} agendas
              {reachedLimit(agendas.length, limits.agendas) && <span style={{ marginLeft: 8, color: '#C9A074', fontWeight: 700 }}>· limite atingido</span>}
            </div>
            <button
              className="nx-btn-primary"
              onClick={openNewAgenda}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: reachedLimit(agendas.length, limits.agendas) ? 0.7 : 1,
              }}>
              {reachedLimit(agendas.length, limits.agendas) ? <Lock size={13} /> : <Plus size={14} />} Nova agenda
            </button>
          </div>
          {agendas.length === 0 ? (
            <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Calendar size={28} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 14 }}>Nenhuma agenda criada. Crie a primeira para começar a agendar.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {agendas.map(a => (
                <div key={a.id} className="nx-card"
                  style={{ padding: '1.1rem 1.25rem', cursor: 'pointer', transition: 'all 0.15s' }}
                  onClick={() => { setSelectedAgendaId(a.id); setTab('calendario') }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.boxShadow = `0 4px 12px ${a.color}22` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: a.color }} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button className="table-action" onClick={() => openEditAgenda(a)}>
                        <Pencil size={11} /> Editar
                      </button>
                      <button className="table-action danger" onClick={() => handleDeleteAgenda(a)}>
                        <Trash2 size={11} /> Excluir
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={12} /> {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)} (slots de {a.slot_minutes} min)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {DAYS_OF_WEEK.map(d => (
                        <span key={d.num} style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                          background: (a.working_days || []).includes(d.num) ? a.color + '22' : '#F1F5F9',
                          color: (a.working_days || []).includes(d.num) ? a.color : '#94A3B8',
                          border: `1px solid ${(a.working_days || []).includes(d.num) ? a.color + '44' : 'var(--border)'}`,
                        }}>
                          {d.label}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedAgendaId(a.id); setTab('calendario') }}
                      style={{
                        marginTop: 4,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: a.color, color: '#fff', border: 'none',
                        borderRadius: 6, padding: '7px 12px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>
                      <Calendar size={12} /> Abrir agenda
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'calendario' && (
        <>
          {!agendas.length ? (
            <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Calendar size={28} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 14 }}>Crie ao menos uma agenda na aba "Agendas" para começar.</div>
              <button className="nx-btn-primary" onClick={() => setTab('agendas')} style={{ marginTop: 8 }}>Ir para Agendas</button>
            </div>
          ) : (
            <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Toolbar */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => setTab('agendas')}
                  className="nx-btn-ghost"
                  title="Ver todas as agendas"
                  style={{ fontSize: 12, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ChevronLeft size={14} /> Agendas
                </button>
                <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
                {selectedAgenda && (
                  <span aria-hidden="true" style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: selectedAgenda.color,
                    boxShadow: `0 0 0 3px ${selectedAgenda.color}22`,
                  }} />
                )}
                <select className="nx-select" style={{ fontSize: 13, fontWeight: 600 }}
                  value={selectedAgendaId || ''} onChange={e => setSelectedAgendaId(e.target.value)}>
                  {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <button className="nx-btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setWeekStart(addDays(weekStart, -7))}>
                    <ChevronLeft size={14} />
                  </button>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 140, textAlign: 'center' }}>
                    {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}
                  </div>
                  <button className="nx-btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setWeekStart(addDays(weekStart, 7))}>
                    <ChevronRight size={14} />
                  </button>
                  <button className="nx-btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setWeekStart(getMonday(new Date()))}>
                    Hoje
                  </button>
                  <button className="nx-btn-ghost" style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                    disabled={!selectedAgendaId}
                    onClick={() => setBlockModal({
                      date_start: fmtDateInput(new Date()),
                      date_end: fmtDateInput(new Date()),
                      all_day: true, time_start: '12:00', time_end: '13:00',
                      reason: '', error: '',
                    })}
                  >
                    <Lock size={12} /> Bloquear horário
                  </button>
                </div>
              </div>

              {/* Grid */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 880 }}>
                  {/* Header dias */}
                  <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: '#F8FAFC' }}>
                    <div />
                    {weekDays.map((d, i) => {
                      const isToday = d.toDateString() === new Date().toDateString()
                      return (
                        <div key={i} style={{
                          padding: '8px 6px', textAlign: 'center', borderLeft: '1px solid var(--border)',
                          fontSize: 12, fontWeight: 600,
                          color: isToday ? '#2563EB' : 'var(--text-secondary)',
                          background: isToday ? '#EFF6FF' : 'transparent',
                        }}>
                          <div>{DAYS_OF_WEEK[d.getDay()].label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}</div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Slots */}
                  {slots.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      Configure horários nesta agenda.
                    </div>
                  ) : slots.map((hhmm, idx) => (
                    <div key={hhmm} style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)', borderBottom: idx === slots.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                      <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right', borderRight: '1px solid var(--border)' }}>
                        {hhmm}
                      </div>
                      {weekDays.map((d, i) => {
                        const working = isWorkingDay(d)
                        const appt = working ? apptAt(d, hhmm) : null
                        const status = appt ? STATUS_OPTIONS.find(s => s.value === appt.status) : null
                        const slotKey = `${fmtDateInput(d)}_${hhmm}`
                        const isDragOver = dragOverSlot === slotKey
                        const block = working ? blockAt(d, hhmm) : null
                        const zebra = idx % 2 === 1
                        return (
                          <div key={i}
                            onClick={() => {
                              if (draggingId || !working) return
                              if (block) { setUnblockConfirm(block); return }
                              appt ? openEditAppt(appt) : openNewAppt(d, hhmm)
                            }}
                            onDragOver={e => {
                              if (!working || block) { e.dataTransfer.dropEffect = 'none'; return }
                              const occupied = apptAt(d, hhmm)
                              if (occupied && occupied.id !== e.dataTransfer.types[0]) {
                                e.dataTransfer.dropEffect = 'none'
                                return
                              }
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setDragOverSlot(slotKey)
                            }}
                            onDragLeave={e => {
                              if (!e.currentTarget.contains(e.relatedTarget)) setDragOverSlot(null)
                            }}
                            onDrop={async e => {
                              e.preventDefault()
                              if (!working || block) return
                              const apptId = e.dataTransfer.getData('apptId')
                              if (!apptId) return
                              const droppedAppt = appointments.find(a => a.id === apptId)
                              if (!droppedAppt) return
                              const occupied = apptAt(d, hhmm)
                              if (occupied && occupied.id !== apptId) return
                              setDragOverSlot(null)
                              setDraggingId(null)
                              const tz = session?.company?.timezone || '-03:00'
                              const newStartsAt = new Date(`${fmtDateInput(d)}T${hhmm}:00${tz}`)
                              if (newStartsAt.toISOString() === droppedAppt.starts_at) return
                              setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, starts_at: newStartsAt.toISOString() } : a))
                              const { error } = await supabase.from('appointments').update({ starts_at: newStartsAt.toISOString() }).eq('id', apptId)
                              if (error) setAppointments(prev => prev.map(a => a.id === apptId ? droppedAppt : a))
                            }}
                            title={block ? `Bloqueado: ${block.reason || 'sem motivo'} — clique para desbloquear` : undefined}
                            style={{
                              minHeight: 46, borderLeft: '1px solid var(--border)',
                              background: isDragOver ? '#DBEAFE'
                                : block ? 'repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 6px, #E2E8F0 6px, #E2E8F0 12px)'
                                : !working ? '#F9FAFB'
                                : zebra ? '#FAFBFC'
                                : 'transparent',
                              cursor: working ? (block ? 'not-allowed' : 'pointer') : 'not-allowed',
                              padding: 3, position: 'relative',
                              transition: 'background 0.1s',
                              outline: isDragOver ? '2px dashed #2563EB' : 'none',
                              outlineOffset: '-2px',
                            }}
                            onMouseEnter={e => { if (working && !appt && !block && !draggingId) e.currentTarget.style.background = '#EFF6FF' }}
                            onMouseLeave={e => { if (working && !appt && !block && !isDragOver) e.currentTarget.style.background = zebra ? '#FAFBFC' : 'transparent' }}
                          >
                            {block && !appt && (
                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                height: '100%', color: '#94A3B8', fontSize: 9, fontWeight: 600,
                              }}>
                                <Lock size={10} />
                              </div>
                            )}
                            {appt && status && (
                              <div
                                draggable
                                onDragStart={e => {
                                  e.dataTransfer.effectAllowed = 'move'
                                  e.dataTransfer.setData('apptId', appt.id)
                                  setDraggingId(appt.id)
                                }}
                                onDragEnd={() => { setDraggingId(null); setDragOverSlot(null) }}
                                onContextMenu={e => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const x = Math.min(e.clientX, window.innerWidth - 185)
                                  const y = Math.min(e.clientY, window.innerHeight - 95)
                                  setCtxMenu({ x, y, appt })
                                }}
                                style={{
                                  background: status.color,
                                  color: '#fff',
                                  borderLeft: `3px solid ${status.color}`,
                                  borderRadius: 5,
                                  padding: '5px 8px',
                                  fontSize: 11, fontWeight: 700, lineHeight: 1.3,
                                  height: '100%',
                                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                  overflow: 'hidden',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                  opacity: draggingId === appt.id ? 0.35 : 1,
                                  cursor: 'grab',
                                  userSelect: 'none',
                                  transition: 'opacity 0.15s',
                                }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {appt.contact_nome}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>
                                  {hhmm} · {status.label}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal agenda */}
      {agendaModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{agendaModal.id ? 'Editar agenda' : 'Nova agenda'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setAgendaModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input className="nx-input" autoFocus placeholder="Ex: Dr. João — Cardiologia"
                  value={agendaModal.name} onChange={e => setAgendaModal(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Cor</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {AGENDA_COLORS.map(c => (
                    <button key={c} onClick={() => setAgendaModal(p => ({ ...p, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: agendaModal.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Dias de funcionamento</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map(d => {
                    const active = (agendaModal.working_days || []).includes(d.num)
                    return (
                      <button key={d.num}
                        onClick={() => setAgendaModal(p => ({
                          ...p,
                          working_days: active
                            ? p.working_days.filter(n => n !== d.num)
                            : [...(p.working_days || []), d.num].sort()
                        }))}
                        style={{
                          padding: '6px 12px', borderRadius: 20,
                          border: `1.5px solid ${active ? agendaModal.color : 'var(--border)'}`,
                          background: active ? agendaModal.color : 'transparent',
                          color: active ? '#fff' : 'var(--text-secondary)',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}>
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Início</label>
                  <input className="nx-input" type="time" value={agendaModal.start_time?.slice(0, 5) || '08:00'}
                    onChange={e => setAgendaModal(p => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Fim</label>
                  <input className="nx-input" type="time" value={agendaModal.end_time?.slice(0, 5) || '18:00'}
                    onChange={e => setAgendaModal(p => ({ ...p, end_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Slot</label>
                  <select className="nx-select" value={agendaModal.slot_minutes}
                    onChange={e => setAgendaModal(p => ({ ...p, slot_minutes: parseInt(e.target.value) }))}>
                    {SLOT_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              </div>
              {professionals.length > 0 && (
                <div>
                  <label style={labelStyle}>Profissional vinculado (opcional)</label>
                  <select className="nx-select" value={agendaModal.professional_id || ''}
                    onChange={e => setAgendaModal(p => ({ ...p, professional_id: e.target.value || null }))}>
                    <option value="">Sem profissional vinculado</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Quando vinculado, os serviços do profissional + da empresa ficam disponíveis no agendamento.
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {agendaErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{agendaErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setAgendaModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveAgenda} disabled={savingAgenda}>
                  {savingAgenda ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      <ConfirmModal
        open={!!confirmDeleteAgenda}
        variant="delete"
        title="Excluir agenda"
        message={`Tem certeza que deseja excluir a agenda "${confirmDeleteAgenda?.name || ''}"? Todos os agendamentos vinculados serão removidos. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir agenda"
        loading={deletingNow}
        onConfirm={confirmDeleteAgendaAction}
        onCancel={() => setConfirmDeleteAgenda(null)}
      />

      <ConfirmModal
        open={confirmDeleteAppt}
        variant="delete"
        title="Excluir agendamento"
        message="Tem certeza que deseja excluir este agendamento? Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={deletingNow}
        onConfirm={confirmDeleteApptAction}
        onCancel={() => setConfirmDeleteAppt(false)}
      />

      <LimitReachedModal
        open={!!limitModal}
        title={limitModal?.title}
        body={limitModal?.body}
        cta={limitModal?.cta}
        planName={limits.plan}
        onClose={() => setLimitModal(null)}
      />

      <ConfirmModal
        open={!!confirmDeleteApptDirect}
        variant="delete"
        title="Excluir agendamento"
        message={`Tem certeza que deseja excluir o agendamento de "${confirmDeleteApptDirect?.contact_nome || ''}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deletingNow}
        onConfirm={async () => {
          if (!confirmDeleteApptDirect) return
          setDeletingNow(true)
          await supabase.from('appointments').delete().eq('id', confirmDeleteApptDirect.id)
          setDeletingNow(false)
          setConfirmDeleteApptDirect(null)
        }}
        onCancel={() => setConfirmDeleteApptDirect(null)}
      />

      <ConfirmModal
        open={!!unblockConfirm}
        variant="delete"
        title="Desbloquear horário"
        message={unblockConfirm ? `Desbloquear "${unblockConfirm.reason || 'sem motivo'}" (${new Date(unblockConfirm.starts_at).toLocaleString('pt-BR')} até ${new Date(unblockConfirm.ends_at).toLocaleString('pt-BR')})?` : ''}
        confirmLabel="Desbloquear"
        onConfirm={handleUnblock}
        onCancel={() => setUnblockConfirm(null)}
      />

      {/* Modal: bloquear horário (ausência/almoço/férias) */}
      {blockModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={15} /> Bloquear horário
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setBlockModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>De</label>
                  <input className="nx-input" type="date" value={blockModal.date_start}
                    onChange={e => setBlockModal(p => ({ ...p, date_start: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Até</label>
                  <input className="nx-input" type="date" value={blockModal.date_end}
                    onChange={e => setBlockModal(p => ({ ...p, date_end: e.target.value }))} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={blockModal.all_day}
                  onChange={e => setBlockModal(p => ({ ...p, all_day: e.target.checked }))} />
                Dia inteiro
              </label>
              {!blockModal.all_day && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Hora início</label>
                    <input className="nx-input" type="time" value={blockModal.time_start}
                      onChange={e => setBlockModal(p => ({ ...p, time_start: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Hora fim</label>
                    <input className="nx-input" type="time" value={blockModal.time_end}
                      onChange={e => setBlockModal(p => ({ ...p, time_end: e.target.value }))} />
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>Motivo</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  {['Almoço', 'Ausência', 'Férias'].map(r => (
                    <button key={r} type="button" onClick={() => setBlockModal(p => ({ ...p, reason: r }))}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                        border: blockModal.reason === r ? '1.5px solid #2563EB' : '1px solid var(--border)',
                        background: blockModal.reason === r ? '#EFF6FF' : 'transparent',
                        color: blockModal.reason === r ? '#2563EB' : 'var(--text-secondary)',
                      }}
                    >{r}</button>
                  ))}
                </div>
                <input className="nx-input" placeholder="Motivo (opcional)"
                  value={blockModal.reason}
                  onChange={e => setBlockModal(p => ({ ...p, reason: e.target.value }))} />
              </div>
              {blockModal.error && <div style={{ fontSize: 12, color: '#DC2626' }}>{blockModal.error}</div>}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setBlockModal(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleCreateBlock} disabled={savingBlock}>
                {savingBlock ? 'Bloqueando...' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Context menu botão direito */}
      {ctxMenu && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 99999,
            background: '#fff',
            border: '1px solid rgba(15,23,42,0.1)',
            borderRadius: 10,
            boxShadow: '0 8px 28px -6px rgba(15,23,42,0.2), 0 2px 8px -3px rgba(15,23,42,0.08)',
            padding: 4,
            minWidth: 180,
          }}>
          <button
            onClick={() => { openEditAppt(ctxMenu.appt); setCtxMenu(null) }}
            style={{
              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
              padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: '#1E293B',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Pencil size={13} style={{ color: '#2563EB', flexShrink: 0 }} /> Editar agendamento
          </button>
          <div style={{ height: 1, background: 'rgba(15,23,42,0.06)', margin: '3px 4px' }} />
          <button
            onClick={() => { setConfirmDeleteApptDirect(ctxMenu.appt); setCtxMenu(null) }}
            style={{
              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
              padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: '#DC2626',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Trash2 size={13} style={{ flexShrink: 0 }} /> Apagar agendamento
          </button>
        </div>,
        document.body
      )}

      {/* Modal agendamento */}
      {apptModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{apptModal.id ? 'Editar agendamento' : 'Novo agendamento'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setApptModal(null); setRecipSearch(''); setUseCustomMsg(false); setCustomMsg('') }}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Agenda</label>
                <select className="nx-select" value={apptModal.agenda_id}
                  onChange={e => setApptModal(p => ({ ...p, agenda_id: e.target.value }))}>
                  {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Nome do cliente</label>
                <input className="nx-input" autoFocus placeholder="Digite ou escolha um contato salvo"
                  value={apptModal.contact_nome}
                  onChange={e => setApptModal(p => ({ ...p, contact_nome: e.target.value }))} />
                {(() => {
                  const q = (apptModal.contact_nome || '').trim().toLowerCase()
                  if (q.length < 2) return null
                  const seen = new Set()
                  const matches = []
                  savedContacts.filter(c => c.nome?.toLowerCase().includes(q)).forEach(c => {
                    const norm = normalizeWhatsAppNumber(c.numero)
                    if (seen.has(norm)) return
                    seen.add(norm)
                    matches.push({ nome: c.nome, numero: norm })
                  })
                  chatContacts.filter(c => c.nome && c.nome.toLowerCase().includes(q) && !seen.has(c.numero)).forEach(c => {
                    seen.add(c.numero)
                    matches.push({ nome: c.nome, numero: c.numero })
                  })
                  if (matches.length === 0) return null
                  return (
                    <div style={{
                      marginTop: 6,
                      background: '#fff', border: '1px solid var(--border)',
                      borderRadius: 8, overflow: 'hidden',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                    }}>
                      <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: 'var(--text-muted)',
                        background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                        Contatos correspondentes
                      </div>
                      {matches.slice(0, 6).map(c => (
                        <button key={c.numero} type="button"
                          onClick={() => setApptModal(p => ({ ...p, contact_nome: c.nome, contact_numero: c.numero }))}
                          style={{
                            width: '100%', textAlign: 'left', padding: '8px 10px',
                            background: 'transparent', border: 'none',
                            borderBottom: '1px solid #F1F5F9', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.nome}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {formatPhoneDisplay(c.numero)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Telefone</label>
                <input className="nx-input" placeholder="Ex: (69) 99269-5898"
                  value={apptModal.contact_numero || ''}
                  onChange={e => setApptModal(p => ({ ...p, contact_numero: e.target.value }))}
                  onBlur={e => {
                    // Ao sair do campo, normaliza pro formato Evolution (sem o 9 extra)
                    const norm = normalizeWhatsAppNumber(e.target.value)
                    if (norm && norm !== e.target.value.replace(/\D/g, '')) {
                      setApptModal(p => ({ ...p, contact_numero: norm }))
                    }
                  }} />
                {(() => {
                  const typedKey = phoneSearchKey(apptModal.contact_numero)
                  if (typedKey.length < 2) return null
                  // chatContacts já vem ordenado por mais recente
                  const matches = chatContacts
                    .filter(c => phoneSearchKey(c.numero).startsWith(typedKey))
                    .slice(0, 6)
                  // Match exato — quando o número digitado bate certinho com alguém
                  const normTyped = normalizeWhatsAppNumber(apptModal.contact_numero)
                  const exact = normTyped && normTyped.length >= 11
                    ? chatContacts.find(c => c.numero === normTyped)
                    : null
                  if (matches.length === 0 && !exact) {
                    if (normTyped.length >= 11) {
                      return (
                        <div style={{
                          marginTop: 6, padding: '7px 10px',
                          background: '#FFFBEB', border: '1px solid #FDE68A',
                          borderRadius: 8, fontSize: 11.5, color: '#92400E',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          <AlertCircle size={12} />
                          Número novo — contato ainda não conversou com a empresa. A mensagem de confirmação pode não ser lida.
                        </div>
                      )
                    }
                    return null
                  }
                  return (
                    <>
                      {exact && (
                        <div style={{
                          marginTop: 6, padding: '6px 10px',
                          background: '#ECFDF5', border: '1px solid #A7F3D0',
                          borderRadius: 8, fontSize: 11.5, color: '#065F46',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>
                          <CheckCircle2 size={11} /> Esse contato já conversou com você
                          {exact.nome ? ` (${exact.nome})` : ' (sem cadastro)'}
                        </div>
                      )}
                      {matches.length > 0 && !exact && (
                        <div style={{
                          marginTop: 6,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, overflow: 'hidden',
                          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                        }}>
                          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                            textTransform: 'uppercase', color: 'var(--text-muted)',
                            background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                            Contatos que já conversaram com você
                          </div>
                          {matches.map(c => (
                            <button key={c.numero} type="button"
                              onClick={() => setApptModal(p => ({
                                ...p,
                                contact_nome: p.contact_nome || c.nome || '',
                                contact_numero: c.numero,
                              }))}
                              style={{
                                width: '100%', textAlign: 'left',
                                padding: '8px 10px',
                                background: 'transparent', border: 'none',
                                borderBottom: '1px solid #F1F5F9', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                                fontFamily: 'inherit',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                {c.nome ? (
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.nome}
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                    textTransform: 'uppercase', color: '#94A3B8',
                                    background: '#F1F5F9', padding: '2px 7px', borderRadius: 999,
                                  }}>
                                    Sem cadastro
                                  </span>
                                )}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatPhoneDisplay(c.numero)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* ── Destinatários extras (contatos adicionais ou grupos) ── */}
              {(() => {
                const extras = apptModal.extra_recipients || []
                const recipMatches = (() => {
                  const q = recipSearch.trim().toLowerCase()
                  if (q.length < 2) return []
                  const results = []
                  // Contatos salvos
                  savedContacts.filter(c => c.nome?.toLowerCase().includes(q)).slice(0, 4).forEach(c => {
                    const num = normalizeWhatsAppNumber(c.numero)
                    if (num && !extras.find(e => e.numero === num))
                      results.push({ label: c.nome, sub: formatPhoneDisplay(num), numero: num })
                  })
                  // Grupos
                  availableGroups.filter(g => g.nomegrupo.toLowerCase().includes(q)).slice(0, 4).forEach(g => {
                    if (!extras.find(e => e.idgrupo === g.idgrupo))
                      results.push({ label: g.nomegrupo, sub: g.idgrupo, idgrupo: g.idgrupo, isGroup: true })
                  })
                  return results.slice(0, 6)
                })()

                function addRecip(item) {
                  setApptModal(p => ({
                    ...p,
                    extra_recipients: [...(p.extra_recipients || []), item.idgrupo
                      ? { nome: item.label, idgrupo: item.idgrupo }
                      : { nome: item.label, numero: item.numero }
                    ],
                  }))
                  setRecipSearch('')
                }
                function removeRecip(idx) {
                  setApptModal(p => ({ ...p, extra_recipients: p.extra_recipients.filter((_, i) => i !== idx) }))
                }

                return (
                  <div>
                    <label style={labelStyle}>Também notificar (opcional)</label>
                    {extras.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {extras.map((e, i) => (
                          <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: e.idgrupo ? '#F5F3FF' : '#EFF6FF',
                            border: `1px solid ${e.idgrupo ? '#DDD6FE' : '#BFDBFE'}`,
                            borderRadius: 20, padding: '3px 10px 3px 8px',
                            fontSize: 12, fontWeight: 600,
                            color: e.idgrupo ? '#7C3AED' : '#1D4ED8',
                          }}>
                            {e.idgrupo ? <Users size={11} /> : <Phone size={11} />}
                            {e.nome}
                            <button type="button" onClick={() => removeRecip(i)} style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: 0, display: 'inline-flex', color: 'inherit', opacity: 0.6,
                            }}><X size={11} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ position: 'relative' }}>
                      <input className="nx-input" placeholder="Buscar contato ou grupo para adicionar…"
                        value={recipSearch}
                        onChange={e => setRecipSearch(e.target.value)}
                        style={{ fontSize: 12 }}
                      />
                      {recipMatches.length > 0 && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, overflow: 'hidden', zIndex: 100,
                          boxShadow: '0 4px 12px rgba(15,23,42,0.10)',
                        }}>
                          {recipMatches.map((item, i) => (
                            <button key={i} type="button" onClick={() => addRecip(item)} style={{
                              width: '100%', textAlign: 'left', padding: '8px 10px',
                              background: 'transparent', border: 'none',
                              borderBottom: '1px solid #F1F5F9', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                background: item.isGroup ? '#EDE9FE' : '#EFF6FF',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {item.isGroup
                                  ? <Users size={12} color="#7C3AED" />
                                  : <Phone size={12} color="#2563EB" />}
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.label}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.isGroup ? 'Grupo' : item.sub}</div>
                              </span>
                              <Plus size={13} color="#6B7280" style={{ flexShrink: 0 }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* ── Lembretes (múltiplos avisos por agendamento) ── */}
              <div>
                <label style={labelStyle}><Bell size={11} style={{ verticalAlign: -1, marginRight: 3 }} />Lembretes</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {REMINDER_OFFSET_OPTIONS.map(opt => {
                    const active = (apptModal.reminder_offsets || []).includes(opt.minutes)
                    return (
                      <button key={opt.minutes} type="button"
                        onClick={() => setApptModal(p => ({
                          ...p,
                          reminder_offsets: active
                            ? p.reminder_offsets.filter(m => m !== opt.minutes)
                            : [...(p.reminder_offsets || []), opt.minutes],
                        }))}
                        style={{
                          fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 20,
                          cursor: 'pointer',
                          border: active ? '1.5px solid #2563EB' : '1px solid var(--border)',
                          background: active ? '#EFF6FF' : 'transparent',
                          color: active ? '#2563EB' : 'var(--text-secondary)',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {reminderPresets.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Padrões:</span>
                    {reminderPresets.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => setApptModal(m => ({ ...m, reminder_offsets: [...(p.offsets || [])] }))}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                          border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#7C3AED', cursor: 'pointer',
                        }}
                      >{p.name}</button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="nx-input" style={{ fontSize: 12 }}
                    placeholder="Salvar seleção atual como padrão (nome)…"
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                  />
                  <button type="button" className="nx-btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}
                    disabled={!newPresetName.trim() || !(apptModal.reminder_offsets || []).length || savingPreset}
                    onClick={async () => {
                      setSavingPreset(true)
                      const { error } = await supabase.from('reminder_presets').insert({
                        instancia: instance, name: newPresetName.trim(),
                        offsets: apptModal.reminder_offsets || [],
                      })
                      setSavingPreset(false)
                      if (!error) {
                        setNewPresetName('')
                        const { data } = await supabase.from('reminder_presets').select('*')
                          .eq('instancia', instance).order('created_at', { ascending: true })
                        setReminderPresets(data || [])
                      }
                    }}
                  >
                    {savingPreset ? 'Salvando...' : 'Salvar padrão'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Data</label>
                  <input className="nx-input" type="date" value={apptModal.date}
                    onChange={e => setApptModal(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Hora</label>
                  <input className="nx-input" type="time" value={apptModal.time}
                    onChange={e => setApptModal(p => ({ ...p, time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Duração</label>
                  <input className="nx-input" type="number" min={5} step={5} value={apptModal.duration_minutes}
                    onChange={e => setApptModal(p => ({ ...p, duration_minutes: e.target.value }))} />
                </div>
              </div>

              {!apptModal.id && (
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Repeat size={11} /> Recorrência
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { value: null,         label: 'Não repetir' },
                      { value: 'semanal',    label: 'Semanal' },
                      { value: 'quinzenal',  label: 'Quinzenal' },
                      { value: 'mensal',     label: 'Mensal' },
                    ].map(r => {
                      const active = apptModal.recurrence === r.value
                      return (
                        <button key={String(r.value)} type="button"
                          onClick={() => setApptModal(p => ({ ...p, recurrence: r.value }))}
                          style={{
                            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${active ? '#2563EB' : 'var(--border)'}`,
                            background: active ? '#EFF6FF' : 'transparent',
                            color: active ? '#2563EB' : 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}>
                          {r.label}
                        </button>
                      )
                    })}
                  </div>
                  {apptModal.recurrence && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="nx-input" type="number" min={2} max={52}
                        style={{ width: 72, textAlign: 'center' }}
                        value={apptModal.recurrence_count}
                        onChange={e => setApptModal(p => ({ ...p, recurrence_count: Math.min(52, Math.max(2, parseInt(e.target.value) || 2)) }))} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        ocorrências — total de <strong style={{ color: 'var(--text-primary)' }}>{apptModal.recurrence_count}</strong> agendamentos
                      </span>
                    </div>
                  )}
                </div>
              )}

              {professionals.length > 0 && (
                <div>
                  <label style={labelStyle}>Profissional</label>
                  <select className="nx-select" value={apptModal.professional_id || ''}
                    onChange={e => setApptModal(p => ({ ...p, professional_id: e.target.value || null, procedure_id: null }))}>
                    <option value="">— Selecione —</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {procedures.length > 0 && (
                <div>
                  <label style={labelStyle}>Serviço</label>
                  <select className="nx-select" value={apptModal.procedure_id || ''}
                    onChange={e => {
                      const procId = e.target.value || null
                      const proc = procedures.find(x => x.id === procId)
                      // Auto-preenche valor e duração a partir do serviço
                      let newPrice = apptModal.price
                      let newDuration = apptModal.duration_minutes
                      if (proc) {
                        newDuration = proc.duration_minutes || newDuration
                        newPrice = proc.price_particular ?? 0
                      }
                      setApptModal(p => ({ ...p, procedure_id: procId, price: newPrice, duration_minutes: newDuration }))
                    }}>
                    <option value="">— Selecione —</option>
                    {procedures
                      .filter(pr => !apptModal.professional_id || !pr.professional_id || pr.professional_id === apptModal.professional_id)
                      .map(pr => <option key={pr.id} value={pr.id}>{pr.name} ({pr.duration_minutes} min)</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle}>Valor (R$)</label>
                <input className="nx-input" type="number" step="0.01" min={0}
                  value={apptModal.price ?? 0}
                  onChange={e => setApptModal(p => ({ ...p, price: e.target.value }))} />
              </div>

              <div>
                <label style={labelStyle}>Pagamento</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { value: 'pendente', label: 'Pendente', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                    { value: 'pago',     label: 'Pago',     color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
                    { value: 'cancelado', label: 'Cancelado', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
                  ].map(s => {
                    const active = apptModal.payment_status === s.value
                    return (
                      <button key={s.value}
                        onClick={() => setApptModal(p => ({ ...p, payment_status: s.value, paid_at: s.value === 'pago' ? new Date().toISOString() : null }))}
                        style={{
                          flex: 1, padding: '7px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                          border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                          background: active ? s.bg : 'transparent',
                          color: active ? s.color : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}>
                        {s.label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Marcar status do agendamento como "Concluído" também marca o pagamento como Pago automaticamente.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Status</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STATUS_OPTIONS.map(s => {
                    const active = apptModal.status === s.value
                    return (
                      <button key={s.value}
                        onClick={() => setApptModal(p => ({ ...p, status: s.value }))}
                        style={{
                          padding: '5px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                          background: active ? s.bg : 'transparent',
                          color: active ? s.color : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        <s.icon size={11} /> {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Observações (opcional)</label>
                <textarea className="nx-input" rows={2} placeholder="Anotações sobre este agendamento..."
                  value={apptModal.notes || ''}
                  onChange={e => setApptModal(p => ({ ...p, notes: e.target.value }))} />
              </div>

              {apptModal.contact_numero && (
                <div style={{
                  background: '#F8FAFC', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <History size={11} /> Últimas mensagens
                    </div>
                    <button onClick={() => navigate(`/painel/conversas?contact=${apptModal.contact_numero.replace(/\D/g, '')}`)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#16A34A', color: '#fff', border: 'none',
                        borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}>
                      <MessageSquare size={11} /> Abrir conversa
                    </button>
                  </div>
                  {loadingHistory ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Carregando histórico...</div>
                  ) : patientHistory.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Sem mensagens anteriores deste número.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {patientHistory.map(m => {
                        const t = (m.type || '').toLowerCase()
                        const isAt = t === 'atendente'
                        const isCli = t === 'cliente'
                        const txt = (m.mensagem || '').replace(/^\*[^*]+\*:\n/, '').trim().slice(0, 90)
                        return (
                          <div key={m.id} style={{
                            fontSize: 11, lineHeight: 1.4,
                            color: 'var(--text-secondary)',
                            paddingLeft: 6, borderLeft: `2px solid ${isAt ? '#16A34A' : isCli ? '#94A3B8' : '#2563EB'}`,
                          }}>
                            <strong style={{ color: isAt ? '#16A34A' : isCli ? '#475569' : '#2563EB' }}>
                              {isAt ? 'Atendente' : isCli ? 'Cliente' : 'IA'}:
                            </strong> {txt}{txt.length >= 90 ? '...' : ''}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {patientAppts.length > 0 && (
                    <>
                      <div style={{ margin: '10px 0 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Agendamentos anteriores
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {patientAppts.map(a => {
                          const st = STATUS_OPTIONS.find(s => s.value === a.status)
                          const procName = procedures.find(p => p.id === a.procedure_id)?.name
                          const dt = new Date(a.starts_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                          return (
                            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <button type="button"
                                onClick={() => { setApptModal(null); setTimeout(() => openEditAppt({ ...a, contact_nome: apptModal.contact_nome, contact_numero: apptModal.contact_numero }), 50) }}
                                style={{
                                  textAlign: 'left', background: 'transparent', border: 'none',
                                  padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit',
                                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 700, flexShrink: 0,
                                  background: st?.bg || '#F1F5F9', color: st?.color || '#64748B', border: `1px solid ${st?.border || st?.color || '#CBD5E1'}` }}>
                                  {st?.label || a.status}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{dt}</span>
                                {procName && <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {procName}</span>}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* ── Mensagem de confirmação ── */}
              {apptModal.contact_numero && (() => {
                const tz = session?.company?.timezone || '-03:00'
                const dateStr = (() => {
                  try {
                    const [y, m, d] = apptModal.date.split('-')
                    const [hh, mm] = apptModal.time.split(':')
                    return new Date(`${y}-${m}-${d}T${hh}:${mm}:00${tz}`).toLocaleString('pt-BR',
                      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  } catch { return apptModal.date }
                })()
                const firstName = (apptModal.contact_nome || '').split(' ')[0] || 'tudo bem'
                const proc = procedures.find(x => x.id === apptModal.procedure_id)
                const defaultMsg = !apptModal.id
                  ? (proc?.reminder_message?.trim()
                      ? proc.reminder_message.replace(/\{nome\}/gi, firstName).replace(/\{data\}/gi, dateStr)
                      : `Olá ${firstName}! 📅 Seu agendamento foi marcado para *${dateStr}*. Qualquer dúvida é só responder aqui!`)
                  : `Olá ${firstName}! Só passando pra confirmar seu agendamento de *${dateStr}*. Até lá! 👋`

                return (
                  <div>
                    <label style={labelStyle}>Mensagem de confirmação</label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {[
                        { val: false, label: 'Padrão' },
                        { val: true,  label: 'Personalizar' },
                      ].map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => {
                            setUseCustomMsg(opt.val)
                            if (opt.val && !customMsg) setCustomMsg(defaultMsg)
                          }}
                          style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${useCustomMsg === opt.val ? '#2563EB' : 'var(--border)'}`,
                            background: useCustomMsg === opt.val ? '#EFF6FF' : '#fff',
                            color: useCustomMsg === opt.val ? '#1D4ED8' : 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {useCustomMsg ? (
                      <textarea
                        className="nx-input"
                        rows={4}
                        value={customMsg}
                        onChange={e => setCustomMsg(e.target.value)}
                        placeholder="Digite a mensagem que será enviada ao cliente..."
                        style={{ resize: 'vertical', fontSize: 13 }}
                      />
                    ) : (
                      <div style={{
                        background: '#F0FDF4', border: '1px solid #BBF7D0',
                        borderRadius: 8, padding: '10px 12px',
                        fontSize: 12.5, color: '#0F172A', lineHeight: 1.55,
                      }}>
                        {defaultMsg}
                      </div>
                    )}
                  </div>
                )
              })()}

            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {apptErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{apptErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                {apptModal.id && (
                  <button onClick={handleDeleteAppt}
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={13} /> Excluir
                  </button>
                )}
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setApptModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveAppt} disabled={savingAppt}>
                  {savingAppt ? 'Salvando...' : 'Salvar'}
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
