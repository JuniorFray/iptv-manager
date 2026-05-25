import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `const gerarLinksCliente = async (cliente) => {
    try {
      const BACKEND = 'https://iptv-manager-production.up.railway.app'
      const res = await fetch(\`\${BACKEND}/pagamento/criar\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: cliente.id, clienteNome: cliente.nome,
          telefone: cliente.telefone, servidor: cliente.servidor,
          usuario: cliente.usuario, senha: cliente.senha,
          valor: cliente.valor, valor3meses: cliente.valor3meses, valor6meses: cliente.valor6meses,
        })
      })`,
  `const gerarLinksCliente = async (cliente) => {
    try {
      const BACKEND = 'https://iptv-manager-production.up.railway.app'
      console.log('[LINKS] gerando para:', cliente.nome, '| usuario:', cliente.usuario, '| servidor:', cliente.servidor)
      const res = await fetch(\`\${BACKEND}/pagamento/criar\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: cliente.id, clienteNome: cliente.nome,
          telefone: cliente.telefone, servidor: cliente.servidor,
          usuario: cliente.usuario, senha: cliente.senha,
          valor: cliente.valor, valor3meses: cliente.valor3meses, valor6meses: cliente.valor6meses,
        })
      })`
)

s = s.replace(
  `      if (!data.ok) return null`,
  `      console.log('[LINKS] resposta pagamento:', JSON.stringify(data).substring(0,200))
      if (!data.ok) return null`
)

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ logs adicionados em gerarLinksCliente!')
