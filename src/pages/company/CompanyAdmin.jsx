import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../../components/ConfirmModal'
import LimitReachedModal from '../../components/LimitReachedModal'
import { getEffectiveLimits, reachedLimit, upgradeMessage, formatLimit, PLAN_DEFAULTS, UNLIMITED } from '../../lib/planLimits'
import { computeBillingStatus, fmtMoney, fmtDateBR, statusBadge, BILLING_STATUS } from '../../lib/billing'
import { Plus, X, UserMinus, RefreshCw, UserCheck, UserX, Pencil, QrCode, Wifi, WifiOff, LogOut, Trash2, Lock, Bell, Crown, Sparkles, TrendingUp, ArrowUpRight, Calendar as CalendarIcon, Users as UsersIcon, Stethoscope, Layers, Tag as TagIcon, Check } from 'lucide-react'
import './Company.css'

const SECTOR_COLORS = ['#2563EB', '#16A34A', '#7C3AED', '#DC2626', '#D97706', '#0891B2']
const TAG_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#16A34A', '#D97706', '#DC2626', '#0891B2', '#6B7280']

const REMINDER_OPTIONS = [
  { value: 30,    label: '30 minutos antes' },
  { value: 60,    label: '1 hora antes' },
  { value: 1440,  label: '24 horas antes' },
  { value: 2880,  label: '48 horas antes' },
  { value: 10080, label: '7 dias antes' },
]

function slugify(name) {
  return (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}
function generatePassword(base) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return slugify(base).slice(0, 5) + '@' + suffix
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

export default function CompanyAdmin() {
  const { session } = useAuth()
  const instance  = session?.company?.instance
  const companyId = session?.company?.id
  const limits    = getEffectiveLimits(session?.company)
  const maxUsers  = limits.users
  const [limitModal, setLimitModal] = useState(null)

  const [users, setUsers]               = useState([])
  const [sectors, setSectors]           = useState([])
  const [proCount, setProCount]         = useState(0)
  const [agendasCount, setAgendasCount] = useState(0)
  const [sectorMembers, setSectorMembers] = useState([])
  const [saving, setSaving]             = useState(false)

  const [sectorModal, setSectorModal]   = useState(false)
  const [sectorForm, setSectorForm]     = useState({ name: '', color: SECTOR_COLORS[0] })
  const [sectorErr, setSectorErr]       = useState('')
  const [assignModal, setAssignModal]   = useState(null)

  // Etiquetas (tags) de pacientes
  const [tags, setTags] = useState([])
  const [tagForm, setTagForm] = useState({ name: '', color: TAG_COLORS[0] })
  const [tagErr, setTagErr] = useState('')
  const [savingTag, setSavingTag] = useState(false)

  const [userModal, setUserModal]       = useState(false)
  const [userForm, setUserForm]         = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [userErr, setUserErr]           = useState('')
  const [editUserModal, setEditUserModal] = useState(null) // user being edited
  const [editUserForm, setEditUserForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [editUserErr, setEditUserErr]   = useState('')
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleteErr, setDeleteErr]       = useState('')

  const DEFAULT_EVOLUTION_URL = 'https://evolutionapi.nexladesenvolvimento.com.br'
  const evolutionUrl = (session?.company?.evolution_url || DEFAULT_EVOLUTION_URL).replace(/\/+$/, '')
  const apiKey       = session?.company?.api_instancia
  const [connState, setConnState]   = useState('unknown') // 'open' | 'connecting' | 'close' | 'unknown'
  const [qrBase64, setQrBase64]     = useState(null)
  const [qrLoading, setQrLoading]   = useState(false)
  const [qrErr, setQrErr]           = useState('')
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Lembretes automáticos de agendamento
  const [reminderEnabled,  setReminderEnabled]  = useState(session?.company?.reminder_enabled ?? false)
  const [reminderOffset,   setReminderOffset]   = useState(session?.company?.reminder_offset_minutes ?? 1440)
  const [reminderGroupId,  setReminderGroupId]  = useState(session?.company?.reminder_group_id ?? '')
  const [savingReminder,   setSavingReminder]   = useState(false)
  const [reminderSaved,    setReminderSaved]    = useState(false)
  const [reminderErr,      setReminderErr]      = useState('')
  const [availableGroups,  setAvailableGroups]  = useState([])

  // Carrega grupos disponíveis
  useEffect(() => {
    const inst = session?.company?.instance
    if (!inst) return
    supabase.from('mensagens_geral')
      .select('idgrupo, nomegrupo')
      .eq('instancia', inst)
      .not('idgrupo', 'is', null)
      .order('id', { ascending: false })
      .limit(20000)
      .then(({ data }) => {
        if (!data) return
        const seen = new Set()
        const groups = []
        for (const row of data) {
          if (!row.idgrupo || seen.has(row.idgrupo)) continue
          seen.add(row.idgrupo)
          groups.push({ idgrupo: row.idgrupo, nomegrupo: row.nomegrupo || row.idgrupo })
        }
        setAvailableGroups(groups)
      })
  }, [session?.company?.instance])

  async function saveReminder() {
    if (!companyId) return
    setSavingReminder(true); setReminderErr(''); setReminderSaved(false)
    const { error } = await supabase
      .from('companies')
      .update({
        reminder_enabled: reminderEnabled,
        reminder_offset_minutes: reminderOffset,
        reminder_group_id: reminderGroupId || null,
      })
      .eq('id', companyId)
    setSavingReminder(false)
    if (error) {
      setReminderErr('Erro ao salvar: ' + error.message)
    } else {
      setReminderSaved(true)
      setTimeout(() => setReminderSaved(false), 2500)
    }
  }

  async function fetchState() {
    if (!evolutionUrl || !instance || !apiKey) return null
    try {
      const res = await fetch(`${evolutionUrl}/instance/connectionState/${instance}`, {
        headers: { apikey: apiKey },
      })
      const data = await res.json()
      const state = data?.instance?.state || data?.state || 'unknown'
      setConnState(state)
      return state
    } catch (e) {
      setConnState('unknown')
      return null
    }
  }

  useEffect(() => {
    if (!evolutionUrl || !instance || !apiKey) return
    fetchState()
    const t = setInterval(fetchState, 8000)
    return () => clearInterval(t)
  }, [evolutionUrl, instance, apiKey])

  async function handleGenerateQR() {
    if (!evolutionUrl || !instance || !apiKey) {
      setQrErr('Configuração de Evolution incompleta. Contate o administrador.'); return
    }
    setQrLoading(true)
    setQrErr('')
    setQrBase64(null)
    try {
      const res = await fetch(`${evolutionUrl}/instance/connect/${instance}`, {
        headers: { apikey: apiKey },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const b64 = data?.base64 || data?.qrcode?.base64 || data?.qrcode || null
      if (!b64) throw new Error('QR Code não retornado pela Evolution')
      setQrBase64(b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`)
      // Polling rápido enquanto aguarda escaneamento
      let attempts = 0
      const fast = setInterval(async () => {
        attempts++
        const s = await fetchState()
        if (s === 'open' || attempts > 40) {
          clearInterval(fast)
          if (s === 'open') setQrBase64(null)
        }
      }, 3000)
    } catch (e) {
      setQrErr('Erro ao gerar QR Code: ' + e.message)
    } finally {
      setQrLoading(false)
    }
  }

  function handleLogout() {
    if (!evolutionUrl || !instance || !apiKey) return
    setConfirmLogout(true)
  }
  async function confirmLogoutAction() {
    setLoggingOut(true)
    try {
      await fetch(`${evolutionUrl}/instance/logout/${instance}`, {
        method: 'DELETE', headers: { apikey: apiKey },
      })
      setQrBase64(null)
      fetchState()
    } catch (e) {
      setQrErr('Erro ao desconectar: ' + e.message)
    }
    setLoggingOut(false)
    setConfirmLogout(false)
  }

  useEffect(() => {
    if (!companyId) return
    supabase.from('users').select('*').eq('company_id', companyId).order('name')
      .then(({ data }) => { if (data) setUsers(data) })
  }, [companyId])

  useEffect(() => {
    if (!instance) return
    supabase.from('sectors').select('*').eq('instancia', instance).order('created_at')
      .then(({ data }) => { if (data) setSectors(data) })
  }, [instance])

  // Carrega contagens pro card de plano (profissionais + agendas)
  useEffect(() => {
    if (!instance) return
    Promise.all([
      supabase.from('professionals').select('id', { count: 'exact', head: true }).eq('instancia', instance),
      supabase.from('agendas').select('id', { count: 'exact', head: true }).eq('instancia', instance),
    ]).then(([{ count: p }, { count: a }]) => {
      setProCount(p || 0)
      setAgendasCount(a || 0)
    })
  }, [instance])

  useEffect(() => {
    if (!sectors.length) { setSectorMembers([]); return }
    supabase.from('sector_members').select('*').in('sector_id', sectors.map(s => s.id))
      .then(({ data }) => { if (data) setSectorMembers(data) })
  }, [sectors])

  // Carrega etiquetas
  useEffect(() => {
    if (!instance) return
    supabase.from('contact_tags').select('*').eq('instancia', instance).order('name')
      .then(({ data }) => { if (data) setTags(data) })
  }, [instance])

  async function handleCreateTag() {
    const name = tagForm.name.trim()
    if (!name) { setTagErr('Dê um nome pra etiqueta.'); return }
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      setTagErr('Já existe uma etiqueta com esse nome.'); return
    }
    setSavingTag(true); setTagErr('')
    const { data, error } = await supabase.from('contact_tags').insert({
      instancia: instance, name, color: tagForm.color,
    }).select().single()
    setSavingTag(false)
    if (error) { setTagErr('Erro: ' + error.message); return }
    setTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setTagForm({ name: '', color: TAG_COLORS[0] })
  }

  async function handleDeleteTag(tagId) {
    await supabase.from('contact_tags').delete().eq('id', tagId)
    setTags(prev => prev.filter(t => t.id !== tagId))
  }

  async function handleUpdateTagColor(tagId, color) {
    await supabase.from('contact_tags').update({ color }).eq('id', tagId)
    setTags(prev => prev.map(t => t.id === tagId ? { ...t, color } : t))
  }

  async function handleCreateSector() {
    if (!sectorForm.name.trim()) { setSectorErr('Nome é obrigatório.'); return }
    setSaving(true)
    const { data, error } = await supabase.from('sectors').insert({
      name: sectorForm.name.trim(), instancia: instance, color: sectorForm.color,
    }).select().single()
    setSaving(false)
    if (error) { setSectorErr('Erro: ' + error.message); return }
    setSectors(prev => [...prev, data])
    setSectorModal(false)
    setSectorForm({ name: '', color: SECTOR_COLORS[0] })
    setSectorErr('')
  }

  async function handleDeleteSector(sectorId) {
    await supabase.from('sectors').delete().eq('id', sectorId)
    setSectors(prev => prev.filter(s => s.id !== sectorId))
    setSectorMembers(prev => prev.filter(m => m.sector_id !== sectorId))
  }

  async function handleAssignUser(userId) {
    if (!assignModal) return
    await supabase.from('sector_members').delete().eq('user_id', userId)
    const { data } = await supabase.from('sector_members')
      .insert({ sector_id: assignModal.id, user_id: userId }).select().single()
    if (data) setSectorMembers(prev => [...prev.filter(m => m.user_id !== userId), data])
  }

  async function handleRemoveMember(userId) {
    await supabase.from('sector_members').delete().eq('user_id', userId)
    setSectorMembers(prev => prev.filter(m => m.user_id !== userId))
  }

  async function handleToggleUser(userId, active) {
    await supabase.from('users').update({ active: !active }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, active: !active } : u))
  }

  async function handleDeleteUser() {
    if (!deletingUser) return
    if (deletingUser.id === session?.user?.id) {
      setDeleteErr('Você não pode excluir a si mesmo.'); return
    }
    setSaving(true); setDeleteErr('')
    const { data, error } = await supabase.rpc('delete_user', { p_user_id: deletingUser.id })
    setSaving(false)
    if (error) {
      setDeleteErr('Erro: ' + error.message + ' — peça pra rodar a migração delete_user_rpc no Supabase.')
      return
    }
    if (data && data.ok === false) { setDeleteErr(data.error || 'Não foi possível excluir.'); return }
    setUsers(prev => prev.filter(u => u.id !== deletingUser.id))
    setSectorMembers(prev => prev.filter(m => m.user_id !== deletingUser.id))
    setDeletingUser(null)
  }

  function openEditUser(user) {
    setEditUserForm({ name: user.name, email: user.email, password: '', role: user.role })
    setEditUserErr('')
    setEditUserModal(user)
  }

  async function handleEditUser() {
    if (!editUserForm.name || !editUserForm.email) { setEditUserErr('Nome e e-mail são obrigatórios.'); return }
    setSaving(true)
    const { error } = await supabase.from('users').update({
      name: editUserForm.name,
      email: editUserForm.email,
      role: editUserForm.role,
    }).eq('id', editUserModal.id)
    if (error) { setSaving(false); setEditUserErr(error.message); return }

    if (editUserForm.password?.trim()) {
      const { error: pwErr } = await supabase.rpc('update_user_password', {
        p_user_id: editUserModal.id,
        p_password: editUserForm.password,
      })
      if (pwErr) { setSaving(false); setEditUserErr('Erro ao atualizar senha: ' + pwErr.message); return }
    }
    setSaving(false)
    setUsers(prev => prev.map(u => u.id === editUserModal.id
      ? { ...u, name: editUserForm.name, email: editUserForm.email, role: editUserForm.role }
      : u))
    setEditUserModal(null)
  }

  async function handleCreateUser() {
    if (!userForm.name || !userForm.email || !userForm.password) {
      setUserErr('Preencha todos os campos.'); return
    }
    const activeCount = users.filter(u => u.active !== false).length
    if (activeCount >= maxUsers) {
      setUserErr(`Limite de ${maxUsers} usuários atingido. Contate o administrador para aumentar o limite.`); return
    }
    setSaving(true)
    const { error } = await supabase.rpc('create_user', {
      p_name: userForm.name,
      p_email: userForm.email,
      p_password: userForm.password,
      p_role: userForm.role,
      p_company_id: companyId,
    })
    setSaving(false)
    if (error) { setUserErr(error.message); return }
    const { data } = await supabase.from('users').select('*').eq('company_id', companyId).order('name')
    if (data) setUsers(data)
    setUserModal(false)
    setUserErr('')
  }

  const domain = slugify(session?.company?.name || 'empresa') + '.com'
  const activeUsers = users.filter(u => u.active !== false)

  // Plan/billing data pro card hero do topo
  const planName  = limits.plan || 'Starter'
  const planDef   = PLAN_DEFAULTS[planName] || PLAN_DEFAULTS.Starter
  const PLAN_THEMES = {
    Starter:  { bg: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', border: 'rgba(217, 119, 6, 0.20)',  numColor: '#B45309', accent: '#D97706', accentSoft: '#FED7AA', icon: Sparkles, glow: 'rgba(250, 204, 21, 0.30)' },
    Pro:      { bg: 'linear-gradient(135deg, #0F0E1B 0%, #1E1B2E 100%)', border: 'rgba(184, 137, 92, 0.4)', numColor: '#FCD34D', accent: '#C9A074', accentSoft: '#A37846', icon: Crown,    glow: 'rgba(201, 160, 116, 0.35)', dark: true },
    Business: { bg: 'linear-gradient(135deg, #2E1065 0%, #4C1D95 100%)', border: 'rgba(167, 139, 250, 0.5)', numColor: '#DDD6FE', accent: '#A78BFA', accentSoft: '#7C3AED', icon: TrendingUp, glow: 'rgba(167, 139, 250, 0.35)', dark: true },
  }
  const planTheme = PLAN_THEMES[planName] || PLAN_THEMES.Starter
  const PlanIcon = planTheme.icon

  const billing = computeBillingStatus(session?.company)
  const billingBadge = statusBadge(billing.status)
  const displayPrice = session?.company?.plan_price_override ?? planDef.price

  const upgradeTarget = planName === 'Starter' ? 'Pro' : planName === 'Pro' ? 'Business' : null
  const upgradeWhatsApp = `https://wa.me/5561999999999?text=${encodeURIComponent(`Olá! Quero fazer upgrade do meu plano NexSac (atual: ${planName}${upgradeTarget ? ` → ${upgradeTarget}` : ''}). Empresa: ${session?.company?.name || ''}`)}`

  // Helper pra renderizar uma mini stat com barra de progresso
  function PlanStat({ icon: Icon, label, used, total }) {
    const isUnlimited = total === UNLIMITED
    const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, total)) * 100))
    const atLimit = !isUnlimited && used >= total
    const nearLimit = !isUnlimited && pct >= 80 && !atLimit
    const barColor = atLimit ? '#DC2626' : nearLimit ? '#D97706' : '#16A34A'
    const trackColor = planTheme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(15, 14, 27, 0.06)'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
            color: planTheme.dark ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
            fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            <Icon size={13} /> {label}
          </div>
          <div style={{ fontFamily: 'var(--font-display, "Bricolage Grotesque")', fontWeight: 700,
            fontSize: 14, color: planTheme.dark ? '#fff' : 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: atLimit ? '#FCA5A5' : nearLimit ? '#FCD34D' : 'inherit' }}>{used}</span>
            <span style={{ opacity: 0.5 }}>/{isUnlimited ? '∞' : total}</span>
          </div>
        </div>
        <div style={{ height: 5, background: trackColor, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: isUnlimited ? '12%' : `${pct}%`,
            background: isUnlimited
              ? `repeating-linear-gradient(45deg, ${barColor}, ${barColor} 4px, transparent 4px, transparent 8px)`
              : `linear-gradient(90deg, ${barColor}88, ${barColor})`,
            borderRadius: 999,
            transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }} />
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter">
      {/* ─── Plano e cobrança (card hero) ──────────────────────────────── */}
      <div className="page-body">
        <div className="section-header">
          <div className="section-title">Plano e cobrança</div>
        </div>
        <div style={{
          position: 'relative',
          background: planTheme.bg,
          border: `1px solid ${planTheme.border}`,
          borderRadius: 18,
          padding: '1.5rem 1.75rem',
          overflow: 'hidden',
          color: planTheme.dark ? '#fff' : 'var(--text-primary)',
        }}>
          {/* Glow ambiental */}
          <div aria-hidden="true" style={{
            position: 'absolute', top: -80, right: -80,
            width: 240, height: 240, borderRadius: '50%',
            background: planTheme.glow, filter: 'blur(60px)', pointerEvents: 'none',
          }} />

          <div className="plan-card-grid" style={{ position: 'relative' }}>

            {/* Coluna esquerda: badge do plano + status billing */}
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 999,
                background: planTheme.dark ? 'rgba(255,255,255,0.08)' : '#fff',
                border: `1px solid ${planTheme.dark ? 'rgba(255,255,255,0.15)' : planTheme.border}`,
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: planTheme.accent,
              }}>
                <PlanIcon size={11} /> Plano atual
              </div>

              <div className="plan-name-display" style={{
                marginTop: 12,
                fontFamily: 'var(--font-display, "Bricolage Grotesque")',
                fontWeight: 800, fontSize: 44, lineHeight: 1, letterSpacing: '-0.04em',
                color: planTheme.numColor,
              }}>
                {planName}
              </div>

              <div style={{ marginTop: 8, fontSize: 13,
                color: planTheme.dark ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>
                {displayPrice ? (
                  <><strong style={{ fontWeight: 700 }}>{fmtMoney(displayPrice)}</strong>/mês</>
                ) : (
                  <em style={{ fontFamily: 'Instrument Serif, serif', fontSize: 14 }}>preço sob medida</em>
                )}
              </div>

              {/* Vencimento + status badge */}
              {billing.status !== BILLING_STATUS.NO_CONFIG && (
                <div style={{
                  marginTop: 16,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px',
                  borderRadius: 10,
                  background: planTheme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
                  border: `1px solid ${planTheme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 14, 27, 0.06)'}`,
                  backdropFilter: 'blur(8px)',
                }}>
                  <CalendarIcon size={13} style={{ color: billingBadge.color }} />
                  <div style={{ fontSize: 12, color: planTheme.dark ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)' }}>
                    Próximo vencimento{' '}
                    <strong style={{ fontWeight: 700, color: planTheme.dark ? '#fff' : 'var(--text-primary)' }}>
                      {fmtDateBR(billing.dueDate)}
                    </strong>
                  </div>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    padding: '2px 8px', borderRadius: 999,
                    background: billingBadge.bg, color: billingBadge.color,
                    border: `1px solid ${billingBadge.border}`,
                  }}>
                    {billing.daysUntilDue != null && billing.daysUntilDue > 0
                      ? `em ${billing.daysUntilDue}d`
                      : billing.daysUntilDue === 0
                      ? 'hoje'
                      : billing.daysOverdue
                      ? `${billing.daysOverdue}d atrás`
                      : billingBadge.label}
                  </span>
                </div>
              )}
            </div>

            {/* Coluna direita: 3 stats + CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <PlanStat icon={Stethoscope} label="Profissionais" used={proCount} total={limits.professionals} />
              <PlanStat icon={UsersIcon}   label="Usuários na equipe" used={users.length} total={limits.users} />
              <PlanStat icon={Layers}      label="Agendas"           used={agendasCount} total={limits.agendas} />

              {/* CTA upgrade — apenas se houver target */}
              {upgradeTarget && (
                <a href={upgradeWhatsApp} target="_blank" rel="noreferrer"
                  style={{
                    marginTop: 6,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10,
                    padding: '11px 16px', borderRadius: 12,
                    background: planTheme.dark
                      ? 'linear-gradient(120deg, #FCD34D 0%, #FB923C 100%)'
                      : 'linear-gradient(120deg, #2563EB 0%, #1D4ED8 100%)',
                    color: planTheme.dark ? '#422006' : '#fff',
                    fontFamily: 'var(--font-display, "Bricolage Grotesque")',
                    fontWeight: 700, fontSize: 13.5,
                    letterSpacing: '-0.01em',
                    textDecoration: 'none',
                    boxShadow: planTheme.dark
                      ? '0 8px 24px -8px rgba(252, 211, 77, 0.5)'
                      : '0 8px 24px -8px rgba(37, 99, 235, 0.45)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <ArrowUpRight size={15} /> Fazer upgrade pra {upgradeTarget}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>
                    Falar com o time
                  </span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Conexão WhatsApp */}
      <div className="page-body">
        <div className="section-header">
          <div className="section-title">Conexão WhatsApp</div>
        </div>
        <div className="nx-card" style={{ padding: '1.25rem 1.5rem' }}>
          {!instance || !apiKey ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Instância não configurada. Solicite ao administrador para cadastrar
              <strong> Instância</strong> e <strong>API Instância</strong>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {connState === 'open' ? (
                    <>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Wifi size={16} style={{ color: '#16A34A' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#16A34A' }}>Conectado</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Instância <strong>{instance}</strong> ativa e pronta para receber mensagens.</div>
                      </div>
                    </>
                  ) : connState === 'connecting' ? (
                    <>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RefreshCw size={16} style={{ color: '#D97706' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#D97706' }}>Aguardando leitura</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Escaneie o QR Code abaixo no WhatsApp.</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <WifiOff size={16} style={{ color: '#DC2626' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#DC2626' }}>Desconectado</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gere o QR Code para conectar a instância <strong>{instance}</strong>.</div>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {connState === 'open' ? (
                    <button onClick={handleLogout}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <LogOut size={13} /> Desconectar
                    </button>
                  ) : (
                    <button onClick={handleGenerateQR} disabled={qrLoading}
                      className="nx-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 14px' }}>
                      <QrCode size={13} /> {qrLoading ? 'Gerando...' : (qrBase64 ? 'Atualizar QR' : 'Gerar QR Code')}
                    </button>
                  )}
                </div>
              </div>

              {qrErr && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626' }}>
                  {qrErr}
                </div>
              )}

              {qrBase64 && connState !== 'open' && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  padding: '16px', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 10,
                }}>
                  <img src={qrBase64} alt="QR Code WhatsApp"
                    style={{ width: 240, height: 240, borderRadius: 8, background: '#fff', padding: 8 }} />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 380, lineHeight: 1.5 }}>
                    Abra o <strong>WhatsApp</strong> no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e escaneie o código.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lembretes automáticos de agendamento */}
      <div className="page-body">
        <div className="section-header">
          <div className="section-title">Lembretes automáticos</div>
        </div>
        <div className="nx-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Header + toggle */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bell size={16} style={{ color: '#2563EB' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                    Enviar lembrete antes de cada agendamento
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 520, lineHeight: 1.5 }}>
                    O sistema envia automaticamente uma mensagem no WhatsApp pra cada contato agendado, na antecedência que você escolher.
                  </div>
                </div>
              </div>
              <button type="button"
                onClick={() => setReminderEnabled(v => !v)}
                aria-pressed={reminderEnabled}
                style={{
                  position: 'relative', width: 42, height: 24, borderRadius: 999,
                  background: reminderEnabled ? '#2563EB' : '#CBD5E1',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                }}>
                <span style={{
                  position: 'absolute', top: 2,
                  left: reminderEnabled ? 20 : 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                }} />
              </button>
            </div>

            {reminderEnabled && (
              <>
                {/* Offset options */}
                <div>
                  <div style={labelStyle}>Avisar com antecedência de</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {REMINDER_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setReminderOffset(opt.value)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: `1.5px solid ${reminderOffset === opt.value ? '#2563EB' : 'var(--border)'}`,
                          background: reminderOffset === opt.value ? '#EFF6FF' : '#fff',
                          color: reminderOffset === opt.value ? '#1D4ED8' : 'var(--text-primary)',
                          fontSize: 13,
                          fontWeight: reminderOffset === opt.value ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grupo para cópia do lembrete */}
                <div>
                  <div style={labelStyle}>Enviar cópia do lembrete para um grupo (opcional)</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Além do lembrete individual para o contato, o sistema pode avisar também um grupo do WhatsApp.
                  </div>
                  <select
                    value={reminderGroupId}
                    onChange={e => setReminderGroupId(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1.5px solid var(--border)',
                      background: '#fff',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      cursor: 'pointer',
                      minWidth: 260,
                      maxWidth: '100%',
                      outline: 'none',
                    }}
                  >
                    <option value=''>— Não enviar para grupo —</option>
                    {availableGroups.map(g => (
                      <option key={g.idgrupo} value={g.idgrupo}>
                        {g.nomegrupo !== g.idgrupo ? g.nomegrupo : g.idgrupo.replace('@g.us', '')}
                      </option>
                    ))}
                  </select>
                  {reminderGroupId && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      Grupo selecionado: <code style={{ fontSize: 11 }}>{reminderGroupId}</code>
                    </div>
                  )}
                </div>

                {/* Preview */}
                <div>
                  <div style={labelStyle}>Como a mensagem chega no contato</div>
                  <div style={{
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: '#0F172A',
                    maxWidth: 520,
                  }}>
                    Olá <strong>Maria</strong>! 👋 Passando pra lembrar do seu agendamento no dia <strong>15/05</strong> às <strong>14:30</strong> com <strong>Camila</strong>. Até lá!
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Os campos em negrito vêm do agendamento (nome, data, hora e profissional).
                  </div>
                  {reminderGroupId && (
                    <>
                      <div style={{ ...labelStyle, marginTop: 12 }}>Como a mensagem chega no grupo</div>
                      <div style={{
                        background: '#F5F3FF',
                        border: '1px solid #DDD6FE',
                        borderRadius: 12,
                        padding: '12px 14px',
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        color: '#0F172A',
                        maxWidth: 520,
                      }}>
                        📅 Lembrete: <strong>Maria</strong> tem agendamento no dia <strong>15/05</strong> às <strong>14:30</strong> com <strong>Camila</strong>.
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Save */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
              <button onClick={saveReminder} disabled={savingReminder} className="nx-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 16px' }}>
                {savingReminder ? 'Salvando...' : 'Salvar configuração'}
              </button>
              {reminderSaved && (
                <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>
                  ✓ Salvo com sucesso
                </span>
              )}
              {reminderErr && (
                <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                  {reminderErr}
                </span>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Setores */}
      <div className="page-body">
        <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="section-title">Setores / Departamentos</div>
          {instance && (
            <button className="nx-btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => { setSectorForm({ name: '', color: SECTOR_COLORS[0] }); setSectorErr(''); setSectorModal(true) }}>
              <Plus size={13} /> Novo setor
            </button>
          )}
        </div>

        {!instance ? (
          <div className="nx-card" style={{ padding: '1.5rem', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Instância WhatsApp não configurada. Contate o administrador.
          </div>
        ) : !sectors.length ? (
          <div className="nx-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhum setor criado ainda. Crie setores e atribua funcionários.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {sectors.map(sector => {
              const memberUsers = sectorMembers
                .filter(m => m.sector_id === sector.id)
                .map(m => users.find(u => u.id === m.user_id))
                .filter(Boolean)
              return (
                <div key={sector.id} className="nx-card" style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: sector.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{sector.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="table-action" onClick={() => setAssignModal(sector)}>
                        <Plus size={11} /> Atribuir
                      </button>
                      <button className="table-action danger" onClick={() => handleDeleteSector(sector.id)}>
                        <X size={11} /> Excluir
                      </button>
                    </div>
                  </div>
                  {!memberUsers.length ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum funcionário atribuído.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {memberUsers.map(u => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', borderRadius: 6, padding: '5px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: sector.color + '22', border: `1px solid ${sector.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: sector.color }}>
                              {u.name.charAt(0)}
                            </div>
                            {u.name}
                          </div>
                          <button className="table-action danger" style={{ padding: '2px 7px', fontSize: 10 }} onClick={() => handleRemoveMember(u.id)}>
                            <UserMinus size={9} /> Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Etiquetas (Tags) */}
      <div className="page-body">
        <div className="section-header">
          <div className="section-title">Etiquetas de contatos</div>
        </div>
        <div className="nx-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F5F3FF', border: '1px solid #DDD6FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TagIcon size={16} style={{ color: '#7C3AED' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 560 }}>
              Crie etiquetas (ex: <em>VIP</em>, <em>Inadimplente</em>, <em>Recorrente</em>) e marque contatos
              nas Conversas, Finalizados e Contatos. Use depois pra filtrar e enxergar grupos específicos.
            </div>
          </div>

          {/* Form de criar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: '1 1 220px', minWidth: 180 }}>
              <div style={labelStyle}>Nome da etiqueta</div>
              <input
                className="nx-input"
                style={{ width: '100%' }}
                placeholder="Ex: VIP, Inadimplente, Pós-cirúrgico..."
                value={tagForm.name}
                onChange={e => { setTagForm(f => ({ ...f, name: e.target.value })); setTagErr('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateTag() }}
                maxLength={32}
              />
            </div>
            <div>
              <div style={labelStyle}>Cor</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {TAG_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTagForm(f => ({ ...f, color: c }))}
                    title={c}
                    style={{
                      width: 26, height: 26, borderRadius: 7,
                      background: c, cursor: 'pointer',
                      border: tagForm.color === c ? '2px solid #0F0E1B' : '2px solid transparent',
                      boxShadow: tagForm.color === c ? '0 0 0 2px #fff inset' : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              className="nx-btn-primary"
              onClick={handleCreateTag}
              disabled={savingTag}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <Plus size={13} /> {savingTag ? 'Criando...' : 'Criar etiqueta'}
            </button>
          </div>

          {tagErr && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
              padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
              {tagErr}
            </div>
          )}

          {/* Lista */}
          {tags.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '12px 0' }}>
              Nenhuma etiqueta criada ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tags.map(t => (
                <div key={t.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: t.color + '12',
                  border: `1px solid ${t.color}44`,
                  borderRadius: 10, padding: '6px 6px 6px 12px',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: t.color }}>{t.name}</span>
                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: 3, marginLeft: 4, paddingLeft: 6, borderLeft: `1px solid ${t.color}33` }}>
                    {TAG_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => handleUpdateTagColor(t.id, c)}
                        title={c}
                        style={{
                          width: 13, height: 13, borderRadius: 4,
                          background: c, cursor: 'pointer', flexShrink: 0,
                          border: t.color === c ? '1.5px solid #0F0E1B' : '1.5px solid transparent',
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => handleDeleteTag(t.id)}
                    title="Excluir etiqueta"
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: t.color, opacity: 0.55, padding: 4,
                      display: 'inline-flex', alignItems: 'center',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.55}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Usuários */}
      <div className="page-body" style={{ marginTop: 0 }}>
        <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="section-title">Usuários ({activeUsers.length} / {formatLimit(maxUsers)})</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Plano <strong>{limits.plan}</strong> · {limits.extra_users > 0 ? <>+{limits.extra_users} usuário{limits.extra_users > 1 ? 's' : ''} extras (R$39 cada)</> : <>limite padrão do plano</>}
            </div>
          </div>
          <button
            className="nx-btn-primary"
            style={{ fontSize: 12, padding: '6px 14px', opacity: reachedLimit(activeUsers.length, maxUsers) ? 0.7 : 1 }}
            onClick={() => {
              if (reachedLimit(activeUsers.length, maxUsers)) {
                setLimitModal(upgradeMessage('users', maxUsers, limits.plan))
                return
              }
              setUserForm({ name: '', email: '', password: '', role: 'viewer' }); setUserErr(''); setUserModal(true)
            }}>
            {reachedLimit(activeUsers.length, maxUsers) ? <Lock size={13} /> : <Plus size={13} />} Novo usuário
          </button>
        </div>

        <div className="nx-card">
          {!users.length ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum usuário.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Setor</th><th>Status</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const memberSectorId = sectorMembers.find(m => m.user_id === u.id)?.sector_id
                  const userSector = sectors.find(s => s.id === memberSectorId)
                  return (
                    <tr key={u.id}>
                      <td className="td-name">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#2563EB' }}>
                            {u.name.charAt(0)}
                          </div>
                          {u.name}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</td>
                      <td>
                        <span className={`nx-badge ${u.role === 'admin' ? 'nx-badge-cyan' : 'nx-badge-gray'}`}>
                          {u.role === 'admin' ? 'Admin' : 'Operador'}
                        </span>
                      </td>
                      <td>
                        {userSector ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: '#fff', background: userSector.color }}>
                            {userSector.name}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={`nx-badge ${u.active !== false ? 'nx-badge-green' : 'nx-badge-red'}`}>
                          {u.active !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="table-action" onClick={() => openEditUser(u)}>
                            <Pencil size={12} /> Editar
                          </button>
                          <button className={`table-action ${u.active !== false ? 'danger' : ''}`}
                            onClick={() => handleToggleUser(u.id, u.active !== false)}>
                            {u.active !== false ? <><UserX size={12} /> Desativar</> : <><UserCheck size={12} /> Ativar</>}
                          </button>
                          {u.id !== session?.user?.id && (
                            <button className="table-action danger"
                              onClick={() => { setDeleteErr(''); setDeletingUser(u) }}>
                              <Trash2 size={12} /> Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmLogout}
        variant="warning"
        title="Desconectar WhatsApp"
        message={`Tem certeza que deseja desconectar a instância "${instance}"? Você precisará escanear o QR Code novamente para reconectar.`}
        confirmLabel="Desconectar"
        loading={loggingOut}
        onConfirm={confirmLogoutAction}
        onCancel={() => setConfirmLogout(false)}
      />

      <LimitReachedModal
        open={!!limitModal}
        title={limitModal?.title}
        body={limitModal?.body}
        cta={limitModal?.cta}
        planName={limits.plan}
        onClose={() => setLimitModal(null)}
      />

      {/* Modal criar setor */}
      {sectorModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Novo setor</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSectorModal(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input className="nx-input" placeholder="Ex: Comercial, Suporte..." autoFocus
                  value={sectorForm.name} onChange={e => setSectorForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Cor identificadora</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {SECTOR_COLORS.map(c => (
                    <button key={c} onClick={() => setSectorForm(p => ({ ...p, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: sectorForm.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {sectorErr && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{sectorErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setSectorModal(false)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCreateSector} disabled={saving}>
                  {saving ? 'Criando...' : 'Criar setor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Modal atribuir usuário ao setor */}
      {assignModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Atribuir ao setor</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: assignModal.color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{assignModal.name}</span>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setAssignModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
              {users.filter(u => u.role !== 'admin').map(u => {
                const inThisSector = sectorMembers.find(m => m.user_id === u.id)?.sector_id === assignModal.id
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, background: inThisSector ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${inThisSector ? '#BBF7D0' : 'var(--border)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#2563EB' }}>
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                      </div>
                    </div>
                    {inThisSector ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A' }}>✓ Atribuído</span>
                    ) : (
                      <button className="nx-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => handleAssignUser(u.id)}>
                        Atribuir
                      </button>
                    )}
                  </div>
                )
              })}
              {users.filter(u => u.role !== 'admin').length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  Nenhum operador disponível.
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button className="nx-btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setAssignModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Modal excluir usuário */}
      {deletingUser && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#DC2626' }}>Excluir usuário</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Esta ação não pode ser desfeita.</div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setDeletingUser(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                Excluir permanentemente <strong>{deletingUser.name}</strong> ({deletingUser.email})?
              </div>
              {deleteErr && (
                <div style={{ marginTop: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626' }}>
                  {deleteErr}
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setDeletingUser(null)}>Cancelar</button>
              <button
                style={{ flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                onClick={handleDeleteUser} disabled={saving}>
                <Trash2 size={13} /> {saving ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Modal editar usuário */}
      {editUserModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Editar usuário</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{editUserModal.name}</div>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setEditUserModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input className="nx-input" autoFocus value={editUserForm.name}
                  onChange={e => setEditUserForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>E-mail</label>
                <input className="nx-input" type="email" value={editUserForm.email}
                  onChange={e => setEditUserForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Nova senha <span style={{ fontWeight: 400, textTransform: 'none' }}>(deixe em branco para não alterar)</span></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="nx-input" placeholder="Nova senha..."
                    value={editUserForm.password}
                    onChange={e => setEditUserForm(p => ({ ...p, password: e.target.value }))} />
                  <button type="button" className="nx-btn-ghost" style={{ flexShrink: 0, padding: '0 12px' }}
                    onClick={() => setEditUserForm(p => ({ ...p, password: generatePassword(p.name || 'user') }))}>
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Perfil de acesso</label>
                <select className="nx-select" value={editUserForm.role}
                  onChange={e => setEditUserForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="viewer">Operador — acesso ao painel de conversas</option>
                  <option value="admin">Admin — acesso completo + configurações</option>
                </select>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {editUserErr && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{editUserErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setEditUserModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleEditUser} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Modal criar usuário */}
      {userModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Novo usuário</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {activeUsers.length} / {maxUsers} usuários ativos
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setUserModal(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input className="nx-input" placeholder="Nome completo" autoFocus
                  value={userForm.name}
                  onChange={e => {
                    const name = e.target.value
                    const email = name ? `${slugify(name)}@${domain}` : ''
                    setUserForm(p => ({ ...p, name, email }))
                  }} />
              </div>
              <div>
                <label style={labelStyle}>E-mail</label>
                <input className="nx-input" type="email" value={userForm.email}
                  onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Senha</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="nx-input" value={userForm.password}
                    onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} />
                  <button type="button" className="nx-btn-ghost" style={{ flexShrink: 0, padding: '0 12px' }}
                    onClick={() => setUserForm(p => ({ ...p, password: generatePassword(p.name || 'user') }))}>
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Perfil de acesso</label>
                <select className="nx-select" value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="viewer">Operador — acesso ao painel de conversas</option>
                  <option value="admin">Admin — acesso completo + configurações</option>
                </select>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {userErr && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{userErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setUserModal(false)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCreateUser} disabled={saving}>
                  {saving ? 'Criando...' : 'Criar acesso'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
