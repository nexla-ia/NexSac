import { useEffect, useRef, useState } from 'react'
import { Tag as TagIcon, X, Plus, Check, Filter, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './Tags.css'

// ─── Hook: carrega tags e atribuições de uma instância ──────────────────────
export function useContactTags(instancia) {
  const [tags, setTags] = useState([])
  const [assignments, setAssignments] = useState([])

  async function load() {
    if (!instancia) return
    const [tRes, aRes] = await Promise.all([
      supabase.from('contact_tags').select('*').eq('instancia', instancia).order('name'),
      supabase.from('contact_tag_assignments').select('*').eq('instancia', instancia),
    ])
    setTags(tRes.data || [])
    setAssignments(aRes.data || [])
  }

  useEffect(() => { load() }, [instancia])

  useEffect(() => {
    if (!instancia) return
    const uid = Math.random().toString(36).slice(2)
    const ch = supabase.channel(`tags-${instancia}-${uid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contact_tags', filter: `instancia=eq.${instancia}` },
        () => load())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contact_tag_assignments', filter: `instancia=eq.${instancia}` },
        () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instancia])

  function tagsOf(numero) {
    const phone = stripPhoneSuffix(numero)
    const ids = assignments.filter(a => a.numero === phone).map(a => a.tag_id)
    return tags.filter(t => ids.includes(t.id))
  }

  return { tags, assignments, tagsOf, reload: load }
}

// Normaliza numero pra busca: remove @s.whatsapp.net e tudo após @
export function stripPhoneSuffix(numero) {
  return (numero || '').replace(/@.*$/, '')
}

// ─── TagChip: pill colorido pequeno ─────────────────────────────────────────
export function TagChip({ tag, size = 'sm', onRemove }) {
  if (!tag) return null
  return (
    <span className={`tagchip tagchip-${size}`} style={{
      background: tag.color + '15',
      color: tag.color,
      border: `1px solid ${tag.color}44`,
    }}>
      <span className="tagchip-dot" style={{ background: tag.color }} />
      {tag.name}
      {onRemove && (
        <button className="tagchip-remove" onClick={(e) => { e.stopPropagation(); onRemove() }}>
          <X size={9} />
        </button>
      )}
    </span>
  )
}

// ─── TagList: renderiza os chips de um número ───────────────────────────────
export function TagList({ tags, size = 'sm', max = null }) {
  if (!tags || tags.length === 0) return null
  const shown = max ? tags.slice(0, max) : tags
  const extra = max && tags.length > max ? tags.length - max : 0
  return (
    <span className="taglist">
      {shown.map(t => <TagChip key={t.id} tag={t} size={size} />)}
      {extra > 0 && <span className={`tagchip tagchip-${size} tagchip-more`}>+{extra}</span>}
    </span>
  )
}

const TAG_PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
  '#6B7280', '#0EA5E9',
]

// ─── TagPicker: botão "Etiquetas" que abre popover com checkboxes ───────────
export function TagPicker({ instancia, numero, userEmail, anchor = 'bottom-left' }) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [editingTag, setEditingTag] = useState(null) // { id, name, color }
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(TAG_PRESET_COLORS[0])
  const [editSaving, setEditSaving] = useState(false)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const nameInputRef = useRef(null)
  const editInputRef = useRef(null)
  const { tags, tagsOf, reload } = useContactTags(instancia)
  const phone = stripPhoneSuffix(numero)
  const mineIds = new Set(tagsOf(phone).map(t => t.id))

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  useEffect(() => {
    if (creating) setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [creating])

  useEffect(() => {
    if (editingTag) setTimeout(() => editInputRef.current?.focus(), 50)
  }, [editingTag])

  async function toggle(tag) {
    if (mineIds.has(tag.id)) {
      await supabase.from('contact_tag_assignments').delete()
        .eq('instancia', instancia).eq('numero', phone).eq('tag_id', tag.id)
    } else {
      await supabase.from('contact_tag_assignments').insert({
        instancia, numero: phone, tag_id: tag.id, created_by_email: userEmail || null,
      })
    }
    reload()
  }

  async function handleCreateTag(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    const { data, error } = await supabase.from('contact_tags').insert({
      instancia, name, color: newColor,
    }).select().single()
    if (!error && data) {
      await supabase.from('contact_tag_assignments').insert({
        instancia, numero: phone, tag_id: data.id, created_by_email: userEmail || null,
      })
    }
    reload()
    setNewName('')
    setNewColor(TAG_PRESET_COLORS[0])
    setCreating(false)
    setSaving(false)
  }

  function startEdit(e, tag) {
    e.stopPropagation()
    setCreating(false)
    setEditingTag(tag)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  function cancelEdit() {
    setEditingTag(null)
    setEditName('')
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    const name = editName.trim()
    if (!name || editSaving || !editingTag) return
    setEditSaving(true)
    await supabase.from('contact_tags')
      .update({ name, color: editColor })
      .eq('id', editingTag.id)
      .eq('instancia', instancia)
    reload()
    setEditSaving(false)
    setEditingTag(null)
  }

  return (
    <div className="tagpicker">
      <button ref={btnRef} className="tagpicker-trigger" onClick={() => setOpen(v => !v)}>
        <TagIcon size={12} />
        Etiquetas
        {mineIds.size > 0 && <span className="tagpicker-count">{mineIds.size}</span>}
      </button>
      {open && (
        <div ref={popRef} className={`tagpicker-pop tagpicker-pop-${anchor}`}>
          <div className="tagpicker-header">Marcar etiquetas</div>
          {tags.length === 0 && !creating && (
            <div className="tagpicker-empty">
              Nenhuma etiqueta ainda.<br />
              <small>Crie uma abaixo.</small>
            </div>
          )}
          {tags.map(t => {
            const isOn = mineIds.has(t.id)
            const isEditing = editingTag?.id === t.id
            if (isEditing) {
              return (
                <form key={t.id} onSubmit={handleSaveEdit} className="tagpicker-create-form">
                  <div className="tagpicker-create-colors">
                    {TAG_PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        className={`tagpicker-color-dot${editColor === c ? ' active' : ''}`}
                        style={{ background: c }}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                  <div className="tagpicker-create-row">
                    <span className="tagpicker-row-dot" style={{ background: editColor, flexShrink: 0 }} />
                    <input
                      ref={editInputRef}
                      className="tagpicker-create-input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      maxLength={40}
                    />
                  </div>
                  <div className="tagpicker-create-actions">
                    <button type="button" className="tagpicker-create-cancel" onClick={cancelEdit}>
                      Cancelar
                    </button>
                    <button type="submit" className="tagpicker-create-save" disabled={!editName.trim() || editSaving}>
                      {editSaving ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </form>
              )
            }
            return (
              <div key={t.id} className={`tagpicker-row-wrap${isOn ? ' on' : ''}`}>
                <button className={`tagpicker-row ${isOn ? 'on' : ''}`} onClick={() => toggle(t)}>
                  <span className="tagpicker-row-dot" style={{ background: t.color }} />
                  <span className="tagpicker-row-name">{t.name}</span>
                  {isOn && <Check size={13} style={{ color: t.color }} />}
                </button>
                <button
                  className="tagpicker-edit-btn"
                  onClick={e => startEdit(e, t)}
                  title="Editar etiqueta"
                  type="button"
                >
                  <Pencil size={11} />
                </button>
              </div>
            )
          })}

          {/* Criar nova etiqueta */}
          {creating ? (
            <form onSubmit={handleCreateTag} className="tagpicker-create-form">
              <div className="tagpicker-create-colors">
                {TAG_PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`tagpicker-color-dot${newColor === c ? ' active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <div className="tagpicker-create-row">
                <span className="tagpicker-row-dot" style={{ background: newColor, flexShrink: 0 }} />
                <input
                  ref={nameInputRef}
                  className="tagpicker-create-input"
                  placeholder="Nome da etiqueta"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  maxLength={40}
                />
              </div>
              <div className="tagpicker-create-actions">
                <button type="button" className="tagpicker-create-cancel" onClick={() => { setCreating(false); setNewName('') }}>
                  Cancelar
                </button>
                <button type="submit" className="tagpicker-create-save" disabled={!newName.trim() || saving}>
                  {saving ? 'Criando…' : 'Criar'}
                </button>
              </div>
            </form>
          ) : (
            <button className="tagpicker-new-btn" onClick={() => setCreating(true)}>
              <Plus size={12} />
              Nova etiqueta
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TagFilter: dropdown pra filtrar (multi-select) ─────────────────────────
export function TagFilter({ instancia, value = [], onChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const { tags } = useContactTags(instancia)
  const selected = new Set(value)
  const selectedTags = tags.filter(t => selected.has(t.id))

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function toggle(id) {
    if (selected.has(id)) onChange(value.filter(v => v !== id))
    else onChange([...value, id])
  }
  function clearAll() { onChange([]) }

  return (
    <div className="tagfilter">
      <button ref={btnRef} className={`tagfilter-trigger ${value.length ? 'active' : ''}`} onClick={() => setOpen(v => !v)}>
        <Filter size={12} />
        {value.length === 0
          ? 'Filtrar por etiqueta'
          : value.length === 1
          ? selectedTags[0]?.name || '1 etiqueta'
          : `${value.length} etiquetas`}
      </button>
      {open && (
        <div ref={popRef} className="tagfilter-pop">
          <div className="tagfilter-header">
            <span>Filtrar por etiqueta</span>
            {value.length > 0 && (
              <button className="tagfilter-clear" onClick={clearAll}>Limpar</button>
            )}
          </div>
          {tags.length === 0 && (
            <div className="tagpicker-empty">
              Nenhuma etiqueta criada ainda.
            </div>
          )}
          {tags.map(t => {
            const isOn = selected.has(t.id)
            return (
              <button key={t.id} className={`tagpicker-row ${isOn ? 'on' : ''}`} onClick={() => toggle(t.id)}>
                <span className="tagpicker-row-dot" style={{ background: t.color }} />
                <span className="tagpicker-row-name">{t.name}</span>
                {isOn && <Check size={13} style={{ color: t.color }} />}
              </button>
            )
          })}
          {value.length > 0 && (
            <div className="tagfilter-foot">
              <small>Mostra contatos com <strong>qualquer</strong> uma das etiquetas selecionadas.</small>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helper pra filtrar contatos por tags ─────────────────────────────────
// Retorna função que recebe um numero e retorna se ele bate com o filtro
export function buildTagFilter(value, assignments) {
  if (!value || value.length === 0) return () => true
  const selected = new Set(value)
  const byPhone = new Map()
  for (const a of assignments) {
    if (selected.has(a.tag_id)) {
      const phone = stripPhoneSuffix(a.numero)
      if (!byPhone.has(phone)) byPhone.set(phone, true)
    }
  }
  return (numero) => byPhone.has(stripPhoneSuffix(numero))
}
