import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `      // Aplica desconto do cupom se informado
      if (cupomCodigo) {`,
  `      console.log('[PAGAMENTO] criar — cupomCodigo:', cupomCodigo, '| v1:', v1, '| v3:', v3)
      // Aplica desconto do cupom se informado
      if (cupomCodigo) {`
)

s = s.replace(
  `            if (c.ativo && (!c.maxUsos || c.usos < c.maxUsos)) {`,
  `            console.log('[PAGAMENTO] cupom:', c.codigo, '| ativo:', c.ativo, '| usos:', c.usos, '| maxUsos:', c.maxUsos)
            if (c.ativo && (!c.maxUsos || c.usos < c.maxUsos)) {`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ logs adicionados em pagamento/criar!')
