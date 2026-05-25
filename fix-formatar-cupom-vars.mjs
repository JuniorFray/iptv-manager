import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

// Adiciona substituição das variáveis de cupom no formatarMensagem
s = s.replace(
  `    console.log('[FORMAT] link1mes:', (links?.['1mes'] || 'VAZIO').substring(0,80))
    console.log('[FORMAT] msg:', msg.substring(0,300))
    // Fallback sem chaves`,
  `    // Substitui variáveis de cupom se cupomCodigo informado
    if (cupomCodigo) {
      try {
        const cSnap = await db.collection('cupons').doc(cupomCodigo.toUpperCase()).get()
        if (cSnap.exists && cSnap.data().ativo) {
          const c = cSnap.data()
          const v1 = parseFloat(String(cliente.valor || '35').replace(',', '.')) || 35
          const desc  = c.tipo === '%' ? v1 * c.valor / 100 : c.valor
          const final = Math.max(0, v1 - desc)
          const fmt   = (n) => Number(n).toFixed(2).replace('.', ',')
          msg = msg
            .replace(/\{CUPOM\}/gi,             c.codigo || '')
            .replace(/\{DESCONTO\}/gi,           'R$ ' + fmt(desc))
            .replace(/\{VALOR_COM_DESCONTO\}/gi, 'R$ ' + fmt(final))
            .replace(/\{VALIDADE_CUPOM\}/gi,     c.validade || '')
        }
      } catch (e) { console.warn('[FORMAT] erro cupom vars:', e.message) }
    } else {
      msg = msg
        .replace(/\{CUPOM\}/gi, '').replace(/\{DESCONTO\}/gi, '')
        .replace(/\{VALOR_COM_DESCONTO\}/gi, '').replace(/\{VALIDADE_CUPOM\}/gi, '')
    }

    // Fallback sem chaves`
)

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ formatarMensagem substitui variáveis de cupom para todos os envios!')
