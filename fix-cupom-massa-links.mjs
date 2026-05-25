import { readFileSync, writeFileSync } from 'fs'

// ── FRONTEND: adiciona cupomCodigo no payload da fila ────────────────────────
let fe = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

fe = fe.replace(
  `            mensagem:    base,
            cliente:     c,`,
  `            mensagem:    base,
            cliente:     c,
            cupomCodigo: cupomMassa.trim() || undefined,`
)

writeFileSync('src/pages/Notificacoes/index.tsx', fe, 'utf8')
console.log('✅ Frontend: cupomCodigo no fila/adicionar!')

// ── BACKEND: aceita cupomCodigo em fila/adicionar e propaga ──────────────────
let be = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

// 1. Desestrutura cupomCodigo no fila/adicionar
be = be.replace(
  `      const { clienteId, clienteNome, telefone, mensagem, gatilho, midiaUrl, midiaTipo, midiaNome, modoEnvio, cliente, pontos } = req.body`,
  `      const { clienteId, clienteNome, telefone, mensagem, gatilho, midiaUrl, midiaTipo, midiaNome, modoEnvio, cliente, pontos, cupomCodigo } = req.body`
)

// 2. Passa cupomCodigo para gerarLinksCliente no bloco de pontos
be = be.replace(
  `        for (const p of pontos) {
          const links = await gerarLinksCliente(p)`,
  `        for (const p of pontos) {
          const links = await gerarLinksCliente(p, cupomCodigo)`
)

// 3. Passa cupomCodigo para formatarMensagem no bloco de cliente único
be = be.replace(
  `      } else if (cliente) {
        mensagemFinal = await formatarMensagem(mensagem, cliente)`,
  `      } else if (cliente) {
        mensagemFinal = await formatarMensagem(mensagem, cliente, cupomCodigo)`
)

// 4. formatarMensagem aceita cupomCodigo e passa para gerarLinksCliente
be = be.replace(
  `  const formatarMensagem = async (template, cliente) => {
    try {
      const links = await gerarLinksCliente(cliente)`,
  `  const formatarMensagem = async (template, cliente, cupomCodigo) => {
    try {
      const links = await gerarLinksCliente(cliente, cupomCodigo)`
)

// 5. gerarLinksCliente aceita cupomCodigo e passa para /pagamento/criar
be = be.replace(
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
      })`,
  `const gerarLinksCliente = async (cliente, cupomCodigo) => {
    try {
      const BACKEND = 'https://iptv-manager-production.up.railway.app'
      const res = await fetch(\`\${BACKEND}/pagamento/criar\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: cliente.id, clienteNome: cliente.nome,
          telefone: cliente.telefone, servidor: cliente.servidor,
          usuario: cliente.usuario, senha: cliente.senha,
          valor: cliente.valor, valor3meses: cliente.valor3meses, valor6meses: cliente.valor6meses,
          cupomCodigo: cupomCodigo || undefined,
        })
      })`
)

// 6. Também propaga cupomCodigo nas chamadas do auto-send (executarEnvioAutomatico)
be = be.replace(
  `            const links = await gerarLinksCliente(p)
            const venc  = p.vencimento || '—'`,
  `            const links = await gerarLinksCliente(p)  // auto-send sem cupom (cupom é só manual)
            const venc  = p.vencimento || '—'`
)

writeFileSync('backend/routes/whatsapp.js', be, 'utf8')
console.log('✅ Backend: cupomCodigo propagado em fila/adicionar → formatarMensagem → gerarLinksCliente!')
