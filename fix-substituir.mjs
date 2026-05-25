import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Fix 1: corrige substituir para usar {VARIAVEL} com chaves
s = s.replace(
  `const substituir = (texto: string, c: Cliente) => {
    const valor = c.valor ? \`R$ \${parseFloat(c.valor).toFixed(2).replace('.', ',')}\` : ''
    return texto
      .replace(/NOME/gi, c.nome).replace(/VENCIMENTO/gi, c.vencimento)
      .replace(/SERVIDOR/gi, c.servidor).replace(/VALOR/gi, valor)
  }`,
  `const substituir = (texto: string, c: Cliente) => {
    const valor = c.valor ? \`R$ \${parseFloat(c.valor).toFixed(2).replace('.', ',')}\` : ''
    return texto
      .replace(/\{NOME\}/gi, c.nome ?? '').replace(/\{VENCIMENTO\}/gi, c.vencimento ?? '')
      .replace(/\{SERVIDOR\}/gi, c.servidor ?? '').replace(/\{USUARIO\}/gi, c.usuario ?? '')
      .replace(/\{SENHA\}/gi, c.senha ?? '').replace(/\{VALOR\}/gi, valor)
  }`
)

// Fix 2: substituir variáveis de cupom na mensagem antes de enviar individualmente
s = s.replace(
  `    try {
      if (!midiaManual) {
        // Só texto
        const res = await fetch(\`\${API}/send\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: mensagem, cliente: clienteSel }) })`,
  `    // Substitui variáveis de cupom na mensagem
    let mensagemEnvio = mensagem
    if (cupomMassa.trim()) {
      try {
        const cRes = await axios.post(\`\${API}/pagamento/cupom/validar\`, { codigo: cupomMassa.trim(), valorOriginal: parseFloat(String(clienteSel.valor || '35').replace(',','.')) || 35 })
        if (cRes.data.ok) {
          const ci = cRes.data
          const desc = ci.tipo === '%' ? ((parseFloat(String(clienteSel.valor||'35').replace(',','.'))||35) * ci.valor / 100) : ci.valor
          const vDesc = Math.max(0, (parseFloat(String(clienteSel.valor||'35').replace(',','.'))||35) - desc).toFixed(2).replace('.',',')
          mensagemEnvio = mensagemEnvio
            .replace(/\{CUPOM\}/gi, ci.codigo)
            .replace(/\{DESCONTO\}/gi, ci.tipo === '%' ? ci.valor + '%' : 'R$ ' + desc.toFixed(2).replace('.',','))
            .replace(/\{VALOR_COM_DESCONTO\}/gi, 'R$ ' + vDesc)
            .replace(/\{VALIDADE_CUPOM\}/gi, ci.validade || '')
        }
      } catch {}
    }

    try {
      if (!midiaManual) {
        // Só texto
        const res = await fetch(\`\${API}/send\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: mensagemEnvio, cliente: clienteSel }) })`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ substituir corrigido + cupom no envio individual!')
