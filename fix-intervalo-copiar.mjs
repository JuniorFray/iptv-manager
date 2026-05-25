import { readFileSync, writeFileSync } from 'fs'

// ── Fix 1: Notificacoes — salvar intervalo no Firestore ao enviar ────────────
let notif = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

notif = notif.replace(
  `  const enviarTodos = async () => {
    if (enviando || clientesFiltrados.length === 0) return
    if (!mensagem.trim() && !midiaManual) return
    cancelarEnvioRef.current = false
    setEnviando(true); setProgresso(0)`,
  `  const enviarTodos = async () => {
    if (enviando || clientesFiltrados.length === 0) return
    if (!mensagem.trim() && !midiaManual) return
    cancelarEnvioRef.current = false
    setEnviando(true); setProgresso(0)
    // Salva intervalo no Firestore antes de enviar
    try {
      await axios.post(\`\${API}/config\`, { ...config, intervaloMin, intervaloMax })
    } catch (e) { console.error('Erro ao salvar intervalo:', e) }`
)

writeFileSync('src/pages/Notificacoes/index.tsx', notif, 'utf8')
console.log('✅ Notificacoes — intervalo salvo ao clicar Enviar todos!')

// ── Fix 2: Clientes — botão Copiar dados no dropdown ────────────────────────
let cli = readFileSync('src/pages/Clientes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Adiciona botão Copiar antes do botão Excluir
cli = cli.replace(
  `                        <button
                          onClick={() => { setMenuAbertoId(null); excluirCliente(c.id) }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#f87171', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Trash2 size={13} /> Excluir
                        </button>`,
  `                        {/* Copiar dados */}
                        <button
                          onClick={() => {
                            setMenuAbertoId(null)
                            const texto = [
                              \`Nome: \${c.nome || ''}\`,
                              \`Usuário: \${c.usuario || ''}\`,
                              \`Senha: \${c.senha || ''}\`,
                              \`Vencimento: \${c.vencimento || ''}\`,
                            ].join('\\n')
                            navigator.clipboard.writeText(texto)
                          }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#94a3b8', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          📋 Copiar dados
                        </button>

                        <button
                          onClick={() => { setMenuAbertoId(null); excluirCliente(c.id) }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#f87171', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Trash2 size={13} /> Excluir
                        </button>`
)

writeFileSync('src/pages/Clientes/index.tsx', cli, 'utf8')
console.log('✅ Clientes — botão Copiar dados adicionado!')
