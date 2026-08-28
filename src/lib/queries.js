import { supabase } from './supabase'

// Consultas que agregam no SERVIDOR em vez de baixar a tabela inteira.
//
// Por que existem: o PostgREST corta toda resposta em 1000 linhas. Um
// `.limit(50000)` no cliente não muda isso — ele devolve 1000 e pronto.
// Como as telas extraíam a lista de contatos/grupos varrendo mensagens, quem
// não tivesse mensagem entre as 1000 mais recentes simplesmente NÃO APARECIA.
// Não era lentidão: era contato sumindo da tela.
//
// Cada função tenta a RPC e, se ela ainda não existir no banco, cai num
// fallback PAGINADO — mais lento, mas correto. O fallback antigo (limit alto
// numa tirada só) era o próprio bug, então não serve de rede.

const PAGE = 1000

// Todas as linhas de uma consulta, paginando até acabar.
async function fetchAllPages(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) break
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

// Contatos individuais (WhatsApp) de uma instância, um por número, já com a
// última mensagem. Shape: [{ numero, created_at, horaLastMessage, outside_assumed }]
export async function fetchConversaContatos(instancia) {
  const { data, error } = await supabase.rpc('api_conversas_contatos', { p_instancia: instancia })
  if (!error && data) return data

  // Fallback paginado: varre as mensagens e deduplica aqui.
  const rows = await fetchAllPages((a, b) =>
    supabase.from('mensagens_geral')
      .select('id, numero, idgrupo, type, "horaLastMessage", created_at')
      .eq('instancia', instancia)
      .or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .order('id', { ascending: false })
      .range(a, b))

  const teveHumano = new Set()
  for (const r of rows) {
    if (r.idgrupo || !r.numero || r.numero.includes('@g.us')) continue
    const t = (r.type || '').toLowerCase()
    if (t === 'atendente' || t === 'humano') teveHumano.add(r.numero)
  }
  const visto = new Set()
  const out = []
  for (const r of rows) {
    if (r.idgrupo || !r.numero || r.numero.includes('@g.us')) continue
    if (visto.has(r.numero)) continue
    visto.add(r.numero)
    out.push({
      numero: r.numero,
      created_at: r.created_at,
      horaLastMessage: r.horaLastMessage,
      outside_assumed: teveHumano.has(r.numero),
    })
  }
  return out
}

// Grupos de uma instância, com a última mensagem de cada.
// Shape: [{ idgrupo, nomegrupo, mensagem, numero, nome, horaLastMessage, created_at }]
export async function fetchGruposLista(instancia) {
  const { data, error } = await supabase.rpc('api_grupos_lista', { p_instancia: instancia })
  if (!error && data) return data

  const rows = await fetchAllPages((a, b) =>
    supabase.from('mensagens_geral')
      .select('id, idgrupo, nomegrupo, mensagem, numero, nome, "horaLastMessage", created_at')
      .eq('instancia', instancia)
      .not('idgrupo', 'is', null)
      .order('id', { ascending: false })
      .range(a, b))

  const visto = new Set()
  const out = []
  for (const r of rows) {
    if (!r.idgrupo || visto.has(r.idgrupo)) continue
    visto.add(r.idgrupo)
    out.push(r)
  }
  return out
}

// Números distintos de uma instância. Shape: [{ numero }]
export async function fetchDistinctNumeros(instancia) {
  const { data, error } = await supabase.rpc('api_distinct_numeros', { p_instancia: instancia })
  if (!error && data) return data
  const rows = await fetchAllPages((a, b) =>
    supabase.from('mensagens_geral').select('numero')
      .eq('instancia', instancia).range(a, b))
  return [...new Set(rows.map(r => r.numero).filter(Boolean))].map(numero => ({ numero }))
}

// Grupos distintos, com o nomegrupo da mensagem mais recente.
// Shape: [{ idgrupo, nomegrupo }]
export async function fetchDistinctGrupos(instancia) {
  const { data, error } = await supabase.rpc('api_distinct_grupos', { p_instancia: instancia })
  if (!error && data) return data
  const rows = await fetchAllPages((a, b) =>
    supabase.from('mensagens_geral').select('idgrupo, nomegrupo')
      .eq('instancia', instancia).not('idgrupo', 'is', null)
      .order('id', { ascending: false }).range(a, b))
  const visto = new Set()
  const out = []
  for (const r of rows) {
    if (!r.idgrupo || visto.has(r.idgrupo)) continue
    visto.add(r.idgrupo)
    out.push({ idgrupo: r.idgrupo, nomegrupo: r.nomegrupo })
  }
  return out
}
