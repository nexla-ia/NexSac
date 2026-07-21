import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../../components/ConfirmModal'
import LimitReachedModal from '../../components/LimitReachedModal'
import { getEffectiveLimits, reachedLimit, upgradeMessage, formatLimit } from '../../lib/planLimits'
import {
  Plus, X, Pencil, Trash2, ClipboardList, Lock, Users,
} from 'lucide-react'
import './Company.css'

const COLORS = ['#2563EB', '#16A34A', '#7C3AED', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#059669']
const DAYS_OF_WEEK = [
  { num: 0, label: 'Dom' },
  { num: 1, label: 'Seg' },
  { num: 2, label: 'Ter' },
  { num: 3, label: 'Qua' },
  { num: 4, label: 'Qui' },
  { num: 5, label: 'Sex' },
  { num: 6, label: 'Sáb' },
]
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TABS = [
  { key: 'profissionais', label: 'Profissionais', icon: Users },
  { key: 'procedimentos', label: 'Serviços', icon: ClipboardList },
]

export default function CompanyCatalog() {
  const { session } = useAuth()
  const instance = session?.company?.instance

  const [tab, setTab] = useState('profissionais')
  const [pros, setPros]       = useState([])
  const [procs, setProcs]     = useState([])
  const [loading, setLoading] = useState(true)

  // Modal states
  const [proModal, setProModal]     = useState(null)
  const [procModal, setProcModal]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null) // { type, item }
  const [deletingNow, setDeletingNow] = useState(false)
  const [limitModal, setLimitModal] = useState(null)

  const limits = getEffectiveLimits(session?.company)
  const proLimitReached = reachedLimit(pros.filter(p => p.active !== false).length, limits.professionals)

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    Promise.all([
      supabase.from('professionals').select('*').eq('instancia', instance).order('name'),
      supabase.from('procedures').select('*').eq('instancia', instance).order('name'),
    ]).then(([p, q]) => {
      setPros(p.data || [])
      setProcs(q.data || [])
      setLoading(false)
    })
  }, [instance])

  // ─── Profissionais ─────────────────────────────────────────────────────────
  function openNewPro() {
    if (proLimitReached) {
      setLimitModal(upgradeMessage('professionals', limits.professionals, limits.plan))
      return
    }
    setProModal({
      name: '', color: COLORS[0], active: true,
      working_days: [1, 2, 3, 4, 5],
      start_time: '08:00',
      end_time: '18:00',
      break_start: '',
      break_end: '',
    })
    setErr('')
  }
  function openEditPro(p) { setProModal({ ...p }); setErr('') }
  async function handleSavePro() {
    if (!proModal.name?.trim()) { setErr('Nome é obrigatório'); return }
    setSaving(true)
    const payload = {
      name: proModal.name.trim(),
      color: proModal.color,
      active: proModal.active !== false,
      working_days: proModal.working_days || [1, 2, 3, 4, 5],
      start_time: proModal.start_time || '08:00',
      end_time: proModal.end_time || '18:00',
      break_start: proModal.break_start || null,
      break_end: proModal.break_end || null,
      instancia: instance,
    }
    const { data, error } = proModal.id
      ? await supabase.from('professionals').update(payload).eq('id', proModal.id).select().single()
      : await supabase.from('professionals').insert(payload).select().single()
    setSaving(false)
    if (error) { setErr('Erro: ' + error.message); return }
    setPros(prev => {
      const ex = prev.find(x => x.id === data.id)
      return ex ? prev.map(x => x.id === data.id ? data : x) : [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
    })
    setProModal(null)
  }

  // ─── Procedimentos ─────────────────────────────────────────────────────────
  function openNewProc() {
    setProcModal({
      name: '',
      duration_minutes: 30, price_particular: 0,
      professional_id: null, active: true,
      reminder_message: '',
    })
    setErr('')
  }
  function openEditProc(p) {
    setProcModal({ ...p })
    setErr('')
  }
  async function handleSaveProc() {
    if (!procModal.name?.trim()) { setErr('Nome é obrigatório'); return }
    setSaving(true)
    const payload = {
      name: procModal.name.trim(),
      duration_minutes: parseInt(procModal.duration_minutes) || 30,
      price_particular: parseFloat(procModal.price_particular) || 0,
      professional_id: procModal.professional_id || null,
      active: procModal.active !== false,
      reminder_message: procModal.reminder_message?.trim() || null,
      instancia: instance,
    }
    const { data, error } = procModal.id
      ? await supabase.from('procedures').update(payload).eq('id', procModal.id).select().single()
      : await supabase.from('procedures').insert(payload).select().single()
    if (error) { setSaving(false); setErr('Erro: ' + error.message); return }

    setProcs(prev => {
      const ex = prev.find(x => x.id === data.id)
      return ex ? prev.map(x => x.id === data.id ? data : x) : [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
    })
    setSaving(false)
    setProcModal(null)
  }

  // ─── Delete genérico ───────────────────────────────────────────────────────
  function askDelete(type, item) { setConfirmDelete({ type, item }) }
  async function doDelete() {
    if (!confirmDelete) return
    setDeletingNow(true)
    const { type, item } = confirmDelete
    if (type === 'pro')   { await supabase.from('professionals').delete().eq('id', item.id);     setPros(prev => prev.filter(x => x.id !== item.id)) }
    if (type === 'proc')  { await supabase.from('procedures').delete().eq('id', item.id);        setProcs(prev => prev.filter(x => x.id !== item.id)) }
    setDeletingNow(false)
    setConfirmDelete(null)
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)' }}>
          Catálogo de Serviços
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          Cadastre os profissionais e serviços da sua empresa.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid #2563EB' : '2px solid transparent',
              color: tab === t.key ? '#2563EB' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: -1,
            }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* PROFISSIONAIS */}
      {tab === 'profissionais' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              {pros.filter(p => p.active !== false).length} de {formatLimit(limits.professionals)} profissionais
              {proLimitReached && <span style={{ marginLeft: 8, color: '#C9A074', fontWeight: 700 }}>· limite atingido</span>}
            </div>
            <button
              className="nx-btn-primary"
              onClick={openNewPro}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: proLimitReached ? 0.7 : 1,
              }}
              title={proLimitReached ? `Limite de ${limits.professionals} profissionais atingido — clique pra ver opções` : ''}>
              {proLimitReached ? <Lock size={13} /> : <Plus size={14} />} Novo profissional
            </button>
          </div>
          {pros.length === 0 ? (
            <EmptyCard icon={Users} text={loading ? 'Carregando...' : 'Nenhum profissional cadastrado ainda.'} />
          ) : (
            <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr><th>Nome</th><th>Atendimento</th><th>Status</th><th style={{ textAlign: 'right' }}>Ação</th></tr>
                </thead>
                <tbody>
                  {pros.map(p => {
                    const days = (p.working_days || [])
                    const dayLabels = days.map(d => DAYS_OF_WEEK.find(x => x.num === d)?.label).filter(Boolean).join('/')
                    return (
                    <tr key={p.id}>
                      <td className="td-name">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.color + '22', border: `1px solid ${p.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: p.color }}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{p.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {days.length ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dayLabels}</div>
                            <div>{p.start_time?.slice(0, 5) || '08:00'} – {p.end_time?.slice(0, 5) || '18:00'}</div>
                            {p.break_start && p.break_end && (
                              <div style={{ fontSize: 10, color: '#D97706', marginTop: 1 }}>
                                Intervalo: {p.break_start.slice(0, 5)} – {p.break_end.slice(0, 5)}
                              </div>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`nx-badge ${p.active !== false ? 'nx-badge-green' : 'nx-badge-red'}`}>
                          {p.active !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="table-action" onClick={() => openEditPro(p)}><Pencil size={11} /> Editar</button>
                          <button className="table-action danger" onClick={() => askDelete('pro', p)}><Trash2 size={11} /> Excluir</button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* PROCEDIMENTOS */}
      {tab === 'procedimentos' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="nx-btn-primary" onClick={openNewProc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Novo serviço
            </button>
          </div>
          {procs.length === 0 ? (
            <EmptyCard icon={ClipboardList} text={loading ? 'Carregando...' : 'Nenhum serviço cadastrado.'} />
          ) : (
            <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr><th>Nome</th><th>Profissional</th><th>Duração</th><th>Preço</th><th>Status</th><th style={{ textAlign: 'right' }}>Ação</th></tr>
                </thead>
                <tbody>
                  {procs.map(p => {
                    const pro = pros.find(x => x.id === p.professional_id)
                    return (
                      <tr key={p.id}>
                        <td className="td-name" style={{ fontWeight: 500 }}>{p.name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pro ? pro.name : 'Toda a empresa'}</td>
                        <td style={{ fontSize: 12 }}>{p.duration_minutes} min</td>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>{fmtMoney(p.price_particular)}</td>
                        <td>
                          <span className={`nx-badge ${p.active !== false ? 'nx-badge-green' : 'nx-badge-red'}`}>
                            {p.active !== false ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button className="table-action" onClick={() => openEditProc(p)}><Pencil size={11} /> Editar</button>
                            <button className="table-action danger" onClick={() => askDelete('proc', p)}><Trash2 size={11} /> Excluir</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal profissional */}
      {proModal && createPortal(
        <Modal title={proModal.id ? 'Editar profissional' : 'Novo profissional'} onClose={() => setProModal(null)}>
          <ModalBody>
            <Field label="Nome">
              <input className="nx-input" autoFocus placeholder="Ex: João Silva"
                value={proModal.name} onChange={e => setProModal(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Cor">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setProModal(p => ({ ...p, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: proModal.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} />
                ))}
              </div>
            </Field>
            <Field label="Dias de atendimento">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAYS_OF_WEEK.map(d => {
                  const active = (proModal.working_days || []).includes(d.num)
                  return (
                    <button key={d.num}
                      onClick={() => setProModal(p => ({
                        ...p,
                        working_days: active
                          ? (p.working_days || []).filter(n => n !== d.num)
                          : [...(p.working_days || []), d.num].sort()
                      }))}
                      style={{
                        padding: '6px 12px', borderRadius: 20,
                        border: `1.5px solid ${active ? proModal.color : 'var(--border)'}`,
                        background: active ? proModal.color : 'transparent',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}>
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Horário de início">
                <input className="nx-input" type="time"
                  value={proModal.start_time?.slice(0, 5) || '08:00'}
                  onChange={e => setProModal(p => ({ ...p, start_time: e.target.value }))} />
              </Field>
              <Field label="Horário de fim">
                <input className="nx-input" type="time"
                  value={proModal.end_time?.slice(0, 5) || '18:00'}
                  onChange={e => setProModal(p => ({ ...p, end_time: e.target.value }))} />
              </Field>
            </div>
            <div>
              <label style={labelStyle}>Intervalo (almoço/pausa)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                <Field label="Início do intervalo">
                  <input className="nx-input" type="time"
                    value={proModal.break_start?.slice(0, 5) || ''}
                    onChange={e => setProModal(p => ({ ...p, break_start: e.target.value }))} />
                </Field>
                <Field label="Fim do intervalo">
                  <input className="nx-input" type="time"
                    value={proModal.break_end?.slice(0, 5) || ''}
                    onChange={e => setProModal(p => ({ ...p, break_end: e.target.value }))} />
                </Field>
                {(proModal.break_start || proModal.break_end) && (
                  <button onClick={() => setProModal(p => ({ ...p, break_start: '', break_end: '' }))}
                    title="Remover intervalo"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    Limpar
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Deixe em branco se o profissional não tem intervalo fixo.
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={proModal.active !== false} onChange={e => setProModal(p => ({ ...p, active: e.target.checked }))} style={{ width: 16, height: 16 }} />
              Profissional ativo
            </label>
          </ModalBody>
          <ModalFooter err={err} onCancel={() => setProModal(null)} onSave={handleSavePro} saving={saving} />
        </Modal>, document.body)}

      {/* Modal procedimento */}
      {procModal && createPortal(
        <Modal title={procModal.id ? 'Editar serviço' : 'Novo serviço'} onClose={() => setProcModal(null)} maxWidth={520}>
          <ModalBody>
            <Field label="Nome">
              <input className="nx-input" autoFocus placeholder="Ex: Corte de cabelo, Consultoria..."
                value={procModal.name} onChange={e => setProcModal(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Duração (min)">
              <input className="nx-input" type="number" min={5} step={5}
                value={procModal.duration_minutes} onChange={e => setProcModal(p => ({ ...p, duration_minutes: e.target.value }))} />
            </Field>
            <Field label="Profissional (deixe vazio para toda a empresa)">
              <select className="nx-select" value={procModal.professional_id || ''}
                onChange={e => setProcModal(p => ({ ...p, professional_id: e.target.value || null }))}>
                <option value="">Toda a empresa</option>
                {pros.filter(p => p.active !== false).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Preço (R$)">
              <input className="nx-input" type="number" step="0.01" min={0}
                value={procModal.price_particular} onChange={e => setProcModal(p => ({ ...p, price_particular: e.target.value }))} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={procModal.active !== false} onChange={e => setProcModal(p => ({ ...p, active: e.target.checked }))} style={{ width: 16, height: 16 }} />
              Serviço ativo
            </label>
            <Field label="Mensagem de confirmação personalizada (opcional)">
              <textarea className="nx-input" rows={3}
                placeholder={`Olá {nome}! Seu agendamento foi marcado para {data}. Qualquer dúvida é só responder aqui!`}
                value={procModal.reminder_message || ''}
                onChange={e => setProcModal(p => ({ ...p, reminder_message: e.target.value }))} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Use <strong>{'{nome}'}</strong> e <strong>{'{data}'}</strong> como variáveis. Se vazio, usa a mensagem padrão da empresa.
              </div>
            </Field>
          </ModalBody>
          <ModalFooter err={err} onCancel={() => setProcModal(null)} onSave={handleSaveProc} saving={saving} />
        </Modal>, document.body)}

      <ConfirmModal
        open={!!confirmDelete}
        variant="delete"
        title={confirmDelete?.type === 'pro' ? 'Excluir profissional' : 'Excluir serviço'}
        message={`Tem certeza que deseja excluir "${confirmDelete?.item?.name || ''}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deletingNow}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <LimitReachedModal
        open={!!limitModal}
        title={limitModal?.title}
        body={limitModal?.body}
        cta={limitModal?.cta}
        planName={limits.plan}
        onClose={() => setLimitModal(null)}
      />
    </div>
  )
}

function EmptyCard({ icon: Icon, text }) {
  return (
    <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Icon size={28} style={{ opacity: 0.2 }} />
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  )
}

function Modal({ title, onClose, children, maxWidth = 440 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
      <div className="nx-card" style={{ width: '100%', maxWidth, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalBody({ children }) {
  return <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
}

function ModalFooter({ err, onCancel, onSave, saving }) {
  return (
    <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
        <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}
