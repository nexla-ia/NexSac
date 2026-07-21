import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const DURATION = 6000

function stripSuffix(val) {
  return (val || '').replace(/@.*$/, '')
}

function getContent(row) {
  return (row.mensagem || '').replace(/^\*[^*]+\*:\n/, '').trim()
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avatarColor(str) {
  const palette = ['#0891B2', '#7C3AED', '#DB2777', '#16A34A', '#D97706', '#2563EB', '#DC2626']
  let h = 0
  for (let i = 0; i < (str || '').length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

function WaIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function SingleToast({ toast, onDismiss }) {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(100)
  const [leaving, setLeaving] = useState(false)
  const rafRef = useRef()
  const startRef = useRef(Date.now())
  const dismissedRef = useRef(false)

  useEffect(() => {
    function tick() {
      const elapsed = Date.now() - startRef.current
      const p = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setProgress(p)
      if (p > 0) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        dismiss()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  function dismiss() {
    if (dismissedRef.current) return
    dismissedRef.current = true
    cancelAnimationFrame(rafRef.current)
    setLeaving(true)
    setTimeout(() => onDismiss(toast.id), 420)
  }

  function handleView(e) {
    e.stopPropagation()
    dismiss()
    navigate('/painel/conversas')
  }

  const phone = stripSuffix(toast.numero)
  const displayName = toast.nome || phone
  const initials = getInitials(toast.nome || null)
  const color = avatarColor(toast.numero)

  return (
    <div
      onClick={handleView}
      style={{
        width: 360,
        borderRadius: 20,
        overflow: 'hidden',
        background: 'rgba(11, 10, 20, 0.94)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: [
          '0 32px 64px -16px rgba(0,0,0,0.85)',
          '0 8px 24px -8px rgba(0,0,0,0.6)',
          'inset 0 1px 0 rgba(255,255,255,0.06)',
        ].join(', '),
        animation: leaving
          ? 'toastLeave 0.42s cubic-bezier(0.4,0,1,1) forwards'
          : 'toastEnter 0.52s cubic-bezier(0.16,1,0.3,1) forwards',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {/* WhatsApp green left stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: 'linear-gradient(180deg, #25D366 0%, #0D9E57 100%)',
        zIndex: 2,
      }} />

      {/* Subtle glow behind avatar */}
      <div style={{
        position: 'absolute',
        top: -20, left: 10,
        width: 80, height: 80,
        borderRadius: '50%',
        background: color,
        opacity: 0.08,
        filter: 'blur(20px)',
        pointerEvents: 'none',
      }} />

      <div style={{ padding: '14px 13px 11px 18px', position: 'relative' }}>
        {/* Header: avatar + info + dismiss */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `linear-gradient(135deg, ${color}, ${color}cc)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: '#fff',
            flexShrink: 0, letterSpacing: '-0.01em',
            boxShadow: `0 4px 14px -4px ${color}70`,
          }}>
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13.5, fontWeight: 700,
              color: 'rgba(255,255,255,0.95)',
              letterSpacing: '-0.015em', lineHeight: 1.1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: 3,
            }}>
              {displayName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <WaIcon />
              <span style={{
                fontSize: 10.5, color: 'rgba(255,255,255,0.38)',
                fontWeight: 600, letterSpacing: '0.01em',
              }}>
                Nova mensagem
              </span>
            </div>
          </div>

          <button
            onClick={e => { e.stopPropagation(); dismiss() }}
            style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.4)', flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.13)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
            }}
          >
            <X size={11} />
          </button>
        </div>

        {/* Message preview */}
        <p style={{
          margin: '0 0 11px 0',
          fontSize: 13,
          color: 'rgba(255,255,255,0.62)',
          lineHeight: 1.52,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          paddingLeft: 1,
          fontWeight: 400,
        }}>
          {toast.content || '📎 Mídia recebida'}
        </p>

        {/* Footer: action button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleView}
            style={{
              background: 'linear-gradient(135deg, #0891B2 0%, #0E7490 100%)',
              border: 'none',
              borderRadius: 10,
              padding: '5px 14px',
              fontSize: 11, fontWeight: 700,
              color: '#fff', cursor: 'pointer',
              letterSpacing: '0.02em',
              boxShadow: '0 4px 14px -4px rgba(8,145,178,0.55)',
              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 6px 18px -4px rgba(8,145,178,0.65)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = '0 4px 14px -4px rgba(8,145,178,0.55)'
            }}
          >
            Ver conversa →
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #25D366, #0891B2, #7C3AED)',
          backgroundSize: '200% 100%',
          transition: 'width 0.1s linear',
        }} />
      </div>
    </div>
  )
}

function getMutedGroups(instance) {
  try { return JSON.parse(localStorage.getItem(`muted_groups_${instance}`) || '[]') } catch { return [] }
}

export function MessageToastContainer({ instance }) {
  const location = useLocation()
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    if (!instance) return

    const ch = supabase.channel(`msg-toasts-${instance}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens_geral',
        filter: `instancia=eq.${instance}`,
      }, async (payload) => {
        const row = payload.new
        const type = (row.type || 'human').toLowerCase()
        if (type !== 'cliente') return

        // Ignora grupos silenciados
        if (row.idgrupo && getMutedGroups(instance).includes(row.idgrupo)) return

        const content = getContent(row)
        const phone = stripSuffix(row.numero || '')

        let nome = null
        try {
          const { data } = await supabase
            .from('saved_contacts')
            .select('nome')
            .eq('instancia', instance)
            .eq('numero', phone)
            .maybeSingle()
          if (data?.nome) nome = data.nome
        } catch { /* nome stays null, phone shown as fallback */ }

        const toast = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          numero: row.numero,
          nome,
          content: content || null,
        }

        setToasts(prev => [toast, ...prev].slice(0, 3))
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [instance])

  const onConversations = location.pathname.startsWith('/painel/conversas')
  if (onConversations || toasts.length === 0) return null

  return createPortal(
    <>
      <style>{`
        @keyframes toastEnter {
          from { opacity: 0; transform: translateX(calc(100% + 32px)) scale(0.94); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toastLeave {
          from { opacity: 1; transform: translateX(0) scale(1);    max-height: 200px; }
          to   { opacity: 0; transform: translateX(calc(100% + 32px)) scale(0.94); max-height: 0; }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <SingleToast toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </>,
    document.body
  )
}
