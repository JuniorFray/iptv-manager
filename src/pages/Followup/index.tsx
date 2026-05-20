import { useState, useEffect } from 'react'
import { Search, RefreshCw, Send, Users, CheckSquare, Square, MessageSquare, Clock, ChevronRight, Shuffle } from 'lucide-react'

const API = 'https://iptv-manager-production.up.railway.app'

interface Contato { nome: string; telefone: string }
interface Enviados { [tel: string]: string }

const fmtData = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function Followup() {
  const [contatos,     setContatos]     = useState<Contato[]>(() => {
    try { return JSON.parse(localStorage.getItem('followup_contatos') || '[]') } catch { return [] }
  })
  const [enviados,     setEnviados]     = useState<Enviados>({})
  const [loading,      setLoading]      = useState(false)
  const [busca,        setBusca]        = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [msgs,         setMsgs]         = useState(['', '', ''])
  const [tamLote,      setTamLote]      = useState(10)
  const [enviando,     setEnviando]     = useState(false)
  const [resultado,    setResultado]    = useState<{tipo:'ok'|'erro', msg:string} | null>(null)
  const [totalBuscado, setTotalBuscado] = useState<number | null>(() => {
    try { const n = localStorage.getItem('followup_total'); return n ? Number(n) : null } catch { return null }
  })
  const [abaMsg,       setAbaMsg]       = useState(0)

  useEffect(() => {
    if (contatos.length > 0) localStorage.setItem('followup_contatos', JSON.stringify(contatos))
  }, [contatos])

  useEffect(() => {
    if (totalBuscado !== null) localStorage.setItem('followup_total', String(totalBuscado))
    carregarEnviados()
  }, [])

  const carregarEnviados = async () => {
    try {
      const res  = await fetch(`${API}/followup/enviados`)
      const data = await res.json()
      if (data.ok) setEnviados(data.enviados)
    } catch {}
  }

  const buscarContatos = async () => {
    setLoading(true); setResultado(null)
    try {
      const res  = await fetch(`${API}/followup/contatos`)
      const data = await res.json()
      if (data.ok) {
        setContatos(data.contatos)
        setTotalBuscado(data.total)
        setSelecionados(new Set())
        await carregarEnviados()
      } else setResultado({ tipo: 'erro', msg: data.error ?? 'Erro ao buscar' })
    } catch { setResultado({ tipo: 'erro', msg: 'Backend offline' }) }
    setLoading(false)
  }

  const filtrados = contatos.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca)
  )

  const selecionarProximoLote = () => {
    const pendentes = filtrados.filter(c => !enviados[c.telefone] && !selecionados.has(c.telefone))
    const proximos  = pendentes.slice(0, tamLote)
    setSelecionados(new Set([...selecionados, ...proximos.map(c => c.telefone)]))
  }

  const toggle = (tel: string) => {
    const novo = new Set(selecionados)
    novo.has(tel) ? novo.delete(tel) : novo.add(tel)
    setSelecionados(novo)
  }

  const toggleTodos = () => {
    selecionados.size === filtrados.length
      ? setSelecionados(new Set())
      : setSelecionados(new Set(filtrados.map(c => c.telefone)))
  }

  const enviar = async () => {
    const msgsValidas = msgs.filter(m => m.trim())
    if (!msgsValidas.length) { setResultado({ tipo: 'erro', msg: 'Escreva ao menos uma mensagem.' }); return }
    if (!selecionados.size)  { setResultado({ tipo: 'erro', msg: 'Selecione ao menos um contato.' }); return }
    setEnviando(true); setResultado(null)
    try {
      const sel  = contatos.filter(c => selecionados.has(c.telefone))
      const res  = await fetch(`${API}/followup/enviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatos: sel, mensagens: msgsValidas }),
      })
      const data = await res.json()
      if (data.ok) {
        setResultado({ tipo: 'ok', msg: `✅ ${data.enfileirados} mensagens enfileiradas!` })
        setSelecionados(new Set())
        await carregarEnviados()
      } else setResultado({ tipo: 'erro', msg: data.error ?? 'Erro ao enviar' })
    } catch { setResultado({ tipo: 'erro', msg: 'Backend offline' }) }
    setEnviando(false)
  }

  const naoEnviadosCount = filtrados.filter(c => !enviados[c.telefone]).length
  const todosSel         = filtrados.length > 0 && selecionados.size === filtrados.length

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>📲 Follow-up</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>
          Contatos do WhatsApp que ainda não são clientes cadastrados
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px', alignItems: 'start' }}>

        {/* Lista */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          <div className="glass-card" style={{ padding: '14px 18px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={buscarContatos} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '13px', opacity: loading ? 0.7 : 1 }}>
              <RefreshCw size={14}/> {loading ? 'Buscando...' : 'Buscar contatos WA'}
            </button>
            {totalBuscado !== null && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                <strong style={{ color: 'white' }}>{naoEnviadosCount}</strong> pendentes · <strong style={{ color: '#4ade80' }}>{Object.keys(enviados).length}</strong> já enviados
              </span>
            )}
            {contatos.length > 0 && (
              <div style={{ marginLeft: 'auto', position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }}/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
                  style={{ padding: '7px 10px 7px 28px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '12px', outline: 'none', width: '180px' }}/>
              </div>
            )}
          </div>

          {contatos.length > 0 && (
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={toggleTodos} style={{ background: 'none', border: 'none', cursor: 'pointer', color: todosSel ? '#818cf8' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: 0 }}>
                  {todosSel ? <CheckSquare size={15}/> : <Square size={15}/>} Todos ({filtrados.length})
                </button>
                <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>Lote:</span>
                  <input type="number" value={tamLote} min={1} max={100}
                    onChange={e => setTamLote(Math.max(1, parseInt(e.target.value) || 10))}
                    style={{ width: '50px', padding: '4px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '12px', outline: 'none', textAlign: 'center' }}/>
                  <button onClick={selecionarProximoLote}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '12px', fontWeight: '600' }}>
                    <ChevronRight size={13}/> Próximos
                  </button>
                </div>
                {selecionados.size > 0 && (
                  <span style={{ marginLeft: 'auto', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                    {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ maxHeight: '540px', overflowY: 'auto' }}>
                {filtrados.map(c => {
                  const jaEnviado  = !!enviados[c.telefone]
                  const selecionado = selecionados.has(c.telefone)
                  return (
                    <div key={c.telefone} onClick={() => toggle(c.telefone)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 18px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', background: selecionado ? 'rgba(99,102,241,0.08)' : 'transparent', opacity: jaEnviado ? 0.65 : 1, transition: 'background 0.15s' }}>
                      <div style={{ color: selecionado ? '#818cf8' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                        {selecionado ? <CheckSquare size={15}/> : <Square size={15}/>}
                      </div>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: jaEnviado ? 'rgba(34,197,94,0.4)' : 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: 'white', fontWeight: '700', fontSize: '13px' }}>{(c.nome?.[0] ?? '?').toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: 'white', fontSize: '13px', fontWeight: '500', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</p>
                        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', margin: 0, fontFamily: 'monospace' }}>{c.telefone}</p>
                      </div>
                      {jaEnviado && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80', fontSize: '11px', flexShrink: 0 }}>
                          <Clock size={11}/> {fmtData(enviados[c.telefone])}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!contatos.length && totalBuscado === null && !loading && (
            <div className="glass-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <Users size={48} color="rgba(255,255,255,0.1)" style={{ marginBottom: '16px' }}/>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Clique em "Buscar contatos WA" para carregar os contatos.</p>
            </div>
          )}
        </div>

        {/* Mensagens */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <MessageSquare size={15} color="#60a5fa"/>
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: '600' }}>Mensagens</h3>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.35)', fontSize: '11px' }}>
                <Shuffle size={11}/> aleatória por contato
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              {[0,1,2].map(i => (
                <button key={i} onClick={() => setAbaMsg(i)}
                  style={{ flex: 1, padding: '6px', borderRadius: '7px', cursor: 'pointer', border: abaMsg === i ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)', background: abaMsg === i ? 'rgba(99,102,241,0.2)' : 'transparent', color: abaMsg === i ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>
                  Msg {i+1} {msgs[i].trim() ? '✓' : ''}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '8px' }}>
              <span onClick={() => { const m = [...msgs]; m[abaMsg] += '{NOME}'; setMsgs(m) }}
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer' }}>
                {'{NOME}'}
              </span>
            </div>

            <textarea value={msgs[abaMsg]} onChange={e => { const m = [...msgs]; m[abaMsg] = e.target.value; setMsgs(m) }}
              placeholder={abaMsg === 0 ? 'Mensagem 1 (obrigatória)' : `Mensagem ${abaMsg+1} (opcional — para variar)`}
              rows={7}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6', boxSizing: 'border-box' as any }}/>

            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '8px 0 14px' }}>
              Preencha 2 ou 3 mensagens para variar o texto e reduzir risco de spam.
            </p>

            {resultado && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', background: resultado.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: resultado.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: resultado.tipo === 'ok' ? '#4ade80' : '#f87171', fontSize: '13px', fontWeight: '600' }}>
                {resultado.msg}
              </div>
            )}

            <button onClick={enviar} disabled={enviando || !selecionados.size || !msgs.some(m => m.trim())}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', cursor: (enviando || !selecionados.size || !msgs.some(m => m.trim())) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#22c55e,#16a34a)', border: 'none', color: 'white', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', opacity: (!selecionados.size || !msgs.some(m => m.trim())) ? 0.5 : 1 }}>
              <Send size={15}/>
              {enviando ? 'Enfileirando...' : `Enviar para ${selecionados.size} contato${selecionados.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
