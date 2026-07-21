import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Plus, Building2, ChevronRight, X, RefreshCw, Users, Database, Clock, Zap } from 'lucide-react'
import './Adm.css'

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function generatePassword(companyName) {
  const base = slugify(companyName).slice(0, 6) || 'nexla'
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return base + '@' + suffix
}

const emptyUser = { name: '', email: '', password: '' }

function trialExpiryDate() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d
}
function fmtDateInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDateBR(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

const emptyTrial = { name: '', email: '', password: '', instance: '', apiInstancia: '', historyTable: '', contactsTable: 'clientes' }

export default function AdmCompanies() {
  const { db, addCompany, addUser, toggleCompanyActive, loadDB } = useAuth()
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Trial modal ───────────────────────────────────────────────
  const [showTrial, setShowTrial] = useState(false)
  const [savingTrial, setSavingTrial] = useState(false)
  const [trialError, setTrialError] = useState('')
  const [trialForm, setTrialForm] = useState({ ...emptyTrial })

  function closeTrial() { setShowTrial(false); setTrialError(''); setTrialForm({ ...emptyTrial }) }

  async function handleSaveTrial() {
    setTrialError('')
    if (!trialForm.name.trim())        { setTrialError('Nome da empresa é obrigatório.'); return }
    if (!trialForm.email.trim())       { setTrialError('E-mail do responsável é obrigatório.'); return }
    if (!trialForm.password.trim())    { setTrialError('Senha é obrigatória.'); return }
    if (!trialForm.instance.trim())    { setTrialError('Instância WhatsApp é obrigatória.'); return }
    if (!trialForm.apiInstancia.trim()){ setTrialError('API da instância é obrigatória.'); return }

    setSavingTrial(true)
    try {
      const expiry = trialExpiryDate()
      const slug = trialForm.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'').replace(/[^a-z0-9]/g,'')

      const { data: company, error: compErr } = await supabase
        .from('companies')
        .insert({
          name: trialForm.name.trim(),
          slug,
          plan: 'Trial',
          instance: trialForm.instance.trim(),
          api_instancia: trialForm.apiInstancia.trim(),
          contacts_table: trialForm.contactsTable.trim() || 'clientes',
          history_table: trialForm.historyTable.trim() || null,
          next_due_date: fmtDateInput(expiry),
          billing_grace_days: 0,
          billing_amount: 0,
        })
        .select()
        .single()

      if (compErr || !company) {
        setTrialError('Erro ao criar empresa: ' + (compErr?.message || 'verifique o Supabase.'))
        setSavingTrial(false); return
      }

      const { error: userErr } = await supabase.rpc('create_user', {
        p_name: trialForm.name.trim(),
        p_email: trialForm.email.trim(),
        p_password: trialForm.password,
        p_role: 'admin',
        p_company_id: company.id,
      })

      if (userErr) {
        setTrialError('Empresa criada, mas erro ao criar usuário: ' + userErr.message)
        setSavingTrial(false); return
      }

      if (trialForm.historyTable) await supabase.rpc('ensure_table_setup', { p_table: trialForm.historyTable.trim() })
      if (trialForm.contactsTable) await supabase.rpc('ensure_table_setup', { p_table: trialForm.contactsTable.trim() })

      await loadDB()
      setSavingTrial(false)
      closeTrial()
    } catch (e) {
      setTrialError('Erro inesperado: ' + e.message)
      setSavingTrial(false)
    }
  }
  const [form, setForm] = useState({
    name: '',
    contactsTable: 'clientes',
    historyTable: '',
    instance: '',
    apiInstancia: '',
    numAccess: 1,
    users: [{ ...emptyUser }],
  })

  function handleCompanyName(name) {
    const slug = slugify(name)
    const domain = slug ? `${slug}.com` : ''
    setForm(prev => ({
      ...prev,
      name,
      users: prev.users.map(u => ({
        ...u,
        email: u.name ? `${slugify(u.name)}@${domain}` : (domain ? `acesso@${domain}` : u.email),
      })),
    }))
  }

  function handleNumAccess(val) {
    const n = Math.max(1, Math.min(10, Number(val)))
    const slug = slugify(form.name)
    const domain = slug ? `${slug}.com` : ''
    setForm(prev => {
      const current = prev.users
      let users
      if (n > current.length) {
        users = [...current, ...Array(n - current.length).fill(null).map(() => ({ ...emptyUser }))]
      } else {
        users = current.slice(0, n)
      }
      return { ...prev, numAccess: n, users }
    })
  }

  function handleUserName(idx, name) {
    const slug = slugify(form.name)
    const domain = slug ? `${slug}.com` : ''
    setForm(prev => {
      const users = [...prev.users]
      users[idx] = {
        ...users[idx],
        name,
        email: name && domain ? `${slugify(name)}@${domain}` : users[idx].email,
      }
      return { ...prev, users }
    })
  }

  function handleUserField(idx, field, value) {
    setForm(prev => {
      const users = [...prev.users]
      users[idx] = { ...users[idx], [field]: value }
      return { ...prev, users }
    })
  }

  function genPassword(idx) {
    handleUserField(idx, 'password', generatePassword(form.name || 'nexla'))
  }

  async function handleSave() {
    setSaveError('')
    if (!form.name.trim()) { setSaveError('Informe o nome da empresa.'); return }
    if (!form.contactsTable.trim()) { setSaveError('Informe o nome da tabela de contatos.'); return }
    if (!form.historyTable.trim()) { setSaveError('Informe o nome da tabela de histórico IA.'); return }
    if (!form.instance.trim()) { setSaveError('Informe o nome da instância do WhatsApp.'); return }
    if (form.instance.trim() && !form.apiInstancia.trim()) { setSaveError('Informe a API da instância (obrigatório quando instância é preenchida).'); return }
    if (form.users.some(u => !u.name || !u.email || !u.password)) { setSaveError('Preencha nome, e-mail e senha de todos os acessos.'); return }
    setSaving(true)
    const company = await addCompany({
      name: form.name,
      contactsTable: form.contactsTable,
      historyTable: form.historyTable,
      instance: form.instance,
      apiInstancia: form.apiInstancia,
    })
    if (!company) { setSaveError('Erro ao criar empresa. Verifique as políticas RLS no Supabase.'); setSaving(false); return }
    for (const u of form.users) {
      const result = await addUser(company.id, { name: u.name, email: u.email, password: u.password, role: 'admin' })
      if (!result?.ok) {
        setSaveError(`Erro ao criar acesso para ${u.name}. Verifique se a função create_user existe no Supabase.`)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    setShowModal(false)
    setForm({ name: '', contactsTable: 'clientes', historyTable: '', instance: '', apiInstancia: '', numAccess: 1, users: [{ ...emptyUser }] })
  }

  function closeModal() {
    setShowModal(false)
    setSaveError('')
    setForm({ name: '', contactsTable: 'clientes', historyTable: '', instance: '', apiInstancia: '', numAccess: 1, users: [{ ...emptyUser }] })
  }

  return (
    <div className="page-enter">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Empresas</div>
          <div className="page-sub">{db.companies.length} empresa(s) cadastrada(s)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowTrial(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg, #0891B2 0%, #7C3AED 100%)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px -4px rgba(8,145,178,0.4)',
            }}>
            <Zap size={13} /> Trial Gratuito
          </button>
          <button className="nx-btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Nova empresa
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="nx-card" style={{ overflow: 'hidden' }}>
          {db.companies.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : db.companies.map((c, i) => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px',
              borderBottom: i < db.companies.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', transition: 'background 0.12s',
            }}
              onClick={() => navigate(`/adm/empresas/${c.id}`)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Building2 size={16} style={{ color: '#2563EB' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {(c.users || []).length} acesso(s) · Criada em {new Date(c.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              {c.plan === 'Trial' && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'linear-gradient(135deg, rgba(8,145,178,0.12), rgba(124,58,237,0.12))',
                  border: '1px solid rgba(8,145,178,0.3)',
                  color: '#0891B2', fontSize: 10, fontWeight: 800,
                  padding: '3px 8px', borderRadius: 999,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  <Zap size={9} /> Trial
                </span>
              )}
              <span className={`nx-badge ${c.active ? 'nx-badge-green' : 'nx-badge-red'}`}>{c.active ? 'Ativa' : 'Inativa'}</span>
              <button className="table-action" style={{ flexShrink: 0 }}
                onClick={e => { e.stopPropagation(); toggleCompanyActive(c.id) }}>
                {c.active ? 'Desativar' : 'Ativar'}
              </button>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal Trial ───────────────────────────────────────── */}
      {showTrial && createPortal(
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(9,7,20,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(6px)', padding: '1.5rem',
        }}>
          <div style={{
            width: '100%', maxWidth: 500, maxHeight: 'calc(100vh - 3rem)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            borderRadius: 20,
            background: '#0B0A14',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 64px -16px rgba(0,0,0,0.9)',
          }}>
            {/* Header */}
            <div style={{
              padding: '22px 28px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(8,145,178,0.12) 0%, rgba(124,58,237,0.1) 100%)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(8,145,178,0.15)', border: '1px solid rgba(8,145,178,0.25)',
                  borderRadius: 999, padding: '3px 10px',
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#0891B2', marginBottom: 10,
                }}>
                  <Zap size={9} /> Plano Trial — 14 dias grátis
                </div>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#fff' }}>
                  Cadastrar empresa no trial
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                  Acesso expira em <strong style={{ color: '#0891B2' }}>{fmtDateBR(trialExpiryDate())}</strong>
                </div>
              </div>
              <button
                onClick={closeTrial}
                style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'rgba(255,255,255,0.5)', flexShrink: 0, marginTop: 2 }}>
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Trial info banner */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.2)',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <Clock size={16} style={{ color: '#0891B2', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>
                    14 dias de acesso completo
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                    Após o período, a empresa é bloqueada automaticamente pelo sistema de billing. Sem cobrança durante o trial.
                  </div>
                </div>
              </div>

              {/* Nome da empresa */}
              <div>
                <label style={trialLabelStyle}>Nome da empresa</label>
                <input
                  className="nx-input"
                  placeholder="Ex: Empresa Exemplo Ltda"
                  autoFocus
                  value={trialForm.name}
                  onChange={e => setTrialForm(p => ({ ...p, name: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>

              {/* E-mail + Senha */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={trialLabelStyle}>E-mail do responsável</label>
                  <input
                    className="nx-input" type="email"
                    placeholder="responsavel@empresa.com"
                    value={trialForm.email}
                    onChange={e => setTrialForm(p => ({ ...p, email: e.target.value }))}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={trialLabelStyle}>Senha de acesso</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="nx-input"
                      placeholder="Gere ou defina"
                      value={trialForm.password}
                      onChange={e => setTrialForm(p => ({ ...p, password: e.target.value }))}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    />
                    <button
                      type="button"
                      title="Gerar senha"
                      onClick={() => setTrialForm(p => ({ ...p, password: generatePassword(p.name || 'trial') }))}
                      style={{ flexShrink: 0, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}>
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Instância + API */}
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <Database size={12} style={{ color: '#0891B2' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>WhatsApp / n8n</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={trialLabelStyle}>Instância WhatsApp</label>
                    <input className="nx-input" placeholder="empresa-exemplo"
                      value={trialForm.instance}
                      onChange={e => setTrialForm(p => ({ ...p, instance: e.target.value.trim() }))}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={trialLabelStyle}>API da instância</label>
                    <input className="nx-input" placeholder="Token/chave"
                      value={trialForm.apiInstancia}
                      onChange={e => setTrialForm(p => ({ ...p, apiInstancia: e.target.value.trim() }))}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={trialLabelStyle}>Tabela de contatos</label>
                    <input className="nx-input" placeholder="clientes"
                      value={trialForm.contactsTable}
                      onChange={e => setTrialForm(p => ({ ...p, contactsTable: e.target.value }))}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={trialLabelStyle}>Tabela histórico IA</label>
                    <input className="nx-input" placeholder="historico_empresa"
                      value={trialForm.historyTable}
                      onChange={e => setTrialForm(p => ({ ...p, historyTable: e.target.value }))}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                </div>
              </div>

              {/* Resumo do trial */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
              }}>
                {[
                  { label: 'Plano', value: 'Trial', color: '#0891B2' },
                  { label: 'Duração', value: '14 dias', color: '#7C3AED' },
                  { label: 'Valor', value: 'R$ 0,00', color: '#16A34A' },
                ].map(item => (
                  <div key={item.label} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10, padding: '10px 12px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: item.color, letterSpacing: '-0.02em' }}>{item.value}</div>
                    <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3, fontWeight: 700 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 28px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
              {trialError && (
                <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#FCA5A5', marginBottom: 12 }}>
                  {trialError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={closeTrial}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button
                  onClick={handleSaveTrial}
                  disabled={savingTrial}
                  style={{
                    flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    background: savingTrial ? 'rgba(8,145,178,0.4)' : 'linear-gradient(135deg, #0891B2 0%, #7C3AED 100%)',
                    border: 'none', borderRadius: 8, padding: '10px',
                    fontSize: 13, fontWeight: 700, color: '#fff', cursor: savingTrial ? 'not-allowed' : 'pointer',
                    boxShadow: savingTrial ? 'none' : '0 4px 16px -4px rgba(8,145,178,0.5)',
                  }}>
                  <Zap size={13} />
                  {savingTrial ? 'Criando trial...' : 'Ativar trial gratuito'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {showModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 580, maxHeight: 'calc(100vh - 3rem)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '1.5rem 1.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Nova empresa</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Preencha os dados para cadastrar</div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }} onClick={closeModal}>
                <X size={16} />
              </button>
            </div>

            {/* Body scrollável */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Nome da empresa */}
              <div>
                <label style={labelStyle}>Nome da empresa</label>
                <input className="nx-input" placeholder="Ex: Empresa Exemplo Ltda"
                  value={form.name} onChange={e => handleCompanyName(e.target.value)} autoFocus />
                {form.name && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                    Domínio gerado: <strong style={{ color: '#2563EB' }}>{slugify(form.name)}.com</strong>
                  </div>
                )}
              </div>

              {/* Tabelas n8n */}
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                  <Database size={13} style={{ color: '#2563EB' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Tabelas n8n</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Instância WhatsApp</label>
                      <input className="nx-input" placeholder="Ex: empresa-exemplo"
                        value={form.instance} onChange={e => setForm(p => ({ ...p, instance: e.target.value.trim() }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        API Instância <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input className="nx-input" placeholder="Token/chave da API"
                        value={form.apiInstancia} onChange={e => setForm(p => ({ ...p, apiInstancia: e.target.value.trim() }))} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Tabela de contatos</label>
                      <input className="nx-input" placeholder="clientes"
                        value={form.contactsTable} onChange={e => setForm(p => ({ ...p, contactsTable: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Tabela de histórico IA</label>
                      <input className="nx-input" placeholder="Ex: historico_empresa"
                        value={form.historyTable} onChange={e => setForm(p => ({ ...p, historyTable: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Número de acessos */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                  <Users size={13} style={{ color: '#2563EB' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Acessos</span>
                  <input type="number" min={1} max={10} value={form.numAccess}
                    onChange={e => handleNumAccess(e.target.value)}
                    style={{ width: 52, marginLeft: 4, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: '#fff', color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {form.users.map((u, idx) => (
                    <div key={idx} style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        Acesso {idx + 1}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={labelStyle}>Nome</label>
                          <input className="nx-input" placeholder="Ex: Alisson"
                            value={u.name} onChange={e => handleUserName(idx, e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>E-mail</label>
                          <input className="nx-input" type="email" placeholder="auto-gerado"
                            value={u.email} onChange={e => handleUserField(idx, 'email', e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Senha</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="nx-input" placeholder="Digite ou gere uma senha"
                            value={u.password} onChange={e => handleUserField(idx, 'password', e.target.value)} />
                          <button type="button" className="nx-btn-ghost" style={{ flexShrink: 0, padding: '0 12px' }}
                            title="Gerar senha" onClick={() => genPassword(idx)}>
                            <RefreshCw size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {saveError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={closeModal}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 2, justifyContent: 'center' }}
                  onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Cadastrar empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const trialLabelStyle = {
  display: 'block', fontSize: 10, fontWeight: 700,
  color: 'rgba(255,255,255,0.35)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.07em',
}
