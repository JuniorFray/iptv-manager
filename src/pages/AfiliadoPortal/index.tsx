import { useState, useEffect } from 'react'
import { Tv, LogIn, Send, Eye, EyeOff, LogOut, Clock, CheckCircle, DollarSign, Users } from 'lucide-react'

const API = 'https://iptv-manager-production.up.railway.app'

const fmtData = (iso: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
const fmtR$   = (v: number)   => `R$ ${v.toFixed(2).replace('.', ',')}`

export default function AfiliadoPortal() {
  const [token,    setToken]    = useState(() => localStorage.getItem('afiliado_token') || '')
  const [afiliado, setAfiliado] = useState<any>(null)
  const [dados,    setDados]    = useState<any>(null)
  const [loading,  setLoading]  = useState(false)
  const [aba,      setAba]      = useState<'dashboard'|'novo'>('dashboard')

  // Login form
  const [email,      setEmail]      = useState('')
  const [senha,      setSenha]      = useState('')
  const [showSenha,  setShowSenha]  = useState(false)
  const [loginErro,  setLoginErro]  = useState('')

  // Novo teste
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTel,  setClienteTel]  = useState('')
  const [servidor,    setServidor]    = useState('WAREZ')
  const [testeRes,    setTesteRes]    = useState<any>(null)
  const [testeErro,   setTesteErro]   = useState('')
  const [enviandoTeste, setEnviandoTeste] = useState(false)

  const carregar = async (tk: string) => {
    setLoading(true)
    const [perfil, vendas] = await Promise.all([
      fetch(`${API}/afiliado/perfil`, { headers: { Authorization: `Bearer ${tk}` } }).then(r => r.json()),
      fetch(`${API}/afiliado/vendas`, { headers: { Authorization: `Bearer ${tk}` } }).then(r => r.json()),
    ])
    if (perfil.ok) setAfiliado(perfil.afiliado)
    else { setToken(''); localStorage.removeItem('afiliado_token'); return setLoading(false) }
    if (vendas.ok) setDados(vendas)
    setLoading(false)
  }

  useEffect(() => { if (token) carregar(token) }, [])

  const login = async () => {
    setLoginErro('')
    const res  = await fetch(`${API}/afiliado/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    })
    const data = await res.json()
    if (data.ok) {
      localStorage.setItem('afiliado_token', data.token)
      setToken(data.token)
      setAfiliado(data.afiliado)
      carregar(data.token)
    } else setLoginErro(data.error || 'Erro ao fazer login')
  }

  const logout = () => {
    localStorage.removeItem('afiliado_token')
    setToken(''); setAfiliado(null); setDados(null)
  }

  const gerarTeste = async () => {
    if (!clienteNome.trim() || !clienteTel.trim()) { setTesteErro('Preencha nome e telefone'); return }
    setEnviandoTeste(true); setTesteErro(''); setTesteRes(null)
    const res  = await fetch(`${API}/afiliado/teste`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteNome, clienteTelefone: clienteTel, servidor })
    })
    const data = await res.json()
    if (data.ok) {
      setTesteRes(data)
      setClienteNome(''); setClienteTel('')
      carregar(token)
    } else setTesteErro(data.error || 'Erro ao gerar teste')
    setEnviandoTeste(false)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  if (!token || !afiliado) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', padding: '16px', borderRadius: '16px', display: 'inline-flex', marginBottom: '16px' }}>
            <Tv size={32} color="white"/>
          </div>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Portal do Afiliado</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '8px', fontSize: '14px' }}>Conecta TV — Área do Parceiro</p>
        </div>
        <div className="glass-card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="seu@email.com" style={inputStyle}/>
            </div>
            <div>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input type={showSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="••••••••" style={{ ...inputStyle, paddingRight: '42px' }}/>
                <button onClick={() => setShowSenha(!showSenha)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                  {showSenha ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            {loginErro && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{loginErro}</p>}
            <button onClick={login} style={{ padding: '13px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
              <LogIn size={16}/> Entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── DASHBOARD ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', padding: '20px' }}>
      {/* Header */}
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', padding: '10px', borderRadius: '12px' }}>
              <Tv size={22} color="white"/>
            </div>
            <div>
              <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Olá, {afiliado.nome}! 👋</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: '12px' }}>Código: <strong style={{ color: '#a5b4fc' }}>{afiliado.codigo}</strong></p>
            </div>
          </div>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '13px' }}>
            <LogOut size={14}/> Sair
          </button>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
          {[{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'novo', label: '➕ Gerar Teste' }].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as any)} style={{ flex: 1, padding: '9px', borderRadius: '7px', cursor: 'pointer', border: 'none', background: aba === a.id ? 'rgba(99,102,241,0.4)' : 'transparent', color: aba === a.id ? '#a5b4fc' : 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: '13px' }}>{a.label}</button>
          ))}
        </div>

        {aba === 'dashboard' && (
          <>
            {/* Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
              {[
                { label: 'Testes gerados', value: dados?.testes?.length ?? 0, color: '#60a5fa', icon: <Users size={18}/> },
                { label: 'Comissão pendente', value: dados ? fmtR$(dados.totalPendente) : '—', color: '#fbbf24', icon: <Clock size={18}/> },
                { label: 'Total ganho', value: dados ? fmtR$(dados.totalComissao) : '—', color: '#4ade80', icon: <DollarSign size={18}/> },
              ].map(c => (
                <div key={c.label} className="glass-card" style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: c.color }}>{c.icon}<span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{c.label}</span></div>
                  <div style={{ color: 'white', fontSize: '22px', fontWeight: 'bold' }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Vendas */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: '600' }}>Minhas vendas</h3>
              </div>
              {!dados?.vendas?.length ? (
                <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0', fontSize: '13px' }}>Nenhuma venda ainda. Gere testes e converta clientes!</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Cliente', 'Plano', 'Valor', 'Comissão', 'Status', 'Data'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.vendas.map((v: any) => (
                      <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px 16px', color: 'white', fontSize: '13px' }}>{v.clienteNome}</td>
                        <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{v.plano}</td>
                        <td style={{ padding: '12px 16px', color: 'white', fontSize: '13px' }}>{fmtR$(v.valor)}</td>
                        <td style={{ padding: '12px 16px', color: '#4ade80', fontWeight: '600', fontSize: '13px' }}>{fmtR$(v.comissao)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: v.status === 'pago' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)', color: v.status === 'pago' ? '#4ade80' : '#fbbf24', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>{v.status === 'pago' ? 'Pago' : 'Pendente'}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{fmtData(v.criadoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {aba === 'novo' && (
          <div className="glass-card" style={{ padding: '28px' }}>
            <h3 style={{ color: 'white', margin: '0 0 20px', fontSize: '16px', fontWeight: '600' }}>Gerar teste para novo cliente</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Nome do cliente</label>
                <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome completo" style={inputStyle}/>
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Telefone (com DDD)</label>
                <input value={clienteTel} onChange={e => setClienteTel(e.target.value)} placeholder="19999999999" style={inputStyle}/>
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Servidor</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['WAREZ', 'ELITE'].map(s => (
                    <button key={s} onClick={() => setServidor(s)} style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', border: servidor === s ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', background: servidor === s ? 'rgba(99,102,241,0.2)' : 'transparent', color: servidor === s ? '#a5b4fc' : 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: '14px' }}>{s}</button>
                  ))}
                </div>
              </div>

              {testeErro && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{testeErro}</p>}

              {testeRes && (
                <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '16px' }}>
                  <p style={{ color: '#4ade80', fontWeight: '700', margin: '0 0 12px', fontSize: '14px' }}>✅ Teste criado com sucesso!</p>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {[['Usuário', testeRes.usuario], ['Senha', testeRes.senha], ['Expira em', testeRes.expira || '3 horas']].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', minWidth: '70px' }}>{k}:</span>
                        <span style={{ color: 'white', fontSize: '13px', fontFamily: 'monospace', fontWeight: '600' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {testeRes.links?.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: '0 0 8px' }}>Links de pagamento para enviar ao cliente:</p>
                      {testeRes.links.map((l: any) => (
                        <div key={l.plano} style={{ marginBottom: '6px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>{l.plano} — R$ {String(l.valor).replace('.',',')} → </span>
                          <a href={l.link} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontSize: '12px', wordBreak: 'break-all' }}>{l.link}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={gerarTeste} disabled={enviandoTeste} style={{ padding: '13px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: 'white', fontWeight: '700', fontSize: '14px', cursor: enviandoTeste ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: enviandoTeste ? 0.7 : 1 }}>
                <Send size={15}/> {enviandoTeste ? 'Gerando...' : 'Gerar Teste'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
