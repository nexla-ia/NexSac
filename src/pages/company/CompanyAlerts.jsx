import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { BellRing, CheckCircle2, Clock, MessageCircle, Forward, X, Copy, User, Phone } from 'lucide-react'
import './Company.css'

let _audioCtx = null

function getAudioCtx() {
  if (!_audioCtx) {
    const AudioCtx = window.AudioContext || (/** @type {any} */ (window)).webkitAudioContext
    _audioCtx = new AudioCtx()
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume()
  return _audioCtx
}

function playNotificationSound() {
  try {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch (_) {}
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const diffMin = Math.floor((now - date) / 60000)
  const diffH = Math.floor(diffMin / 60)

  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diffMin < 1) return hhmm
  if (diffMin < 60) return hhmm
  if (diffH < 24) return hhmm

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  if (isYesterday) return 'Ontem'

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function CompanyAlerts() {
  const { session } = useAuth()
  const instance   = session?.company?.instance
  const currentUser = session?.user
  const companyUsers = (session?.company?.users || []).filter(u => u.active)
  const aiEnabled = session?.company?.ai_enabled !== false

  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [realtimeStatus, setRealtimeStatus] = useState('connecting')
  const [unreadCount, setUnreadCount] = useState(0)
  const [audioEnabled, setAudioEnabled] = useState(false)

  // Modal de encaminhamento
  const [forwardAlert, setForwardAlert] = useState(null)
  const [forwardTarget, setForwardTarget] = useState('')
  const [forwarding, setForwarding] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  function copyNumber(id, num) {
    const clean = (num || '').replace(/@.*$/, '').replace(/\D/g, '')
    navigator.clipboard.writeText(clean).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  function enableAudio() {
    try {
      getAudioCtx()
      playNotificationSound()
      setAudioEnabled(true)
    } catch (_) {}
  }

  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Alertas — NexSac`
    } else {
      document.title = 'NexSac'
    }
    return () => { document.title = 'NexSac' }
  }, [unreadCount])

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    supabase
      .from('alerts')
      .select('*')
      .eq('instancia', instance)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setAlerts(data)
        setLoading(false)
      })
  }, [instance])

  useEffect(() => {
    if (!instance) return
    setRealtimeStatus('connecting')

    const channel = supabase
      .channel(`realtime-alerts-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `instancia=eq.${instance}` },
        (payload) => {
          if (!payload.new) return
          setAlerts(prev => [payload.new, ...prev])
          // Sem IA: só notifica encaminhamentos para mim. Com IA: notifica alertas gerais e encaminhados.
          const isForwardedToMe = payload.new.forwarded_to_user_id === currentUser?.id
          const isGeneralAlert = !payload.new.forwarded_to_user_id
          const shouldNotify = aiEnabled
            ? (isGeneralAlert || isForwardedToMe)
            : isForwardedToMe
          if (shouldNotify) {
            setUnreadCount(c => c + 1)
            playNotificationSound()
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts', filter: `instancia=eq.${instance}` },
        (payload) => {
          if (payload.new) setAlerts(prev => prev.map(a => a.id === payload.new.id ? payload.new : a))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error')
      })

    return () => { supabase.removeChannel(channel) }
  }, [instance, currentUser?.id, aiEnabled])

  async function resolve(id) {
    await supabase.from('alerts').update({ resolved: true }).eq('id', id)
  }

  async function handleForward() {
    if (!forwardTarget) return
    const target = companyUsers.find(u => u.id === forwardTarget)
    if (!target) return
    setForwarding(true)
    await supabase.from('alerts').update({
      forwarded_to_user_id: target.id,
      forwarded_to_name: target.name,
      forwarded_by_name: currentUser?.name || 'Usuário',
    }).eq('id', forwardAlert.id)
    setForwarding(false)
    setForwardAlert(null)
    setForwardTarget('')
  }

  useEffect(() => {
    function onFocus() { setUnreadCount(0) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Filtra: mostra alertas gerais + encaminhados para mim
  // Alertas encaminhados para outra pessoa somem da tela de quem encaminhou
  // Quando IA está desativada, só mostra encaminhamentos (alertas da IA não devem aparecer)
  const visible = alerts.filter(a => {
    if (!aiEnabled && !a.forwarded_to_user_id) return false       // sem IA, esconde alertas gerais
    if (!a.forwarded_to_user_id) return true                      // alerta geral, todos veem
    if (a.forwarded_to_user_id === currentUser?.id) return true   // encaminhado para mim, vejo
    return false                                                   // encaminhado para outro, não vejo
  })

  const filtered = visible.filter(a => {
    if (filter === 'pending') return !a.resolved
    if (filter === 'resolved') return a.resolved
    return true
  })

  const pending  = visible.filter(a => !a.resolved).length
  const resolved = visible.filter(a =>  a.resolved).length

  return (
    <div className="alerts-root">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: 4 }}>
            {aiEnabled ? 'Alertas da IA' : 'Encaminhamentos'}
            {unreadCount > 0 && (
              <span style={{
                marginLeft: 8, background: '#DC2626', color: '#fff',
                borderRadius: 20, fontSize: 11, fontWeight: 700,
                padding: '2px 8px', verticalAlign: 'middle',
              }}>
                {unreadCount} novo{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {loading
              ? 'Carregando...'
              : aiEnabled
                ? 'Avisos enviados pelo agente de IA'
                : 'Conversas encaminhadas por outros atendentes'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
            color: realtimeStatus === 'connected' ? '#16A34A' : realtimeStatus === 'error' ? '#DC2626' : '#9CA3AF',
            background: realtimeStatus === 'connected' ? '#F0FDF4' : realtimeStatus === 'error' ? '#FEF2F2' : '#F9FAFB',
            border: `1px solid ${realtimeStatus === 'connected' ? '#BBF7D0' : realtimeStatus === 'error' ? '#FECACA' : '#E5E7EB'}`,
            borderRadius: 20, padding: '4px 10px',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: realtimeStatus === 'connected' ? '#16A34A' : realtimeStatus === 'error' ? '#DC2626' : '#9CA3AF',
              boxShadow: realtimeStatus === 'connected' ? '0 0 0 2px #BBF7D0' : 'none',
              display: 'inline-block',
              animation: realtimeStatus === 'connected' ? 'pulse-dot 2s infinite' : 'none',
            }} />
            {realtimeStatus === 'connected' ? 'Ao vivo' : realtimeStatus === 'error' ? 'Erro de conexão' : 'Conectando...'}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'pending', 'resolved'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? 'nx-btn-primary' : 'nx-btn-ghost'}
                style={{ fontSize: 12, padding: '7px 14px' }}
              >
                {f === 'all' ? `Todos (${visible.length})` : f === 'pending' ? `Pendentes (${pending})` : `Resolvidos (${resolved})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!audioEnabled && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#FFFBEB', border: '1px solid #FDE68A',
          borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400E' }}>
            <BellRing size={15} />
            Ative o som para ser notificado quando chegar um novo alerta.
          </div>
          <button className="nx-btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={enableAudio}>
            Ativar som
          </button>
        </div>
      )}

      {!instance && (
        <div className="nx-card" style={{ padding: '2rem', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          Instância não configurada para esta empresa.
        </div>
      )}

      {!loading && instance && filtered.length === 0 && (
        <div className="nx-card" style={{
          padding: '3rem', textAlign: 'center', color: 'var(--text-muted)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <BellRing size={28} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>
            Nenhum alerta {filter === 'pending' ? 'pendente' : filter === 'resolved' ? 'resolvido' : ''} encontrado.
          </div>
        </div>
      )}

      {filtered.map(alert => {
        const isForMe = alert.forwarded_to_user_id === currentUser?.id
        const isForwarded = !!alert.forwarded_to_user_id

        return (
          <div key={alert.id} className={`alert-card ${alert.resolved ? 'resolved' : 'unresolved'}`}
            style={{ borderLeft: isForMe ? '3px solid #7C3AED' : undefined }}
          >
            <div className="alert-icon" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', alignSelf: 'flex-start' }}>
              <BellRing size={16} style={{ color: '#D97706' }} />
            </div>

            <div className="alert-body">
              {/* Badge encaminhado */}
              {isForwarded && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600,
                  color: isForMe ? '#7C3AED' : '#6B7280',
                  background: isForMe ? '#F5F3FF' : '#F9FAFB',
                  border: `1px solid ${isForMe ? '#DDD6FE' : '#E5E7EB'}`,
                  borderRadius: 20, padding: '2px 8px', marginBottom: 6,
                }}>
                  <Forward size={10} />
                  {isForMe
                    ? `Encaminhado para você por ${alert.forwarded_by_name}`
                    : `Encaminhado para ${alert.forwarded_to_name}`
                  }
                </div>
              )}

              {(alert.nome || alert.numero) && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                  background: '#F8FAFC', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '6px 10px', marginBottom: 8,
                  fontSize: 12,
                }}>
                  {alert.nome && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-primary)', fontWeight: 600 }}>
                      <User size={12} style={{ color: '#6B7280' }} />
                      {alert.nome}
                    </span>
                  )}
                  {alert.numero && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      <Phone size={12} style={{ color: '#6B7280' }} />
                      {alert.numero.replace(/@.*$/, '')}
                      <button
                        onClick={() => copyNumber(alert.id, alert.numero)}
                        title="Copiar número"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          background: copiedId === alert.id ? '#F0FDF4' : 'transparent',
                          border: `1px solid ${copiedId === alert.id ? '#BBF7D0' : 'var(--border)'}`,
                          color: copiedId === alert.id ? '#16A34A' : '#6B7280',
                          borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={10} />
                        {copiedId === alert.id ? 'Copiado' : 'Copiar'}
                      </button>
                    </span>
                  )}
                </div>
              )}

              <div className="alert-msg" style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {alert.mensagem}
              </div>
              <div className="alert-footer">
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} /> {formatTime(alert.created_at)}
                </span>
                {alert.numero && (
                  <>
                    <a
                      href={`https://wa.me/${alert.numero.replace(/@.*$/, '').replace(/\D/g, '')}`}
                      target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#16A34A', fontWeight: 500, textDecoration: 'none' }}
                    >
                      <MessageCircle size={11} /> WhatsApp
                    </a>
                    {session?.company?.digisac_url && (
                      <a
                        href={session.company.digisac_url}
                        target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#7C3AED', fontWeight: 500, textDecoration: 'none' }}
                      >
                        <MessageCircle size={11} /> Digisac
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              {alert.resolved ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#16A34A' }}>
                  <CheckCircle2 size={14} /> Resolvido
                </span>
              ) : (
                <>
                  <button
                    className="nx-btn-primary"
                    style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => resolve(alert.id)}
                  >
                    <CheckCircle2 size={13} /> Marcar resolvido
                  </button>
                  {companyUsers.length > 1 && (
                    <button
                      className="nx-btn-ghost"
                      style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => { setForwardAlert(alert); setForwardTarget('') }}
                    >
                      <Forward size={13} /> Encaminhar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* Modal encaminhar */}
      {forwardAlert && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Encaminhar alerta</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Selecione quem deve receber este aviso</div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                onClick={() => setForwardAlert(null)}><X size={16} /></button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {companyUsers.filter(u => u.id !== currentUser?.id).map(u => (
                <label key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${forwardTarget === u.id ? '#2563EB' : 'var(--border)'}`,
                  background: forwardTarget === u.id ? '#EFF6FF' : 'var(--bg-surface)',
                  transition: 'all 0.15s',
                }}>
                  <input type="radio" style={{ display: 'none' }} value={u.id}
                    checked={forwardTarget === u.id}
                    onChange={() => setForwardTarget(u.id)} />
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: '#EFF6FF', border: '1px solid #BFDBFE',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#2563EB', flexShrink: 0,
                  }}>{u.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setForwardAlert(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: forwardTarget ? 1 : 0.5 }}
                onClick={handleForward} disabled={!forwardTarget || forwarding}>
                <Forward size={13} /> {forwarding ? 'Enviando...' : 'Encaminhar'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
