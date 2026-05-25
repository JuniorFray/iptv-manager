import { useState, useEffect } from 'react'
import { Users, Plus, Edit2, Trash2, CheckCircle, DollarSign, X, Eye, EyeOff } from 'lucide-react'

const API = 'https://iptv-manager-production.up.railway.app'

interface Afiliado {
  id: string; nome: string; email: string; codigo: string
  comissaoTipo: 'percent' | 'fixed'; comissaoValor: number
  ativo: boolean; totalVendas: number; totalComissao: number; totalPendente: number
}

const fmtR$ = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

export default function Afiliados() {
  const [lista,       setLista]       = useState<Afiliado[]>([])
  const [loading,     setLoading]     = useState(false)
  const [modal,       setModal]       = useState<'novo' | 'editar' | null>(null)
  const [editId,      setEditId]      = useState<string | null>(null)
  const [form,        setForm]        = useState({ nome: '', email: '', senha: '', comissaoTipo: 'percent', comissaoValor: '10', ativo: true })
  const [showSenha,   setShowSenha]   = useState(false)
  const [resultado,   setResultado]   = useState<{tipo:'ok'|'erro', msg:string} | null>(null)
  const [vendaDetail, setVendaDetail] = useState<string | null>(null)

  const carregar = async () => {
    setLoading(true)
    const res  = await fetch(`${API}/afiliados`)
    const data = await res.json()
    if (data.ok) setLista(data.afiliados)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const abrirNovo = () => {
    setForm({ nome: '', email: '', senha: '', comissaoTipo: 'percent', comissaoValor: '10', ativo: true })
    setEditId(null); setModal('novo'); setResultado(null)
  }

  const abrirEditar = (a: Afiliado) => {
    setForm({ nome: a.nome, email: a.email, senha: '', comissaoTipo: a.comissaoTipo, comissaoValor: String(a.comissaoValor), ativo: a.ativo })
    setEditId(a.id); setModal('editar'); setResultado(null)
  }

  const salvar = async () => {
    const body: any = { nome: form.nome, email: form.email, comissaoTipo: form.comissaoTipo, comissaoValor: Number(form.comissaoValor), ativo: form.ativo }
    if (form.senha) body.senha = form.senha
    if (modal === 'novo') body.senha = form.senha
    const url    = modal === 'novo' ? `${API}/afiliados` : `${API}/afiliados/${editId}`
    const method = modal === 'novo' ? 'POST' : 'PUT'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data   = await res.json()
    if (data.ok) { setModal(null); carregar(); setResultado(null) }
    else setResultado({ tipo: 'erro', msg: data.error })
  }

  const excluir = async (id: string, nome: string) => {
    if (!confirm(`Excluir afiliado ${nome}?`)) return
    await fetch(`${API}/afiliados/${id}`, { method: 'DELETE' })
    carregar()
  }

  const pagarComissao = async (id: string, nome: string, pendente: number) => {
    if (!confirm(`Marcar R$ ${pendente.toFixed(2)} como pago para ${nome}?`)) return
    const res  = await fetch(`${API}/afiliados/${id}/pagar`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) { setResultado({ tipo: 'ok', msg: `${data.pagas} comissões marcadas como pagas!` }); carregar() }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>🤝 Afiliados</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>Gestão de afiliados e comissões</p>
        </div>
        <button onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 20px', borderRadius: '10px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
          <Plus size={15}/> Novo Afiliado
        </button>
      </div>

      {resultado && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', background: resultado.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: resultado.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: resultado.tipo === 'ok' ? '#4ade80' : '#f87171', fontSize: '13px', fontWeight: '600' }}>
          {resultado.msg}
        </div>
      )}

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Afiliados', value: lista.length, color: '#60a5fa', icon: <Users size={20}/> },
          { label: 'Comissões Pendentes', value: fmtR$(lista.reduce((s, a) => s + a.totalPendente, 0)), color: '#fbbf24', icon: <DollarSign size={20}/> },
          { label: 'Total em Comissões', value: fmtR$(lista.reduce((s, a) => s + a.totalComissao, 0)), color: '#4ade80', icon: <CheckCircle size={20}/> },
        ].map(c => (
          <div key={c.label} className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', color: c.color }}>{c.icon}<span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{c.label}</span></div>
            <div style={{ color: 'white', fontSize: '22px', fontWeight: 'bold' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Nome', 'Email', 'Código', 'Comissão', 'Vendas', 'Pendente', 'Status', 'Ações'].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Carregando...</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Nenhum afiliado cadastrado.</td></tr>
            ) : lista.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '14px 16px', color: 'white', fontWeight: '600', fontSize: '13px' }}>{a.nome}</td>
                <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{a.email}</td>
                <td style={{ padding: '14px 16px' }}><span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }}>{a.codigo}</span></td>
                <td style={{ padding: '14px 16px', color: 'white', fontSize: '13px' }}>{a.comissaoTipo === 'percent' ? `${a.comissaoValor}%` : fmtR$(a.comissaoValor)}</td>
                <td style={{ padding: '14px 16px', color: 'white', fontSize: '13px' }}>{a.totalVendas}</td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ color: a.totalPendente > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)', fontWeight: '600', fontSize: '13px' }}>{fmtR$(a.totalPendente)}</span>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ background: a.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: a.ativo ? '#4ade80' : '#f87171', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>{a.ativo ? 'Ativo' : 'Inativo'}</span>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {a.totalPendente > 0 && (
                      <button onClick={() => pagarComissao(a.id, a.nome, a.totalPendente)} title="Pagar comissão" style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', padding: '5px 8px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
                        <DollarSign size={13}/>
                      </button>
                    )}
                    <button onClick={() => abrirEditar(a)} style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '5px 8px', borderRadius: '7px', cursor: 'pointer' }}>
                      <Edit2 size={13}/>
                    </button>
                    <button onClick={() => excluir(a.id, a.nome)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', padding: '5px 8px', borderRadius: '7px', cursor: 'pointer' }}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-card" style={{ padding: '32px', width: '100%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: '18px' }}>{modal === 'novo' ? 'Novo Afiliado' : 'Editar Afiliado'}</h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}><X size={20}/></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Nome', key: 'nome', type: 'text', placeholder: 'Nome completo' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'email@exemplo.com' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} style={inputStyle}/>
                </div>
              ))}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>{modal === 'novo' ? 'Senha' : 'Nova senha (deixe em branco para manter)'}</label>
                <div style={{ position: 'relative' }}>
                  <input type={showSenha ? 'text' : 'password'} value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Senha" style={{ ...inputStyle, paddingRight: '40px' }}/>
                  <button onClick={() => setShowSenha(!showSenha)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                    {showSenha ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Tipo de comissão</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[{ val: 'percent', label: '% Percentual' }, { val: 'fixed', label: 'R$ Valor fixo' }].map(t => (
                    <button key={t.val} onClick={() => setForm({ ...form, comissaoTipo: t.val })}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', border: form.comissaoTipo === t.val ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', background: form.comissaoTipo === t.val ? 'rgba(99,102,241,0.2)' : 'transparent', color: form.comissaoTipo === t.val ? '#a5b4fc' : 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Valor da comissão {form.comissaoTipo === 'percent' ? '(%)' : '(R$)'}</label>
                <input type="number" value={form.comissaoValor} onChange={e => setForm({ ...form, comissaoValor: e.target.value })} style={inputStyle}/>
              </div>
              {modal === 'editar' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Status:</label>
                  <button onClick={() => setForm({ ...form, ativo: !form.ativo })}
                    style={{ padding: '4px 14px', borderRadius: '20px', cursor: 'pointer', border: 'none', background: form.ativo ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: form.ativo ? '#4ade80' : '#f87171', fontWeight: '600', fontSize: '12px' }}>
                    {form.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
              )}
              {resultado && <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '13px' }}>{resultado.msg}</div>}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button onClick={() => setModal(null)} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvar} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
