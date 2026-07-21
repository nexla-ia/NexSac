import { Lock, Phone, LogOut } from 'lucide-react'
import { fmtMoney, fmtDateBR } from '../lib/billing'
import BrandMark from './BrandMark'

const WHATSAPP_LINK = 'https://wa.me/5561999999999?text=Ol%C3%A1!%20Minha%20conta%20NexSac%20foi%20bloqueada%20por%20pagamento%20em%20atraso.%20Quero%20regularizar.'

export default function BlockedScreen({ company, onLogout }) {
  const amount = company?.billing_amount
  const dueDate = company?.next_due_date

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: '#fff',
      padding: '2rem',
    }}>
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        padding: '20px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark size={28} color="#C9A074" strokeWidth={1.6} />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#C9A074' }}>Clini<span style={{ color: '#60A5FA' }}>Sac</span></span>
        </div>
        {onLogout && (
          <button onClick={onLogout} style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.7)',
            padding: '8px 14px', borderRadius: 8,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit',
          }}>
            <LogOut size={13} /> Sair
          </button>
        )}
      </div>

      <div style={{
        maxWidth: 520, width: '100%', textAlign: 'center',
      }}>
        <div style={{
          width: 76, height: 76, borderRadius: '50%',
          background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 12px 32px rgba(220, 38, 38, 0.3)',
        }}>
          <Lock size={32} />
        </div>

        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 30, fontWeight: 700,
          margin: '0 0 12px',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}>
          Sua conta está temporariamente bloqueada
        </h1>

        <p style={{
          fontSize: 15.5, color: 'rgba(255, 255, 255, 0.72)',
          lineHeight: 1.65, margin: '0 0 28px',
        }}>
          A mensalidade da <strong style={{ color: '#fff' }}>{company?.name || 'sua empresa'}</strong> está em
          atraso e o período de carência expirou. Pra retomar o acesso, é só regularizar o pagamento.
        </p>

        {(amount || dueDate) && (
          <div style={{
            display: 'inline-flex',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            padding: '14px 22px',
            gap: 28,
            marginBottom: 28,
          }}>
            {amount && (
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Valor</div>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmtMoney(amount)}</div>
              </div>
            )}
            {dueDate && (
              <div style={{ textAlign: 'left', borderLeft: amount ? '1px solid rgba(255, 255, 255, 0.1)' : 'none', paddingLeft: amount ? 28 : 0 }}>
                <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Vencimento</div>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmtDateBR(dueDate)}</div>
              </div>
            )}
          </div>
        )}

        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '14px 28px', borderRadius: 12,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            color: '#fff', fontSize: 15, fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(22, 163, 74, 0.3)',
            transition: 'transform 0.15s',
            fontFamily: 'inherit',
          }}>
          <Phone size={17} /> Regularizar agora pelo WhatsApp
        </a>

        <p style={{
          marginTop: 24, fontSize: 12,
          color: 'rgba(255, 255, 255, 0.4)',
        }}>
          Seus dados continuam seguros. Acesso liberado automaticamente após pagamento.
        </p>
      </div>
    </div>
  )
}
