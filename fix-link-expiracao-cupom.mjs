import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `            expires:              true,
            expiration_date_to:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),`,
  `            expires:              true,
            expiration_date_to:   (() => {
              const padrao = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              if (cupomInfo?.validade) {
                const [d, m, a] = cupomInfo.validade.split('/').map(Number)
                const vencCupom = new Date(a, m - 1, d, 23, 59, 59)
                return (vencCupom < padrao ? vencCupom : padrao).toISOString()
              }
              return padrao.toISOString()
            })(),`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ link expira junto com o cupom se validade for menor que 7 dias!')
