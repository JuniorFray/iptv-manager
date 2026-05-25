import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// ── Fix 1: filtro inativos case-insensitive + sem telefone obrigatório ────────
// Count badge
s = s.replace(
  `                        : f.id === 'inativos'
                        ? clientes.filter(c => c.telefone && c.status === 'inativo').length`,
  `                        : f.id === 'inativos'
                        ? clientes.filter(c => c.status?.toLowerCase() === 'inativo' || (!c.status && c.telefone)).length`
)

// clientesFiltrados
s = s.replace(
  `    let lista = filtro === 'inativos'
      ? clientes.filter(c => c.telefone && c.status === 'inativo')
      : clientes.filter(c => c.telefone && c.status !== 'inativo')`,
  `    let lista = filtro === 'inativos'
      ? clientes.filter(c => c.telefone && (c.status?.toLowerCase() === 'inativo' || !c.status))
      : clientes.filter(c => c.telefone && c.status?.toLowerCase() !== 'inativo' && c.status)`
)

// ── Fix 2: campo cupom no envio em massa ──────────────────────────────────────
// Adiciona estado cupomMassa
s = s.replace(
  `  const [intervaloMin, setIntervaloMin]   = useState(5000)
  const [intervaloMax, setIntervaloMax]   = useState(15000)`,
  `  const [intervaloMin, setIntervaloMin]   = useState(5000)
  const [intervaloMax, setIntervaloMax]   = useState(15000)
  const [cupomMassa, setCupomMassa]       = useState('')`
)

// Valida e aplica cupom antes de enviar — substitui variáveis na mensagem por cliente
s = s.replace(
  `  const enviarTodos = async () => {
    if (enviando || clientesFiltrados.length === 0) return
    if (!mensagem.trim() && !midiaManual) return
    cancelarEnvioRef.current = false
    setEnviando(true); setProgresso(0)
    // Salva intervalo no Firestore antes de enviar
    try {
      await axios.post(\`\${API}/config\`, { ...config, intervaloMin, intervaloMax })
    } catch (e) { console.error('Erro ao salvar intervalo:', e) }`,
  `  const enviarTodos = async () => {
    if (enviando || clientesFiltrados.length === 0) return
    if (!mensagem.trim() && !midiaManual) return
    cancelarEnvioRef.current = false
    setEnviando(true); setProgresso(0)
    // Salva intervalo no Firestore antes de enviar
    try {
      await axios.post(\`\${API}/config\`, { ...config, intervaloMin, intervaloMax })
    } catch (e) { console.error('Erro ao salvar intervalo:', e) }

    // Valida cupom se informado
    let cupomInfo: any = null
    if (cupomMassa.trim()) {
      try {
        const res = await axios.post(\`\${API}/cupom/validar\`, { codigo: cupomMassa.trim(), valorOriginal: 35 })
        if (res.data.ok) cupomInfo = res.data
        else alert('Cupom inválido: ' + res.data.error)
      } catch {}
    }`
)

// Substitui variáveis de cupom na mensagem por cliente
s = s.replace(
  `        const mensagemFinal = (midiaManual ? '' : mensagem)
          .replace(/\{NOME\}/gi, cliente.nome ?? '')
          .replace(/\{VENCIMENTO\}/gi, cliente.vencimento ?? '')
          .replace(/\{SERVIDOR\}/gi, cliente.servidor ?? '')
          .replace(/\{USUARIO\}/gi, cliente.usuario ?? '')
          .replace(/\{SENHA\}/gi, cliente.senha ?? '')`,
  `        const v1orig = parseFloat(String(cliente.valor || '35').replace(',','.')) || 35
        const desconto = cupomInfo ? (cupomInfo.tipo === '%' ? v1orig * cupomInfo.valor / 100 : cupomInfo.valor) : 0
        const valorDesc = Math.max(0, v1orig - desconto).toFixed(2).replace('.',',')
        const mensagemFinal = (midiaManual ? '' : mensagem)
          .replace(/\{NOME\}/gi, cliente.nome ?? '')
          .replace(/\{VENCIMENTO\}/gi, cliente.vencimento ?? '')
          .replace(/\{SERVIDOR\}/gi, cliente.servidor ?? '')
          .replace(/\{USUARIO\}/gi, cliente.usuario ?? '')
          .replace(/\{SENHA\}/gi, cliente.senha ?? '')
          .replace(/\{CUPOM\}/gi, cupomInfo ? cupomInfo.codigo : '')
          .replace(/\{DESCONTO\}/gi, cupomInfo ? (cupomInfo.tipo === '%' ? cupomInfo.valor + '%' : 'R$ ' + desconto.toFixed(2).replace('.',',')) : '')
          .replace(/\{VALOR_COM_DESCONTO\}/gi, cupomInfo ? 'R$ ' + valorDesc : '')`
)

// Adiciona campo cupom no layout Envio em Massa
s = s.replace(
  `              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Intervalo entre envios (segundos)</label>`,
  `              <div style={{ marginBottom: '12px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>🎟️ Cupom de desconto (opcional)</label>
                <input value={cupomMassa} onChange={e => setCupomMassa(e.target.value.toUpperCase())} placeholder="Ex: VOLTA10" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', outline: 'none', fontFamily: 'monospace', letterSpacing: '0.05em', boxSizing: 'border-box' as any }} />
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '4px 0 0' }}>Use nas mensagens: {'{CUPOM}'} {'{DESCONTO}'} {'{VALOR_COM_DESCONTO}'}</p>
              </div>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Intervalo entre envios (segundos)</label>`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ Filtro inativos corrigido + campo cupom no envio em massa!')
