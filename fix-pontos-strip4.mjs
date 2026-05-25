import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = 'const msgBase = regra.mensagem'
const NOVO  = 'const msgBase = stripLinksDoTemplate(regra.mensagem)'

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado no arquivo')
  process.exit(1)
}

const resultado = s.replace(BUSCA, NOVO)

if (!resultado.includes(NOVO)) {
  console.error('❌ Replace falhou')
  process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', resultado, 'utf8')
console.log('✅ stripLinksDoTemplate aplicado com sucesso!')
