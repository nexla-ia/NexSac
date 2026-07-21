import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Sidebar from '../../components/Sidebar'
import BillingBanner from '../../components/BillingBanner'
import BlockedScreen from '../../components/BlockedScreen'
import SupportWidget from '../../components/SupportWidget'
import { shouldBlockAccess } from '../../lib/billing'
import { MessageSquare, History, BellRing, BarChart2, Settings2, Contact2, Calendar, Sparkles, Kanban, Package, GraduationCap, Instagram, ShieldCheck, Headset, MessageSquareHeart, Menu, X, Users, DollarSign, GitMerge } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { latestUpdateDate } from '../../data/updates'
import './Company.css'

export default function CompanyLayout() {
  const { session, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const blocked = shouldBlockAccess(session?.company)
  const instance = session?.company?.instance
  const [activeCount, setActiveCount] = useState(0)
  const [pendingAlerts, setPendingAlerts] = useState(0)
  const [groupUnreadMap, setGroupUnreadMap] = useState({}) // idgrupo → true (dedupe por grupo, não por mensagem)
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportUnread, setSupportUnread] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const groupUnread = Object.keys(groupUnreadMap).length

  // Fecha sidebar ao trocar de rota (mobile) e zera badge de grupos ao entrar na tela
  useEffect(() => {
    setSidebarOpen(false)
    if (location.pathname.startsWith('/painel/grupos')) setGroupUnreadMap({})
  }, [location.pathname])
  // Trava scroll do body quando drawer aberto
  useEffect(() => {
    if (sidebarOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // Onboarding obrigatório: força usuário novo para o tutorial até concluir
  useEffect(() => {
    const userKey = session?.user?.email
    if (!userKey) return
    const done = localStorage.getItem(`nx_onboarding_done_${userKey}`) === 'true'
    if (!done && location.pathname !== '/painel/tutorial') {
      navigate('/painel/tutorial', { replace: true })
    }
  }, [session?.user?.email, location.pathname, navigate])

  // Garante que a tabela conversations está no Realtime
  useEffect(() => {
    supabase.rpc('ensure_table_setup', { p_table: 'conversations' })
  }, [])

  // Conta conversas na Recepção = únicas em mensagens_geral, sem encerradas e sem atendimento ativo
  useEffect(() => {
    if (!instance) return

    async function refresh() {
      const [{ data: msgs }, { data: closed }, { data: attended }] = await Promise.all([
        supabase.from('mensagens_geral').select('numero').eq('instancia', instance),
        supabase.from('conversations').select('session_id').eq('instancia', instance),
        supabase.from('attendances').select('numero').eq('instancia', instance),
      ])
      const closedSet   = new Set((closed   || []).map(r => r.session_id))
      const attendedSet = new Set((attended || []).map(r => r.numero))
      const unique = new Set((msgs || []).map(r => r.numero))
      // Badge = só o que está na Recepção (sem atendente e não encerrada)
      setActiveCount([...unique].filter(s => !closedSet.has(s) && !attendedSet.has(s)).length)
    }
    refresh()

    const ch = supabase.channel('layout-conversations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_geral', filter: `instancia=eq.${instance}` },
        () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `instancia=eq.${instance}` },
        () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances', filter: `instancia=eq.${instance}` },
        () => refresh())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Conta alertas pendentes reais (sem IA: conta só encaminhamentos para o usuário)
  const userId = session?.user?.id
  const aiOn = session?.company?.ai_enabled !== false
  useEffect(() => {
    if (!instance) return
    function countQuery() {
      let q = supabase.from('alerts').select('id', { count: 'exact' })
        .eq('instancia', instance).eq('resolved', false)
      if (!aiOn && userId) q = q.eq('forwarded_to_user_id', userId)
      return q
    }
    countQuery().then(({ count }) => setPendingAlerts(count || 0))

    const ch = supabase.channel('layout-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `instancia=eq.${instance}` },
        () => { countQuery().then(({ count }) => setPendingAlerts(count || 0)) })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance, aiOn, userId])

  // Badge de grupos: contagem inicial (não lidos desde a última leitura, mesmo antes
  // de abrir a tela de grupos) + contador ao vivo deduplicado por grupo (não por mensagem).
  useEffect(() => {
    if (!instance || !session?.user?.email) return
    let cancelled = false
    Promise.all([
      supabase.from('conversation_reads').select('session_id, last_read_at')
        .eq('instancia', instance).eq('user_email', session.user.email),
      supabase.from('mensagens_geral').select('idgrupo, created_at')
        .eq('instancia', instance).not('idgrupo', 'is', null).ilike('type', 'cliente')
        .order('id', { ascending: false }).limit(5000),
    ]).then(([{ data: reads }, { data: msgs }]) => {
      if (cancelled) return
      const readsMap = {}
      ;(reads || []).forEach(r => { readsMap[r.session_id] = r.last_read_at })
      let muted = []
      try { muted = JSON.parse(localStorage.getItem(`muted_groups_${instance}`) || '[]') } catch {}
      const seen = new Set()
      const unreadMap = {}
      for (const row of (msgs || [])) {
        if (!row.idgrupo || seen.has(row.idgrupo)) continue
        seen.add(row.idgrupo)
        if (muted.includes(row.idgrupo)) continue
        const lr = readsMap[row.idgrupo]
        if (!lr || (row.created_at && new Date(row.created_at) > new Date(lr))) {
          unreadMap[row.idgrupo] = true
        }
      }
      setGroupUnreadMap(unreadMap)
    })
    return () => { cancelled = true }
  }, [instance, session?.user?.email])

  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel('layout-groups-unread')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensagens_geral',
        filter: `instancia=eq.${instance}`,
      }, (p) => {
        const row = p.new
        if (!row?.idgrupo) return
        if ((row.type || '').toLowerCase() !== 'cliente') return
        if (location.pathname.startsWith('/painel/grupos')) return
        try {
          const muted = JSON.parse(localStorage.getItem(`muted_groups_${instance}`) || '[]')
          if (muted.includes(row.idgrupo)) return
        } catch {}
        setGroupUnreadMap(prev => (prev[row.idgrupo] ? prev : { ...prev, [row.idgrupo]: true }))
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance, location.pathname])

  const isAdmin = session?.user?.role === 'admin'
  const aiEnabled = session?.company?.ai_enabled !== false
  const lastSeen = typeof window !== 'undefined' ? localStorage.getItem('nx_news_seen') : null
  const hasNewUpdate = !lastSeen || lastSeen < latestUpdateDate()

  // modules: null = tudo habilitado; objeto = apenas as chaves false estão desativadas
  const mods = session?.company?.modules || {}
  const mod = key => mods[key] !== false  // true por padrão

  const links = [
    ...(mod('conversas') ? [{ to: '/painel/conversas', icon: MessageSquare, label: 'Conversas',
      badge: activeCount > 0 ? activeCount : null, badgeColor: 'cyan' }] : []),
    ...(aiEnabled && mod('conversas') ? [{ to: '/painel/historico', icon: History, label: 'Conversas IA' }] : []),
    ...(mod('instagram') ? [{ to: '/painel/instagram', icon: Instagram, label: 'Instagram' }] : []),
    ...(mod('grupos') ? [{ to: '/painel/grupos', icon: Users, label: 'Grupos',
      badge: groupUnread > 0 ? groupUnread : null, badgeColor: 'cyan' }] : []),
    ...(mod('contatos') ? [{ to: '/painel/contatos', icon: Contact2, label: 'Contatos' }] : []),
    ...(mod('agenda') ? [{ to: '/painel/agenda', icon: Calendar, label: 'Agenda' }] : []),
    ...(mod('kanban') ? [{ to: '/painel/atividades', icon: Kanban, label: 'Kanban' }] : []),
    ...(isAdmin && mod('financeiro') ? [{ to: '/painel/financeiro', icon: DollarSign, label: 'Financeiro' }] : []),
    ...(isAdmin && mod('crm') ? [{ to: '/painel/crm', icon: GitMerge, label: 'CRM' }] : []),
    ...(mod('alertas') ? [{ to: '/painel/alertas', icon: BellRing, label: 'Alertas',
      badge: pendingAlerts > 0 ? pendingAlerts : null, badgeColor: 'amber' }] : []),
    { to: '/painel/tutorial',  icon: GraduationCap, label: 'Tutorial' },
    { to: '/painel/novidades', icon: Sparkles,      label: 'Novidades',
      badge: hasNewUpdate ? 'Novo' : null, badgeColor: 'violet' },
    { to: '/painel/seguranca', icon: ShieldCheck,   label: 'Segurança' },
    { to: '/painel/feedback',  icon: MessageSquareHeart, label: 'Feedback' },
    ...(isAdmin ? [
      ...(mod('metricas') ? [{ to: '/painel/metricas', icon: BarChart2, label: 'Métricas' }] : []),
      ...(mod('catalogo') ? [{ to: '/painel/catalogo', icon: Package, label: 'Catálogo de Serviços' }] : []),
      { to: '/painel/admin', icon: Settings2, label: 'Administração' },
    ] : []),
    { key: 'suporte', icon: Headset, label: 'Suporte',
      onClick: () => setSupportOpen(true), active: supportOpen,
      badge: supportUnread > 0 ? supportUnread : null, badgeColor: 'amber' },
  ]

  if (blocked) {
    return <BlockedScreen company={session?.company} onLogout={logout} />
  }

  return (
    <div className={`company-root ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="company-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      <Sidebar links={links} role="company" />
      <div className="company-main-wrap">
        <div className="company-topbar">
          <button
            type="button"
            className="company-hamburger"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="company-topbar-name">{session?.company?.name}</div>
          <span className={`nx-badge nx-badge-${
            session?.company?.plan === 'Business' ? 'violet' :
            session?.company?.plan === 'Pro' ? 'cyan' :
            session?.company?.plan === 'Trial' ? 'amber' :
            'gray'
          }`}>
            {session?.company?.plan === 'Trial' ? '⚡ Trial' : session?.company?.plan}
          </span>
        </div>
        <BillingBanner company={session?.company} />
        <main className="company-main">
          <Outlet />
        </main>
      </div>
      <SupportWidget
        session={session}
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        onUnreadChange={setSupportUnread}
      />
    </div>
  )
}
