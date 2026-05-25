import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Usa os valores já formatados retornados pelo backend em vez de recalcular
s = s.replace(
  `        if (cRes.data.ok) {
          const ci = cRes.data
          const desc = ci.tipo === '%' ? ((parseFloat(String(clienteSel.valor||'35').replace(',','.'))||35) * ci.valor / 100) : ci.valor
          const vDesc = Math.max(0, (parseFloat(String(clienteSel.valor||'35').replace(',','.'))||35) - desc).toFixed(2).replace('.',',')
          mensagemEnvio = mensagemEnvio
            .replace(/\{CUPOM\}/gi, ci.codigo)
            .replace(/\{DESCONTO\}/gi, 'R$ ' + desc.toFixed(2).replace('.',','))
            .replace(/\{VALOR_COM_DESCONTO\}/gi, 'R$ ' + vDesc)
            .replace(/\{VALIDADE_CUPOM\}/gi, ci.validade || '')
        }`,
  `        if (cRes.data.ok) {
          const ci = cRes.data
          mensagemEnvio = mensagemEnvio
            .replace(/\{CUPOM\}/gi, ci.codigo)
            .replace(/\{DESCONTO\}/gi, 'R$ ' + String(ci.desconto).replace('.',','))
            .replace(/\{VALOR_COM_DESCONTO\}/gi, 'R$ ' + String(ci.final).replace('.',','))
            .replace(/\{VALIDADE_CUPOM\}/gi, ci.validade || '')
        }`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ valores do cupom usando resposta direta do backend!')
