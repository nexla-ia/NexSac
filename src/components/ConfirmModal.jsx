import { createPortal } from 'react-dom'
import { X, AlertTriangle, Trash2, Info } from 'lucide-react'

const VARIANTS = {
  danger:  { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', Icon: AlertTriangle },
  warning: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', Icon: AlertTriangle },
  info:    { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', Icon: Info },
  delete:  { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', Icon: Trash2 },
}

export default function ConfirmModal({
  open,
  title = 'Confirmar ação',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null
  const v = VARIANTS[variant] || VARIANTS.danger
  const Icon = v.Icon

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100000, backdropFilter: 'blur(4px)', padding: '1.5rem',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onCancel}
    >
      <div
        className="nx-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          animation: 'scaleIn 0.18s ease-out',
        }}
      >
        <div style={{ padding: '1.4rem 1.5rem 0.6rem', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: v.bg, border: `1px solid ${v.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={20} style={{ color: v.color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {title}
            </div>
            {message && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                {message}
              </div>
            )}
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="nx-btn-ghost" style={{ minWidth: 100 }} onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              minWidth: 110, justifyContent: 'center',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: v.color, color: '#fff', border: 'none',
              borderRadius: 8, padding: '9px 16px',
              fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1,
              boxShadow: `0 1px 4px ${v.color}40`,
            }}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.94) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>,
    document.body
  )
}
