import { useState } from 'react'

const API = 'https://iptv-manager-production.up.railway.app'

interface ClienteSel { telefone: string }
interface ClienteFiltro { telefone: string }
type Resultado = { tipo: 'ok' | 'erro'; msg: string } | null

interface UseEnqueteParams {
  clienteSel: ClienteSel | null
  clientesFiltrados: ClienteFiltro[]
  formatarTelefone: (tel: string) => string
  setResultado: (r: Resultado) => void
  setEnviando: (v: boolean) => void
  blocoTamanho?: number
  blocoPausaMin?: number
  intervaloMin?: number
  intervaloMax?: number
}

export function useEnquete({ clienteSel, clientesFiltrados, formatarTelefone, setResultado, setEnviando, blocoTamanho = 0, blocoPausaMin = 0, intervaloMin = 5000, intervaloMax = 15000 }: UseEnqueteParams) {
  const [modoEnquete,     setModoEnquete]     = useState(false)
  const [enqueteTitulo,   setEnqueteTitulo]   = useState('')
  const [enqueteOpcoes,   setEnqueteOpcoes]   = useState<string[]>(['', '', ''])
  const [enqueteMultipla, setEnqueteMultipla] = useState(false)

  const enqueteValido = enqueteTitulo.trim() !== '' && enqueteOpcoes.filter(o => o.trim()).length >= 2

  const enviarEnqueteUm = async () => {
    if (!clienteSel) return
    const opcoes = enqueteOpcoes.filter(o => o.trim())
    if (!enqueteTitulo.trim() || opcoes.length < 2) return
    const phone = formatarTelefone(clienteSel.telefone)
    try {
      await fetch(`${API}/send/poll`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, titulo: enqueteTitulo.trim(), opcoes, selectableCount: enqueteMultipla ? opcoes.length : 1 })
      })
    } catch {}
  }

  const enviarEnqueteTodos = async () => {
    const opcoes = enqueteOpcoes.filter(o => o.trim())
    if (!enqueteTitulo.trim() || opcoes.length < 2) return
    setEnviando(true)
    let adicionados = 0
    let enviosNoBloco = 0
    const processados = new Set<string>()
    for (const c of clientesFiltrados) {
      if (!c.telefone || processados.has(c.telefone)) continue
      processados.add(c.telefone)
      try {
        await fetch(`${API}/send/poll`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formatarTelefone(c.telefone), titulo: enqueteTitulo.trim(), opcoes, selectableCount: enqueteMultipla ? opcoes.length : 1 })
        })
        adicionados++
      } catch {}
      enviosNoBloco++
      const espera = intervaloMin === intervaloMax
        ? intervaloMin
        : Math.floor(Math.random() * (intervaloMax - intervaloMin + 1)) + intervaloMin
      await new Promise(r => setTimeout(r, espera))
      if (blocoTamanho > 0 && blocoPausaMin > 0 && enviosNoBloco >= blocoTamanho) {
        await new Promise(r => setTimeout(r, blocoPausaMin * 60000))
        enviosNoBloco = 0
      }
    }
    setResultado({ tipo: 'ok', msg: `${adicionados} enquetes enviadas!` })
    setEnviando(false)
  }

  const EnqueteForm = () => {
    if (!modoEnquete) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
        <input value={enqueteTitulo} onChange={e => setEnqueteTitulo(e.target.value)} placeholder="Título da enquete (ex: Qual plano você prefere?)"
          style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '13px', outline: 'none' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {enqueteOpcoes.map((op, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', width: '20px', textAlign: 'right' }}>{i + 1}.</span>
              <input value={op} onChange={e => { const arr = [...enqueteOpcoes]; arr[i] = e.target.value; setEnqueteOpcoes(arr) }}
                placeholder={`Opção ${i + 1}`}
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
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px', alignSelf: 'flex-start', marginTop: '4px' }}>
          <button onClick={() => setEnqueteMultipla(false)} style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: !enqueteMultipla ? 'rgba(99,102,241,0.4)' : 'transparent', color: !enqueteMultipla ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>☑️ Escolha única</button>
          <button onClick={() => setEnqueteMultipla(true)} style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: enqueteMultipla ? 'rgba(99,102,241,0.4)' : 'transparent', color: enqueteMultipla ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>☑️ Múltipla escolha</button>
        </div>
      </div>
    )
  }

  return { modoEnquete, setModoEnquete, enqueteValido, enviarEnqueteUm, enviarEnqueteTodos, EnqueteForm }
}
