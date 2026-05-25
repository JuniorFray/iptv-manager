import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Troca axios por fetch na validação do cupom em enviarUm + adiciona console.log
s = s.replace(
  `    // Substitui variáveis de cupom se informado
    if (cupomMassa.trim()) {
      try {
        const v1 = parseFloat(String((clienteSel as any).valor || '35').replace(',','.')) || 35
        const cRes = await axios.post(\`\${API}/pagamento/cupom/validar\`, { codigo: cupomMassa.trim(), valorOriginal: v1 })
        if (cRes.data.ok) {
          const ci = cRes.data
          msgFinal = msgFinal
            .replace(/{CUPOM}/gi,              ci.codigo)
            .replace(/{DESCONTO}/gi,            'R$ ' + String(ci.desconto).replace('.',','))
            .replace(/{VALOR_COM_DESCONTO}/gi,  'R$ ' + String(ci.final).replace('.',','))
            .replace(/{VALIDADE_CUPOM}/gi,      ci.validade || '')
        }
      } catch {}
    } else {
      msgFinal = msgFinal
        .replace(/{CUPOM}/gi, '').replace(/{DESCONTO}/gi, '')
        .replace(/{VALOR_COM_DESCONTO}/gi, '').replace(/{VALIDADE_CUPOM}/gi, '')
    }`,
  `    // Substitui variáveis de cupom se informado
    if (cupomMassa.trim()) {
      try {
        const v1 = parseFloat(String((clienteSel as any).valor || '35').replace(',','.')) || 35
        const cvRes = await fetch(\`\${API}/pagamento/cupom/validar\`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo: cupomMassa.trim(), valorOriginal: v1 })
        })
        const cvData = await cvRes.json()
        console.log('[CUPOM] validar resposta:', cvData)
        if (cvData.ok) {
          const descTxt = cvData.tipo === '%'
            ? (v1 * cvData.valor / 100).toFixed(2).replace('.', ',')
            : Number(cvData.valor).toFixed(2).replace('.', ',')
          const finalTxt = Math.max(0, v1 - parseFloat(descTxt.replace(',','.'))).toFixed(2).replace('.', ',')
          msgFinal = msgFinal
            .replace(/\{CUPOM\}/gi,             cvData.codigo || '')
            .replace(/\{DESCONTO\}/gi,           'R$ ' + descTxt)
            .replace(/\{VALOR_COM_DESCONTO\}/gi, 'R$ ' + finalTxt)
            .replace(/\{VALIDADE_CUPOM\}/gi,     cvData.validade || '')
          console.log('[CUPOM] variáveis substituídas. DESCONTO=R$ ' + descTxt)
        }
      } catch (e) { console.error('[CUPOM] erro na validação:', e) }
    } else {
      msgFinal = msgFinal
        .replace(/\{CUPOM\}/gi, '').replace(/\{DESCONTO\}/gi, '')
        .replace(/\{VALOR_COM_DESCONTO\}/gi, '').replace(/\{VALIDADE_CUPOM\}/gi, '')
    }`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ cupom validação trocado para fetch + console.log adicionado!')
