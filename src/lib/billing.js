// ────────────────────────────────────────────────────────────────────────────
// Billing — compute status da mensalidade da empresa
//
// Cada empresa tem:
//   billing_day            — dia do mês de vencimento
//   next_due_date          — próximo vencimento (avança ao marcar pago)
//   billing_amount         — valor mensal
//   billing_grace_days     — dias de carência após vencimento (default 1)
//   billing_reminder_days  — dias antes do vencimento que mostra aviso (default 3)
//   billing_blocked        — bloqueio manual
//
// Status derivado em runtime:
//   ok          — pago, sem alerta
//   due_soon    — vencimento próximo (dentro do reminder window)
//   due_today   — hoje é o dia do vencimento
//   overdue     — passou do vencimento, dentro da carência
//   blocked     — passou da carência ou bloqueio manual
//   no_config   — billing não configurado pelo ADM ainda
// ────────────────────────────────────────────────────────────────────────────

export const BILLING_STATUS = {
  OK:        'ok',
  DUE_SOON:  'due_soon',
  DUE_TODAY: 'due_today',
  OVERDUE:   'overdue',
  BLOCKED:   'blocked',
  NO_CONFIG: 'no_config',
}

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseDate(val) {
  if (!val) return null
  if (val instanceof Date) return startOfDay(val)
  // YYYY-MM-DD ou ISO
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return startOfDay(d)
}

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export function computeBillingStatus(company) {
  if (!company) return { status: BILLING_STATUS.NO_CONFIG }

  // Bloqueio manual ganha de tudo
  if (company.billing_blocked) {
    return { status: BILLING_STATUS.BLOCKED, reason: 'manual' }
  }

  // Sem configuração de billing — não mostra nada
  if (!company.next_due_date && !company.billing_day) {
    return { status: BILLING_STATUS.NO_CONFIG }
  }

  const today = startOfDay()
  const dueDate = parseDate(company.next_due_date)
  if (!dueDate) return { status: BILLING_STATUS.NO_CONFIG }

  const reminderDays = Number(company.billing_reminder_days ?? 3)
  const graceDays = Number(company.billing_grace_days ?? 1)

  const daysUntilDue = daysBetween(dueDate, today)

  // Próximo vencimento ainda longe
  if (daysUntilDue > reminderDays) {
    return { status: BILLING_STATUS.OK, dueDate, daysUntilDue }
  }

  // Dentro do reminder window
  if (daysUntilDue > 0) {
    return { status: BILLING_STATUS.DUE_SOON, dueDate, daysUntilDue }
  }

  if (daysUntilDue === 0) {
    return { status: BILLING_STATUS.DUE_TODAY, dueDate, daysUntilDue: 0 }
  }

  // Em atraso
  const daysOverdue = -daysUntilDue
  if (daysOverdue <= graceDays) {
    return { status: BILLING_STATUS.OVERDUE, dueDate, daysOverdue, graceDays }
  }
  return { status: BILLING_STATUS.BLOCKED, dueDate, daysOverdue, reason: 'overdue' }
}

export function shouldBlockAccess(company) {
  return computeBillingStatus(company).status === BILLING_STATUS.BLOCKED
}

export function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtDateBR(d) {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Pra ADM: badge de status com cor
export function statusBadge(status) {
  switch (status) {
    case BILLING_STATUS.OK:        return { label: 'Em dia',     bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' }
    case BILLING_STATUS.DUE_SOON:  return { label: 'Vence em breve', bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' }
    case BILLING_STATUS.DUE_TODAY: return { label: 'Vence hoje', bg: '#FED7AA', color: '#C2410C', border: '#FDBA74' }
    case BILLING_STATUS.OVERDUE:   return { label: 'Atrasada',   bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' }
    case BILLING_STATUS.BLOCKED:   return { label: 'Bloqueada',  bg: '#1E293B', color: '#FFF',     border: '#0F172A' }
    case BILLING_STATUS.NO_CONFIG: return { label: 'Sem cobrança', bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' }
    default:                       return { label: '—', bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' }
  }
}
