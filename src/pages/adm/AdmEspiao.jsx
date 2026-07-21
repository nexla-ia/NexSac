import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Eye, Search, RefreshCw, Bot, User, Wrench, Calendar, CheckCircle2,
  AlertTriangle, MessageSquare, ChevronRight, X, Filter, Clock, Building2,
  Image as ImageIcon, FileText, Mic, Sparkles, ShieldAlert,
} from 'lucide-react'
import './AdmEspiao.css'

const PAGE_SIZE = 80

function parseTimestamp(val) {
  if (!val) return null
  if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
    const [date, time] = val.split(' ')
    const [d, m, y] = date.split('/')
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).toISOString()
  }
  return val
}

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

function fmtPhone(numero) {
  if (!numero) return '—'
  const clean = numero.replace(/@.*$/, '')
  if (clean.length === 13) return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  return clean
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(ts).toLocaleDateString('pt-BR')
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function detectIssues(messages) {
  const issues = []
  const iaMsgs = messages.filter(m => (m.type || '').toLowerCase() === 'ia')
  const longIa = iaMsgs.filter(m => (m.mensagem || '').length > 1200).length
  if (longIa > 0) issues.push({ icon: AlertTriangle, label: `${longIa} resposta IA muito longa`, color: '#F59E0B' })
  const errorMsgs = messages.filter(m => /erro|error|exception|undefined|null|failed/i.test(m.mensagem || ''))
  if (errorMsgs.length) issues.push({ icon: ShieldAlert, label: `${errorMsgs.length} possível erro técnico`, color: '#DC2626' })
  return issues
}

export default function AdmEspiao() {
  const { db } = useAuth()
  const companies = (db.companies || []).filter(c => c.instance && c.active)

  const [selected, setSelected] = useState(companies[0]?.id || null)
  const [period, setPeriod] = useState('7d')
  const [typeFilter, setTypeFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [activeNum, setActiveNum] = useState(null)
  const [messages, setMessages] = useState([])
  const [contacts, setContacts] = useState({})
  const [convClosures, setConvClosures] = useState({})
  const [loading, setLoading] = useState(false)
  const [lastSync, setLastSync] = useState(null)

  const company = companies.find(c => c.id === selected)
  const chatRef = useRef(null)

  useEffect(() => {
    if (!company?.instance) return
    loadAll()
  }, [company?.instance, period])

  async function loadAll() {
    if (!company?.instance) return
    setLoading(true)
    setActiveNum(null)
    setMessages([])

    const since = period === '24h'
      ? new Date(Date.now() - 86400000).toISOString()
      : period === '7d'
      ? new Date(Date.now() - 7 * 86400000).toISOString()
      : period === '30d'
      ? new Date(Date.now() - 30 * 86400000).toISOString()
      : new Date(Date.now() - 90 * 86400000).toISOString()

    const [msgs, saved, convs] = await Promise.all([
      supabase.from('mensagens_geral')
        .select('id, numero, mensagem, base64, type, "horaLastMessage", created_at')
        .eq('instancia', company.instance)
        .gte('created_at', since)
        .order('id', { ascending: false })
        .limit(20000),
      supabase.from('saved_contacts').select('id, numero, nome, photo, notes').eq('instancia', company.instance),
      supabase.from('conversations').select('session_id, reason, closed_at').eq('instancia', company.instance),
    ])

    setMessages(msgs.data || [])
    const cmap = {}
    ;(saved.data || []).forEach(c => { cmap[c.numero] = c })
    setContacts(cmap)
    const cls = {}
    ;(convs.data || []).forEach(c => { cls[c.session_id] = c.reason })
    setConvClosures(cls)
    setLastSync(new Date())
    setLoading(false)
  }

  // Agrupa por numero
  const conversations = useMemo(() => {
    const grouped = {}
    messages.forEach(m => {
      const num = m.numero
      if (!num) return
      if (!grouped[num]) grouped[num] = { numero: num, messages: [], lastTs: null, hasIa: false, hasHumano: false }
      grouped[num].messages.push(m)
      const ts = parseTimestamp(m.horaLastMessage) || m.created_at
      if (!grouped[num].lastTs || new Date(ts) > new Date(grouped[num].lastTs)) {
        grouped[num].lastTs = ts
        // Preview: texto da mensagem ou indicador de mídia
        if (m.mensagem) grouped[num].lastMsg = m.mensagem
        else if (m.base64) {
          const media = detectMedia(m.base64)
          grouped[num].lastMsg = media?.type === 'image' ? '📷 Imagem'
                               : media?.type === 'audio' ? '🎤 Áudio'
                               : media?.type === 'pdf'   ? '📄 PDF'
                               : '📎 Anexo'
        }
      }
      const t = (m.type || '').toLowerCase()
      if (t === 'ia') grouped[num].hasIa = true
      if (t === 'humano' || t === 'atendente') grouped[num].hasHumano = true
    })
    let list = Object.values(grouped)
    if (typeFilter === 'so_ia')      list = list.filter(c => c.hasIa && !c.hasHumano)
    if (typeFilter === 'assumidas')  list = list.filter(c => c.hasHumano)
    if (typeFilter === 'finalizadas') list = list.filter(c => convClosures[c.numero])
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(c => {
        const contato = contacts[c.numero]
        return c.numero.toLowerCase().includes(s) || (contato?.nome || '').toLowerCase().includes(s)
      })
    }
    list.sort((a, b) => new Date(b.lastTs || 0) - new Date(a.lastTs || 0))
    return list
  }, [messages, typeFilter, search, contacts, convClosures])

  const activeConv = activeNum ? conversations.find(c => c.numero === activeNum) : null
  const activeMessages = useMemo(() => {
    if (!activeConv) return []
    return [...activeConv.messages].sort((a, b) => {
      const ta = parseTimestamp(a.horaLastMessage) || a.created_at
      const tb = parseTimestamp(b.horaLastMessage) || b.created_at
      return new Date(ta) - new Date(tb)
    })
  }, [activeConv])

  const issues = useMemo(() => activeConv ? detectIssues(activeMessages) : [], [activeMessages, activeConv])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [activeNum, activeMessages.length])

  const stats = useMemo(() => {
    const totalMsgs = messages.length
    const totalConvs = conversations.length
    const cliente = messages.filter(m => (m.type || '').toLowerCase() === 'cliente').length
    const ia = messages.filter(m => (m.type || '').toLowerCase() === 'ia').length
    const humano = messages.filter(m => (m.type || '').toLowerCase() === 'humano').length
    return { totalMsgs, totalConvs, cliente, ia, humano }
  }, [messages, conversations])

  return (
    <div className="esp-root">
      {/* Header */}
      <div className="esp-head">
        <div className="esp-head-left">
          <div className="esp-head-eyebrow">
            <Eye size={13} /> Modo Espião
          </div>
          <h1 className="esp-head-title">Espelho de conversas</h1>
          <p className="esp-head-sub">Escolhe a empresa e leia <strong>tudo</strong> que entra e sai dela — pra achar fala errada da IA, bug, contato bravo. Você está como observador, sem mexer em nada.</p>
        </div>
        <div className="esp-head-right">
          <div className="esp-stat">
            <span className="esp-stat-num">{stats.totalConvs}</span>
            <span className="esp-stat-lbl">conversas</span>
          </div>
          <div className="esp-stat">
            <span className="esp-stat-num">{stats.totalMsgs}</span>
            <span className="esp-stat-lbl">mensagens</span>
          </div>
          <div className="esp-stat" title="Cliente / IA / Humano">
            <span className="esp-stat-num esp-stat-mix">
              <em style={{ color: '#16A34A' }}>{stats.cliente}</em>
              <em style={{ color: '#A78BFA' }}>{stats.ia}</em>
              <em style={{ color: '#3B82F6' }}>{stats.humano}</em>
            </span>
            <span className="esp-stat-lbl">cli · ia · hum</span>
          </div>
          <button className="esp-refresh" onClick={loadAll} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            {lastSync ? `${timeAgo(lastSync)}` : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="esp-toolbar">
        <div className="esp-tool-group">
          <label className="esp-tool-lbl"><Building2 size={12} /> Empresa</label>
          <select className="esp-select" value={selected || ''} onChange={e => setSelected(e.target.value)}>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name} · {c.instance}</option>
            ))}
          </select>
        </div>
        <div className="esp-tool-group">
          <label className="esp-tool-lbl"><Clock size={12} /> Período</label>
          <div className="esp-pills">
            {['24h', '7d', '30d', '90d'].map(p => (
              <button key={p} className={`esp-pill ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
        </div>
        <div className="esp-tool-group">
          <label className="esp-tool-lbl"><Filter size={12} /> Filtro</label>
          <div className="esp-pills">
            <button className={`esp-pill ${typeFilter === 'todos' ? 'on' : ''}`} onClick={() => setTypeFilter('todos')}>Todos</button>
            <button className={`esp-pill ${typeFilter === 'so_ia' ? 'on' : ''}`} onClick={() => setTypeFilter('so_ia')}>Só IA</button>
            <button className={`esp-pill ${typeFilter === 'assumidas' ? 'on' : ''}`} onClick={() => setTypeFilter('assumidas')}>Assumidas</button>
            <button className={`esp-pill ${typeFilter === 'finalizadas' ? 'on' : ''}`} onClick={() => setTypeFilter('finalizadas')}>Finalizadas</button>
          </div>
        </div>
        <div className="esp-tool-search">
          <Search size={14} />
          <input placeholder="Buscar por nome ou número..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Layout */}
      <div className="esp-shell">
        {/* Lista de conversas */}
        <aside className="esp-list">
          <div className="esp-list-head">
            <span>{conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}</span>
          </div>
          {loading && (
            <div className="esp-empty">
              <RefreshCw size={20} className="spin" />
              <p>Carregando mensagens da empresa...</p>
            </div>
          )}
          {!loading && !conversations.length && (
            <div className="esp-empty">
              <MessageSquare size={20} />
              <p>Nenhuma conversa nesse período.</p>
            </div>
          )}
          {!loading && conversations.slice(0, 200).map(c => {
            const contact = contacts[c.numero]
            const closure = convClosures[c.numero]
            const isActive = c.numero === activeNum
            return (
              <button
                key={c.numero}
                className={`esp-conv ${isActive ? 'active' : ''}`}
                onClick={() => setActiveNum(c.numero)}
              >
                <div className="esp-conv-avatar">
                  {contact?.photo
                    ? <img src={contact.photo} alt="" />
                    : <span>{(contact?.nome || c.numero).charAt(0).toUpperCase()}</span>}
                </div>
                <div className="esp-conv-info">
                  <div className="esp-conv-row1">
                    <span className="esp-conv-name">{contact?.nome || fmtPhone(c.numero)}</span>
                    <span className="esp-conv-time">{timeAgo(c.lastTs)}</span>
                  </div>
                  <div className="esp-conv-preview">
                    {(c.lastMsg || '').slice(0, 60)}{(c.lastMsg || '').length > 60 ? '...' : ''}
                  </div>
                  <div className="esp-conv-tags">
                    {c.hasHumano && <span className="esp-tag esp-tag-blue">Humano</span>}
                    {c.hasIa && !c.hasHumano && <span className="esp-tag esp-tag-purple">Só IA</span>}
                    {closure && <span className="esp-tag esp-tag-gray">{closure}</span>}
                    <span className="esp-tag esp-tag-ghost">{c.messages.length} msg</span>
                  </div>
                </div>
                <ChevronRight size={14} className="esp-conv-arrow" />
              </button>
            )
          })}
        </aside>

        {/* Chat */}
        <main className="esp-chat">
          {!activeConv && (
            <div className="esp-chat-empty">
              <Eye size={40} />
              <h3>Selecione uma conversa</h3>
              <p>Escolha à esquerda pra ver o histórico completo — toda mensagem que entrou ou saiu, incluindo as da IA e ferramentas internas.</p>
            </div>
          )}
          {activeConv && (
            <>
              <header className="esp-chat-head">
                <div className="esp-chat-head-left">
                  <div className="esp-chat-avatar">
                    {contacts[activeConv.numero]?.photo
                      ? <img src={contacts[activeConv.numero].photo} alt="" />
                      : <span>{(contacts[activeConv.numero]?.nome || activeConv.numero).charAt(0).toUpperCase()}</span>}
                  </div>
                  <div>
                    <div className="esp-chat-name">{contacts[activeConv.numero]?.nome || fmtPhone(activeConv.numero)}</div>
                    <div className="esp-chat-num">{fmtPhone(activeConv.numero)} · {activeConv.messages.length} mensagens</div>
                  </div>
                </div>
                {issues.length > 0 && (
                  <div className="esp-issues">
                    {issues.map((iss, i) => {
                      const Icon = iss.icon
                      return (
                        <span key={i} className="esp-issue" style={{ color: iss.color, borderColor: iss.color + '55', background: iss.color + '12' }}>
                          <Icon size={11} /> {iss.label}
                        </span>
                      )
                    })}
                  </div>
                )}
              </header>
              <div ref={chatRef} className="esp-chat-body">
                {activeMessages.map(m => {
                  const rawType = (m.type || 'cliente').toLowerCase()
                  // Normaliza 'atendente' (vindo do n8n) como 'humano'
                  const type = rawType === 'atendente' ? 'humano' : rawType
                  const ts = parseTimestamp(m.horaLastMessage) || m.created_at
                  // Mensagem pode vir em `mensagem` (texto) ou `base64` (mídia em coluna separada)
                  const rawContent = (m.mensagem || m.base64 || '').replace(/^\*[^*]+\*:\n/, '').trim()
                  // Detecta mídia: tenta primeiro pelo base64 puro, depois pelo conteúdo texto
                  const media = detectMedia(m.base64 || rawContent)
                  const mediaSrc = m.base64 || rawContent
                  const content = rawContent
                  const isTool = type === 'tool' || (type === 'ia' && /^Calling \w+ with input:/i.test(content))
                  const isLongIa = type === 'ia' && content.length > 1200
                  return (
                    <div key={m.id} className={`esp-msg esp-msg-${type} ${isTool ? 'esp-msg-tool' : ''}`}>
                      <div className="esp-msg-meta">
                        {type === 'cliente' && <><User size={10} /> Cliente</>}
                        {type === 'ia' && !isTool && <><Bot size={10} /> IA</>}
                        {isTool && <><Wrench size={10} /> Ferramenta interna</>}
                        {type === 'humano' && <><Sparkles size={10} /> Atendente humano</>}
                        <span className="esp-msg-ts">{fmtTime(ts)}</span>
                      </div>
                      <div className="esp-msg-bubble">
                        {media?.type === 'audio' && (
                          <audio controls src={`data:${media.mime};base64,${mediaSrc}`} />
                        )}
                        {media?.type === 'image' && (
                          <img src={`data:${media.mime};base64,${mediaSrc}`} alt="" />
                        )}
                        {media?.type === 'pdf' && (
                          <a className="esp-msg-pdf" href={`data:${media.mime};base64,${mediaSrc}`} target="_blank" rel="noreferrer">
                            <FileText size={14} /> Abrir PDF
                          </a>
                        )}
                        {!media && content && (
                          <pre className="esp-msg-text">{isLongIa ? content.slice(0, 800) + '\n\n[...]' : content}</pre>
                        )}
                        {!media && !content && (
                          <pre className="esp-msg-text" style={{ color: '#94A3B8', fontStyle: 'italic' }}>(mensagem vazia)</pre>
                        )}
                        {isLongIa && (
                          <div className="esp-msg-warn">
                            <AlertTriangle size={11} /> Resposta com {content.length} caracteres — possivelmente muito longa
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
