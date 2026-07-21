import { createPortal } from 'react-dom'
import { Lock, X, ArrowRight, Sparkles } from 'lucide-react'

const WHATSAPP_LINK = 'https://wa.me/5561999999999?text=Ol%C3%A1!%20Quero%20liberar%20mais%20recursos%20no%20meu%20plano%20NexSac.'

export default function LimitReachedModal({ open, title, body, cta, onClose, planName }) {
  if (!open) return null
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, backdropFilter: 'blur(6px)', padding: '1.5rem',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: '#fff',
          borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
        {/* Header colorido */}
        <div style={{
          padding: '24px 28px 20px',
          background: 'linear-gradient(135deg, #C9A074 0%, #B8895C 100%)',
          color: '#fff',
          position: 'relative',
        }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(255, 255, 255, 0.2)', border: 'none',
            color: '#fff', width: 26, height: 26, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}><X size={14} /></button>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Lock size={20} />
          </div>
          <div style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em',
            lineHeight: 1.3,
          }}>
            {title}
          </div>
          {planName && (
            <div style={{
              fontSize: 11, fontWeight: 600, marginTop: 6,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'rgba(255, 255, 255, 0.85)',
            }}>
              Plano atual: {planName}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px 8px' }}>
          <p style={{
            margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.65,
          }}>
            {body}
          </p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 28px 24px',
          display: 'flex', gap: 10, flexDirection: 'column',
        }}>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '11px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
              color: '#fff', fontWeight: 700, fontSize: 13.5,
              textDecoration: 'none', cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(22, 163, 74, 0.25)',
            }}>
            <Sparkles size={15} /> {cta || 'Falar com o time'}
            <ArrowRight size={15} />
          </a>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: '#94A3B8', fontSize: 12.5, cursor: 'pointer',
              padding: '6px', fontFamily: 'inherit', fontWeight: 500,
            }}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
