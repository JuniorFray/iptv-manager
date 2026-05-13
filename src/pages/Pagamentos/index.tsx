import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle, Clock, XCircle, RefreshCw, Tag, Trash2, ToggleLeft, ToggleRight, Plus } from 'lucide-react'

const API = 'https://iptv-manager-production.up.railway.app'

interface Pagamento {
  id: string
  clienteNome: string
  telefone: string
  servidor: string
  usuario: string
  valor: number | null
  plano: string | null
  status: string
  link: string | null
  criadoEm: string | null
  renovadoEm: string | null
  mpPaymentId: string | null
}

interface Cupom {
  id: string
  codigo: string
  tipo: string
  valor: number
  usos: number
  maxUsos: number | null
  validade: string | null
  ativo: boolean
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
  color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

export default function Pagamentos() {
  const [pagamentos, setPagamentos]   = useState<Pagamento[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [abaCupom, setAbaCupom]       = useState(false)
  const [cupons, setCupons]           = useState<Cupom[]>([])
  const [novoCupom, setNovoCupom]     = useState({ codigo: '', tipo: '%', valor: '', maxUsos: '', validade: '' })
  const [criandoCupom, setCriandoCupom] = useState(false)
  const [msgCupom, setMsgCupom]       = useState('')

  const fetchHistorico = async () => {
    setLoading(true)
    try {
      const res  = await fetch(API + '/pagamento/historico')
      const data = await res.json()
      if (data.ok) setPagamentos(data.pagamentos)
    } catch {}
    setLoading(false)
  }

  const carregarCupons = async () => {
    try {
      const res  = await fetch(API + '/pagamento/cupons')
      const data = await res.json()
      setCupons(Array.isArray(data) ? data : [])
    } catch {}
  }

  useEffect(() => { fetchHistorico() }, [])
  useEffect(() => { if (abaCupom) carregarCupons() }, [abaCupom])

  const criarCupom = async () => {
    if (!novoCupom.codigo || !novoCupom.valor) { setMsgCupom('Preencha código e valor.'); return }
    setCriandoCupom(true)
    try {
      const res = await fetch(API + '/pagamento/cupom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: novoCupom.codigo, tipo: novoCupom.tipo,
          valor: Number(novoCupom.valor),
          maxUsos: novoCupom.maxUsos ? Number(novoCupom.maxUsos) : null,
          validade: novoCupom.validade || null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setMsgCupom('✅ Cupom criado!')
        setNovoCupom({ codigo: '', tipo: '%', valor: '', maxUsos: '', validade: '' })
        carregarCupons()
      } else {
        setMsgCupom('❌ ' + (data.error ?? 'Erro'))
      }
    } catch { setMsgCupom('❌ Erro ao criar cupom') }
    setCriandoCupom(false)
    setTimeout(() => setMsgCupom(''), 3000)
  }

  const toggleCupom = async (codigo: string) => {
    await fetch(API + '/pagamento/cupom/' + codigo + '/toggle', { method: 'PATCH' })
    carregarCupons()
  }

  const deletarCupom = async (codigo: string) => {
    if (!window.confirm('Excluir cupom "' + codigo + '"?')) return
    await fetch(API + '/pagamento/cupom/' + codigo, { method: 'DELETE' })
    carregarCupons()
  }

  const totalRecebido = pagamentos.filter(p => p.status === 'aprovado' && p.valor).reduce((a, p) => a + (p.valor ?? 0), 0)
  const aprovados     = pagamentos.filter(p => p.status === 'aprovado').length
  const pendentes     = pagamentos.filter(p => p.status === 'pendente').length
  const falhos        = pagamentos.filter(p => p.status === 'falhou' || p.status === 'estornado').length
  const filtrados     = filtroStatus === 'todos' ? pagamentos : pagamentos.filter(p => p.status === filtroStatus)

  const statusBadge = (status: string) => {
    const map: Record<string, { cor: string; bg: string; label: string }> = {
      aprovado:  { cor: '#4ade80', bg: 'rgba(34,197,94,0.15)',  label: '✅ Aprovado'  },
      pendente:  { cor: '#fbbf24', bg: 'rgba(245,158,11,0.15)', label: '⏳ Pendente'  },
      falhou:    { cor: '#f87171', bg: 'rgba(239,68,68,0.15)',  label: '❌ Falhou'    },
      estornado: { cor: '#a78bfa', bg: 'rgba(139,92,246,0.15)', label: '↩️ Estornado' },
    }
    const s = map[status] ?? { cor: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.08)', label: status }
    return <span style={{ background: s.bg, color: s.cor, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>{s.label}</span>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>💳 Pagamentos</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>Histórico de pagamentos via Mercado Pago</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {(['historico', 'cupons'] as const).map(a => (
            <button key={a} onClick={() => setAbaCupom(a === 'cupons')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: (a === 'cupons') === abaCupom ? '600' : '400', background: (a === 'cupons') === abaCupom ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)', border: (a === 'cupons') === abaCupom ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', color: (a === 'cupons') === abaCupom ? '#a5b4fc' : 'rgba(255,255,255,0.5)' }}>
              {a === 'cupons' ? <><Tag size={14} /> Cupons</> : <><CreditCard size={14} /> Histórico</>}
            </button>
          ))}
          {!abaCupom && (
            <button onClick={fetchHistorico}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px' }}>
              <RefreshCw size={14} /> Atualizar
            </button>
          )}
        </div>
      </div>

      {/* ABA CUPONS */}
      {abaCupom && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Criar cupom */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ color: 'white', margin: '0 0 18px', fontSize: '15px' }}>🎟️ Criar novo cupom</h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Código</label>
                <input value={novoCupom.codigo} placeholder="Ex: MAIO10" onChange={e => setNovoCupom({ ...novoCupom, codigo: e.target.value.toUpperCase() })}
                  style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.05em' }} />
              </div>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Valor</label>
                <input type="number" value={novoCupom.valor} placeholder="Ex: 10" onChange={e => setNovoCupom({ ...novoCupom, valor: e.target.value })}
                  style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: '100px' }}>
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
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Máx. usos (opcional)</label>
                <input type="number" value={novoCupom.maxUsos} placeholder="Ilimitado" onChange={e => setNovoCupom({ ...novoCupom, maxUsos: e.target.value })}
                  style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Validade (opcional)</label>
                <input value={novoCupom.validade} placeholder="DD/MM/AAAA" onChange={e => setNovoCupom({ ...novoCupom, validade: e.target.value })}
                  style={inputStyle} />
              </div>
              <button onClick={criarCupom} disabled={criandoCupom}
                style={{ padding: '9px 20px', borderRadius: '8px', cursor: 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <Plus size={14} /> {criandoCupom ? 'Criando...' : 'Criar'}
              </button>
            </div>
            {msgCupom && <p style={{ color: msgCupom.startsWith('✅') ? '#4ade80' : '#f87171', fontSize: '13px', margin: '12px 0 0', fontWeight: '600' }}>{msgCupom}</p>}
          </div>

          {/* Lista de cupons */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>📋 Cupons cadastrados</h3>
              <button onClick={carregarCupons} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px' }}>
                <RefreshCw size={12} />
              </button>
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
                        <td style={{ padding: '10px 14px', color: 'white', fontSize: '13px' }}>
                          {c.tipo === '%' ? c.valor + '%' : 'R$ ' + c.valor.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                          {c.usos}{c.maxUsos ? '/' + c.maxUsos : ''}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{c.validade || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: c.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: c.ativo ? '#4ade80' : '#f87171', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                            {c.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => toggleCupom(c.codigo)} style={{ padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                              {c.ativo ? <ToggleRight size={14} color="#4ade80" /> : <ToggleLeft size={14} />}
                            </button>
                            <button onClick={() => deletarCupom(c.codigo)} style={{ padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
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

      {/* ABA HISTÓRICO */}
      {!abaCupom && (
        <>
          {/* Cards resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            {[
              { label: 'Total Recebido',  value: 'R$ ' + totalRecebido.toFixed(2).replace('.', ','), icon: <CreditCard size={22} color="white" />, grad: 'linear-gradient(135deg,#22c55e,#16a34a)', shadow: 'rgba(34,197,94,0.3)' },
              { label: 'Aprovados',       value: aprovados,  icon: <CheckCircle size={22} color="white" />, grad: 'linear-gradient(135deg,#3b82f6,#6366f1)', shadow: 'rgba(99,102,241,0.3)' },
              { label: 'Pendentes',       value: pendentes,  icon: <Clock size={22} color="white" />,       grad: 'linear-gradient(135deg,#f59e0b,#d97706)', shadow: 'rgba(245,158,11,0.3)' },
              { label: 'Falhos/Estornos', value: falhos,     icon: <XCircle size={22} color="white" />,     grad: 'linear-gradient(135deg,#ef4444,#dc2626)', shadow: 'rgba(239,68,68,0.3)' },
            ].map(c => (
              <div key={c.label} className="glass-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: '0 0 6px' }}>{c.label}</p>
                    <h2 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{c.value}</h2>
                  </div>
                  <div style={{ background: c.grad, padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px ' + c.shadow }}>{c.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabela */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {[
                { id: 'todos',    label: 'Todos' },
                { id: 'aprovado', label: '✅ Aprovados' },
                { id: 'pendente', label: '⏳ Pendentes' },
                { id: 'falhou',   label: '❌ Falhos' },
              ].map(f => (
                <button key={f.id} onClick={() => setFiltroStatus(f.id)} style={{ padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: filtroStatus === f.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', border: filtroStatus === f.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)', color: filtroStatus === f.id ? '#818cf8' : 'rgba(255,255,255,0.4)' }}>{f.label}</button>
              ))}
            </div>

            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>Carregando...</p>
            ) : filtrados.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>Nenhum pagamento encontrado.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Cliente', 'Servidor', 'Plano', 'Valor', 'Status', 'Data', 'Renovado'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px', color: 'white', fontSize: '13px' }}>
                          <div style={{ fontWeight: '600' }}>{p.clienteNome}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{p.telefone}</div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>{p.servidor}</span>
                        </td>
                        <td style={{ padding: '12px', color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{p.plano ?? '—'}</td>
                        <td style={{ padding: '12px', color: '#4ade80', fontSize: '14px', fontWeight: '700' }}>
                          {p.valor != null ? 'R$ ' + p.valor.toFixed(2).replace('.', ',') : '—'}
                        </td>
                        <td style={{ padding: '12px' }}>{statusBadge(p.status)}</td>
                        <td style={{ padding: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                          {p.criadoEm ? new Date(p.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                        </td>
                        <td style={{ padding: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                          {p.renovadoEm ? new Date(p.renovadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
