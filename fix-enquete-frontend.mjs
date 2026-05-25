import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// 1. Adiciona estados da enquete após os estados existentes
s = s.replace(
  `  const [abaMsg,       setAbaMsg]       = useState(0)`,
  `  const [abaMsg,       setAbaMsg]       = useState(0)
  // Enquete
  const [modoEnquete,   setModoEnquete]   = useState(false)
  const [enqueteTitulo, setEnqueteTitulo] = useState('')
  const [enqueteOpcoes, setEnqueteOpcoes] = useState(['', '', ''])`
)

// 2. Adiciona função enviarEnqueteUm antes do enviarUm
const fnEnquete = `
  const enviarEnqueteUm = async () => {
    if (!clienteSel) return
    const opcoes = enqueteOpcoes.filter(o => o.trim())
    if (!enqueteTitulo.trim() || opcoes.length < 2) return
    const phone = formatarTelefone(clienteSel.telefone)
    try {
      await fetch(\`\${API}/send/poll\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, titulo: enqueteTitulo.trim(), opcoes })
      })
    } catch {}
  }

  const enviarEnqueteTodos = async () => {
    const opcoes = enqueteOpcoes.filter(o => o.trim())
    if (!enqueteTitulo.trim() || opcoes.length < 2) return
    setEnviando(true)
    let adicionados = 0
    const processados = new Set<string>()
    for (const c of clientesFiltrados) {
      if (!c.telefone || processados.has(c.telefone)) continue
      processados.add(c.telefone)
      try {
        await fetch(\`\${API}/send/poll\`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formatarTelefone(c.telefone), titulo: enqueteTitulo.trim(), opcoes })
        })
        adicionados++
      } catch {}
      await new Promise(r => setTimeout(r, 1500))
    }
    setResultado({ tipo: 'ok', msg: \`\${adicionados} enquetes enviadas!\` })
    setEnviando(false)
  }

`

s = s.replace(
  `  const enviarUm = async () => {`,
  fnEnquete + `  const enviarUm = async () => {`
)

// 3. Adiciona toggle Mensagem/Enquete e campos de enquete na seção "Editar Mensagem"
s = s.replace(
  `              <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Editar Mensagem</h3>`,
  `              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>Editar Mensagem</h3>
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px' }}>
                  <button onClick={() => setModoEnquete(false)} style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: !modoEnquete ? 'rgba(99,102,241,0.4)' : 'transparent', color: !modoEnquete ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>✉️ Mensagem</button>
                  <button onClick={() => setModoEnquete(true)}  style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: modoEnquete  ? 'rgba(99,102,241,0.4)' : 'transparent', color: modoEnquete  ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>📊 Enquete</button>
                </div>
              </div>
              {modoEnquete && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                  <input value={enqueteTitulo} onChange={e => setEnqueteTitulo(e.target.value)} placeholder="Título da enquete (ex: Qual plano você prefere?)"
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '13px', outline: 'none' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {enqueteOpcoes.map((op, i) => (
                      <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', width: '20px', textAlign: 'right' }}>{i+1}.</span>
                        <input value={op} onChange={e => { const arr = [...enqueteOpcoes]; arr[i] = e.target.value; setEnqueteOpcoes(arr) }}
                          placeholder={\`Opção \${i+1}\`}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '12px', outline: 'none' }} />
                        {enqueteOpcoes.length > 2 && (
                          <button onClick={() => setEnqueteOpcoes(enqueteOpcoes.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.6)', padding: '4px' }}>✕</button>
                        )}
                      </div>
                    ))}
                    {enqueteOpcoes.length < 12 && (
                      <button onClick={() => setEnqueteOpcoes([...enqueteOpcoes, ''])} style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '12px' }}>+ Adicionar opção</button>
                    )}
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: 0 }}>Mínimo 2 opções • Máximo 12 opções</p>
                </div>
              )}`
)

// 4. Botão individual — adapta para enquete
s = s.replace(
  `              <button onClick={enviarUm} disabled={!clienteSel || (!mensagem.trim() && !midiaManual) || !whatsReady}`,
  `              <button onClick={modoEnquete ? enviarEnqueteUm : enviarUm} disabled={!clienteSel || (!modoEnquete ? (!mensagem.trim() && !midiaManual) : (!enqueteTitulo.trim() || enqueteOpcoes.filter(o=>o.trim()).length < 2)) || !whatsReady}`
)

// 5. Botão massa — adapta para enquete
s = s.replace(
  `                <button onClick={enviarTodos} disabled={enviando || clientesFiltrados.length === 0 || (!mensagem.trim() && !midiaManual) || !whatsReady}`,
  `                <button onClick={modoEnquete ? enviarEnqueteTodos : enviarTodos} disabled={enviando || clientesFiltrados.length === 0 || (!modoEnquete ? (!mensagem.trim() && !midiaManual) : (!enqueteTitulo.trim() || enqueteOpcoes.filter(o=>o.trim()).length < 2)) || !whatsReady}`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('Frontend enquete aplicado!')
