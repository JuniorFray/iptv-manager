import { readFileSync, writeFileSync } from 'fs'

// ── 1. Clientes/index.tsx — cupom no gerarLinkPagamento ─────────────────────
let cli = readFileSync('src/pages/Clientes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Adiciona estado cupomLink
cli = cli.replace(
  `  const [gerandoLinkId, setGerandoLinkId]   = useState<string | null>(null)`,
  `  const [gerandoLinkId, setGerandoLinkId]   = useState<string | null>(null)
  const [cupomLink, setCupomLink]             = useState('')
  const [cupomModal, setCupomModal]           = useState<Cliente | null>(null)`
)

// Modifica gerarLinkPagamento para usar cupomLink
cli = cli.replace(
  `  const gerarLinkPagamento = async (cliente: Cliente) => {
    setGerandoLinkId(cliente.id)
    try {
      // Agrupa pontos pelo responsável (ou pelo próprio telefone)
      const telResp = cliente.responsavel?.trim() || cliente.telefone
      const pontos = clientes.filter(c =>
        (c.responsavel?.trim() || c.telefone) === telResp && c.status === 'ativo'
      )
      // Gera links para cada ponto separadamente
      const allLinks: { ponto: string; plano: string; valor: number; link: string }[] = []
      for (const ponto of pontos) {
        const res = await fetch(\`\${BACKEND_URL}/pagamento/criar\`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId: ponto.id, clienteNome: ponto.nome,
            telefone: telResp, servidor: ponto.servidor,
            usuario: ponto.usuario, senha: ponto.senha,
            valor: ponto.valor, valor3meses: ponto.valor3meses, valor6meses: ponto.valor6meses,
          }),
        })
        const data = await res.json()
        if (data.ok && data.links) {
          data.links.forEach((l: any) => allLinks.push({ ponto: ponto.nome, ...l }))
        }
      }
      if (allLinks.length > 0) setLinksModal({ clienteNome: cliente.nome, links: allLinks, pontos: pontos.length > 1 })
      else mostrarMsgPainel('erro', 'Falha ao gerar links')
    } catch { mostrarMsgPainel('erro', 'Backend offline.') }
    setGerandoLinkId(null)
  }`,
  `  const gerarLinkPagamento = async (cliente: Cliente, cupom?: string) => {
    setCupomModal(null)
    setGerandoLinkId(cliente.id)
    try {
      const telResp = cliente.responsavel?.trim() || cliente.telefone
      const pontos = clientes.filter(c =>
        (c.responsavel?.trim() || c.telefone) === telResp && c.status === 'ativo'
      )
      const allLinks: { ponto: string; plano: string; valor: number; link: string }[] = []
      for (const ponto of pontos) {
        const res = await fetch(\`\${BACKEND_URL}/pagamento/criar\`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId: ponto.id, clienteNome: ponto.nome,
            telefone: telResp, servidor: ponto.servidor,
            usuario: ponto.usuario, senha: ponto.senha,
            valor: ponto.valor, valor3meses: ponto.valor3meses, valor6meses: ponto.valor6meses,
            cupomCodigo: cupom || undefined,
          }),
        })
        const data = await res.json()
        if (data.ok && data.links) {
          data.links.forEach((l: any) => allLinks.push({ ponto: ponto.nome, ...l }))
        }
      }
      if (allLinks.length > 0) setLinksModal({ clienteNome: cliente.nome, links: allLinks, pontos: pontos.length > 1 })
      else mostrarMsgPainel('erro', 'Falha ao gerar links')
    } catch { mostrarMsgPainel('erro', 'Backend offline.') }
    setGerandoLinkId(null)
    setCupomLink('')
  }`
)

// Substitui chamada do menu para abrir modal de cupom primeiro
cli = cli.replace(
  `                        onClick={() => { setMenuAbertoId(null); gerarLinkPagamento(c) }}`,
  `                        onClick={() => { setMenuAbertoId(null); setCupomModal(c); setCupomLink('') }}`
)

// Adiciona modal de cupom antes do linksModal
cli = cli.replace(
  `      {linksModal && (`,
  `      {/* Modal Cupom */}
      {cupomModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="glass-card" style={{ padding: '28px', width: '100%', maxWidth: '380px' }}>
            <h3 style={{ color: 'white', margin: '0 0 6px', fontSize: '17px' }}>💳 Gerar Links</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: '0 0 20px' }}>{cupomModal.nome}</p>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Cupom de desconto (opcional)</label>
            <input
              value={cupomLink} onChange={e => setCupomLink(e.target.value.toUpperCase())}
              placeholder="Ex: MAIO10"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '14px', outline: 'none', marginBottom: '16px', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '0.05em' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setCupomModal(null); setCupomLink('') }} style={{ flex: 1, padding: '11px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>Cancelar</button>
              <button onClick={() => gerarLinkPagamento(cupomModal, cupomLink || undefined)} style={{ flex: 2, padding: '11px', borderRadius: '10px', cursor: 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '14px' }}>
                {cupomLink ? \`🎟️ Aplicar "\${cupomLink}" e Gerar\` : '🔗 Gerar sem cupom'}
              </button>
            </div>
          </div>
        </div>
      )}

      {linksModal && (`
)

writeFileSync('src/pages/Clientes/index.tsx', cli, 'utf8')
console.log('✅ Clientes/index.tsx — cupom no modal de links!')

// ── 2. Notificacoes/index.tsx — variáveis {CUPOM}, {DESCONTO}, {VALOR_COM_DESCONTO}
let notif = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

notif = notif.replace(
  `const VARIAVEIS = ['{NOME}', '{VENCIMENTO}', '{SERVIDOR}', '{VALOR}', '{VALOR_3MESES}', '{VALOR_6MESES}', '{LINK_1MES}', '{LINK_3MESES}', '{LINK_6MESES}']`,
  `const VARIAVEIS = ['{NOME}', '{VENCIMENTO}', '{SERVIDOR}', '{VALOR}', '{VALOR_3MESES}', '{VALOR_6MESES}', '{LINK_1MES}', '{LINK_3MESES}', '{LINK_6MESES}', '{CUPOM}', '{DESCONTO}', '{VALOR_COM_DESCONTO}', '{VALIDADE_CUPOM}']`
)

writeFileSync('src/pages/Notificacoes/index.tsx', notif, 'utf8')
console.log('✅ Notificacoes/index.tsx — variáveis de cupom adicionadas!')

// ── 3. Pagamentos/index.tsx — seção de gerenciamento de cupons ───────────────
let pag = readFileSync('src/pages/Pagamentos/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Adiciona imports e estado
pag = pag.replace(
  `import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react'`,
  `import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle, Clock, XCircle, RefreshCw, Tag, Trash2, ToggleLeft, ToggleRight, Plus } from 'lucide-react'`
)

pag = pag.replace(
  `  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')`,
  `  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [cupons, setCupons] = useState<any[]>([])
  const [abaCupom, setAbaCupom] = useState(false)
  const [novoCupom, setNovoCupom] = useState({ codigo: '', tipo: '%', valor: '', maxUsos: '', validade: '' })
  const [criandoCupom, setCriandoCupom] = useState(false)
  const [msgCupom, setMsgCupom] = useState('')`
)

// Adiciona funções de cupom após useEffect
pag = pag.replace(
  `  const totalRecebido`,
  `  const carregarCupons = async () => {
    try {
      const res = await fetch(\`\${API}/pagamento/cupons\`)
      const data = await res.json()
      setCupons(Array.isArray(data) ? data : [])
    } catch {}
  }

  useEffect(() => { if (abaCupom) carregarCupons() }, [abaCupom])

  const criarCupom = async () => {
    if (!novoCupom.codigo || !novoCupom.valor) { setMsgCupom('Preencha código e valor.'); return }
    setCriandoCupom(true)
    try {
      const res = await fetch(\`\${API}/pagamento/cupom\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...novoCupom, valor: Number(novoCupom.valor), maxUsos: novoCupom.maxUsos ? Number(novoCupom.maxUsos) : null }),
      })
      const data = await res.json()
      if (data.ok) { setMsgCupom('✅ Cupom criado!'); setNovoCupom({ codigo: '', tipo: '%', valor: '', maxUsos: '', validade: '' }); carregarCupons() }
      else setMsgCupom('❌ ' + (data.error ?? 'Erro'))
    } catch { setMsgCupom('❌ Erro ao criar cupom') }
    setCriandoCupom(false)
    setTimeout(() => setMsgCupom(''), 3000)
  }

  const toggleCupom = async (codigo: string) => {
    await fetch(\`\${API}/pagamento/cupom/\${codigo}/toggle\`, { method: 'PATCH' })
    carregarCupons()
  }

  const deletarCupom = async (codigo: string) => {
    if (!confirm(\`Excluir cupom "\${codigo}"?\`)) return
    await fetch(\`\${API}/pagamento/cupom/\${codigo}\`, { method: 'DELETE' })
    carregarCupons()
  }

  const totalRecebido`
)

// Adiciona toggle de aba antes do return
pag = pag.replace(
  `  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>💳 Pagamentos</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>Histórico de pagamentos via Mercado Pago</p>
        </div>
        <button onClick={() => {
          setLoading(true)
          fetch(\`\${API}/pagamento/historico\`).then(r => r.json()).then(d => { if (d.ok) setPagamentos(d.pagamentos); setLoading(false) })
        }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px' }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>`,
  `  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>💳 Pagamentos</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>Histórico de pagamentos via Mercado Pago</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setAbaCupom(false)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: !abaCupom ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)', border: !abaCupom ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', color: !abaCupom ? '#a5b4fc' : 'rgba(255,255,255,0.5)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: !abaCupom ? '600' : '400' }}>
            <CreditCard size={14} /> Histórico
          </button>
          <button onClick={() => setAbaCupom(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: abaCupom ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)', border: abaCupom ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', color: abaCupom ? '#a5b4fc' : 'rgba(255,255,255,0.5)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: abaCupom ? '600' : '400' }}>
            <Tag size={14} /> Cupons
          </button>
          {!abaCupom && <button onClick={() => { setLoading(true); fetch(\`\${API}/pagamento/historico\`).then(r => r.json()).then(d => { if (d.ok) setPagamentos(d.pagamentos); setLoading(false) }) }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px' }}><RefreshCw size={14} /> Atualizar</button>}
        </div>
      </div>

      {/* ── ABA CUPONS ── */}
      {abaCupom && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Criar cupom */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ color: 'white', margin: '0 0 18px', fontSize: '15px' }}>🎟️ Criar novo cupom</h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {[
                { label: 'Código', key: 'codigo', placeholder: 'Ex: MAIO10', style: { textTransform: 'uppercase', fontFamily: 'monospace' } },
                { label: 'Valor', key: 'valor', placeholder: 'Ex: 10', type: 'number' },
                { label: 'Máx. usos (opcional)', key: 'maxUsos', placeholder: 'Ilimitado', type: 'number' },
                { label: 'Validade (opcional)', key: 'validade', placeholder: 'DD/MM/AAAA' },
              ].map(({ label, key, placeholder, type, style: st }: any) => (
                <div key={key} style={{ flex: '1', minWidth: '140px' }}>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>{label}</label>
                  <input type={type ?? 'text'} value={(novoCupom as any)[key]} placeholder={placeholder}
                    onChange={e => setNovoCupom({ ...novoCupom, [key]: key === 'codigo' ? e.target.value.toUpperCase() : e.target.value })}
                    style={{ ...st, width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ flex: '1', minWidth: '120px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Tipo</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['%', 'R$'].map(t => (
                    <button key={t} onClick={() => setNovoCupom({ ...novoCupom, tipo: t })}
                      style={{ flex: 1, padding: '9px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', background: novoCupom.tipo === t ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)', border: novoCupom.tipo === t ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', color: novoCupom.tipo === t ? '#a5b4fc' : 'rgba(255,255,255,0.4)' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={criarCupom} disabled={criandoCupom} style={{ padding: '9px 20px', borderRadius: '8px', cursor: 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <Plus size={14} /> {criandoCupom ? 'Criando...' : 'Criar'}
              </button>
            </div>
            {msgCupom && <p style={{ color: msgCupom.startsWith('✅') ? '#4ade80' : '#f87171', fontSize: '13px', margin: '12px 0 0', fontWeight: '600' }}>{msgCupom}</p>}
          </div>

          {/* Lista de cupons */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>📋 Cupons cadastrados</h3>
              <button onClick={carregarCupons} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px' }}><RefreshCw size={12} /></button>
            </div>
            {cupons.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '30px 0' }}>Nenhum cupom cadastrado.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Código', 'Desconto', 'Usos', 'Validade', 'Status', 'Ações'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cupons.map(c => (
                      <tr key={c.codigo} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px', color: '#a5b4fc', fontFamily: 'monospace', fontWeight: '700', fontSize: '14px' }}>{c.codigo}</td>
                        <td style={{ padding: '10px 14px', color: 'white', fontSize: '13px' }}>{c.tipo === '%' ? \`\${c.valor}%\` : \`R$ \${c.valor.toFixed(2)}\`}</td>
                        <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{c.usos}{c.maxUsos ? \`/\${c.maxUsos}\` : ''}</td>
                        <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{c.validade || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: c.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: c.ativo ? '#4ade80' : '#f87171', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>{c.ativo ? 'Ativo' : 'Inativo'}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => toggleCupom(c.codigo)} title={c.ativo ? 'Desativar' : 'Ativar'} style={{ padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                              {c.ativo ? <ToggleRight size={14} color="#4ade80" /> : <ToggleLeft size={14} />}
                            </button>
                            <button onClick={() => deletarCupom(c.codigo)} title="Excluir" style={{ padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!abaCupom && <>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div></div>
      </div>`
)

// Fecha o bloco condicional !abaCupom antes do </div> final
pag = pag.replace(
  `    </div>
  )
}`,
  `    </>}
    </div>
  )
}`
)

writeFileSync('src/pages/Pagamentos/index.tsx', pag, 'utf8')
console.log('✅ Pagamentos/index.tsx — gerenciamento de cupons adicionado!')
