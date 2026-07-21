import { useState, useEffect, useRef } from 'react'
import { Zap, Plus, Trash2, Check, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function QuickMessages({ instancia, onSelect }) {
  const [open, setOpen]           = useState(false)
  const [messages, setMessages]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [adding, setAdding]       = useState(false)
  const [titulo, setTitulo]       = useState('')
  const [mensagem, setMensagem]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const popoverRef = useRef(null)
  const tituloRef  = useRef(null)

  async function load() {
    if (!instancia) return
    setLoading(true)
    const { data } = await supabase
      .from('quick_messages')
      .select('id, titulo, mensagem')
      .eq('instancia', instancia)
      .order('created_at')
    setMessages(data || [])
    setLoading(false)
  }

  useEffect(() => { if (open) load() }, [open, instancia])

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  useEffect(() => {
    if (adding) setTimeout(() => tituloRef.current?.focus(), 50)
  }, [adding])

  async function handleSave() {
    if (!titulo.trim() || !mensagem.trim()) return
    setSaving(true)
    const { data } = await supabase.from('quick_messages').insert({
      instancia, titulo: titulo.trim(), mensagem: mensagem.trim(),
    }).select().single()
    if (data) setMessages(prev => [...prev, data])
    setTitulo(''); setMensagem(''); setAdding(false)
    setSaving(false)
  }

  async function handleDelete(id) {
    setDeletingId(id)
    await supabase.from('quick_messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
    setDeletingId(null)
  }

  function handleSelect(msg) {
    onSelect(msg.mensagem)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Mensagens rápidas"
        style={{
          padding: '0 13px', height: '100%', minHeight: 38,
          background: open ? '#FFF7ED' : '#fff',
          border: `1px solid ${open ? '#FB923C' : 'var(--border)'}`,
          borderRadius: 8, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: open ? '#EA580C' : '#6B7280',
          transition: 'all .15s',
        }}
      >
        <Zap size={15} fill={open ? '#EA580C' : 'none'} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
            width: 320, maxHeight: 420, background: '#fff',
            border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(15,23,42,0.13)',
            display: 'flex', flexDirection: 'column',
            zIndex: 9999,
          }}
        >
          <div style={{
            padding: '12px 16px 10px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Zap size={14} color="#EA580C" fill="#EA580C" />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                Mensagens rápidas
              </span>
            </div>
            <button
              onClick={() => { setAdding(true); setTitulo(''); setMensagem('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: '#FFF7ED', border: '1px solid #FED7AA',
                borderRadius: 7, padding: '4px 10px', fontSize: 11.5,
                fontWeight: 700, color: '#EA580C', cursor: 'pointer',
              }}
            >
              <Plus size={12} /> Nova
            </button>
          </div>

          {adding && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #FEF3C7', background: '#FFFBEB' }}>
              <input
                ref={tituloRef}
                className="nx-input"
                style={{ marginBottom: 7, fontSize: 12 }}
                placeholder="Título (ex: Saudação)"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
              />
              <textarea
                className="nx-input"
                rows={3}
                style={{ resize: 'vertical', fontSize: 12, marginBottom: 8 }}
                placeholder="Texto da mensagem..."
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSave() }}
              />
              <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                <button onClick={() => setAdding(false)} style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 7,
                  border: '1px solid var(--border)', background: '#fff',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !titulo.trim() || !mensagem.trim()} style={{
                  fontSize: 12, padding: '5px 14px', borderRadius: 7,
                  border: 'none', background: '#EA580C', color: '#fff',
                  fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  opacity: (!titulo.trim() || !mensagem.trim()) ? 0.5 : 1,
                }}>
                  {saving
                    ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</>
                    : <><Check size={11} /> Salvar</>}
                </button>
              </div>
            </div>
          )}

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
            {!loading && messages.length === 0 && !adding && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Zap size={28} strokeWidth={1.2} style={{ margin: '0 auto 8px', display: 'block', opacity: .4 }} />
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nenhuma mensagem rápida</div>
                <div style={{ fontSize: 12 }}>Clique em <strong>+ Nova</strong> para adicionar</div>
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid #F8FAFC',
                  cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => handleSelect(msg)}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {msg.titulo}
                  </div>
                  <div style={{
                    fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {msg.mensagem}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(msg.id) }}
                  disabled={deletingId === msg.id}
                  title="Remover"
                  style={{
                    flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                    color: '#DC2626', opacity: 0.4, padding: '2px 4px',
                    display: 'flex', alignItems: 'center',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
                >
                  {deletingId === msg.id
                    ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
