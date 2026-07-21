import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Plus, X, UserCheck, UserX, RefreshCw, Pencil, Settings, Layers, UserMinus, Trash2 } from 'lucide-react'
import AdmCompanyBilling from './AdmCompanyBilling'
import './Adm.css'

const SECTOR_COLORS = [
  '#2563EB', '#16A34A', '#7C3AED', '#DC2626', '#D97706', '#0891B2',
]

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

export default function AdmCompanyDetail() {
  const { id } = useParams()
  const { db, loadDB, addUser, updateUser, toggleUserActive } = useAuth()
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleteErr, setDeleteErr] = useState('')
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [editModal, setEditModal] = useState(null) // usuário sendo editado
  const [companyModal, setCompanyModal] = useState(false)
  const [companyForm, setCompanyForm] = useState({})
  const [companyErr, setCompanyErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' })
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', role: 'admin' })
  const [err, setErr] = useState('')
  const [editErr, setEditErr] = useState('')

  // Setores
  const [sectors, setSectors] = useState([])
  const [sectorMembers, setSectorMembers] = useState([]) // { id, sector_id, user_id }
  const [sectorModal, setSectorModal] = useState(false)
  const [sectorForm, setSectorForm] = useState({ name: '', color: SECTOR_COLORS[0] })
  const [sectorErr, setSectorErr] = useState('')
  const [assignModal, setAssignModal] = useState(null) // sector being assigned

  const company = db.companies.find(c => c.id === id)

  // Carrega setores da empresa
  useEffect(() => {
    if (!company?.instance) return
    supabase.from('sectors').select('*').eq('instancia', company.instance).order('created_at')
      .then(({ data }) => { if (data) setSectors(data) })
    supabase.from('sector_members').select('*')
      .in('sector_id', []) // carregado depois que sectors chega
      .then(() => {})
  }, [company?.instance])

  useEffect(() => {
    if (!sectors.length) { setSectorMembers([]); return }
    supabase.from('sector_members').select('*').in('sector_id', sectors.map(s => s.id))
      .then(({ data }) => { if (data) setSectorMembers(data) })
  }, [sectors])

  if (!company) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Empresa não encontrada.</div>

  const domain = slugify(company.name) + '.com'

  function handleName(name) {
    const email = name ? `${slugify(name)}@${domain}` : ''
    setForm(p => ({ ...p, name, email }))
  }

  function openModal() {
    setForm({ name: '', email: '', password: '', role: 'admin' })
    setErr('')
    setShowModal(true)
  }

  function openCompanyEdit() {
    setCompanyForm({
      name: company.name || '',
      instance: company.instance || '',
      apiInstancia: company.api_instancia || '',
      historyTable: company.history_table || '',
      contactsTable: company.contacts_table || 'clientes',
      plan: company.plan || 'Starter',
      extraUsers: company.extra_users ?? 0,
      maxUsers: company.max_users ?? '',
      maxProfessionals: company.max_professionals ?? '',
      maxAgendas: company.max_agendas ?? '',
      planPriceOverride: company.plan_price_override ?? '',
      digisacUrl: company.digisac_url || '',
      aiEnabled: company.ai_enabled !== false,
      instagramEnabled: company.instagram_enabled === true,
      instagramWebhookPath: company.instagram_webhook_path || '',
      evolutionUrl: company.evolution_url || '',
      numeroBase: company.numero_base || '',
      timezone: company.timezone || '-03:00',
      modules: company.modules || {},
    })
    setCompanyErr('')
    setCompanyModal(true)
  }

  async function handleSaveCompany() {
    if (!companyForm.name?.trim()) { setCompanyErr('Nome é obrigatório.'); return }
    if (companyForm.instance?.trim() && !companyForm.apiInstancia?.trim()) {
      setCompanyErr('API Instância é obrigatória quando a instância está preenchida.'); return
    }
    setSaving(true)
    const updates = {
      name: companyForm.name,
      instance: companyForm.instance || null,
      api_instancia: companyForm.apiInstancia || null,
      history_table: companyForm.historyTable || null,
      contacts_table: companyForm.contactsTable || null,
      plan: companyForm.plan || 'Starter',
      extra_users: parseInt(companyForm.extraUsers) || 0,
      max_users: companyForm.maxUsers === '' || companyForm.maxUsers == null ? null : parseInt(companyForm.maxUsers),
      max_professionals: companyForm.maxProfessionals === '' || companyForm.maxProfessionals == null ? null : parseInt(companyForm.maxProfessionals),
      max_agendas: companyForm.maxAgendas === '' || companyForm.maxAgendas == null ? null : parseInt(companyForm.maxAgendas),
      plan_price_override: companyForm.planPriceOverride === '' || companyForm.planPriceOverride == null
        ? null
        : parseFloat(companyForm.planPriceOverride),
      digisac_url: companyForm.digisacUrl?.trim() || null,
      ai_enabled: !!companyForm.aiEnabled,
      instagram_enabled: !!companyForm.instagramEnabled,
      instagram_webhook_path: companyForm.instagramEnabled
        ? (companyForm.instagramWebhookPath?.trim().replace(/^\/+|\/+$/g, '') || null)
        : null,
      evolution_url: companyForm.evolutionUrl?.trim().replace(/\/+$/, '') || null,
      numero_base: companyForm.numeroBase?.trim() || null,
      timezone: companyForm.timezone || '-03:00',
      modules: Object.keys(companyForm.modules || {}).length > 0 ? companyForm.modules : null,
    }
    const { error } = await supabase.from('companies').update(updates).eq('id', company.id)
    setSaving(false)
    if (error) { setCompanyErr('Erro ao salvar: ' + error.message); return }
    setCompanyModal(false)
    await loadDB()
  }

  function openEdit(user) {
    setEditForm({ name: user.name, email: user.email, password: '', role: user.role })
    setEditErr('')
    setEditModal(user)
  }

  async function handleDeleteUser() {
    if (!deletingUser) return
    setSaving(true)
    setDeleteErr('')
    const { data, error } = await supabase.rpc('delete_user', { p_user_id: deletingUser.id })
    setSaving(false)
    if (error) {
      setDeleteErr('Erro: ' + error.message + ' — confirme que a função delete_user foi criada (rode supabase/migrations/20260429_delete_user_rpc.sql).')
      return
    }
    if (data && data.ok === false) {
      setDeleteErr(data.error || 'Não foi possível excluir.')
      return
    }
    setDeletingUser(null)
    await loadDB()
  }

  async function handleEditUser() {
    if (!editForm.name || !editForm.email) { setEditErr('Nome e e-mail são obrigatórios.'); return }
    setSaving(true)
    const result = await updateUser(editModal.id, editForm)
    setSaving(false)
    if (!result?.ok) { setEditErr(result?.error || 'Erro ao salvar alterações.'); return }
    setEditModal(null)
  }

  async function handleCreateSector() {
    if (!sectorForm.name.trim()) { setSectorErr('Nome é obrigatório.'); return }
    setSaving(true)
    const { data, error } = await supabase.from('sectors').insert({
      name: sectorForm.name.trim(),
      instancia: company.instance,
      color: sectorForm.color,
    }).select().single()
    setSaving(false)
    if (error) { setSectorErr('Erro: ' + error.message); return }
    setSectors(prev => [...prev, data])
    setSectorModal(false)
    setSectorForm({ name: '', color: SECTOR_COLORS[0] })
  }

  async function handleDeleteSector(sectorId) {
    await supabase.from('sectors').delete().eq('id', sectorId)
    setSectors(prev => prev.filter(s => s.id !== sectorId))
    setSectorMembers(prev => prev.filter(m => m.sector_id !== sectorId))
  }

  async function handleAssignUser(userId) {
    if (!assignModal) return
    // Remove apenas dos setores desta empresa (evita apagar atribuições de outra empresa)
    const companySectorIds = sectors.map(s => s.id)
    if (companySectorIds.length) {
      await supabase.from('sector_members').delete()
        .eq('user_id', userId).in('sector_id', companySectorIds)
    }
    const { data } = await supabase.from('sector_members').insert({
      sector_id: assignModal.id,
      user_id: userId,
    }).select().single()
    if (data) setSectorMembers(prev => [...prev.filter(m => m.user_id !== userId), data])
  }

  async function handleRemoveMember(userId) {
    await supabase.from('sector_members').delete().eq('user_id', userId)
    setSectorMembers(prev => prev.filter(m => m.user_id !== userId))
  }

  async function handleAddUser() {
    if (!form.name || !form.email || !form.password) { setErr('Preencha todos os campos.'); return }
    setSaving(true)
    const result = await addUser(company.id, form)
    setSaving(false)
    if (!result?.ok) {
      setErr(result?.error || 'Erro ao criar acesso. Verifique se a função create_user existe no Supabase.')
      return
    }
    setShowModal(false)
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <button className="nx-btn-ghost" style={{ marginBottom: 12 }} onClick={() => navigate('/adm/empresas')}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="page-title">{company.name}</div>
            <div className="page-sub" style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
              <span className={`nx-badge ${company.active ? 'nx-badge-green' : 'nx-badge-red'}`}>{company.active ? 'Ativa' : 'Inativa'}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Criada em {new Date(company.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="nx-btn-ghost" onClick={openCompanyEdit}>
              <Settings size={14} /> Editar empresa
            </button>
            <button className="nx-btn-primary" onClick={openModal}>
              <Plus size={14} /> Novo usuário
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="section-header">
          <div className="section-title">Usuários ({(company.users || []).length})</div>
        </div>
        <div className="nx-card">
          {!(company.users || []).length ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhum usuário cadastrado. Crie o primeiro acesso.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {company.users.map(u => (
                  <tr key={u.id}>
                    <td className="td-name">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: '#EFF6FF', border: '1px solid #BFDBFE',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 600, color: '#2563EB',
                        }}>{u.name.charAt(0)}</div>
                        {u.name}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</td>
                    <td><span className={`nx-badge ${u.role === 'admin' ? 'nx-badge-cyan' : 'nx-badge-gray'}`}>{u.role === 'admin' ? 'Admin' : 'Viewer'}</span></td>
                    <td><span className={`nx-badge ${u.active ? 'nx-badge-green' : 'nx-badge-red'}`}>{u.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="table-action" onClick={() => openEdit(u)}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button className={`table-action ${u.active ? 'danger' : ''}`} onClick={() => toggleUserActive(company.id, u.id)}>
                        {u.active ? <><UserX size={12} /> Desativar</> : <><UserCheck size={12} /> Ativar</>}
                      </button>
                      <button className="table-action danger" onClick={() => { setDeleteErr(''); setDeletingUser(u) }}>
                        <Trash2 size={12} /> Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Financeiro / Mensalidade */}
      <div className="page-body" style={{ marginTop: 0 }}>
        <AdmCompanyBilling company={company} onUpdate={loadDB} />
      </div>

      {/* Setores */}
      {company.instance && (
        <div className="page-body" style={{ marginTop: 0 }}>
          <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="section-title">Setores ({sectors.length})</div>
            <button className="nx-btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => { setSectorForm({ name: '', color: SECTOR_COLORS[0] }); setSectorErr(''); setSectorModal(true) }}>
              <Plus size={13} /> Novo setor
            </button>
          </div>

          {!sectors.length ? (
            <div className="nx-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhum setor criado. Crie setores e atribua funcionários.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {sectors.map(sector => {
                const members = sectorMembers.filter(m => m.sector_id === sector.id)
                const memberUsers = members.map(m => company.users?.find(u => u.id === m.user_id)).filter(Boolean)
                const unassigned = (company.users || []).filter(u => !sectorMembers.find(m => m.user_id === u.id) || sectorMembers.find(m => m.user_id === u.id)?.sector_id === sector.id)
                return (
                  <div key={sector.id} className="nx-card" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: sector.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{sector.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="table-action" onClick={() => setAssignModal(sector)}>
                          <Plus size={11} /> Atribuir
                        </button>
                        <button className="table-action danger" onClick={() => handleDeleteSector(sector.id)}>
                          <X size={11} /> Excluir
                        </button>
                      </div>
                    </div>
                    {!memberUsers.length ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum funcionário atribuído.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {memberUsers.map(u => (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', borderRadius: 6, padding: '5px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                              <div style={{
                                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                background: sector.color + '20', border: `1px solid ${sector.color}40`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 700, color: sector.color,
                              }}>{u.name.charAt(0)}</div>
                              {u.name}
                            </div>
                            <button className="table-action danger" style={{ padding: '2px 7px', fontSize: 10 }}
                              onClick={() => handleRemoveMember(u.id)}>
                              <UserMinus size={9} /> Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {deletingUser && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#DC2626' }}>Excluir usuário</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Esta ação não pode ser desfeita.</div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setDeletingUser(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                Excluir permanentemente o usuário <strong>{deletingUser.name}</strong> ({deletingUser.email})?
              </div>
              {deleteErr && (
                <div style={{ marginTop: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626' }}>
                  {deleteErr}
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setDeletingUser(null)}>Cancelar</button>
              <button
                style={{ flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                onClick={handleDeleteUser} disabled={saving}>
                <Trash2 size={13} /> {saving ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {editModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Editar usuário</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{editModal.name}</div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
                onClick={() => setEditModal(null)}><X size={16} /></button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input className="nx-input" value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>E-mail</label>
                <input className="nx-input" type="email" value={editForm.email}
                  onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Nova senha <span style={{ fontWeight: 400, textTransform: 'none' }}>(deixe em branco para não alterar)</span></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="nx-input" placeholder="Nova senha..."
                    value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} />
                  <button type="button" className="nx-btn-ghost" style={{ flexShrink: 0, padding: '0 12px' }}
                    title="Gerar senha" onClick={() => setEditForm(p => ({ ...p, password: generatePassword(company.name) }))}>
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Perfil de acesso</label>
                <select className="nx-select" value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="admin">Admin — acesso completo</option>
                  <option value="viewer">Viewer — somente leitura</option>
                </select>
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {editErr && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
                  {editErr}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setEditModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleEditUser} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar alterações'}
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
          <div className="nx-card" style={{ width: '100%', maxWidth: 440 }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Novo usuário</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Acesso para <strong style={{ color: 'var(--text-secondary)' }}>{company.name}</strong>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
                onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input className="nx-input" placeholder="Ex: Alisson"
                  value={form.name} onChange={e => handleName(e.target.value)} autoFocus />
              </div>

              <div>
                <label style={labelStyle}>E-mail</label>
                <input className="nx-input" type="email"
                  placeholder={`usuario@${domain}`}
                  value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>

              <div>
                <label style={labelStyle}>Senha</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="nx-input" placeholder="Digite ou gere uma senha"
                    value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                  <button type="button" className="nx-btn-ghost" style={{ flexShrink: 0, padding: '0 12px' }}
                    title="Gerar senha" onClick={() => setForm(p => ({ ...p, password: generatePassword(company.name) }))}>
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Perfil de acesso</label>
                <select className="nx-select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="admin">Admin — acesso completo</option>
                  <option value="viewer">Viewer — somente leitura</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {err && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
                  {err}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleAddUser} disabled={saving}>
                  {saving ? 'Salvando...' : 'Criar acesso'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {companyModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 3rem)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Editar empresa</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setCompanyModal(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div>
                <label style={labelStyle}>Nome da empresa</label>
                <input className="nx-input" value={companyForm.name} onChange={e => setCompanyForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Instância WhatsApp</label>
                  <input className="nx-input" placeholder="Ex: empresa-exemplo" value={companyForm.instance} onChange={e => setCompanyForm(p => ({ ...p, instance: e.target.value.trim() }))} />
                </div>
                <div>
                  <label style={labelStyle}>API Instância <span style={{ color: '#DC2626' }}>*</span></label>
                  <input className="nx-input" placeholder="Token/chave da API" value={companyForm.apiInstancia} onChange={e => setCompanyForm(p => ({ ...p, apiInstancia: e.target.value.trim() }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Fuso horário da empresa</label>
                <select className="nx-select" value={companyForm.timezone}
                  onChange={e => setCompanyForm(p => ({ ...p, timezone: e.target.value }))}>
                  <option value="-02:00">UTC-2 — Fernando de Noronha</option>
                  <option value="-03:00">UTC-3 — Brasília / SP / RJ (padrão)</option>
                  <option value="-04:00">UTC-4 — AM / MT / MS / RO</option>
                  <option value="-05:00">UTC-5 — Acre / AM Oeste</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Tabela de histórico IA</label>
                  <input className="nx-input" placeholder="Ex: n8n_chat_histories_..." value={companyForm.historyTable} onChange={e => setCompanyForm(p => ({ ...p, historyTable: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Tabela de contatos</label>
                  <input className="nx-input" placeholder="clientes" value={companyForm.contactsTable} onChange={e => setCompanyForm(p => ({ ...p, contactsTable: e.target.value }))} />
                </div>
              </div>
              {/* ─── Plano e limites ──────────────────────────────────── */}
              <div style={{
                background: 'linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%)',
                border: '1.5px solid #FDE68A',
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#92400E' }}>
                  Plano e limites
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Plano</label>
                    <select className="nx-select" value={companyForm.plan}
                      onChange={e => setCompanyForm(p => ({ ...p, plan: e.target.value }))}>
                      <option value="Starter">Starter — R$ 247</option>
                      <option value="Pro">Pro — R$ 597</option>
                      <option value="Business">Business — Sob medida</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Add-on usuários extras <span style={{ fontWeight: 400, textTransform: 'none' }}>(R$ 39/mês cada)</span></label>
                    <input className="nx-input" type="number" min={0} max={200} value={companyForm.extraUsers}
                      onChange={e => setCompanyForm(p => ({ ...p, extraUsers: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Valor negociado (R$) <span style={{ fontWeight: 400, textTransform: 'none' }}>— deixe vazio pra usar o preço padrão do plano</span></label>
                  <input className="nx-input" type="number" min={0} step="0.01"
                    placeholder={companyForm.plan === 'Starter' ? '247' : companyForm.plan === 'Pro' ? '597' : ''}
                    value={companyForm.planPriceOverride}
                    onChange={e => setCompanyForm(p => ({ ...p, planPriceOverride: e.target.value }))} />
                  {companyForm.planPriceOverride !== '' && companyForm.planPriceOverride != null && (
                    <div style={{ fontSize: 11, color: '#92400E', marginTop: 4, fontWeight: 500 }}>
                      Preço individual: <strong>R$ {parseFloat(companyForm.planPriceOverride).toFixed(2).replace('.', ',')}</strong> (plano {companyForm.plan})
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#92400E', fontWeight: 500, marginTop: -2 }}>
                  Overrides individuais — deixe vazio pra usar o default do plano:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Máx. usuários</label>
                    <input className="nx-input" type="number" min={1} max={500} placeholder="auto" value={companyForm.maxUsers}
                      onChange={e => setCompanyForm(p => ({ ...p, maxUsers: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Máx. profissionais</label>
                    <input className="nx-input" type="number" min={1} max={500} placeholder="auto" value={companyForm.maxProfessionals}
                      onChange={e => setCompanyForm(p => ({ ...p, maxProfessionals: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Máx. agendas</label>
                    <input className="nx-input" type="number" min={1} max={500} placeholder="auto" value={companyForm.maxAgendas}
                      onChange={e => setCompanyForm(p => ({ ...p, maxAgendas: e.target.value }))} />
                  </div>
                </div>
              </div>
              {/* ─── Módulos personalizados ──────────────────────────── */}
              {(() => {
                const MODULES = [
                  { key: 'conversas',  label: 'Conversas',      desc: 'Chat WhatsApp/atendimento' },
                  { key: 'instagram',  label: 'Instagram',       desc: 'Atendimento pelo Instagram' },
                  { key: 'grupos',     label: 'Grupos',          desc: 'Chat de grupos WhatsApp' },
                  { key: 'contatos',   label: 'Contatos',        desc: 'Cadastro de contatos' },
                  { key: 'agenda',     label: 'Agenda',          desc: 'Agendamentos e lembretes' },
                  { key: 'kanban',     label: 'Kanban',          desc: 'Atividades e quadro kanban' },
                  { key: 'financeiro', label: 'Financeiro',      desc: 'Orçamentos e pagamentos' },
                  { key: 'catalogo',   label: 'Catálogo de Serviços', desc: 'Serviços e profissionais' },
                  { key: 'alertas',    label: 'Alertas',         desc: 'Notificações automáticas' },
                  { key: 'metricas',   label: 'Métricas',        desc: 'Dashboard de desempenho' },
                ]
                const mods = companyForm.modules || {}
                const allDefault = Object.keys(mods).length === 0
                const toggle = key => setCompanyForm(p => {
                  const cur = p.modules || {}
                  const next = { ...cur, [key]: !cur[key] }
                  // Remove chaves que são true (padrão) para manter objeto limpo
                  if (next[key] === true) delete next[key]
                  return { ...p, modules: next }
                })
                return (
                  <div style={{
                    background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)',
                    border: '1.5px solid #BFDBFE', borderRadius: 10, padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#1E40AF' }}>
                        Módulos do pacote
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompanyForm(p => ({ ...p, modules: {} }))}
                        style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 6,
                          border: '1px solid #BFDBFE', background: '#fff',
                          color: '#1D4ED8', cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        {allDefault ? '✓ Todos habilitados' : 'Restaurar padrão'}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#1E40AF', opacity: .7, marginTop: -6 }}>
                      Desative os módulos que este cliente não tem no pacote contratado.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {MODULES.map(m => {
                        const enabled = mods[m.key] !== false
                        return (
                          <label key={m.key} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                            border: `1.5px solid ${enabled ? '#86EFAC' : '#FCA5A5'}`,
                            background: enabled ? '#F0FDF4' : '#FFF1F2',
                            transition: 'all .15s',
                          }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${enabled ? '#16A34A' : '#DC2626'}`,
                              background: enabled ? '#16A34A' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }} onClick={() => toggle(m.key)}>
                              {enabled && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ minWidth: 0 }} onClick={() => toggle(m.key)}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: enabled ? '#15803D' : '#DC2626' }}>
                                {m.label}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                                {m.desc}
                              </div>
                            </div>
                            <input type="checkbox" checked={enabled} onChange={() => toggle(m.key)} style={{ display: 'none' }} />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div>
                <label style={labelStyle}>URL Digisac <span style={{ fontWeight: 400, textTransform: 'none' }}>(deixe vazio se não usa)</span></label>
                <input className="nx-input" placeholder="Ex: https://suaempresa.digisac.com.br" value={companyForm.digisacUrl}
                  onChange={e => setCompanyForm(p => ({ ...p, digisacUrl: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>URL Evolution API <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional — padrão: evolutionapi.nexladesenvolvimento.com.br)</span></label>
                <input className="nx-input" placeholder="Padrão: https://evolutionapi.nexladesenvolvimento.com.br" value={companyForm.evolutionUrl}
                  onChange={e => setCompanyForm(p => ({ ...p, evolutionUrl: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Número base WhatsApp <span style={{ fontWeight: 400, textTransform: 'none' }}>(JID do número cadastrado na instância)</span></label>
                <input className="nx-input" placeholder="Ex: 5511999999999@s.whatsapp.net" value={companyForm.numeroBase}
                  onChange={e => setCompanyForm(p => ({ ...p, numeroBase: e.target.value.trim() }))} />
              </div>
              <div>
                <label style={labelStyle}>Atendimento por IA</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${companyForm.aiEnabled ? '#BFDBFE' : 'var(--border)'}`,
                  background: companyForm.aiEnabled ? '#EFF6FF' : 'var(--bg-surface)',
                  transition: 'all 0.15s',
                }}>
                  <input type="checkbox" checked={!!companyForm.aiEnabled}
                    onChange={e => setCompanyForm(p => ({ ...p, aiEnabled: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: companyForm.aiEnabled ? '#1E40AF' : 'var(--text-primary)' }}>
                      {companyForm.aiEnabled ? 'IA ativa — responde automaticamente' : 'IA desativada — apenas atendimento humano'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Quando desativada, todas as mensagens do cliente vão direto para a Recepção.
                    </div>
                  </div>
                </label>
              </div>
              <div>
                <label style={labelStyle}>Instagram Direct</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${companyForm.instagramEnabled ? 'rgba(220, 38, 127, 0.4)' : 'var(--border)'}`,
                  background: companyForm.instagramEnabled
                    ? 'linear-gradient(135deg, rgba(131, 58, 180, 0.06) 0%, rgba(247, 119, 55, 0.06) 100%)'
                    : 'var(--bg-surface)',
                  transition: 'all 0.15s',
                }}>
                  <input type="checkbox" checked={!!companyForm.instagramEnabled}
                    onChange={e => setCompanyForm(p => ({ ...p, instagramEnabled: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: companyForm.instagramEnabled ? '#BE185D' : 'var(--text-primary)' }}>
                      {companyForm.instagramEnabled ? 'Instagram ativo — inbox liberada' : 'Instagram inativo — empresa vê tela de upgrade'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Liberar exige configuração no n8n + Meta Business API. Só ative depois de testar.
                    </div>
                  </div>
                </label>
                {companyForm.instagramEnabled && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ ...labelStyle, color: '#BE185D' }}>
                      Path do webhook n8n <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <div style={{
                      display: 'flex', alignItems: 'stretch',
                      border: '1.5px solid rgba(220, 38, 127, 0.25)',
                      borderRadius: 8, overflow: 'hidden',
                      background: '#fff',
                    }}>
                      <span style={{
                        padding: '9px 10px', fontSize: 11.5,
                        background: 'rgba(131, 58, 180, 0.06)',
                        color: '#7C3AED', fontFamily: 'monospace',
                        borderRight: '1px solid rgba(220, 38, 127, 0.15)',
                        whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center',
                      }}>n8n.nexladesenvolvimento.com.br/webhook/</span>
                      <input
                        className="nx-input"
                        placeholder="envioNexlainstagram_empresaXYZ"
                        value={companyForm.instagramWebhookPath}
                        onChange={e => setCompanyForm(p => ({ ...p, instagramWebhookPath: e.target.value.trim() }))}
                        style={{
                          border: 'none', borderRadius: 0, flex: 1,
                          fontFamily: 'monospace', fontSize: 12.5,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Cada empresa tem um workflow próprio no n8n com a credencial da Meta API dela.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', flexShrink: 0, background: '#fff' }}>
              {companyErr && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{companyErr}</div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setCompanyModal(false)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveCompany} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {sectorModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Novo setor</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSectorModal(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome do setor</label>
                <input className="nx-input" placeholder="Ex: Comercial, Suporte..." autoFocus
                  value={sectorForm.name} onChange={e => setSectorForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Cor</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {SECTOR_COLORS.map(c => (
                    <button key={c} onClick={() => setSectorForm(p => ({ ...p, color: c }))}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                        outline: sectorForm.color === c ? `3px solid ${c}` : 'none',
                        outlineOffset: 2,
                      }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {sectorErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{sectorErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setSectorModal(false)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCreateSector} disabled={saving}>
                  {saving ? 'Criando...' : 'Criar setor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {assignModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Atribuir ao setor</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: assignModal.color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{assignModal.name}</span>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setAssignModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {(company.users || []).filter(u => u.role !== 'admin').map(u => {
                const inThisSector = sectorMembers.find(m => m.user_id === u.id)?.sector_id === assignModal.id
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: inThisSector ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${inThisSector ? '#BBF7D0' : 'var(--border)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#2563EB' }}>{u.name.charAt(0)}</div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                      </div>
                    </div>
                    {inThisSector ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A' }}>✓ Atribuído</span>
                    ) : (
                      <button className="nx-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => handleAssignUser(u.id)}>
                        Atribuir
                      </button>
                    )}
                  </div>
                )
              })}
              {(company.users || []).filter(u => u.role !== 'admin').length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  Nenhum operador cadastrado. Crie usuários com perfil Viewer/Operador.
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button className="nx-btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setAssignModal(null)}>Fechar</button>
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
