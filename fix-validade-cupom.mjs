import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

// Fix 1: validar — comparar fim do dia (23:59:59)
s = s.replace(
  `      if (c.validade) {
        const [d, m, a] = c.validade.split('/').map(Number)
        if (new Date(a, m - 1, d) < new Date()) return res.status(400).json({ ok: false, error: 'Cupom expirado' })
      }`,
  `      if (c.validade) {
        const [d, m, a] = c.validade.split('/').map(Number)
        const fimDia = new Date(a, m - 1, d, 23, 59, 59)
        if (fimDia < new Date()) return res.status(400).json({ ok: false, error: 'Cupom expirado' })
      }`
)

// Fix 2: criar — também verificar validade ao aplicar desconto
s = s.replace(
  `            if (c.ativo && (!c.maxUsos || c.usos < c.maxUsos)) {`,
  `            const validadeOk = !c.validade || (() => {
                const [d, m, a] = c.validade.split('/').map(Number)
                return new Date(a, m - 1, d, 23, 59, 59) >= new Date()
              })()
            if (c.ativo && validadeOk && (!c.maxUsos || c.usos < c.maxUsos)) {`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ validade agora considera fim do dia (23:59:59)!')
