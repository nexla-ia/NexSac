import { Calendar, AlertTriangle, AlertOctagon, Phone } from 'lucide-react'
import { computeBillingStatus, BILLING_STATUS, fmtDateBR, fmtMoney } from '../lib/billing'

const WHATSAPP_LINK = 'https://wa.me/5561999999999?text=Ol%C3%A1!%20Quero%20pagar%20a%20mensalidade%20da%20NexSac.'

export default function BillingBanner({ company }) {
  const { status, dueDate, daysUntilDue, daysOverdue, graceDays } = computeBillingStatus(company)

  if (status === BILLING_STATUS.OK || status === BILLING_STATUS.NO_CONFIG || status === BILLING_STATUS.BLOCKED) {
    return null
  }

  const amount = company?.billing_amount

  const config = {
    [BILLING_STATUS.DUE_SOON]: {
      icon: Calendar,
      bg: 'linear-gradient(90deg, #FEF3C7 0%, #FFFBEB 100%)',
      color: '#92400E',
      border: '#FDE68A',
      title: `Sua mensalidade vence em ${daysUntilDue} ${daysUntilDue === 1 ? 'dia' : 'dias'} (${fmtDateBR(dueDate)})`,
      sub: amount
        ? `Valor: ${fmtMoney(amount)}. Garante a continuidade do serviço pagando antes do vencimento.`
        : 'Garanta a continuidade do serviço pagando antes do vencimento.',
    },
    [BILLING_STATUS.DUE_TODAY]: {
      icon: AlertTriangle,
      bg: 'linear-gradient(90deg, #FED7AA 0%, #FFEDD5 100%)',
      color: '#9A3412',
      border: '#FDBA74',
      title: `Sua mensalidade vence HOJE (${fmtDateBR(dueDate)})`,
      sub: amount ? `Valor: ${fmtMoney(amount)}. Pague hoje pra evitar atraso.` : 'Pague hoje pra evitar atraso.',
    },
    [BILLING_STATUS.OVERDUE]: {
      icon: AlertOctagon,
      bg: 'linear-gradient(90deg, #FECACA 0%, #FEE2E2 100%)',
      color: '#991B1B',
      border: '#FCA5A5',
      title: `Sua mensalidade está atrasada há ${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'}`,
      sub: `Você tem ${graceDays - daysOverdue + 1} ${(graceDays - daysOverdue + 1) === 1 ? 'dia' : 'dias'} pra regularizar antes do bloqueio. Vencimento: ${fmtDateBR(dueDate)}${amount ? ` · Valor: ${fmtMoney(amount)}` : ''}.`,
    },
  }

  const c = config[status]
  if (!c) return null
  const Icon = c.icon

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 10,
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      margin: '12px 16px 0',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'rgba(255, 255, 255, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: c.color, flexShrink: 0,
      }}>
        <Icon size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: c.color, lineHeight: 1.4 }}>
          {c.title}
        </div>
        <div style={{ fontSize: 12, color: c.color, opacity: 0.85, marginTop: 2, lineHeight: 1.5 }}>
          {c.sub}
        </div>
      </div>
      <a
        href={WHATSAPP_LINK}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8,
          background: c.color, color: '#fff',
          fontSize: 12, fontWeight: 700, textDecoration: 'none',
          flexShrink: 0,
          fontFamily: 'inherit',
        }}>
        <Phone size={13} /> Falar com o time
      </a>
    </div>
  )
}
