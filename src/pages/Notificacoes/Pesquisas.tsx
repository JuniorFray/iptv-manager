import { useState, useEffect } from 'react'
import { Send, Trash2, RefreshCw, BarChart3 } from 'lucide-react'

const API = 'https://iptv-manager-production.up.railway.app'

interface Cliente { id: string; nome: string; telefone: string; servidor: string; status: string; vencimento: string }
interface Pesquisa {
  id: string
  titulo: string
  opcoes: string[]
  totalEnviado: number
  totalRespondido: number
  resultado: Record<string, number>
}

function parseData(v: string): Date | null {
  if (!v) return null
  const p = v.split('/')
  if (p.length !== 3) return null
  return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]))
}
function diferencaDias(d: Date): number {
  const h = new Date(); h.setHours(0, 0, 0, 0)
  const a = new Date(d); a.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - h.getTime()) / 86400000)
}
const formatarTelefone = (tel: string) => {
  let num = tel.replace(/\D/g, '')
  if (num.startsWith('5555')) num = num.substring(2)
  else if (!num.startsWith('55')) num = '55' + num
  return num
}

const filtros = [
  { id: 'todos', label: 'Todos os Clientes', cor: '34d399', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.3)' },
  { id: 'venchoje', label: 'Vencendo Hoje', cor: 'f87171', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)' },
  { id: 'venc4', label: 'Vencendo em 4 dias', cor: 'fbbf24', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)' },
  { id: 'venc7', label: 'Vencendo em 7 dias', cor: '818cf8', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)' },
  { id: 'vencidos', label: 'Vencidos', cor: 'ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)' },
  { id: 'inativos', label: 'Inativos', cor: '94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)' },
  { id: 'venc7plus', label: 'Vencidos +7 dias', cor: 'ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)' },
  { id: 'srv_warez', label: '📡 Warez', cor: '60a5fa', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)' },
  { id: 'srv_elite', label: '⚡ Elite', cor: 'c084fc', bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)' },
  { id: 'srv_central', label: '🌐 Central', cor: '34d399', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.3)' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
}

export default function Pesquisas({ clientes, whatsReady, blocoTamanho = 0, blocoPausaMin = 0, intervaloMin = 5000, intervaloMax = 15000 }: { clientes: Cliente[]; whatsReady: boolean; blocoTamanho?: number; blocoPausaMin?: number; intervaloMin?: number; intervaloMax?: number }) {
  const [titulo, setTitulo] = useState('')
  const [opcoes, setOpcoes] = useState<string[]>(['', '', ''])
  const [multipla, setMultipla] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [pesquisas, setPesquisas] = useState<Pesquisa[]>([])
  const [carregando, setCarregando] = useState(false)

  const valido = titulo.trim() !== '' && opcoes.filter(o => o.trim()).length >= 2

  const filtroAtual = filtros.find(f => f.id === filtro)!

  const clientesFiltrados = (() => {
    let lista = filtro === 'inativos'
      ? clientes.filter(c => c.telefone && (c.status?.toLowerCase() === 'inativo' || !c.status))
      : clientes.filter(c => c.telefone && c.status?.toLowerCase() !== 'inativo' && c.status)
    if (filtro === 'venchoje') lista = lista.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false })
    else if (filtro === 'venc4') lista = lista.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false })
    else if (filtro === 'venc7') lista = lista.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false })
    else if (filtro === 'vencidos') lista = lista.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) < 0 : false })
    else if (filtro === 'venc7plus') lista = lista.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) < -7 : false })
    if (filtro === 'srv_warez') lista = lista.filter(c => c.servidor?.toUpperCase() === 'WAREZ')
    if (filtro === 'srv_elite') lista = lista.filter(c => c.servidor?.toUpperCase() === 'ELITE')
    if (filtro === 'srv_central') lista = lista.filter(c => c.servidor?.toUpperCase() === 'CENTRAL')
    if (busca) lista = lista.filter(c => c.nome?.toLowerCase().includes(busca.toLowerCase()) || c.telefone?.includes(busca))
    return lista
  })()

  const carregarPesquisas = async () => {
    setCarregando(true)
    try {
      const res = await fetch(`${API}/pesquisa/listar`)
      setPesquisas(await res.json())
    } catch {}
    setCarregando(false)
  }

  useEffect(() => { carregarPesquisas() }, [])

  const criarPesquisa = async (): Promise<string | null> => {
    const opcoesValidas = opcoes.filter(o => o.trim())
    const res = await fetch(`${API}/pesquisa/criar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: titulo.trim(), opcoes: opcoesValidas, multipla })
    })
    const data = await res.json()
    return data.ok ? data.id : null
  }

  const enviarUm = async () => {
    if (!clienteSel || !valido) return
    const pesquisaId = await criarPesquisa()
    if (!pesquisaId) { setResultado({ tipo: 'erro', msg: 'Erro ao criar pesquisa.' }); return }
    try {
      await fetch(`${API}/pesquisa/enviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pesquisaId, phone: formatarTelefone(clienteSel.telefone) })
      })
      setResultado({ tipo: 'ok', msg: `Pesquisa enviada para ${clienteSel.nome}!` })
      setTitulo(''); setOpcoes(['', '', ''])
      carregarPesquisas()
    } catch {
      setResultado({ tipo: 'erro', msg: 'Erro ao enviar.' })
    }
    setTimeout(() => setResultado(null), 5000)
  }

  const enviarTodos = async () => {
    if (!valido || clientesFiltrados.length === 0) return
    setEnviando(true); setProgresso(0)
    const pesquisaId = await criarPesquisa()
    if (!pesquisaId) { setResultado({ tipo: 'erro', msg: 'Erro ao criar pesquisa.' }); setEnviando(false); return }
    let enviados = 0
    let enviosNoBloco = 0
    const processados = new Set<string>()
    for (let i = 0; i < clientesFiltrados.length; i++) {
      const c = clientesFiltrados[i]
      if (!c.telefone || processados.has(c.telefone)) { setProgresso(i + 1); continue }
      processados.add(c.telefone)
      try {
        await fetch(`${API}/pesquisa/enviar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pesquisaId, phone: formatarTelefone(c.telefone) })
        })
        enviados++
      } catch {}
      enviosNoBloco++
      setProgresso(i + 1)
      const espera = intervaloMin === intervaloMax
        ? intervaloMin
        : Math.floor(Math.random() * (intervaloMax - intervaloMin + 1)) + intervaloMin
      await new Promise(r => setTimeout(r, espera))
      if (blocoTamanho > 0 && blocoPausaMin > 0 && enviosNoBloco >= blocoTamanho) {
        await new Promise(r => setTimeout(r, blocoPausaMin * 60000))
        enviosNoBloco = 0
      }
    }
    setResultado({ tipo: 'ok', msg: `${enviados} pesquisas enviadas!` })
    setTitulo(''); setOpcoes(['', '', ''])
    setEnviando(false)
    carregarPesquisas()
    setTimeout(() => setResultado(null), 5000)
  }

  const excluirPesquisa = async (id: string) => {
    if (!confirm('Excluir esta pesquisa e seus resultados?')) return
    await fetch(`${API}/pesquisa/${id}`, { method: 'DELETE' })
    setPesquisas(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
      {/* Coluna esquerda - filtros e clientes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Filtrar Clientes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtros.map(f => (
              <button key={f.id} onClick={() => { setFiltro(f.id); setClienteSel(null); setBusca('') }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                  background: filtro === f.id ? f.bg : 'rgba(255,255,255,0.03)',
                  border: filtro === f.id ? `1px solid ${f.border}` : '1px solid rgba(255,255,255,0.06)',
                  color: filtro === f.id ? `#${f.cor}` : 'rgba(255,255,255,0.5)', fontWeight: filtro === f.id ? '600' : '400', fontSize: '14px' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ color: 'white', margin: '0 0 12px', fontSize: '15px' }}>Cliente individual (opcional)</h3>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." style={{ ...inputStyle, marginBottom: '10px' }} />
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {clientesFiltrados.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', padding: '16px 0', margin: 0 }}>Nenhum cliente</p>
              : clientesFiltrados.map(c => (
                <button key={c.id} onClick={() => setClienteSel(clienteSel?.id === c.id ? null : c)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                    background: clienteSel?.id === c.id ? filtroAtual.bg : 'rgba(255,255,255,0.03)',
                    border: clienteSel?.id === c.id ? `1px solid ${filtroAtual.border}` : '1px solid rgba(255,255,255,0.06)', color: 'white', textAlign: 'left' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{c.nome}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{c.telefone}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Coluna direita - form e resultados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {resultado && (
          <div style={{ padding: '14px 18px', borderRadius: '12px', background: resultado.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: resultado.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: resultado.tipo === 'ok' ? '#4ade80' : '#f87171', fontWeight: '600', fontSize: '14px' }}>
            {resultado.msg}
          </div>
        )}

        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>📋 Nova Pesquisa</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
            <textarea value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título da pesquisa (ex: Qual servidor você usa hoje?)" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {opcoes.map((op, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', width: '20px', textAlign: 'right' }}>{i + 1}.</span>
                  <input value={op} onChange={e => { const arr = [...opcoes]; arr[i] = e.target.value; setOpcoes(arr) }}
                    placeholder={`Opção ${i + 1}`}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '12px', outline: 'none' }} />
                  {opcoes.length > 2 && (
                    <button onClick={() => setOpcoes(opcoes.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.6)', padding: '4px' }}>✕</button>
                  )}
                </div>
              ))}
              {opcoes.length < 12 && (
                <button onClick={() => setOpcoes([...opcoes, ''])} style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '12px' }}>+ Adicionar opção</button>
              )}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: 0 }}>Mínimo 2 opções • Máximo 12 opções • Cliente responde com o número ou o texto da opção</p>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px', alignSelf: 'flex-start' }}>
              <button onClick={() => setMultipla(false)} style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: !multipla ? 'rgba(99,102,241,0.4)' : 'transparent', color: !multipla ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>☑️ Escolha única</button>
              <button onClick={() => setMultipla(true)}  style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background:  multipla ? 'rgba(99,102,241,0.4)' : 'transparent', color:  multipla ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>☑️ Múltipla escolha</button>
            </div>
          </div>

          <button onClick={enviarUm} disabled={!clienteSel || !valido || !whatsReady}
            style={{ width: '100%', marginBottom: '10px', padding: '13px', borderRadius: '12px', border: 'none',
              cursor: !clienteSel || !valido || !whatsReady ? 'not-allowed' : 'pointer',
              background: !clienteSel || !valido || !whatsReady ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#25d366,#128c7e)',
              color: !clienteSel || !valido || !whatsReady ? 'rgba(255,255,255,0.3)' : 'white', fontWeight: 'bold', fontSize: '15px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Send size={18} /> {!whatsReady ? 'WhatsApp desconectado' : `Enviar para ${clienteSel ? clienteSel.nome : '...'}`}
          </button>

          {enviando && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Enviando...</span>
                <span style={{ color: `#${filtroAtual.cor}`, fontSize: '13px', fontWeight: '600' }}>{progresso}/{clientesFiltrados.length}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '99px', height: '6px' }}>
                <div style={{ width: `${(progresso / clientesFiltrados.length) * 100}%`, height: '100%', background: `#${filtroAtual.cor}`, borderRadius: '99px' }} />
              </div>
            </div>
          )}

          <button onClick={enviarTodos} disabled={enviando || !valido || clientesFiltrados.length === 0 || !whatsReady}
            style={{ width: '100%', padding: '13px', borderRadius: '12px', border: `1px solid ${filtroAtual.border}`,
              background: enviando || !valido || !whatsReady ? 'rgba(255,255,255,0.05)' : filtroAtual.bg,
              color: enviando || !valido || !whatsReady ? 'rgba(255,255,255,0.3)' : `#${filtroAtual.cor}`,
              cursor: enviando || !valido || !whatsReady ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Send size={16} /> {enviando ? `Enviando... ${progresso}/${clientesFiltrados.length}` : `Enviar para todos (${clientesFiltrados.length})`}
          </button>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ color: 'white', margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}><BarChart3 size={16} /> Resultados</h3>
            <button onClick={carregarPesquisas} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
              <RefreshCw size={13} /> {carregando ? 'Carregando...' : 'Atualizar'}
            </button>
          </div>
          {pesquisas.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '30px 0', fontSize: '13px' }}>Nenhuma pesquisa enviada ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pesquisas.map(p => {
                const maxVotos = Math.max(1, ...Object.values(p.resultado))
                return (
                  <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <p style={{ color: 'white', fontWeight: '600', margin: '0 0 2px', fontSize: '14px' }}>{p.titulo}</p>
                        <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: '12px' }}>Enviado: {p.totalEnviado} • Respondido: {p.totalRespondido} ({p.totalEnviado > 0 ? Math.round(p.totalRespondido / p.totalEnviado * 100) : 0}%)</p>
                      </div>
                      <button onClick={() => excluirPesquisa(p.id)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', padding: '5px 8px', borderRadius: '7px', cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {p.opcoes.map(o => {
                        const votos = p.resultado[o] || 0
                        return (
                          <div key={o}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                              <span>{o}</span><span>{votos}</span>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '99px', height: '6px' }}>
                              <div style={{ width: `${(votos / maxVotos) * 100}%`, height: '100%', background: '#818cf8', borderRadius: '99px' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
