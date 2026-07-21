import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { computeBillingStatus, statusBadge, BILLING_STATUS, fmtMoney, fmtDateBR } from '../../lib/billing'
import { CircleDollarSign, CheckCircle2, Calendar, Lock, Unlock, Plus, RefreshCw } from 'lucide-react'

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

export default function AdmCompanyBilling({ company, onUpdate }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [paying, setPaying] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('pix')

  const status = computeBillingStatus(company)
  const badge = statusBadge(status.status)

  useEffect(() => {
    if (!company?.id) return
    supabase.from('invoices')
      .select('*')
      .eq('company_id', company.id)
      .order('due_date', { ascending: false })
      .limit(12)
      .then(({ data }) => { setInvoices(data || []); setLoading(false) })
  }, [company?.id])

  function startEdit() {
    setForm({
      billing_day:           company.billing_day ?? '',
      billing_amount:        company.billing_amount ?? '',
      billing_grace_days:    company.billing_grace_days ?? 1,
      billing_reminder_days: company.billing_reminder_days ?? 3,
      next_due_date:         company.next_due_date ?? '',
    })
    setErr(''); setEditing(true)
  }

  async function handleSave() {
    setSaving(true); setErr('')
    const updates = {
      billing_day:           form.billing_day === '' ? null : parseInt(form.billing_day),
      billing_amount:        form.billing_amount === '' ? null : parseFloat(form.billing_amount),
      billing_grace_days:    parseInt(form.billing_grace_days) || 1,
      billing_reminder_days: parseInt(form.billing_reminder_days) || 3,
      next_due_date:         form.next_due_date || null,
    }
    const { error } = await supabase.from('companies').update(updates).eq('id', company.id)
    setSaving(false)
    if (error) { setErr('Erro: ' + error.message); return }
    setEditing(false)
    onUpdate?.()
  }

  async function handleMarkPaid() {
    setSaving(true); setErr('')
    const amount = payAmount ? parseFloat(payAmount) : null
    const { data, error } = await supabase.rpc('mark_company_paid', {
      p_company_id: company.id,
      p_amount: amount,
      p_payment_method: payMethod,
      p_notes: null,
    })
    setSaving(false)
    if (error) { setErr('Erro: ' + error.message + ' — confirme que rodou supabase/migrations/20260429_billing.sql.'); return }
    if (data && data.ok === false) { setErr(data.error); return }
    setPaying(false)
    setPayAmount('')
    // Recarrega invoices + refresh state
    const { data: inv } = await supabase.from('invoices').select('*').eq('company_id', company.id).order('due_date', { ascending: false }).limit(12)
    setInvoices(inv || [])
    onUpdate?.()
  }

  async function toggleBlock() {
    setSaving(true)
    const { error } = await supabase.from('companies')
      .update({ billing_blocked: !company.billing_blocked })
      .eq('id', company.id)
    setSaving(false)
    if (error) { setErr('Erro: ' + error.message); return }
    onUpdate?.()
  }

  return (
    <div style={{ marginTop: 0 }}>
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="section-title">
          <CircleDollarSign size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Financeiro / Mensalidade
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!company.billing_blocked && (
            <button className="nx-btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => { setPayAmount(company.billing_amount || ''); setPaying(true) }}>
              <CheckCircle2 size={13} /> Marcar como pago
            </button>
          )}
          <button className={company.billing_blocked ? 'nx-btn-primary' : 'nx-btn-ghost'}
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={toggleBlock} disabled={saving}>
            {company.billing_blocked ? <><Unlock size={13} /> Desbloquear</> : <><Lock size={13} /> Bloquear acesso</>}
          </button>
          <button className="nx-btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={startEdit}>
            Editar config
          </button>
        </div>
      </div>

      {/* Status atual */}
      <div className="nx-card" style={{ padding: '18px 20px', marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <BillStat
          label="Status"
          value={
            <span className="nx-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
              {badge.label}
            </span>
          }
        />
        <BillStat label="Próximo vencimento" value={company.next_due_date ? fmtDateBR(company.next_due_date) : '—'} />
        <BillStat label="Valor mensal"        value={company.billing_amount ? fmtMoney(company.billing_amount) : '—'} />
        <BillStat label="Dia do mês"          value={company.billing_day || '—'} />
        <BillStat label="Aviso prévio"        value={`${company.billing_reminder_days ?? 3} ${(company.billing_reminder_days ?? 3) === 1 ? 'dia' : 'dias'}`} />
        <BillStat label="Carência após venc." value={`${company.billing_grace_days ?? 1} ${(company.billing_grace_days ?? 1) === 1 ? 'dia' : 'dias'}`} />
      </div>

      {/* Status detail caso atrasado */}
      {(status.status === BILLING_STATUS.OVERDUE || status.status === BILLING_STATUS.BLOCKED) && status.daysOverdue && (
        <div style={{
          background: '#FEE2E2', border: '1px solid #FECACA',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          fontSize: 12, color: '#991B1B', fontWeight: 600,
        }}>
          {status.status === BILLING_STATUS.BLOCKED
            ? `🔒 Acesso bloqueado — atrasado há ${status.daysOverdue} dias.`
            : `⚠️ Atrasado há ${status.daysOverdue} dia${status.daysOverdue === 1 ? '' : 's'} (carência ${status.graceDays}d). Será bloqueado em breve.`}
        </div>
      )}

      {/* Histórico de invoices */}
      <div className="nx-card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
          Histórico de pagamentos
        </div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : !invoices.length ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Sem registros de pagamento ainda.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Vencimento</th>
                <th>Pago em</th>
                <th>Valor</th>
                <th>Método</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{fmtDateBR(inv.due_date)}</td>
                  <td>{inv.paid_at ? fmtDateBR(inv.paid_at) : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMoney(inv.amount)}</td>
                  <td style={{ textTransform: 'uppercase', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em' }}>{inv.payment_method || '—'}</td>
                  <td>
                    {inv.paid_at ? (
                      <span className="nx-badge nx-badge-green">Pago</span>
                    ) : (
                      <span className="nx-badge nx-badge-red">Pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: marcar pago */}
      {paying && (
        <BillModal title="Marcar mensalidade como paga" onClose={() => setPaying(false)}>
          <div>
            <label style={labelStyle}>Valor recebido</label>
            <input className="nx-input" type="number" min={0} step="0.01"
              value={payAmount} onChange={e => setPayAmount(e.target.value)}
              placeholder={company.billing_amount ? fmtMoney(company.billing_amount) : ''} />
          </div>
          <div>
            <label style={labelStyle}>Forma de pagamento</label>
            <select className="nx-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="cartao">Cartão</option>
              <option value="transferencia">Transferência</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          {err && <div style={errStyle}>{err}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setPaying(false)}>Cancelar</button>
            <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleMarkPaid} disabled={saving}>
              {saving ? 'Salvando...' : 'Confirmar pagamento'}
            </button>
          </div>
        </BillModal>
      )}

      {/* Modal: editar config */}
      {editing && (
        <BillModal title="Configurar cobrança" onClose={() => setEditing(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Dia do mês</label>
              <input className="nx-input" type="number" min={1} max={31}
                value={form.billing_day} onChange={e => setForm(p => ({ ...p, billing_day: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Valor mensal (R$)</label>
              <input className="nx-input" type="number" min={0} step="0.01"
                value={form.billing_amount} onChange={e => setForm(p => ({ ...p, billing_amount: e.target.value }))} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Próximo vencimento (date)</label>
            <input className="nx-input" type="date"
              value={form.next_due_date} onChange={e => setForm(p => ({ ...p, next_due_date: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Avança automaticamente +1 mês a cada vez que marca como pago.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Aviso prévio (dias antes)</label>
              <input className="nx-input" type="number" min={0} max={30}
                value={form.billing_reminder_days} onChange={e => setForm(p => ({ ...p, billing_reminder_days: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Carência (dias após venc.)</label>
              <input className="nx-input" type="number" min={0} max={30}
                value={form.billing_grace_days} onChange={e => setForm(p => ({ ...p, billing_grace_days: e.target.value }))} />
            </div>
          </div>
          {err && <div style={errStyle}>{err}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancelar</button>
            <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </BillModal>
      )}
    </div>
  )
}

function BillStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
    </div>
  )
}

function BillModal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
    }}>
      <div onClick={e => e.stopPropagation()} className="nx-card"
        style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>
          {title}
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

const errStyle = {
  background: '#FEF2F2', border: '1px solid #FECACA',
  borderRadius: 8, padding: '8px 12px',
  fontSize: 12, color: '#DC2626',
}
