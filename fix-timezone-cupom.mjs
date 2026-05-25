import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

// Helper: cria data de fim de dia no horário de Brasília (UTC-3)
// 23:59:59 BRT = 26:59:59 UTC = dia seguinte 02:59:59 UTC
const fimDiaBRT = `(d, m, a) => new Date(Date.UTC(a, m - 1, d, 26, 59, 59))`

// Fix 1: /cupom/validar — comparação de expiração
s = s.replace(
  `      if (c.validade) {
        const [d, m, a] = c.validade.split('/').map(Number)
        const fimDia = new Date(a, m - 1, d, 23, 59, 59)
        if (fimDia < new Date()) return res.status(400).json({ ok: false, error: 'Cupom expirado' })
      }`,
  `      if (c.validade) {
        const [d, m, a] = c.validade.split('/').map(Number)
        const fimDia = new Date(Date.UTC(a, m - 1, d, 26, 59, 59)) // 23:59:59 BRT
        if (fimDia < new Date()) return res.status(400).json({ ok: false, error: 'Cupom expirado' })
      }`
)

// Fix 2: /pagamento/criar — validadeOk
s = s.replace(
  `            const validadeOk = !c.validade || (() => {
                const [d, m, a] = c.validade.split('/').map(Number)
                return new Date(a, m - 1, d, 23, 59, 59) >= new Date()
              })()`,
  `            const validadeOk = !c.validade || (() => {
                const [d, m, a] = c.validade.split('/').map(Number)
                return new Date(Date.UTC(a, m - 1, d, 26, 59, 59)) >= new Date() // 23:59:59 BRT
              })()`
)

// Fix 3: expiration_date_to do link MP
s = s.replace(
  `            if (cupomData?.validade) {
                const [d, m, a] = cupomData.validade.split('/').map(Number)
                const vencCupom = new Date(a, m - 1, d, 23, 59, 59)`,
  `            if (cupomData?.validade) {
                const [d, m, a] = cupomData.validade.split('/').map(Number)
                const vencCupom = new Date(Date.UTC(a, m - 1, d, 26, 59, 59)) // 23:59:59 BRT`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ Timezone BRT (UTC-3) aplicado em todas as comparações de validade!')
