import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `const formatarMensagem = async (template, cliente) => {
    const fmtValor = v => v ? \`R$ \${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.', ',')}\` : ''
    const v3 = cliente.valor3meses || '95.00'
    const v6 = cliente.valor6meses || '170.00'
    const links = await gerarLinksCliente(cliente)`,
  `const formatarMensagem = async (template, cliente, cupomCodigo) => {
    const fmtValor = v => v ? \`R$ \${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.', ',')}\` : ''
    const v3 = cliente.valor3meses || '95.00'
    const v6 = cliente.valor6meses || '170.00'
    const links = await gerarLinksCliente(cliente, cupomCodigo)`
)

if (!s.includes('formatarMensagem = async (template, cliente, cupomCodigo)')) {
  console.error('❌ Padrão não encontrado')
  process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ formatarMensagem agora aceita e propaga cupomCodigo!')
