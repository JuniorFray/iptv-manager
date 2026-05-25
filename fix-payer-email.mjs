import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/pagamento.js', 'utf8')

const BUSCA = `payer:               { name: clienteNome },`
const NOVO  = `payer:               { name: clienteNome, email: (telefone ? telefone.replace(/\\D/g,'') + '@pag.com' : 'cliente@pag.com') },`

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado')
  process.exit(1)
}

const resultado = s.replace(BUSCA, NOVO)

if (!resultado.includes('@pag.com')) {
  console.error('❌ Replace falhou')
  process.exit(1)
}

writeFileSync('backend/routes/pagamento.js', resultado, 'utf8')
console.log('✅ payer.email adicionado — botão Pix liberado automaticamente!')
