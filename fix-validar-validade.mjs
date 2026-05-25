import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `      res.json({ ok: true, codigo: c.codigo, tipo: c.tipo, valor: c.valor, desconto, final })`,
  `      res.json({ ok: true, codigo: c.codigo, tipo: c.tipo, valor: c.valor, desconto, final, validade: c.validade || null })`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ validade adicionada no retorno do /cupom/validar!')
