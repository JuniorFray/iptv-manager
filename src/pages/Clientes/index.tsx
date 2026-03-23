import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { Plus, Search, Pencil, Trash2, RefreshCw, Check, X } from 'lucide-react'

const BACKEND_URL = 'https://iptv-manager-production.up.railway.app'

interface Cliente {
  id: string
  nome: string
  telefone: string
  tipo: string
  servidor: string
  usuario: string
  senha: string
  vencimento: string
  valor: string
  status: string
  obs: string
}

const clienteVazio: Omit<Cliente, 'id'> = {
  nome: '', telefone: '', tipo: 'IPTV', servidor: '', usuario: '',
  senha: '', vencimento: '', valor: '', status: 'ativo', obs: '',
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<Omit<Cliente, 'id'> & { id?: string }>(clienteVazio)
  const [carregando, setCarregando] = useState(false)
  const [renovandoId, setRenovandoId] = useState<string | null>(null)
  const [msgPainel, setMsgPainel] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  // Warez
  const [sincronizandoWarez, setSincronizandoWarez] = useState(false)
  const [syncResult, setSyncResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  // Elite
  const [sincronizandoElite, setSincronizandoElite] = useState(false)
  const [syncEliteResult, setSyncEliteResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientes'), snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)))
    })
    return unsub
  }, [])

  const clientesFiltrados = clientes.filter(c => {
    const t = busca.toLowerCase()
    return (
      c.nome?.toLowerCase().includes(t) ||
      c.telefone?.includes(t) ||
      c.servidor?.toLowerCase().includes(t) ||
      c.usuario?.toLowerCase().includes(t) ||
      c.obs?.toLowerCase().includes(t)
    )
  })

  const mostrarMsgPainel = (tipo: 'ok' | 'erro', msg: string) => {
    setMsgPainel({ tipo, msg })
    setTimeout(() => setMsgPainel(null), 6000)
  }

  const abrirModal = (cliente?: Cliente) => {
    setClienteEditando(cliente ? { ...cliente } : { ...clienteVazio })
    setModalAberto(true)
  }

  const fecharModal = () => { setModalAberto(false); setClienteEditando(clienteVazio) }

  const salvarCliente = async () => {
    setCarregando(true)
    try {
      const { id, ...dados } = clienteEditando as Cliente
      if (id) {
        await updateDoc(doc(db, 'clientes', id), dados as any)
      } else {
        await addDoc(collection(db, 'clientes'), dados)
      }
      fecharModal()
    } finally {
      setCarregando(false)
    }
  }

  const excluirCliente = async (id: string) => {
    if (!confirm('Excluir este cliente?')) return
    await deleteDoc(doc(db, 'clientes', id))
  }

  const formatarData = (ts: any): string => {
    if (!ts) return '—'
    if (typeof ts === 'string') return ts
    if (ts?.toDate) return ts.toDate().toLocaleDateString('pt-BR')
    return '—'
  }

  const diffDias = (venc: string): number | null => {
    if (!venc) return null
    const [d, m, y] = venc.split('/').map(Number)
    if (!d || !m || !y) return null
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const data = new Date(y, m - 1, d)
    return Math.round((data.getTime() - hoje.getTime()) / 86400000)
  }

  const corVencimento = (venc: string) => {
    const diff = diffDias(venc)
    if (diff === null) return 'rgba(255,255,255,0.5)'
    if (diff < 0) return '#f87171'
    if (diff <= 4) return '#fb923c'
    if (diff <= 7) return '#fbbf24'
    return '#4ade80'
  }

  // ---- Helpers de servidor ----
  const isWarez = (servidor: string) => servidor?.toUpperCase().includes('WAREZ')
  const isElite = (servidor: string) => servidor?.toUpperCase().includes('ELITE')

  // ---- Sincronizar Warez ----
  const sincronizarWWPanel = async () => {
    setSincronizandoWarez(true)
    setSyncResult(null)
    try {
      const res = await fetch(`${BACKEND_URL}/painel/sincronizar`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const linhasWarez: any[] = data.linhas ?? []
      let atualizados = 0, pulados = 0, naoEncontrados = 0

      for (const cliente of clientes) {
        if (cliente.usuario?.trim()) { pulados++; continue }
        if (!isWarez(cliente.servidor)) continue

        const nomeLower = cliente.nome?.toLowerCase() ?? ''
        const palavras = nomeLower.split(' ').filter((p: string) => p.length > 2)

        const match = linhasWarez.find((l: any) => {
          const notes = (l.notes ?? '').toLowerCase()
          if (!notes) return false
          return palavras.filter((p: string) => notes.includes(p)).length >= 2
        })

        if (match) {
          await updateDoc(doc(db, 'clientes', cliente.id), {
            usuario: match.username,
            senha: match.password,
          })
          atualizados++
        } else {
          naoEncontrados++
        }
      }
      setSyncResult({
        tipo: 'ok',
        msg: `✅ Warez sincronizado!\n✔ ${atualizados} atualizados  ⏭ ${pulados} pulados  ❌ ${naoEncontrados} não encontrados`,
      })
    } catch (err: any) {
      setSyncResult({ tipo: 'erro', msg: `❌ Erro Warez: ${err.message}` })
    } finally {
      setSincronizandoWarez(false)
    }
  }

  // ---- Renovar Warez ----
  const renovarClienteWarez = async (cliente: Cliente) => {
    setRenovandoId(cliente.id)
    try {
      const username = cliente.usuario?.trim()
      if (!username) throw new Error('Cliente sem usuário. Sincronize o Warez primeiro.')

      const syncRes = await fetch(`${BACKEND_URL}/painel/sincronizar`)
      const syncData = await syncRes.json()
      const linhas: any[] = syncData.linhas ?? []
      const linha = linhas.find((l: any) => l.username === username)
      if (!linha) throw new Error(`Usuário "${username}" não encontrado no painel Warez.`)

      const renovarRes = await fetch(`${BACKEND_URL}/painel/renovar/${linha.id}`, { method: 'POST' })
      const renovarData = await renovarRes.json()
      if (!renovarRes.ok) throw new Error(renovarData?.error ?? 'Falha ao renovar no Warez.')

      const expDate = renovarData?.exp_date ?? renovarData?.expiry_date
      if (!expDate) throw new Error('Renovação feita mas data não retornada pelo painel.')

      const d = new Date(expDate)
      const novaDataStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      await updateDoc(doc(db, 'clientes', cliente.id), { vencimento: novaDataStr })
      mostrarMsgPainel('ok', `✅ ${cliente.nome} renovado!\n👤 ${username} | 📅 ${novaDataStr}`)
    } catch (err: any) {
      mostrarMsgPainel('erro', `❌ Erro ao renovar ${cliente.nome}:\n${err.message}`)
    } finally {
      setRenovandoId(null)
    }
  }

  // ---- Sincronizar Elite ----
  const sincronizarElite = async () => {
    setSincronizandoElite(true)
    setSyncEliteResult(null)
    try {
      const res = await fetch(`${BACKEND_URL}/elite/sincronizar`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const linhasElite: any[] = data.linhas ?? []
      let atualizados = 0, pulados = 0, naoEncontrados = 0

      for (const cliente of clientes) {
        if (cliente.usuario?.trim()) { pulados++; continue }
        if (!isElite(cliente.servidor)) continue

        const nomeLower = cliente.nome?.toLowerCase() ?? ''
        const palavras = nomeLower.split(' ').filter((p: string) => p.length > 2)

        const match = linhasElite.find((l: any) => {
          const name = (l.name ?? l.notes ?? '').toLowerCase()
          if (!name) return false
          return palavras.filter((p: string) => name.includes(p)).length >= 2
        })

        if (match) {
          await updateDoc(doc(db, 'clientes', cliente.id), {
            usuario: match.username,
            senha: match.password,
          })
          atualizados++
        } else {
          naoEncontrados++
        }
      }
      setSyncEliteResult({
        tipo: 'ok',
        msg: `✅ Elite sincronizado!\n✔ ${atualizados} atualizados  ⏭ ${pulados} pulados  ❌ ${naoEncontrados} não encontrados`,
      })
    } catch (err: any) {
      setSyncEliteResult({ tipo: 'erro', msg: `❌ Erro Elite: ${err.message}` })
    } finally {
      setSincronizandoElite(false)
    }
  }

  // ---- Renovar Elite ----
  const renovarClienteElite = async (cliente: Cliente) => {
    setRenovandoId(cliente.id)
    try {
      const username = cliente.usuario?.trim()
      if (!username) throw new Error('Cliente sem usuário. Sincronize o Elite primeiro.')

      const syncRes = await fetch(`${BACKEND_URL}/elite/sincronizar`)
      const syncData = await syncRes.json()
      const linhas: any[] = syncData.linhas ?? []
      const linha = linhas.find((l: any) => l.username === username)
      if (!linha) throw new Error(`Usuário "${username}" não encontrado no painel Elite.`)

      const renovarRes = await fetch(`${BACKEND_URL}/elite/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: linha.id, tipo: cliente.tipo ?? 'IPTV' }),
      })
      const renovarData = await renovarRes.json()
      if (!renovarRes.ok) throw new Error(renovarData?.error ?? 'Falha ao renovar no Elite.')

      const expDate = renovarData?.exp_date ?? renovarData?.expiry_date
      if (!expDate) throw new Error('Renovação feita mas data não retornada pelo painel.')

      const d = new Date(expDate)
      const novaDataStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      await updateDoc(doc(db, 'clientes', cliente.id), { vencimento: novaDataStr })
      mostrarMsgPainel('ok', `✅ ${cliente.nome} renovado!\n👤 ${username} | 📅 ${novaDataStr}`)
    } catch (err: any) {
      mostrarMsgPainel('erro', `❌ Erro ao renovar ${cliente.nome}:\n${err.message}`)
    } finally {
      setRenovandoId(null)
    }
  }

  // ---- JSX ----
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>Clientes</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontSize: '14px' }}>{clientes.length} clientes cadastrados</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Sincronizar Warez */}
          <button onClick={sincronizarWWPanel} disabled={sincronizandoWarez} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: sincronizandoWarez ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.15)',
            color: sincronizandoWarez ? 'rgba(255,255,255,0.3)' : '#60a5fa',
            border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px',
            padding: '12px 20px', cursor: sincronizandoWarez ? 'not-allowed' : 'pointer',
            fontWeight: 'bold', fontSize: '14px',
          }}>
            <RefreshCw size={18} style={{ animation: sincronizandoWarez ? 'spin 1s linear infinite' : 'none' }} />
            {sincronizandoWarez ? 'Sincronizando...' : 'Sincronizar Warez'}
          </button>

          {/* Sincronizar Elite */}
          <button onClick={sincronizarElite} disabled={sincronizandoElite} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: sincronizandoElite ? 'rgba(255,255,255,0.05)' : 'rgba(168,85,247,0.15)',
            color: sincronizandoElite ? 'rgba(255,255,255,0.3)' : '#c084fc',
            border: '1px solid rgba(168,85,247,0.3)', borderRadius: '12px',
            padding: '12px 20px', cursor: sincronizandoElite ? 'not-allowed' : 'pointer',
            fontWeight: 'bold', fontSize: '14px',
          }}>
            <RefreshCw size={18} style={{ animation: sincronizandoElite ? 'spin 1s linear infinite' : 'none' }} />
            {sincronizandoElite ? 'Sincronizando...' : 'Sincronizar Elite'}
          </button>

          {/* Novo Cliente */}
          <button onClick={() => abrirModal()} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white',
            border: 'none', borderRadius: '12px', padding: '12px 20px',
            cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
          }}>
            <Plus size={18} /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Mensagem painel */}
      {msgPainel && (
        <div style={{
          marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
          background: msgPainel.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: msgPainel.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
          color: msgPainel.tipo === 'ok' ? '#4ade80' : '#f87171',
          fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
        }}>
          {msgPainel.msg}
        </div>
      )}

      {/* Resultado sync Warez */}
      {syncResult && (
        <div style={{
          marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
          background: syncResult.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: syncResult.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
          color: syncResult.tipo === 'ok' ? '#4ade80' : '#f87171',
          fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
        }}>
          {syncResult.msg}
        </div>
      )}

      {/* Resultado sync Elite */}
      {syncEliteResult && (
        <div style={{
          marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
          background: syncEliteResult.tipo === 'ok' ? 'rgba(168,85,247,0.15)' : 'rgba(239,68,68,0.15)',
          border: syncEliteResult.tipo === 'ok' ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(239,68,68,0.3)',
          color: syncEliteResult.tipo === 'ok' ? '#c084fc' : '#f87171',
          fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
        }}>
          {syncEliteResult.msg}
        </div>
      )}

      {/* Busca */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Search size={18} color="rgba(255,255,255,0.4)" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone, servidor, usuário..."
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'white', fontSize: '15px', flex: 1,
          }}
        />
        {busca && (
          <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="glass-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['NOME', 'TELEFONE', 'TIPO', 'SERVIDOR', 'USUÁRIO', 'SENHA', 'VENCIMENTO', 'VALOR', 'STATUS', 'OBS.', 'AÇÕES'].map(col => (
                <th key={col} style={{
                  padding: '14px 16px', textAlign: 'left',
                  color: 'rgba(255,255,255,0.4)', fontSize: '11px',
                  fontWeight: '600', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientesFiltrados.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                  {busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
                </td>
              </tr>
            ) : clientesFiltrados.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Nome */}
                <td style={{ padding: '14px 16px', color: 'white', fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap' }}>{c.nome || '—'}</td>

                {/* Telefone */}
                <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.6)', fontSize: '13px', whiteSpace: 'nowrap' }}>{c.telefone || '—'}</td>

                {/* Tipo */}
                <td style={{ padding: '14px 16px' }}>
                  {c.tipo ? (
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                      background: c.tipo === 'P2P' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)',
                      color: c.tipo === 'P2P' ? '#c084fc' : '#60a5fa',
                      border: c.tipo === 'P2P' ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(59,130,246,0.4)',
                    }}>{c.tipo}</span>
                  ) : '—'}
                </td>

                {/* Servidor */}
                <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.7)', fontSize: '13px', whiteSpace: 'nowrap' }}>{c.servidor || '—'}</td>

                {/* Usuário */}
                <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.usuario || '—'}</td>

                {/* Senha */}
                <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.senha || '—'}</td>

                {/* Vencimento */}
                <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: corVencimento(c.vencimento), fontWeight: '600', fontSize: '13px' }}>
                    {formatarData(c.vencimento)}
                  </span>
                </td>

                {/* Valor */}
                <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  {c.valor ? `R$ ${parseFloat(c.valor).toFixed(2).replace('.', ',')}` : '—'}
                </td>

                {/* Status */}
                <td style={{ padding: '14px 16px' }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                    background: c.status === 'ativo' ? 'rgba(34,197,94,0.15)' : c.status === 'suspenso' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                    color: c.status === 'ativo' ? '#4ade80' : c.status === 'suspenso' ? '#fbbf24' : '#f87171',
                    border: c.status === 'ativo' ? '1px solid rgba(34,197,94,0.3)' : c.status === 'suspenso' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(239,68,68,0.3)',
                  }}>
                    {c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : '—'}
                  </span>
                </td>

                {/* Obs */}
                <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.obs || '—'}
                </td>

                {/* Ações */}
                <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

                    {/* Renovar Warez */}
                    {isWarez(c.servidor) && (
                      <button
                        onClick={() => renovarClienteWarez(c)}
                        disabled={renovandoId === c.id}
                        title="Renovar no Warez"
                        style={{
                          padding: '6px 10px', borderRadius: '8px', border: 'none', cursor: renovandoId === c.id ? 'not-allowed' : 'pointer',
                          background: renovandoId === c.id ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.15)',
                          color: renovandoId === c.id ? 'rgba(255,255,255,0.3)' : '#60a5fa',
                          fontSize: '12px', fontWeight: 'bold',
                        }}
                      >
                        {renovandoId === c.id ? '...' : '↻'}
                      </button>
                    )}

                    {/* Renovar Elite */}
                    {isElite(c.servidor) && (
                      <button
                        onClick={() => renovarClienteElite(c)}
                        disabled={renovandoId === c.id}
                        title="Renovar no Elite"
                        style={{
                          padding: '6px 10px', borderRadius: '8px', border: 'none', cursor: renovandoId === c.id ? 'not-allowed' : 'pointer',
                          background: renovandoId === c.id ? 'rgba(255,255,255,0.05)' : 'rgba(168,85,247,0.15)',
                          color: renovandoId === c.id ? 'rgba(255,255,255,0.3)' : '#c084fc',
                          fontSize: '12px', fontWeight: 'bold',
                        }}
                      >
                        {renovandoId === c.id ? '...' : '↻'}
                      </button>
                    )}

                    {/* Editar */}
                    <button
                      onClick={() => abrirModal(c)}
                      title="Editar"
                      style={{
                        padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                      }}
                    >
                      <Pencil size={14} />
                    </button>

                    {/* Excluir */}
                    <button
                      onClick={() => excluirCliente(c.id)}
                      title="Excluir"
                      style={{
                        padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.15)', color: '#f87171',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>

                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Cadastro/Edição */}
      {modalAberto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }} onClick={e => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '560px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'white', fontWeight: 'bold', fontSize: '20px', margin: 0 }}>
                {(clienteEditando as any).id ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={fecharModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {([
                { label: 'Nome', key: 'nome', type: 'text', full: true },
                { label: 'Telefone', key: 'telefone', type: 'text' },
                { label: 'Servidor', key: 'servidor', type: 'text' },
                { label: 'Usuário', key: 'usuario', type: 'text' },
                { label: 'Senha', key: 'senha', type: 'text' },
                { label: 'Vencimento (DD/MM/AAAA)', key: 'vencimento', type: 'text' },
                { label: 'Valor (R$)', key: 'valor', type: 'text' },
                { label: 'Observação', key: 'obs', type: 'text' },
              ] as { label: string; key: keyof Omit<Cliente, 'id'>; type: string; full?: boolean }[]).map(({ label, key, type, full }) => (
                <div key={key} style={{ gridColumn: full ? '1 / -1' : undefined }}>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>{label}</label>
                  <input
                    type={type}
                    value={(clienteEditando as any)[key] ?? ''}
                    onChange={e => setClienteEditando(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px', padding: '10px 14px', color: 'white', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}

              {/* Tipo */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Tipo</label>
                <select
                  value={clienteEditando.tipo}
                  onChange={e => setClienteEditando(prev => ({ ...prev, tipo: e.target.value }))}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none',
                  }}
                >
                  <option value="IPTV" style={{ background: '#1e1e2e' }}>IPTV</option>
                  <option value="P2P" style={{ background: '#1e1e2e' }}>P2P</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Status</label>
                <select
                  value={clienteEditando.status}
                  onChange={e => setClienteEditando(prev => ({ ...prev, status: e.target.value }))}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none',
                  }}
                >
                  <option value="ativo" style={{ background: '#1e1e2e' }}>Ativo</option>
                  <option value="inativo" style={{ background: '#1e1e2e' }}>Inativo</option>
                  <option value="suspenso" style={{ background: '#1e1e2e' }}>Suspenso</option>
                </select>
              </div>
            </div>

            {/* Botões do modal */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button onClick={fecharModal} style={{
                padding: '12px 24px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '14px',
              }}>
                Cancelar
              </button>
              <button onClick={salvarCliente} disabled={carregando} style={{
                padding: '12px 24px', borderRadius: '10px', border: 'none',
                background: carregando ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                color: carregando ? 'rgba(255,255,255,0.3)' : 'white',
                cursor: carregando ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <Check size={16} /> {carregando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}