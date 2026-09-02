import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchConversaContatos, fetchGruposLista } from '../../lib/queries'
import { detectSendError } from '../../lib/sendStatus'
import ConfirmModal from '../../components/ConfirmModal'
import {
  Search, AlertCircle, Users, Check, Zap, Clock, Plus, Trash2,
  Image as ImageIcon, Type, X, Layers, UploadCloud, ArrowUp, ArrowDown, Phone,
} from 'lucide-react'
import './Company.css'

const DISPARO_WEBHOOK = 'https://n8n.nexladesenvolvimento.com.br/webhook/disparo-mensagem-plata'
// Intervalo mínimo entre dois disparos da MESMA campanha. Rajada de mensagens
// repetidas é o padrão que o WhatsApp usa pra marcar disparo em massa.
const DISPARO_COOLDOWN_MS = 10 * 60 * 1000
const MAX_ITENS = 5
// Teto de segurança por disparo: mandar pra base inteira de uma vez é o padrão
// que derruba número no WhatsApp. Selecionando mais que isso, cada disparo
// pega 50 aleatórios dentro do que foi marcado.
const DISPARO_MAX_DESTINATARIOS = 50

// Fisher-Yates parcial: embaralha só o necessário pra tirar os N primeiros
function amostraAleatoria(lista, n) {
  if (lista.length <= n) return lista
  const copia = [...lista]
  for (let i = copia.length - 1; i > copia.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia.slice(copia.length - n)
}

const TIPOS = [
  { key: 'texto', label: 'Texto', icon: Type },
  { key: 'imagem', label: 'Imagem', icon: ImageIcon },
]
const iconeDoTipo = tipo => (TIPOS.find(t => t.key === tipo) || TIPOS[0]).icon

function normPhoneKey(sid) {
  const n = (sid || '').replace(/@.*$/, '').replace(/\D/g, '')
  return n.startsWith('55') && n.length > 10 ? n.slice(2) : n
}

function fmtWhen(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtSegundos(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// Balão verde de conversa — como a mensagem vai chegar no WhatsApp do cliente
function BalaoWhats({ item, maxLinhas }) {
  const temLegenda = !!item.texto?.trim()
  const clamp = maxLinhas
    ? { display: '-webkit-box', WebkitLineClamp: maxLinhas, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
    : {}
  return (
    <div style={{
      display: 'inline-block', maxWidth: '100%',
      background: '#DCF8C6', borderRadius: '10px 10px 10px 2px',
      padding: '7px 10px', boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
    }}>
      {item.tipo === 'imagem' && item.arquivoUrl && (
        <img src={item.arquivoUrl} alt={item.arquivoNome}
          style={{ display: 'block', width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, marginBottom: temLegenda ? 6 : 0 }} />
      )}
      {temLegenda && (
        <div style={{
          fontSize: 12, color: '#111B21', lineHeight: 1.45,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...clamp,
        }}>
          {item.texto}
        </div>
      )}
    </div>
  )
}

export default function CompanyDisparo() {
  const { session } = useAuth()
  const instance = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia
  const instanceOwner = session?.company?.numero_base || null

  const [campanhas, setCampanhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [campanhaModal, setCampanhaModal] = useState(null) // rascunho sendo criado/editado
  const [salvando, setSalvando] = useState(false)
  const [excluirId, setExcluirId] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const [disparoStatus, setDisparoStatus] = useState({}) // campanha id → 'disparando' | 'ok' | 'erro'
  const [agora, setAgora] = useState(() => Date.now())
  const [dragOverIdx, setDragOverIdx] = useState(-1)
  const fileInputsRef = useRef([])
  const [envios, setEnvios] = useState([]) // linhas de disparo_envios da instância inteira
  const [resumoId, setResumoId] = useState(null)

  // Base de contatos e grupos pra montar o público (busca no picker)
  const [contatos, setContatos] = useState([]) // [{ numero, norm, nome, photo }]
  const [grupos, setGrupos] = useState([])     // [{ idgrupo, nome }]
  const [buscaDestinatario, setBuscaDestinatario] = useState('')
  const [destTab, setDestTab] = useState('contatos') // 'contatos' | 'grupos'

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    supabase.from('disparo_campanhas').select('*').eq('instancia', instance).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('disparo_campanhas (rode a migration 20260902_disparo_campanhas.sql):', error.message)
        } else if (data) {
          setCampanhas(data.map(rowToCampanha))
        }
        setLoading(false)
      })
  }, [instance])

  useEffect(() => {
    if (!instance) return
    supabase.from('disparo_envios').select('*').eq('instancia', instance)
      .then(({ data, error }) => {
        if (error) { console.warn('disparo_envios:', error.message); return }
        setEnvios(data || [])
      })

    const ch = supabase.channel(`disparo-envios-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disparo_envios', filter: `instancia=eq.${instance}` },
        p => {
          setEnvios(prev => {
            if (p.eventType === 'DELETE') return prev.filter(e => e.id !== p.old.id)
            const existe = prev.some(e => e.id === p.new.id)
            return existe ? prev.map(e => e.id === p.new.id ? p.new : e) : [...prev, p.new]
          })
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  useEffect(() => {
    if (!instance) return

    Promise.all([
      supabase.from('saved_contacts').select('numero, nome, photo').eq('instancia', instance),
      fetchConversaContatos(instance),
    ]).then(([{ data: saved }, conversas]) => {
      const savedByPhone = {}
      ;(saved || []).forEach(c => { savedByPhone[normPhoneKey(c.numero)] = c })
      const vistos = new Set()
      const out = []
      ;(saved || []).forEach(c => {
        const norm = normPhoneKey(c.numero)
        if (vistos.has(norm)) return
        vistos.add(norm)
        out.push({ numero: c.numero, norm, nome: c.nome, photo: c.photo || null })
      })
      ;(conversas || []).forEach(c => {
        const norm = normPhoneKey(c.numero)
        if (vistos.has(norm)) return
        vistos.add(norm)
        const s = savedByPhone[norm]
        out.push({ numero: c.numero, norm, nome: s?.nome || c.numero, photo: s?.photo || null })
      })
      setContatos(out)
    })

    Promise.all([
      fetchGruposLista(instance),
      supabase.from('group_custom_names').select('idgrupo, nome').eq('instancia', instance),
    ]).then(([lista, { data: customNames }]) => {
      const nomeCustom = {}
      ;(customNames || []).forEach(g => { nomeCustom[g.idgrupo] = g.nome })
      setGrupos((lista || []).map(g => ({ idgrupo: g.idgrupo, nome: nomeCustom[g.idgrupo] || g.nomegrupo || g.idgrupo })))
    })
  }, [instance])

  const novoItem = (tipo = 'texto') => ({
    tipo,
    texto: '',
    arquivoNome: '',
    arquivoBase64: '',
    arquivoUrl: '',
    arquivoMime: '',
    arquivoTamanho: 0,
  })

  const novaCampanhaVazia = () => ({
    id: null,
    nome: '',
    createdAt: null,
    destinatarios: [], // { tipo: 'contato', numero, nome } | { tipo: 'grupo', idgrupo, nome }
    itens: [novoItem('texto')],
  })

  function itemDoBanco(it) {
    const tipo = it?.tipo || 'texto'
    const base64 = it?.arquivo_base64 || ''
    const mime = it?.arquivo_mime || ''
    return {
      ...novoItem(tipo),
      texto: it?.texto || '',
      arquivoNome: it?.arquivo_nome || '',
      arquivoMime: mime,
      arquivoBase64: base64,
      arquivoUrl: base64 ? `data:${mime || 'image/jpeg'};base64,${base64}` : '',
    }
  }

  function rowToCampanha(r) {
    return {
      id: r.id,
      nome: r.nome,
      createdAt: r.created_at,
      destinatarios: Array.isArray(r.destinatarios) ? r.destinatarios : [],
      itens: Array.isArray(r.itens) && r.itens.length ? r.itens.map(itemDoBanco) : [novoItem('texto')],
      lastDisparoAt: r.last_disparo_at,
      lastDisparoTotal: r.last_disparo_total,
    }
  }

  const itemParaBanco = it => ({
    tipo: it.tipo,
    texto: it.texto || null,
    arquivo_nome: it.arquivoNome || null,
    arquivo_mime: it.arquivoMime || null,
    arquivo_base64: it.arquivoBase64 || null,
  })

  const itemVazio = it => it.tipo === 'texto' ? !it.texto.trim() : !it.arquivoBase64
  const itensValidos = c => (c.itens || []).filter(it => !itemVazio(it))

  function alterarItem(idx, campos) {
    setCampanhaModal(p => ({ ...p, itens: p.itens.map((it, i) => i === idx ? { ...it, ...campos } : it) }))
  }
  function adicionarItem() {
    setCampanhaModal(p => p.itens.length >= MAX_ITENS ? p : { ...p, itens: [...p.itens, novoItem('texto')] })
  }
  function removerItem(idx) {
    setCampanhaModal(p => p.itens.length <= 1 ? p : { ...p, itens: p.itens.filter((_, i) => i !== idx) })
  }
  function trocarTipo(idx, tipo) {
    setCampanhaModal(p => ({
      ...p,
      itens: p.itens.map((it, i) => i === idx ? (it.tipo === tipo ? it : { ...novoItem(tipo), texto: it.texto }) : it),
    }))
  }
  function moverItem(idx, delta) {
    const destino = idx + delta
    setCampanhaModal(p => {
      if (destino < 0 || destino >= p.itens.length) return p
      const itens = [...p.itens]
      ;[itens[idx], itens[destino]] = [itens[destino], itens[idx]]
      return { ...p, itens }
    })
  }
  function receberArquivo(idx, file) {
    if (!file) return
    const MAX = 15 * 1024 * 1024
    if (file.size > MAX) {
      alert('Arquivo muito grande. O limite é 15 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      alterarItem(idx, {
        arquivoNome: file.name,
        arquivoTamanho: file.size,
        arquivoMime: file.type,
        arquivoBase64: String(reader.result).split(',')[1] || '',
        arquivoUrl: String(reader.result),
      })
    }
    reader.readAsDataURL(file)
  }
  function limparArquivo(idx) {
    alterarItem(idx, { arquivoNome: '', arquivoBase64: '', arquivoUrl: '', arquivoMime: '', arquivoTamanho: 0 })
  }

  function destinatarioKey(item) { return item.tipo === 'grupo' ? item.idgrupo : item.numero }

  function isDestinatarioSelecionado(item) {
    if (!campanhaModal) return false
    const key = destinatarioKey(item)
    return campanhaModal.destinatarios.some(d => d.tipo === item.tipo && destinatarioKey(d) === key)
  }

  function toggleDestinatario(item) {
    setCampanhaModal(p => {
      const key = destinatarioKey(item)
      const ja = p.destinatarios.some(d => d.tipo === item.tipo && destinatarioKey(d) === key)
      return {
        ...p,
        destinatarios: ja
          ? p.destinatarios.filter(d => !(d.tipo === item.tipo && destinatarioKey(d) === key))
          : [...p.destinatarios, item],
      }
    })
  }

  function toggleSelecionarTodos(lista) {
    setCampanhaModal(p => {
      const chaves = new Set(lista.map(destinatarioKey))
      const tipo = lista[0]?.tipo
      const todosSelecionados = lista.length > 0 && lista.every(item => isDestinatarioSelecionado(item))
      if (todosSelecionados) {
        return { ...p, destinatarios: p.destinatarios.filter(d => !(d.tipo === tipo && chaves.has(destinatarioKey(d)))) }
      }
      const jaSelecionados = new Set(p.destinatarios.filter(d => d.tipo === tipo).map(destinatarioKey))
      const novos = lista.filter(item => !jaSelecionados.has(destinatarioKey(item)))
      return { ...p, destinatarios: [...p.destinatarios, ...novos] }
    })
  }

  const contatosParaLista = useMemo(() => contatos.map(c => ({ tipo: 'contato', numero: c.numero, nome: c.nome, photo: c.photo })), [contatos])
  const gruposParaLista = useMemo(() => grupos.map(g => ({ tipo: 'grupo', idgrupo: g.idgrupo, nome: g.nome })), [grupos])

  const contatosFiltrados = useMemo(() => {
    const q = buscaDestinatario.trim().toLowerCase()
    const qNum = buscaDestinatario.replace(/\D/g, '')
    if (!q) return contatosParaLista
    return contatosParaLista.filter(c => c.nome?.toLowerCase().includes(q) || (qNum && c.numero.includes(qNum)))
  }, [contatosParaLista, buscaDestinatario])

  const gruposFiltrados = useMemo(() => {
    const q = buscaDestinatario.trim().toLowerCase()
    if (!q) return gruposParaLista
    return gruposParaLista.filter(g => g.nome?.toLowerCase().includes(q))
  }, [gruposParaLista, buscaDestinatario])

  const enviosPorCampanha = useMemo(() => {
    const map = {}
    envios.forEach(e => { (map[e.campanha_id] ||= []).push(e) })
    return map
  }, [envios])

  function contarStatus(campanhaId) {
    const lista = enviosPorCampanha[campanhaId] || []
    return {
      enviado: lista.filter(e => e.status === 'enviado').length,
      pendente: lista.filter(e => e.status === 'pendente').length,
      erro: lista.filter(e => e.status === 'erro').length,
      total: lista.length,
    }
  }

  async function sincronizarEnvios(campanhaId, destinatarios) {
    const rows = destinatarios.map(d => ({
      campanha_id: campanhaId,
      instancia: instance,
      tipo: d.tipo,
      destino: d.tipo === 'grupo' ? d.idgrupo : d.numero,
      nome: d.nome || null,
    }))
    if (!rows.length) return
    const { data, error } = await supabase.from('disparo_envios')
      .upsert(rows, { onConflict: 'campanha_id,tipo,destino', ignoreDuplicates: true })
      .select()
    if (error) { console.warn('disparo_envios upsert:', error.message); return }
    if (data?.length) setEnvios(prev => [...prev, ...data.filter(d => !prev.some(e => e.id === d.id))])
  }

  async function salvarCampanha() {
    if (!campanhaModal?.nome.trim()) return
    const itens = itensValidos(campanhaModal)
    if (!itens.length || !campanhaModal.destinatarios.length) return
    setSalvando(true)
    const payload = {
      instancia: instance,
      nome: campanhaModal.nome.trim(),
      itens: itens.map(itemParaBanco),
      destinatarios: campanhaModal.destinatarios,
      created_by_email: session?.user?.email || null,
    }
    const q = campanhaModal.id
      ? supabase.from('disparo_campanhas').update(payload).eq('id', campanhaModal.id).select().single()
      : supabase.from('disparo_campanhas').insert(payload).select().single()
    const { data, error } = await q
    setSalvando(false)
    if (error) {
      console.warn('disparo_campanhas (rode a migration 20260902_disparo_campanhas.sql):', error.message)
      alert('Erro ao salvar a campanha: ' + error.message)
      return
    }
    const salvo = rowToCampanha(data)
    setCampanhas(prev => campanhaModal.id ? prev.map(c => c.id === salvo.id ? salvo : c) : [salvo, ...prev])
    setCampanhaModal(null)
    sincronizarEnvios(salvo.id, salvo.destinatarios)
  }

  async function excluirCampanha() {
    if (!excluirId) return
    setExcluindo(true)
    const { error } = await supabase.from('disparo_campanhas').delete().eq('id', excluirId)
    setExcluindo(false)
    if (error) {
      alert('Erro ao excluir: ' + error.message)
      return
    }
    setCampanhas(prev => prev.filter(c => c.id !== excluirId))
    setExcluirId(null)
  }

  function esperaDisparo(c, ref = agora) {
    if (!c.lastDisparoAt) return 0
    const desde = ref - new Date(c.lastDisparoAt).getTime()
    if (isNaN(desde) || desde < 0) return 0
    return Math.max(0, DISPARO_COOLDOWN_MS - desde)
  }

  useEffect(() => {
    if (!campanhas.some(c => esperaDisparo(c, Date.now()) > 0)) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [campanhas, agora])

  async function dispararCampanha(c) {
    const itens = itensValidos(c)
    if (!itens.length || !c.destinatarios.length) return
    if (esperaDisparo(c, Date.now()) > 0) return
    await sincronizarEnvios(c.id, c.destinatarios)
    const { data: pendentes } = await supabase.from('disparo_envios').select('*')
      .eq('campanha_id', c.id).in('status', ['pendente', 'erro'])
    if (!pendentes?.length) return
    setDisparoStatus(prev => ({ ...prev, [c.id]: 'disparando' }))
    try {
      const alvo = amostraAleatoria(pendentes, DISPARO_MAX_DESTINATARIOS)
      const contatosAlvo = alvo.filter(e => e.tipo === 'contato')
      const gruposAlvo = alvo.filter(e => e.tipo === 'grupo')
      const payload = {
        empresa: {
          nome: session?.company?.name || null,
          instancia: instance,
          api_instancia: apiInstancia,
        },
        campanha: {
          id: c.id,
          titulo: c.nome,
          instrucao_antibanimento: null,
          itens: itens.map(it => ({
            tipo: it.tipo,
            texto: it.texto || '',
            nome_arquivo: it.tipo === 'imagem' ? (it.arquivoNome || null) : null,
            mime_type: it.tipo === 'imagem' ? (it.arquivoMime || null) : null,
            base64: it.tipo === 'imagem' ? (it.arquivoBase64 || null) : null,
          })),
        },
        contatos: contatosAlvo.map(e => ({
          envio_id: e.id,
          telefone: e.destino,
          nome: e.nome || null,
        })),
        grupos: gruposAlvo.map(e => ({
          envio_id: e.id,
          idgrupo: e.destino,
          numero: instanceOwner || e.destino,
          nome: e.nome || null,
        })),
        enviado_em: new Date().toISOString(),
        enviado_por: session?.user?.email || session?.user?.name || null,
      }

      const res = await fetch(DISPARO_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await res.text().catch(() => '')
      if (!res.ok || detectSendError(text)) throw new Error(detectSendError(text) || `webhook retornou ${res.status}`)

      const nowIso = new Date().toISOString()
      await supabase.from('disparo_campanhas')
        .update({ last_disparo_at: nowIso, last_disparo_total: alvo.length })
        .eq('id', c.id)
      setCampanhas(prev => prev.map(x => x.id === c.id
        ? { ...x, lastDisparoAt: nowIso, lastDisparoTotal: alvo.length }
        : x))
      setDisparoStatus(prev => ({ ...prev, [c.id]: 'ok' }))
    } catch (err) {
      console.warn('disparo falhou:', err.message)
      setDisparoStatus(prev => ({ ...prev, [c.id]: 'erro' }))
    }
    setTimeout(() => setDisparoStatus(prev => { const n = { ...prev }; delete n[c.id]; return n }), 4000)
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: 4 }}>
            Disparo
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {loading ? 'Carregando...' : `${campanhas.length} campanha${campanhas.length === 1 ? '' : 's'} de disparo`}
          </div>
        </div>
        <button
          className="nx-btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', fontSize: 12 }}
          onClick={() => setCampanhaModal(novaCampanhaVazia())}
        >
          <Plus size={14} /> Nova campanha
        </button>
      </div>

      {!loading && campanhas.length === 0 && (
        <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Layers size={28} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>Nenhuma campanha de disparo criada ainda.</div>
          <div style={{ fontSize: 12 }}>Crie uma campanha, escolha os destinatários e dispare uma mensagem em massa.</div>
        </div>
      )}

      {campanhas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14, alignItems: 'stretch' }}>
          {campanhas.map(c => {
            const itens = itensValidos(c)
            const TipoIcon = itens.length > 1 ? Layers : iconeDoTipo(itens[0]?.tipo)
            const nContatos = c.destinatarios.filter(d => d.tipo === 'contato').length
            const nGrupos = c.destinatarios.filter(d => d.tipo === 'grupo').length
            const st = disparoStatus[c.id]
            const espera = esperaDisparo(c)
            const contagem = contarStatus(c.id)
            const faltam = c.destinatarios.length - contagem.enviado
            const desabilitado = faltam <= 0 || st === 'disparando' || espera > 0

            return (
              <div key={c.id} className="nx-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
                onClick={() => setResumoId(c.id)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
                    }}>
                      <TipoIcon size={17} style={{ color: '#2563EB' }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {itens.length} mensagem{itens.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="nx-btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => setCampanhaModal(c)}>Editar</button>
                    <button className="nx-btn-ghost" style={{ padding: '5px 8px', color: '#DC2626' }} onClick={() => setExcluirId(c.id)} title="Excluir campanha">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                  {nContatos > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                      <Phone size={10} /> {nContatos} contato{nContatos === 1 ? '' : 's'}
                    </span>
                  )}
                  {nGrupos > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                      <Users size={10} /> {nGrupos} grupo{nGrupos === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {contagem.total > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A' }}>✓ {contagem.enviado} enviado{contagem.enviado === 1 ? '' : 's'}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B' }}>· {contagem.pendente} não enviado{contagem.pendente === 1 ? '' : 's'}</span>
                    {contagem.erro > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626' }}>· {contagem.erro} erro{contagem.erro === 1 ? '' : 's'}</span>}
                  </div>
                )}

                {itens.length > 0 && (
                  <div style={{
                    marginTop: 12, padding: '11px 10px', borderRadius: 10,
                    background: '#ECE5DD', border: '1px solid #DED5CC',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                  }}>
                    {itens.map((it, i) => <BalaoWhats key={i} item={it} maxLinhas={3} />)}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    {c.lastDisparoAt && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={9} style={{ color: '#16A34A' }} />
                        {c.lastDisparoTotal || 0} enviado(s) em {fmtWhen(c.lastDisparoAt)}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={desabilitado}
                    title={espera > 0
                      ? `Um disparo a cada ${DISPARO_COOLDOWN_MS / 60000} minutos, pra não queimar o número`
                      : faltam <= 0 ? 'Todo mundo já recebeu essa campanha'
                      : faltam > DISPARO_MAX_DESTINATARIOS ? `${faltam} faltando — envia só pra ${DISPARO_MAX_DESTINATARIOS} aleatórios por segurança`
                      : ''}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: desabilitado ? 'default' : 'pointer',
                      ...(st === 'ok' ? { background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }
                        : st === 'erro' ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }
                        : espera > 0 ? { background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }
                        : faltam > 0 ? { background: '#2563EB', color: '#fff' }
                        : { background: '#F1F5F9', color: '#94A3B8' }),
                    }}
                    onClick={e => { e.stopPropagation(); dispararCampanha(c) }}
                  >
                    {st === 'ok' ? <Check size={12} /> : st === 'erro' ? <AlertCircle size={12} /> : st === 'disparando' || espera > 0 ? <Clock size={12} /> : <Zap size={12} />}
                    {st === 'disparando' ? 'Disparando...'
                      : st === 'ok' ? 'Enviado'
                      : st === 'erro' ? 'Erro'
                      : espera > 0 ? fmtSegundos(espera / 1000)
                      : faltam <= 0 ? 'Concluído'
                      : `Disparar (${Math.min(faltam, DISPARO_MAX_DESTINATARIOS)})`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {resumoId && (() => {
        const c = campanhas.find(x => x.id === resumoId)
        if (!c) return null
        const lista = enviosPorCampanha[resumoId] || []
        const enviados = lista.filter(e => e.status === 'enviado')
        const pendentes = lista.filter(e => e.status === 'pendente')
        const erros = lista.filter(e => e.status === 'erro')
        const colunas = [
          { titulo: 'Enviados', cor: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', lista: enviados },
          { titulo: 'Não enviados', cor: '#64748B', bg: '#F8FAFC', border: 'var(--border)', lista: pendentes },
          { titulo: 'Erro', cor: '#DC2626', bg: '#FEF2F2', border: '#FECACA', lista: erros },
        ]
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
            backdropFilter: 'blur(4px)', padding: '1.5rem',
          }} onClick={() => setResumoId(null)}>
            <div className="nx-card" style={{ width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {lista.length} destinatário{lista.length === 1 ? '' : 's'} no total
                  </div>
                </div>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setResumoId(null)}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
                {colunas.map(col => (
                  <div key={col.titulo} style={{ border: `1px solid ${col.border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '9px 12px', background: col.bg, borderBottom: `1px solid ${col.border}`, fontSize: 12, fontWeight: 700, color: col.cor }}>
                      {col.titulo} ({col.lista.length})
                    </div>
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {col.lista.length === 0 && (
                        <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Ninguém aqui.</div>
                      )}
                      {col.lista.map((e, i) => (
                        <div key={e.id} style={{ padding: '8px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {e.tipo === 'grupo' ? <Users size={11} style={{ color: '#7C3AED', flexShrink: 0 }} /> : <Phone size={11} style={{ color: '#2563EB', flexShrink: 0 }} />}
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.nome || e.destino}
                            </span>
                          </div>
                          {e.status === 'enviado' && e.enviado_em && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{fmtWhen(e.enviado_em)}</div>
                          )}
                          {e.status === 'erro' && e.erro_msg && (
                            <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>{e.erro_msg}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal criar/editar campanha */}
      {campanhaModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: '1.5rem',
        }} onClick={() => setCampanhaModal(null)}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 880, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{campanhaModal.id ? 'Editar campanha' : 'Nova campanha de disparo'}</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setCampanhaModal(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: '1 1 60%', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflowY: 'auto' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome da campanha</label>
                  <input className="nx-input" autoFocus placeholder="Ex: Promoção de setembro"
                    value={campanhaModal.nome}
                    onChange={e => setCampanhaModal(p => ({ ...p, nome: e.target.value }))} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destinatários</label>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--border)', padding: 3, borderRadius: 8 }}>
                      {[
                        { key: 'contatos', label: 'Contatos', icon: Phone, total: contatosParaLista.length },
                        { key: 'grupos', label: 'Grupos', icon: Users, total: gruposParaLista.length },
                      ].map(o => (
                        <button key={o.key} onClick={() => setDestTab(o.key)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            background: destTab === o.key ? '#fff' : 'transparent',
                            color: destTab === o.key ? '#2563EB' : 'var(--text-muted)',
                            boxShadow: destTab === o.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          }}>
                          <o.icon size={12} /> {o.label} ({o.total})
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB' }}>
                      {campanhaModal.destinatarios.length} selecionado{campanhaModal.destinatarios.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, lineHeight: 1.5, marginBottom: 8,
                    padding: '7px 10px', borderRadius: 8,
                    ...(campanhaModal.destinatarios.length > DISPARO_MAX_DESTINATARIOS
                      ? { color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A' }
                      : { color: 'var(--text-muted)', background: '#F8FAFC', border: '1px solid var(--border)' }),
                  }}>
                    <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      {campanhaModal.destinatarios.length > DISPARO_MAX_DESTINATARIOS
                        ? <>Você selecionou {campanhaModal.destinatarios.length}, mas por segurança cada disparo manda pra só <strong>{DISPARO_MAX_DESTINATARIOS} pessoas aleatórias</strong> dessa lista — evita bloqueio do número.</>
                        : <>Por segurança, cada disparo manda pra até {DISPARO_MAX_DESTINATARIOS} pessoas. Selecionando mais, o sistema escolhe {DISPARO_MAX_DESTINATARIOS} aleatoriamente a cada disparo.</>}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                    <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13 }}
                      placeholder={destTab === 'grupos' ? 'Buscar grupo...' : 'Buscar contato por nome ou número...'}
                      value={buscaDestinatario}
                      onChange={e => setBuscaDestinatario(e.target.value)}
                    />
                    {buscaDestinatario && (
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setBuscaDestinatario('')}>
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {(() => {
                    const lista = destTab === 'grupos' ? gruposFiltrados : contatosFiltrados
                    const todosSelecionados = lista.length > 0 && lista.every(item => isDestinatarioSelecionado(item))
                    return (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          background: '#F8FAFC', borderBottom: '1px solid var(--border)',
                          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: lista.length ? 'pointer' : 'default',
                        }}>
                          <input type="checkbox" checked={todosSelecionados} disabled={!lista.length}
                            onChange={() => toggleSelecionarTodos(lista)} />
                          Selecionar todos ({lista.length})
                        </label>
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {lista.length === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '14px 10px', textAlign: 'center' }}>
                              {destTab === 'grupos' ? 'Nenhum grupo encontrado.' : 'Nenhum contato encontrado.'}
                            </div>
                          )}
                          {lista.map((item, i) => {
                            const key = destinatarioKey(item)
                            const selecionado = isDestinatarioSelecionado(item)
                            return (
                              <label key={key} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', cursor: 'pointer',
                                borderTop: i ? '1px solid var(--border)' : 'none',
                                background: selecionado ? '#EFF6FF' : 'transparent',
                              }}>
                                <input type="checkbox" checked={selecionado} onChange={() => toggleDestinatario(item)} />
                                {item.tipo === 'grupo' ? <Users size={13} style={{ color: '#7C3AED', flexShrink: 0 }} /> : <Phone size={13} style={{ color: '#2563EB', flexShrink: 0 }} />}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</div>
                                  {item.tipo === 'contato' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.numero}</div>}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    O que enviar
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 9, lineHeight: 1.5 }}>
                    As mensagens saem em sequência, uma depois da outra, na ordem abaixo.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {campanhaModal.itens.map((item, idx) => {
                      const ultimo = idx === campanhaModal.itens.length - 1
                      return (
                        <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: '#FCFDFD' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Mensagem {idx + 1}
                            </span>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <button title="Subir" disabled={idx === 0} onClick={() => moverItem(idx, -1)}
                                style={{ background: 'none', border: 'none', padding: 3, display: 'flex', color: idx === 0 ? '#CBD5E1' : '#64748B', cursor: idx === 0 ? 'default' : 'pointer' }}>
                                <ArrowUp size={13} />
                              </button>
                              <button title="Descer" disabled={ultimo} onClick={() => moverItem(idx, 1)}
                                style={{ background: 'none', border: 'none', padding: 3, display: 'flex', color: ultimo ? '#CBD5E1' : '#64748B', cursor: ultimo ? 'default' : 'pointer' }}>
                                <ArrowDown size={13} />
                              </button>
                              {campanhaModal.itens.length > 1 && (
                                <button title="Remover mensagem" onClick={() => removerItem(idx)}
                                  style={{ background: 'none', border: 'none', padding: 3, display: 'flex', color: '#DC2626', cursor: 'pointer' }}>
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 4, background: 'var(--border)', padding: 3, borderRadius: 8, marginBottom: 10 }}>
                            {TIPOS.map(o => (
                              <button key={o.key} onClick={() => trocarTipo(idx, o.key)}
                                style={{
                                  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                  padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                  border: 'none', cursor: 'pointer',
                                  background: item.tipo === o.key ? '#fff' : 'transparent',
                                  color: item.tipo === o.key ? '#2563EB' : 'var(--text-muted)',
                                  boxShadow: item.tipo === o.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                }}>
                                <o.icon size={12} /> {o.label}
                              </button>
                            ))}
                          </div>

                          {item.tipo === 'texto' ? (
                            <textarea className="nx-input" rows={3} style={{ width: '100%', resize: 'vertical', fontSize: 13, fontFamily: 'inherit' }}
                              placeholder="Mensagem que será enviada..."
                              value={item.texto}
                              onChange={e => alterarItem(idx, { texto: e.target.value })} />
                          ) : (
                            <div>
                              <input
                                ref={el => { fileInputsRef.current[idx] = el }}
                                type="file"
                                accept="image/*"
                                onChange={e => { receberArquivo(idx, e.target.files?.[0]); e.target.value = '' }}
                                style={{ display: 'none' }}
                              />

                              {item.arquivoUrl ? (
                                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#F8FAFC' }}>
                                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                    <img src={item.arquivoUrl} alt={item.arquivoNome}
                                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid var(--border)' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.arquivoNome}
                                      </div>
                                      {item.arquivoTamanho > 0 && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                          {(item.arquivoTamanho / 1024).toFixed(0)} KB
                                        </div>
                                      )}
                                      <button className="nx-btn-ghost" style={{ padding: '3px 10px', fontSize: 11, marginTop: 8, color: '#DC2626' }}
                                        onClick={() => limparArquivo(idx)}>
                                        <Trash2 size={11} /> Remover
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => fileInputsRef.current[idx]?.click()}
                                  onDragOver={e => { e.preventDefault(); setDragOverIdx(idx) }}
                                  onDragLeave={() => setDragOverIdx(-1)}
                                  onDrop={e => { e.preventDefault(); setDragOverIdx(-1); receberArquivo(idx, e.dataTransfer.files?.[0]) }}
                                  style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    border: dragOverIdx === idx ? '1.5px dashed #2563EB' : '1.5px dashed var(--border)',
                                    background: dragOverIdx === idx ? '#EFF6FF' : '#F8FAFC',
                                    borderRadius: 10, padding: '22px 16px', cursor: 'pointer',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  <UploadCloud size={22} style={{ color: dragOverIdx === idx ? '#2563EB' : '#94A3B8' }} />
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Arraste a imagem aqui ou clique pra escolher
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    JPG, PNG ou WEBP · até 15 MB
                                  </div>
                                </div>
                              )}

                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Legenda (opcional)
                              </div>
                              <textarea className="nx-input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 13, fontFamily: 'inherit', marginTop: 5 }}
                                placeholder="Texto que acompanha a imagem..."
                                value={item.texto}
                                onChange={e => alterarItem(idx, { texto: e.target.value })} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {campanhaModal.itens.length < MAX_ITENS ? (
                    <button
                      onClick={adicionarItem}
                      style={{
                        width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        marginTop: 10, padding: '9px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                        border: '1.5px dashed var(--border)', background: 'transparent',
                        color: '#2563EB', cursor: 'pointer',
                      }}>
                      <Plus size={14} /> Adicionar mensagem
                    </button>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
                      Limite de {MAX_ITENS} mensagens por campanha.
                    </div>
                  )}
                </div>
              </div>

              <aside style={{ flex: '0 0 320px', borderLeft: '1px solid var(--border)', padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Como vai aparecer no WhatsApp
                </div>
                <div style={{
                  background: '#ECE5DD', borderRadius: 12, padding: '12px 10px',
                  minHeight: 150, display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-start', gap: 6,
                }}>
                  {itensValidos(campanhaModal).length === 0 ? (
                    <div style={{ margin: 'auto', textAlign: 'center', fontSize: 11, color: '#7A8A94', lineHeight: 1.5, padding: '0 8px' }}>
                      Escreva a mensagem ou escolha uma imagem — a prévia aparece aqui conforme você digita.
                    </div>
                  ) : (
                    itensValidos(campanhaModal).map((it, i) => <BalaoWhats key={i} item={it} />)
                  )}
                </div>
                {itensValidos(campanhaModal).length > 1 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.5 }}>
                    {itensValidos(campanhaModal).length} mensagens, enviadas nessa ordem com um intervalo curto entre elas.
                  </div>
                )}
                <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)', marginTop: 12 }}>
                  <strong>{campanhaModal.destinatarios.length}</strong> destinatário(s) selecionado(s).
                </div>
              </aside>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setCampanhaModal(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={salvarCampanha}
                disabled={!campanhaModal.nome.trim() || !itensValidos(campanhaModal).length || !campanhaModal.destinatarios.length || salvando}
                title={!campanhaModal.destinatarios.length ? 'Escolha ao menos um destinatário' : !itensValidos(campanhaModal).length ? 'Preencha pelo menos uma mensagem' : ''}>
                {salvando ? 'Salvando...' : campanhaModal.id ? 'Salvar' : 'Criar campanha'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!excluirId}
        variant="delete"
        title="Excluir campanha"
        message="Essa campanha vai ser removida. Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={excluindo}
        onConfirm={excluirCampanha}
        onCancel={() => setExcluirId(null)}
      />
    </div>
  )
}
