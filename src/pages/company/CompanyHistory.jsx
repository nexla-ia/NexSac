import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { MessageSquare, Bot, User, PhoneCall, Info, Headset, ChevronLeft } from 'lucide-react'
import './Company.css'

const REASON_STYLE = {
  agendado:       { label: 'Agendado',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  resolvido:      { label: 'Resolvido',   color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  encaminhado:    { label: 'Encaminhado', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  desistiu:       { label: 'Desistiu',    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  encerrado_auto: { label: 'Auto',        color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
}

function formatPhone(val) {
  return (val || '').replace(/@.*$/, '')
}

// Helpers de esquema dual: n8n (session_id/message/data) ou mensagens_geral (numero/mensagem/horaLastMessage/type)
function getSessionId(row) { return row.session_id || row.numero || null }
function getMessageContent(row) {
  const raw = row.message?.content || row.mensagem || ''
  return raw.replace(/^\*[^*]+\*:\n/, '').trim()
}
function getMessageType(row) { return row.message?.type || row.type || 'human' }
function getTimestamp(row) { return row.data || row['horaLastMessage'] || row.created_at || null }

const INJECTED_PROMPT_RE = /responda em portugu[eê]s|de forma objetiva|solicite\s|n[aã]o informar|indicar que|apresentaremos|breve explica[çc][aã]o|orienta[çc][õo]es gerais|avalia[çc][aã]o pr[eé]-operat/i

function detectMedia(b64) {
  if (!b64 || b64.length < 10) return null
  if (b64.startsWith('T2dn')) return { type: 'audio', mime: 'audio/ogg' }
  if (b64.startsWith('//uQ') || b64.startsWith('SUQz')) return { type: 'audio', mime: 'audio/mpeg' }
  if (b64.startsWith('GkXf')) return { type: 'audio', mime: 'audio/webm' }
  if (b64.startsWith('/9j/')) return { type: 'image', mime: 'image/jpeg' }
  if (b64.startsWith('iVBOR')) return { type: 'image', mime: 'image/png' }
  if (b64.startsWith('UklGR')) return { type: 'image', mime: 'image/webp' }
  if (b64.startsWith('R0lGOD')) return { type: 'image', mime: 'image/gif' }
  if (b64.startsWith('JVBERi')) return { type: 'pdf', mime: 'application/pdf' }
  return null
}

function isToolMessage(row) {
  const type = getMessageType(row)
  const content = row.message?.content || row.mensagem || ''
  if (type === 'tool') return true
  if (type === 'ai' && /^Calling \w+ with input:/i.test(content.trim())) return true
  if (type === 'ai' && content.length > 800) return true
  if ((type === 'human' || type === 'cliente') && content.length > 200 && INJECTED_PROMPT_RE.test(content)) return true
  return false
}

function formatMsgTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()

  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (isToday) return hhmm
  if (isYesterday) return `Ontem ${hhmm}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm}`
}

function formatContactTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  if (diffH < 24) return `${diffH}h`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  if (isYesterday) return 'Ontem'

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function CompanyHistory() {
  const { session } = useAuth()
  const historyTable = session?.company?.history_table
  const instance     = session?.company?.instance

  const [contacts, setContacts] = useState([])
  const [closedMap, setClosedMap] = useState({}) // session_id → reason
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState('connecting')
  const [assumedSet, setAssumedSet] = useState(new Set())
  const [lightbox, setLightbox] = useState(null)
  const bottomRef = useRef(null)
  const selectedRef = useRef(null)

  useEffect(() => { selectedRef.current = selected }, [selected])

  // Detecta quais números foram assumidos por atendente (via mensagens_geral)
  useEffect(() => {
    if (!instance) return
    supabase.from('mensagens_geral').select('numero')
      .eq('instancia', instance).eq('type', 'atendente')
      .then(({ data }) => {
        if (data) setAssumedSet(new Set(data.map(r => r.numero)))
      })
    const ch = supabase.channel('hist-assumed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens_geral', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.new?.type === 'atendente' && p.new?.numero) {
            setAssumedSet(prev => new Set([...prev, p.new.numero]))
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega enceramentos para mostrar badge de motivo no histórico
  useEffect(() => {
    if (!instance) return
    supabase.from('conversations').select('session_id, reason').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.session_id] = r.reason })
          setClosedMap(map)
        }
      })
    // Realtime: quando nova conversa for encerrada, atualiza o badge
    const ch = supabase.channel('hist-closed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `instancia=eq.${instance}` },
        (p) => { if (p.new) setClosedMap(prev => ({ ...prev, [p.new.session_id]: p.new.reason })) })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [session?.company?.instance])

  useEffect(() => {
    if (!historyTable) return
    // Garante RLS + Realtime configurados (idempotente, seguro chamar sempre)
    supabase.rpc('ensure_table_setup', { p_table: historyTable })
    setLoadingContacts(true)
    const q = supabase.from(historyTable).select('*').order('id', { ascending: false })
    const query = historyTable === 'mensagens_geral' ? q.eq('instancia', instance) : q
    query
      .then(({ data, error }) => {
        if (!error && data) {
          const seen = new Set()
          const unique = []
          for (const row of data) {
            const sid = getSessionId(row)
            if (!sid || seen.has(sid)) continue
            if (sid.includes('@g.us')) continue  // ignora grupos do WhatsApp
            seen.add(sid)
            unique.push({
              session_id: sid,
              phone: formatPhone(sid),
              lastTs: getTimestamp(row),
            })
          }
          setContacts(unique)
        }
        setLoadingContacts(false)
      })
  }, [historyTable, instance])

  useEffect(() => {
    if (!selected || !historyTable) return
    setLoadingMsgs(true)
    setMessages([])
    const col = historyTable === 'mensagens_geral' ? 'numero' : 'session_id'
    const mq = supabase.from(historyTable).select('*').eq(col, selected.session_id)
    const msgQuery = historyTable === 'mensagens_geral' ? mq.eq('instancia', instance) : mq
    msgQuery.order('id', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setMessages(data.filter(row => !isToolMessage(row)).map(row => ({
            id: row.id,
            type: getMessageType(row),
            content: getMessageContent(row),
            base64: row.base64 || null,
            ts: getTimestamp(row),
          })))
        }
        setLoadingMsgs(false)
      })
  }, [selected, historyTable])

  useEffect(() => {
    if (!historyTable) return
    setRealtimeStatus('connecting')

    const rtFilter = historyTable === 'mensagens_geral' && instance
      ? `instancia=eq.${instance}`
      : undefined

    const channel = supabase
      .channel(`realtime-${historyTable}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: historyTable, ...(rtFilter ? { filter: rtFilter } : {}) },
        (payload) => {
          const row = payload.new
          if (!row) return

          const sid = getSessionId(row)
          if (!sid || sid.includes('@g.us')) return
          const ts = getTimestamp(row)
          // Se sessão estava encerrada e chegou nova mensagem, remove o badge
          setClosedMap(prev => {
            if (prev[sid]) {
              const next = { ...prev }
              delete next[sid]
              return next
            }
            return prev
          })
          setContacts(prev => {
            const exists = prev.find(c => c.session_id === sid)
            if (exists) {
              return [
                { ...exists, lastTs: ts },
                ...prev.filter(c => c.session_id !== sid),
              ]
            }
            return [{ session_id: sid, phone: formatPhone(sid), lastTs: ts }, ...prev]
          })

          if (selectedRef.current?.session_id === sid && !isToolMessage(row)) {
            setMessages(msgs => [
              ...msgs,
              {
                id: row.id,
                type: getMessageType(row),
                content: getMessageContent(row),
                base64: row.base64 || null,
                ts,
              },
            ])
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error')
      })

    return () => { supabase.removeChannel(channel) }
  }, [historyTable, instance])

  useEffect(() => {
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingMsgs])

  const filtered = contacts.filter(c => c.phone.includes(search))

  return (
    <div className={`contacts-root ${selected ? 'has-selected' : ''}`}>
      {/* Lista lateral */}
      <div className="contacts-list">
        <div className="contacts-list-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="contacts-list-title">Histórico de Conversa</div>
            {historyTable && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11,
                color: realtimeStatus === 'connected' ? '#16A34A' : realtimeStatus === 'error' ? '#DC2626' : '#9CA3AF',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: realtimeStatus === 'connected' ? '#16A34A' : realtimeStatus === 'error' ? '#DC2626' : '#9CA3AF',
                  display: 'inline-block',
                  animation: realtimeStatus === 'connected' ? 'pulse-dot 2s infinite' : 'none',
                }} />
                {realtimeStatus === 'connected' ? 'Ao vivo' : realtimeStatus === 'error' ? 'Erro' : '...'}
              </div>
            )}
          </div>
          <input
            className="contacts-search"
            placeholder="Buscar por telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="contacts-list-body">
          {!historyTable && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Tabela de histórico não configurada.
            </div>
          )}
          {historyTable && loadingContacts && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Carregando...
            </div>
          )}
          {historyTable && !loadingContacts && filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhum contato encontrado.
            </div>
          )}
          {filtered.map(c => {
            const reason = closedMap[c.session_id]
            const rs = reason ? REASON_STYLE[reason] : null
            const assumed = assumedSet.has(c.session_id)
            return (
              <div
                key={c.session_id}
                className={`contact-item ${selected?.session_id === c.session_id ? 'selected' : ''}`}
                onClick={() => setSelected(c)}
              >
                <div className="contact-avatar"><User size={14} style={{ opacity: 0.4 }} /></div>
                <div className="contact-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div className="contact-name">{c.phone}</div>
                    {rs && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                        color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`,
                        lineHeight: '16px',
                      }}>{rs.label}</span>
                    )}
                    {assumed && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                        color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0',
                        lineHeight: '16px',
                      }}>
                        <Headset size={9} /> Assumido
                      </span>
                    )}
                  </div>
                  <div className="contact-preview">Ver conversa completa</div>
                </div>
                <div className="contact-meta">
                  {c.lastTs && <div className="contact-time">{formatContactTime(c.lastTs)}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Painel de chat */}
      <div className="chat-panel">
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: 8, padding: '10px 16px', margin: '12px 16px 0',
          fontSize: 12, color: '#1E40AF', lineHeight: '1.5',
          flexShrink: 0,
        }}>
          <Info size={14} style={{ marginTop: 1, flexShrink: 0, color: '#2563EB' }} />
          <span>
            <strong>Conversas IA</strong> — exibe todas as mensagens recebidas e processadas pela IA.
            Caso o atendimento seja assumido por um atendente, a conversa indica que foi assumida
            e as mensagens do atendente <strong>não aparecem aqui</strong> — elas ficam registradas na tela de Conversas.
          </span>
        </div>

        {!selected ? (
          <div className="chat-empty">
            <MessageSquare size={32} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 14 }}>Selecione uma conversa para visualizar o histórico</div>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <button
                className="chat-back-mobile"
                onClick={() => setSelected(null)}
                title="Voltar para a lista"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="contact-avatar" style={{ width: 38, height: 38, fontSize: 15 }}>
                <User size={14} style={{ opacity: 0.4 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>{selected.phone}</div>
                {!loadingMsgs && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{messages.length} mensagem(ns)</div>
                )}
              </div>
            </div>

            {assumedSet.has(selected.session_id) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: 0, padding: '8px 18px',
                fontSize: 12, color: '#15803D', fontWeight: 500,
                flexShrink: 0,
              }}>
                <Headset size={13} />
                Atendimento assumido por um atendente — mensagens do atendente não são exibidas aqui.
              </div>
            )}

            <div className="chat-body">
              {loadingMsgs && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '2rem' }}>
                  Carregando mensagens...
                </div>
              )}
              {!loadingMsgs && messages.length === 0 && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '2rem' }}>
                  Sem mensagens.
                </div>
              )}
              {messages.map(msg => {
                const isHuman = msg.type === 'human'
                const isImage = isHuman && /^(esta imagem|a imagem|esse documento|este documento|essa imagem|o documento|a foto|essa foto)/i.test(msg.content.trim())
                return (
                  <div key={msg.id}>
                    <div className="msg-label" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      justifyContent: isHuman ? 'flex-start' : 'flex-end',
                      color: isHuman ? 'var(--text-muted)' : '#2563EB',
                    }}>
                      {isHuman ? <><User size={10} /> Cliente</> : <><Bot size={10} /> IA</>}
                    </div>
                    <div className={`msg-row ${isHuman ? 'ai' : 'client'}`}>
                      {(() => {
                        const media = detectMedia(msg.base64)
                        const rawContent = msg.content || ''
                        const fileLineMatch = rawContent.match(/^(🎤 Áudio|🖼️ [^\n]+|📄 [^\n]+|📎 [^\n]+)(\n([\s\S]*))?$/)
                        const fileLine = fileLineMatch?.[1] || null
                        const extraText = fileLineMatch?.[3]?.trim() || ''
                        const isPlaceholder = !!fileLine
                        const displayContent = isPlaceholder ? extraText : rawContent
                        const hasOnlyMedia = media && !displayContent
                        const bubbleStyle = hasOnlyMedia
                          ? { background: 'transparent', padding: 0, boxShadow: 'none', border: 'none' }
                          : {}
                        return (
                          <div className="msg-bubble" style={bubbleStyle}>
                            {media && (() => {
                              const src = `data:${media.mime};base64,${msg.base64}`
                              if (media.type === 'audio') return (
                                <audio controls src={src} style={{ width: 280, maxWidth: '100%', display: 'block', marginBottom: hasOnlyMedia ? 0 : 6 }} />
                              )
                              if (media.type === 'image') return (
                                <img src={src} alt="mídia" style={{ maxWidth: 280, width: '100%', borderRadius: 8, display: 'block', marginBottom: hasOnlyMedia ? 0 : 6, cursor: 'zoom-in' }}
                                  onClick={() => setLightbox(src)} />
                              )
                              if (media.type === 'pdf') {
                                const fileName = (fileLine || '').replace(/^📄\s*/, '').trim() || 'documento.pdf'
                                return (
                                  <a href={src} download={fileName} target="_blank" rel="noreferrer"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 10,
                                      background: '#FEF2F2', border: '1px solid #FECACA',
                                      borderRadius: 8, padding: '10px 14px', textDecoration: 'none',
                                      minWidth: 220, marginBottom: hasOnlyMedia ? 0 : 6,
                                    }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: 6, background: '#FEE2E2',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      color: '#DC2626', fontWeight: 700, fontSize: 11, flexShrink: 0,
                                    }}>PDF</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {fileName}
                                      </div>
                                      <div style={{ fontSize: 11, color: '#6B7280' }}>Clique para baixar/abrir</div>
                                    </div>
                                  </a>
                                )
                              }
                              return null
                            })()}
                            {isImage && !msg.base64 && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 600, color: '#6B7280',
                                background: '#F3F4F6', border: '1px solid #E5E7EB',
                                borderRadius: 6, padding: '2px 8px', marginBottom: 6,
                              }}>🖼️ Imagem enviada</div>
                            )}
                            {displayContent && (
                              <span style={{ whiteSpace: 'pre-wrap' }}>{displayContent}</span>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    {msg.ts && (
                      <div className="msg-time" style={{ textAlign: isHuman ? 'left' : 'right' }}>
                        {formatMsgTime(msg.ts)}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div style={{
              padding: '12px 18px',
              borderTop: '0.5px solid var(--border)',
              background: 'var(--bg-surface)',
              flexShrink: 0,
            }}>
              <a
                href={`https://wa.me/${selected.phone}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#25D366', color: '#fff',
                  border: 'none', borderRadius: 8,
                  padding: '9px 18px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', textDecoration: 'none',
                  boxShadow: '0 1px 4px rgba(37,211,102,0.3)',
                }}
              >
                <PhoneCall size={15} />
                Ver conversa no WhatsApp
              </a>
            </div>
          </>
        )}
      </div>
      {lightbox && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, cursor: 'zoom-out' }}
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="mídia" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
        </div>
      , document.body)}
    </div>
  )
}
