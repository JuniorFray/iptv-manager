import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Editar Mensagem</h3>`,
  `            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Editar Mensagem</h3>
              {/* Campo Cupom Global */}
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <label style={{ color: '#a5b4fc', fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>🎟️ Cupom de desconto (opcional)</label>
                <input value={cupomMassa} onChange={e => setCupomMassa(e.target.value.toUpperCase())} placeholder="Ex: VOLTA10 — aplica em individual e massa"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', outline: 'none', fontFamily: 'monospace', letterSpacing: '0.05em', boxSizing: 'border-box' as any }} />
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '5px 0 0' }}>Use nas mensagens: {'{CUPOM}'} {'{DESCONTO}'} {'{VALOR_COM_DESCONTO}'}</p>
              </div>`
)

if (!s.includes('setCupomMassa(e.target')) {
  console.error('❌ Padrão não encontrado')
  process.exit(1)
}

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ Campo cupom inserido acima da edição de mensagem!')
