import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// 1. Remove o campo cupom do bloco Envio em Massa
s = s.replace(
  `              <div style={{ marginBottom: '12px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>🎟️ Cupom de desconto (opcional)</label>
                <input value={cupomMassa} onChange={e => setCupomMassa(e.target.value.toUpperCase())} placeholder="Ex: VOLTA10" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', outline: 'none', fontFamily: 'monospace', letterSpacing: '0.05em', boxSizing: 'border-box' as any }} />
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '4px 0 0' }}>Use nas mensagens: {'{CUPOM}'} {'{DESCONTO}'} {'{VALOR_COM_DESCONTO}'}</p>
              </div>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Intervalo entre envios (segundos)</label>`,
  `              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Intervalo entre envios (segundos)</label>`
)

// 2. Adiciona campo cupom acima da área de edição de mensagem (antes do textarea de mensagem)
// Procura o bloco de edição de mensagem e insere o campo cupom antes
s = s.replace(
  `            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>Mensagem</label>`,
  `            {/* Campo Cupom Global */}
            <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <label style={{ color: '#a5b4fc', fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>🎟️ Cupom de desconto (opcional)</label>
              <input value={cupomMassa} onChange={e => setCupomMassa(e.target.value.toUpperCase())} placeholder="Ex: VOLTA10 — aplica em envio individual e em massa"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', outline: 'none', fontFamily: 'monospace', letterSpacing: '0.05em', boxSizing: 'border-box' as any }} />
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '5px 0 0' }}>Variáveis disponíveis: {'{CUPOM}'} {'{DESCONTO}'} {'{VALOR_COM_DESCONTO}'} {'{VALIDADE_CUPOM}'}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>Mensagem</label>`
)

// 3. Aplica cupom também no envio individual — substituir variáveis na mensagem final
s = s.replace(
  `      const msgFormatada = mensagem
          .replace(/\{NOME\}/gi, clienteSel.nome ?? '')
          .replace(/\{VENCIMENTO\}/gi, clienteSel.vencimento ?? '')
          .replace(/\{SERVIDOR\}/gi, clienteSel.servidor ?? '')
          .replace(/\{USUARIO\}/gi, clienteSel.usuario ?? '')
          .replace(/\{SENHA\}/gi, clienteSel.senha ?? '')`,
  `      const v1ind = parseFloat(String(clienteSel.valor || '35').replace(',','.')) || 35
      let cupomInfoInd: any = null
      if (cupomMassa.trim()) {
        try {
          const cRes = await axios.post(\`\${API}/pagamento/cupom/validar\`, { codigo: cupomMassa.trim(), valorOriginal: v1ind })
          if (cRes.data.ok) cupomInfoInd = cRes.data
        } catch {}
      }
      const descontoInd = cupomInfoInd ? (cupomInfoInd.tipo === '%' ? v1ind * cupomInfoInd.valor / 100 : cupomInfoInd.valor) : 0
      const valorDescInd = Math.max(0, v1ind - descontoInd).toFixed(2).replace('.',',')
      const msgFormatada = mensagem
          .replace(/\{NOME\}/gi, clienteSel.nome ?? '')
          .replace(/\{VENCIMENTO\}/gi, clienteSel.vencimento ?? '')
          .replace(/\{SERVIDOR\}/gi, clienteSel.servidor ?? '')
          .replace(/\{USUARIO\}/gi, clienteSel.usuario ?? '')
          .replace(/\{SENHA\}/gi, clienteSel.senha ?? '')
          .replace(/\{CUPOM\}/gi, cupomInfoInd ? cupomInfoInd.codigo : '')
          .replace(/\{DESCONTO\}/gi, cupomInfoInd ? (cupomInfoInd.tipo === '%' ? cupomInfoInd.valor + '%' : 'R$ ' + descontoInd.toFixed(2).replace('.',',')) : '')
          .replace(/\{VALOR_COM_DESCONTO\}/gi, cupomInfoInd ? 'R$ ' + valorDescInd : '')`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ Campo cupom movido para acima da mensagem — funciona em individual e massa!')
