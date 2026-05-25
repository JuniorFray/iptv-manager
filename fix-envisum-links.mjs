import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Encontra o bloco enviarUm atual e substitui por versão que gera links no frontend
const OLD = `  const enviarUm = async () => {
    if (!clienteSel) return
    if (!mensagem.trim() && !midiaManual) return
    const textoFinal = substituir(mensagem, clienteSel)
    const phone = formatarTelefone(clienteSel.telefone)`

const NEW = `  const enviarUm = async () => {
    if (!clienteSel) return
    if (!mensagem.trim() && !midiaManual) return
    const phone = formatarTelefone(clienteSel.telefone)

    // Substitui variáveis básicas
    let msgFinal = mensagem
      .replace(/\{NOME\}/gi,       clienteSel.nome       ?? '')
      .replace(/\{VENCIMENTO\}/gi, clienteSel.vencimento  ?? '')
      .replace(/\{SERVIDOR\}/gi,   clienteSel.servidor    ?? '')
      .replace(/\{VALOR\}/gi,      clienteSel.valor ? 'R$ ' + parseFloat(String(clienteSel.valor).replace(',','.')).toFixed(2).replace('.',',') : '')

    // Substitui variáveis de cupom se informado
    if (cupomMassa.trim()) {
      try {
        const v1 = parseFloat(String((clienteSel as any).valor || '35').replace(',','.')) || 35
        const cRes = await axios.post(\`\${API}/pagamento/cupom/validar\`, { codigo: cupomMassa.trim(), valorOriginal: v1 })
        if (cRes.data.ok) {
          const ci = cRes.data
          msgFinal = msgFinal
            .replace(/\{CUPOM\}/gi,              ci.codigo)
            .replace(/\{DESCONTO\}/gi,            'R$ ' + String(ci.desconto).replace('.',','))
            .replace(/\{VALOR_COM_DESCONTO\}/gi,  'R$ ' + String(ci.final).replace('.',','))
            .replace(/\{VALIDADE_CUPOM\}/gi,      ci.validade || '')
        }
      } catch {}
    } else {
      msgFinal = msgFinal
        .replace(/\{CUPOM\}/gi, '').replace(/\{DESCONTO\}/gi, '')
        .replace(/\{VALOR_COM_DESCONTO\}/gi, '').replace(/\{VALIDADE_CUPOM\}/gi, '')
    }

    // Gera links no frontend e substitui {LINK_1MES} etc.
    if (msgFinal.match(/\{LINK_[^}]+\}/i)) {
      try {
        const lRes = await fetch(\`\${API}/pagamento/criar\`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId: (clienteSel as any).id, clienteNome: clienteSel.nome,
            telefone: clienteSel.telefone, servidor: (clienteSel as any).servidor,
            usuario: (clienteSel as any).usuario, senha: (clienteSel as any).senha,
            valor: (clienteSel as any).valor, valor3meses: (clienteSel as any).valor3meses,
            valor6meses: (clienteSel as any).valor6meses,
            cupomCodigo: cupomMassa.trim() || undefined,
          })
        })
        const lData = await lRes.json()
        if (lData.ok && lData.links) {
          const link1   = lData.links.find((l: any) => l.plano.includes('1'))?.link || ''
          const link3   = lData.links.find((l: any) => l.plano.includes('3'))?.link || ''
          const link6   = lData.links.find((l: any) => l.plano.includes('6'))?.link || ''
          msgFinal = msgFinal
            .replace(/\{LINK_1MES\}/gi,   link1)
            .replace(/\{LINK_3MESES\}/gi, link3)
            .replace(/\{LINK_6MESES\}/gi, link6)
        }
      } catch {}
    }

    const textoFinal = msgFinal`

if (!s.includes(OLD.trim())) {
  console.error('❌ Padrão enviarUm não encontrado')
  process.exit(1)
}

s = s.replace(OLD, NEW)

// Agora garante que o send usa msgFinal (não mensagem) e não passa cliente (evita formatarMensagem)
s = s.replace(
  `        const res = await fetch(\`\${API}/send\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: mensagem, cliente: clienteSel }) })`,
  `        const res = await fetch(\`\${API}/send\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: msgFinal }) })`
)

// Garante que mídia com legenda também usa msgFinal
s = s.replace(
  `          body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: mensagem, cliente: clienteSel }) })`,
  `          body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: msgFinal }) })`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ enviarUm reescrito — links gerados no frontend!')
