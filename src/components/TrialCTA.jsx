import { useEffect, useState } from 'react'

const WA_URL = 'https://wa.me/556999300101?text=Ol%C3%A1!%20Quero%20testar%20o%20NexSac%20gratuitamente%20por%2014%20dias!'

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

export default function TrialCTA({ compact = false }) {
  const [hovered, setHovered] = useState(false)
  const [glow, setGlow] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setGlow(v => !v), 2800)
    return () => clearInterval(id)
  }, [])

  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + 14)
  const expiryStr = expiryDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

  return (
    <>
      <style>{`
        @keyframes trialGlow {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.08); }
        }
        @keyframes trialEnter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div
        onClick={() => window.open(WA_URL, '_blank')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: compact ? 16 : 20,
          background: '#0B0A14',
          border: `1px solid ${hovered ? 'rgba(8,145,178,0.35)' : 'rgba(255,255,255,0.07)'}`,
          padding: compact ? '18px 20px' : '26px 28px',
          cursor: 'pointer',
          transition: 'border-color 0.25s, box-shadow 0.25s',
          boxShadow: hovered
            ? '0 0 0 1px rgba(8,145,178,0.2), 0 12px 32px -8px rgba(8,145,178,0.25)'
            : '0 4px 16px -8px rgba(0,0,0,0.6)',
          animation: 'trialEnter 0.5s ease-out both',
        }}
      >
        {/* Aurora glows */}
        <div style={{
          position: 'absolute', top: -80, right: -60,
          width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(8,145,178,0.35) 0%, transparent 70%)',
          transition: 'opacity 0.6s',
          opacity: glow ? 0.9 : 0.5,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -70, left: -50,
          width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)',
          transition: 'opacity 0.6s',
          opacity: glow ? 0.6 : 0.3,
          pointerEvents: 'none',
        }} />

        {/* Grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          pointerEvents: 'none',
        }} />

        {/* Top badge */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 999,
          padding: '3px 9px',
          fontSize: 9, fontWeight: 800,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
        }}>
          <span style={{
            display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
            background: '#25D366',
            boxShadow: '0 0 6px #25D366',
            animation: 'trialGlow 2s ease-in-out infinite',
          }} />
          Sem cartão de crédito
        </div>

        {/* Main content */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18 }}>

          {/* Counter block */}
          <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 56 }}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', 'DM Sans', sans-serif",
              fontSize: compact ? 44 : 52,
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1,
              letterSpacing: '-0.04em',
              textShadow: '0 0 32px rgba(8,145,178,0.6)',
              transition: 'text-shadow 0.4s',
            }}>
              14
            </div>
            <div style={{
              fontSize: 8, fontWeight: 800,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.35)',
              marginTop: 3,
            }}>
              DIAS
            </div>
          </div>

          {/* Vertical divider */}
          <div style={{
            width: 1, height: 52,
            background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.1) 40%, rgba(255,255,255,0.1) 60%, transparent)',
            flexShrink: 0,
          }} />

          {/* Text + CTA */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', 'DM Sans', sans-serif",
              fontSize: compact ? 14 : 15.5,
              fontWeight: 700,
              color: '#fff',
              lineHeight: 1.2,
              marginBottom: 5,
              letterSpacing: '-0.01em',
            }}>
              Teste grátis o NexSac.
            </div>
            <div style={{
              fontSize: 11.5,
              color: 'rgba(255,255,255,0.42)',
              lineHeight: 1.45,
              marginBottom: 14,
            }}>
              IA · Agenda · Atendimento · Kanban liberados até <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{expiryStr}</strong>
            </div>

            <button
              onClick={e => { e.stopPropagation(); window.open(WA_URL, '_blank') }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: hovered
                  ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)'
                  : 'linear-gradient(135deg, #25D366 0%, #1DAA54 100%)',
                color: '#fff', border: 'none',
                borderRadius: 10, padding: '8px 16px',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.01em',
                boxShadow: hovered
                  ? '0 6px 20px -4px rgba(37,211,102,0.6)'
                  : '0 4px 14px -4px rgba(37,211,102,0.45)',
                transition: 'all 0.2s',
                transform: hovered ? 'translateY(-1px)' : 'none',
              }}
            >
              <WhatsAppIcon />
              Começar pelo WhatsApp →
            </button>
          </div>
        </div>

        {/* Bottom caption */}
        <div style={{
          position: 'relative',
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 16,
          fontSize: 10.5, color: 'rgba(255,255,255,0.28)',
          fontWeight: 500,
        }}>
          {['Cancele quando quiser', 'Suporte humano incluído', 'Dados 100% seguros'].map((txt, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#0891B2', fontSize: 11 }}>✓</span> {txt}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
