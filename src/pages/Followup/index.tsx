import { useState } from 'react'
import { Search, RefreshCw, Send, Users, CheckSquare, Square, MessageSquare } from 'lucide-react'

const API = 'https://iptv-manager-production.up.railway.app'
const VARIAVEIS = ['{NOME}']

interface Contato { nome: string; telefone: string }

export default function Followup() {
  const [contatos, setContatos]       = useState<Contato[]>([])
  const [loading, setLoading]         = useState(false)
  const [busca, setBusca]             = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [mensagem, setMensagem]       = useState('')
  const [enviando, setEnviando]       = useState(false)
  const [resultado, setResultado]     = useState<{tipo:'ok'|'erro', msg:string} | null>(null)
  const [totalBuscado, setTotalBuscado] = useState<number | null>(null)

  const buscarContatos = async () => {
    setLoading(true)
    setResultado(null)
    try {
      const res  = await fetch(`${API}/whatsapp/followup/contatos`)
      const data = await res.json()
      if (data.ok) {
        setContatos(data.contatos)
        setTotalBuscado(data.total)
        setSelecionados(new Set())
      } else {
        setResultado({ tipo: 'erro', msg: data.error ?? 'Erro ao buscar contatos' })
      }
    } catch {
      setResultado({ tipo: 'erro', msg: 'Backend offline' })
    }
    setLoading(false)
  }

  const filtrados = contatos.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.telefone.includes(busca)
  )

  const toggleTodos = () => {
    if (selecionados.size === filtrados.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(filtrados.map(c => c.telefone)))
    }
  }

  const toggle = (tel: string) => {
    const novo = new Set(selecionados)
    novo.has(tel) ? novo.delete(tel) : novo.add(tel)
    setSelecionados(novo)
  }

  const enviar = async () => {
    if (!mensagem.trim()) { setResultado({ tipo: 'erro', msg: 'Escreva uma mensagem.' }); return }
    if (selecionados.size === 0) { setResultado({ tipo: 'erro', msg: 'Selecione ao menos um contato.' }); return }
    setEnviando(true)
    setResultado(null)
    try {
      const contatosSel = contatos.filter(c => selecionados.has(c.telefone))
      const res  = await fetch(`${API}/whatsapp/followup/enviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatos: contatosSel, mensagem }),
      })
      const data = await res.json()
      if (data.ok) {
        setResultado({ tipo: 'ok', msg: `✅ ${data.enfileirados} mensagens enfileiradas com sucesso!` })
        setSelecionados(new Set())
      } else {
        setResultado({ tipo: 'erro', msg: data.error ?? 'Erro ao enviar' })
      }
    } catch {
      setResultado({ tipo: 'erro', msg: 'Backend offline' })
    }
    setEnviando(false)
  }

  const todosSelecionados = filtrados.length > 0 && selecionados.size === filtrados.length

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>📲 Follow-up</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>
          Contatos do WhatsApp que ainda não são clientes cadastrados
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>

        {/* Coluna esquerda — lista de contatos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Barra de ações */}
          <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={buscarContatos} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '14px', opacity: loading ? 0.7 : 1 }}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              {loading ? 'Buscando...' : 'Buscar contatos WA'}
            </button>

            {totalBuscado !== null && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                <strong style={{ color: 'white' }}>{totalBuscado}</strong> contatos não cadastrados encontrados
              </span>
            )}

            {contatos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone..."
                    style={{ padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', outline: 'none', width: '220px' }} />
                </div>
              </div>
            )}
          </div>

          {/* Lista */}
          {contatos.length > 0 && (
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
              {/* Cabeçalho */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={toggleTodos} style={{ background: 'none', border: 'none', cursor: 'pointer', color: todosSelecionados ? '#818cf8' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: 0 }}>
                  {todosSelecionados ? <CheckSquare size={16} /> : <Square size={16} />}
                  {todosSelecionados ? 'Desmarcar todos' : `Selecionar todos (${filtrados.length})`}
                </button>
                {selecionados.size > 0 && (
                  <span style={{ marginLeft: 'auto', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                    {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Itens */}
              <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
                {filtrados.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '30px 0', fontSize: '13px' }}>Nenhum resultado para "{busca}"</p>
                ) : filtrados.map(c => (
                  <div key={c.telefone} onClick={() => toggle(c.telefone)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', background: selecionados.has(c.telefone) ? 'rgba(99,102,241,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                    <div style={{ color: selecionados.has(c.telefone) ? '#818cf8' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                      {selecionados.has(c.telefone) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </div>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'white', fontWeight: '700', fontSize: '14px' }}>{(c.nome?.[0] ?? '?').toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: 'white', fontSize: '14px', fontWeight: '500', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0, fontFamily: 'monospace' }}>{c.telefone}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contatos.length === 0 && totalBuscado === null && !loading && (
            <div className="glass-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <Users size={48} color="rgba(255,255,255,0.1)" style={{ marginBottom: '16px' }} />
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Clique em "Buscar contatos WA" para carregar os contatos que ainda não são clientes.</p>
            </div>
          )}
        </div>

        {/* Coluna direita — mensagem */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '20px' }}>
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <MessageSquare size={16} color="#60a5fa" />
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: '600' }}>Mensagem</h3>
            </div>

            {/* Variáveis */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {VARIAVEIS.map(v => (
                <span key={v} onClick={() => setMensagem(m => m + v)}
                  style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer' }}>
                  {v}
                </span>
              ))}
            </div>

            <textarea value={mensagem} onChange={e => setMensagem(e.target.value)}
              placeholder="Oi {NOME}! Tudo bem? Vi que você ainda não conhece nosso serviço..."
              rows={8}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6', boxSizing: 'border-box' as any }} />

            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '8px 0 16px' }}>
              As mensagens serão enviadas com intervalo automático via fila.
            </p>

            {resultado && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', background: resultado.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: resultado.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: resultado.tipo === 'ok' ? '#4ade80' : '#f87171', fontSize: '13px', fontWeight: '600' }}>
                {resultado.msg}
              </div>
            )}

            <button onClick={enviar} disabled={enviando || selecionados.size === 0 || !mensagem.trim()}
              style={{ width: '100%', padding: '13px', borderRadius: '10px', cursor: (enviando || selecionados.size === 0 || !mensagem.trim()) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#22c55e,#16a34a)', border: 'none', color: 'white', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: (selecionados.size === 0 || !mensagem.trim()) ? 0.5 : 1 }}>
              <Send size={16} />
              {enviando ? 'Enfileirando...' : `Enviar para ${selecionados.size} contato${selecionados.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
