// Canonicalização de números BR: o WhatsApp entrega a mensagem do cliente
// sem o 9 extra do celular, mas o número pode chegar com o 9 vindo de outras
// telas (agenda, contatos). Sem normalizar, a mesma pessoa vira duas conversas.

export function normalizeBRDigits(raw) {
  let d = (raw || '').replace(/@.*/, '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 11 || d.length === 10) d = '55' + d
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') d = '55' + d.slice(2, 4) + d.slice(5)
  return d
}

export function canonSession(numero) {
  if (!numero || String(numero).includes('@g.us')) return numero
  const d = normalizeBRDigits(numero)
  return d ? `${d}@s.whatsapp.net` : numero
}

// Todas as formas do MESMO número que podem existir no banco (com e sem o 9).
export function numeroVariants(numero) {
  const out = new Set()
  const bare = String(numero || '').replace(/@.*/, '')
  if (bare) {
    out.add(bare)
    out.add(`${bare}@s.whatsapp.net`)
  }
  const d = normalizeBRDigits(numero)
  if (d) {
    out.add(d)
    out.add(`${d}@s.whatsapp.net`)
    if (d.length === 12 && d.startsWith('55')) {
      const withNine = '55' + d.slice(2, 4) + '9' + d.slice(4)
      out.add(withNine)
      out.add(`${withNine}@s.whatsapp.net`)
    }
  }
  return [...out]
}
