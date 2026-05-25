import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

// Corrige prefixo das rotas de cupom
s = s.replace(`  router.post('/cupom', async`, `  router.post('/pagamento/cupom', async`)
s = s.replace(`  router.get('/cupons', async`, `  router.get('/pagamento/cupons', async`)
s = s.replace(`  router.post('/cupom/validar', async`, `  router.post('/pagamento/cupom/validar', async`)
s = s.replace(`  router.patch('/cupom/:codigo/toggle', async`, `  router.patch('/pagamento/cupom/:codigo/toggle', async`)
s = s.replace(`  router.delete('/cupom/:codigo', async`, `  router.delete('/pagamento/cupom/:codigo', async`)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ Prefixo /pagamento/ adicionado nas rotas de cupom!')
