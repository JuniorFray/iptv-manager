import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Corrige o bloco de cupom completamente
s = s.replace(
  `    // Valida cupom se informado
    let __cupomInfo: any = null
    if (cupomMassa.trim()) {
      try {
        const res = await axios.post(\`\${API}/cupom/validar\`, { codigo: cupomMassa.trim(), valorOriginal: 35 })
        if (res.data.ok) _cupomInfo = res.data
        else alert('Cupom inválido: ' + res.data.error)
      } catch {}
    }`,
  `    // Valida cupom se informado
    let cupomInfo: any = null
    if (cupomMassa.trim()) {
      try {
        const res = await axios.post(\`\${API}/pagamento/cupom/validar\`, { codigo: cupomMassa.trim(), valorOriginal: 35 })
        if (res.data.ok) cupomInfo = res.data
        else alert('Cupom inválido: ' + res.data.error)
      } catch { console.warn('Erro ao validar cupom') }
    }
    void cupomInfo`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ cupomInfo corrigido!')
