import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { Plus, Search, Pencil, Trash2, RefreshCw, Check, X, Download } from 'lucide-react'

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

// Converte "YYYY-MM-DD" ou "YYYY-MM-DD HH:mm:ss" → "DD/MM/YYYY"
const isoParaBR = (str: string): string => {
  if (!str) return ''
  const parte = str.split(' ')[0]          // descarta hora se houver
  const [y, m, d] = parte.split('-')
  if (!y || !m || !d) return ''
  return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`
}

// Converte "DD/MM/YYYY HH:mm" (resposta IPTV) → "DD/MM/YYYY"
const dtBRParaBR = (str: string): string => {
  if (!str) return ''
  return str.split(' ')[0]
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<Omit<Cliente, 'id'> & { id?: string }>(clienteVazio)
  const [carregando, setCarregando] = useState(false)
  const [renovandoId, setRenovandoId]     = useState<string | null>(null)
  const [gerandoLinkId, setGerandoLinkId] = useState<string | null>(null)
  const [linksModal, setLinksModal]       = useState<{clienteNome: string, links: {plano: string, valor: number, link: string}[]} | null>(null)
  const [importandoId, setImportandoId] = useState<string | null>(null)
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null)
  const [msgPainel, setMsgPainel] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  // Warez
  const [sincronizandoWarez, setSincronizandoWarez] = useState(false)
  const [syncResult, setSyncResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  // Elite
  const [sincronizandoElite, setSincronizandoElite] = useState(false)
  const [syncEliteResult, setSyncEliteResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [linhasEliteCache, setLinhasEliteCache] = useState<any[]>([])

  // Central
  const [sincronizandoCentral, setSincronizandoCentral] = useState(false)
  const [_syncCentralResult, setSyncCentralResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [linhasCentralCache, setLinhasCentralCache] = useState<any[]>([])

  // Modal de período de renovação
  const [modalRenovar, setModalRenovar] = useState(false)
  const [clienteParaRenovar, setClienteParaRenovar] = useState<Cliente | null>(null)
  const [periodoRenovar, setPeriodoRenovar] = useState<number>(1)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientes'), snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)))
    })
    return unsub
  }, [])

  // Fechar menu ao clicar fora
  useEffect(() => {
    if (!menuAbertoId) return
    const handler = () => setMenuAbertoId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuAbertoId])

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
  const isWarez   = (servidor: string) => servidor?.toUpperCase().includes('WAREZ')
  const isElite   = (servidor: string) => servidor?.toUpperCase().includes('ELITE')
  const isCentral = (servidor: string) => servidor?.toUpperCase().includes('CENTRAL')

  // ---- Buscar linhas Elite (com cache) ----
  const buscarLinhasElite = async (): Promise<any[]> => {
    if (linhasEliteCache.length > 0) return linhasEliteCache
    const res = await fetch(`${BACKEND_URL}/elite/sincronizar`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    const linhas = data.linhas ?? []
    setLinhasEliteCache(linhas)
    return linhas
  }

  const matchElite = (cliente: Cliente, linhas: any[]): any | null => {
    // 1. Busca por username — ignora @dominio (ex: cristianeS01@p2elite.com → cristianeS01)
    const usuario = cliente.usuario?.trim().toLowerCase().split('@')[0]
    if (usuario) {
      const byUser = linhas.find((l: any) => (l.username ?? '').toLowerCase().split('@')[0] === usuario)
      if (byUser) return byUser
    }
    // 2. Fallback: nome completo deve bater (todas as palavras)
    const nomeLower = cliente.nome?.toLowerCase() ?? ''
    const palavras = nomeLower.split(' ').filter((p: string) => p.length > 2)
    if (palavras.length === 0) return null
    return linhas.find((l: any) => {
      const name = (l.name ?? l.notes ?? '').toLowerCase()
      if (!name) return false
      return palavras.every((p: string) => name.includes(p))
    }) ?? null
  }

  const matchCentral = (cliente: Cliente, linhas: any[]): any | null => {
    // 1. Busca por username exato
    const usuario = cliente.usuario?.trim().toLowerCase()
    if (usuario) {
      const byUser = linhas.find((l: any) => l.username?.toLowerCase() === usuario)
      if (byUser) return byUser
    }
    // 2. Fallback por nome
    const nomeLower = cliente.nome?.toLowerCase() ?? ''
    const palavras = nomeLower.split(' ').filter((p: string) => p.length > 2)
    if (palavras.length === 0) return null
    return linhas.find((l: any) => {
      const name = (l.name ?? '').toLowerCase()
      if (!name) return false
      return palavras.filter((p: string) => name.includes(p)).length >= 2
    }) ?? null
  }

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
  const gerarLinkPagamento = async (cliente: Cliente) => {
    setGerandoLinkId(cliente.id)
    try {
      const res = await fetch(`${BACKEND_URL}/pagamento/criar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: cliente.id, clienteNome: cliente.nome,
          telefone: cliente.telefone, servidor: cliente.servidor,
          usuario: cliente.usuario, senha: cliente.senha,
        }),
      })
      const data = await res.json()
      if (data.ok && data.links) setLinksModal({ clienteNome: cliente.nome, links: data.links })
      else mostrarMsgPainel('erro', `Erro: ${data.error ?? 'Falha ao gerar links'}`)
    } catch { mostrarMsgPainel('erro', 'Backend offline.') }
    setGerandoLinkId(null)
  }

  const renovarClienteWarez = async (cliente: Cliente, credits: number = 1) => {
    setRenovandoId(cliente.id)
    try {
      const username = cliente.usuario?.trim()
      if (!username) throw new Error('Cliente sem usuário.')

      // Busca linha diretamente pelo username (suporta IPTV e P2P)
      const buscarRes = await fetch(`${BACKEND_URL}/painel/buscar-linha/${encodeURIComponent(username)}`)
      const buscarData = await buscarRes.json()
      if (!buscarData.ok) throw new Error(buscarData.error ?? `Usuário "${username}" não encontrado no painel Warez.`)
      const lineId = buscarData.id

      const renovarRes = await fetch(`${BACKEND_URL}/painel/renovar/${lineId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credits,
          nome:     cliente.nome,
          telefone: cliente.telefone,
          usuario:  cliente.usuario,
          senha:    cliente.senha,
        }),
      })
      const renovarData = await renovarRes.json()
      if (!renovarRes.ok) throw new Error(renovarData?.error ?? 'Falha ao renovar no Warez.')

      const expDate = renovarData?.exp_date ?? renovarData?.expiry_date
      if (!expDate) throw new Error('Renovação feita mas data não retornada pelo painel.')

      const d = new Date(expDate)
      const novaDataStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      await updateDoc(doc(db, 'clientes', cliente.id), { vencimento: novaDataStr })
      mostrarMsgPainel('ok', `✅ ${cliente.nome} renovado! (${credits * 30} dias)\n👤 ${username} | 📅 ${novaDataStr}`)
    } catch (err: any) {
      mostrarMsgPainel('erro', `❌ Erro ao renovar ${cliente.nome}:\n${err.message}`)
    } finally {
      setRenovandoId(null)
    }
  }

  // ---- Sincronizar Elite (atualiza usuario, senha E vencimento) ----
  const sincronizarElite = async () => {
    setSincronizandoElite(true)
    setSyncEliteResult(null)
    setLinhasEliteCache([])
    try {
      const res = await fetch(`${BACKEND_URL}/elite/sincronizar`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const linhasElite: any[] = data.linhas ?? []
      setLinhasEliteCache(linhasElite)
      let atualizados = 0, pulados = 0, naoEncontrados = 0

      for (const cliente of clientes) {
        if (cliente.usuario?.trim()) { pulados++; continue }
        if (!isElite(cliente.servidor)) continue

        const match = matchElite(cliente, linhasElite)
        if (match) {
          const updates: any = {
            usuario: match.username ?? '',
            senha:   match.password ?? '',
          }
          // Atualizar vencimento se disponível
          if (match.exp_date) {
            updates.vencimento = isoParaBR(match.exp_date)
          }
          await updateDoc(doc(db, 'clientes', cliente.id), updates)
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

  // ---- Importar usuario/senha/vencimento Elite para um cliente específico ----
  const importarElite = async (cliente: Cliente) => {
    setImportandoId(cliente.id)
    try {
      const linhas = await buscarLinhasElite()
      const match = matchElite(cliente, linhas)
      if (!match) throw new Error(`Nenhuma linha Elite encontrada para "${cliente.nome}". Verifique se o nome bate com o cadastro no Elite.`)

      const updates: any = {
        usuario: (match.username ?? '').split('@')[0],
        senha:   match.password ?? '',
      }
      if (match.exp_date) {
        updates.vencimento = isoParaBR(match.exp_date)
      }
      await updateDoc(doc(db, 'clientes', cliente.id), updates)
      mostrarMsgPainel('ok', `✅ ${cliente.nome} importado!\n👤 ${match.username}${match.exp_date ? ' | 📅 ' + isoParaBR(match.exp_date) : ''}`)
    } catch (err: any) {
      mostrarMsgPainel('erro', `❌ Erro ao importar ${cliente.nome}:\n${err.message}`)
    } finally {
      setImportandoId(null)
    }
  }

  // ---- Renovar Elite ----
  const renovarClienteElite = async (cliente: Cliente, meses: number = 1) => {
    setRenovandoId(cliente.id)
    try {
      const username = cliente.usuario?.trim()
      if (!username) throw new Error('Cliente sem usuário. Use o botão Importar primeiro.')

      const linhas = await buscarLinhasElite()
      const linha = linhas.find((l: any) => (l.username ?? '').split('@')[0].toLowerCase() === username.toLowerCase().split('@')[0])
      if (!linha) throw new Error(`Usuário "${username}" não encontrado no painel Elite.`)

      const renovarRes = await fetch(`${BACKEND_URL}/elite/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:       linha.id,
          tipo:     linha.tipo ?? cliente.tipo ?? 'IPTV',
          meses,
          nome:     cliente.nome,
          telefone: cliente.telefone,
          usuario:  cliente.usuario,
          senha:    cliente.senha,
        }),
      })
      const renovarData = await renovarRes.json()
      if (!renovarRes.ok) throw new Error(renovarData?.error ?? 'Falha ao renovar no Elite.')

      // Elite IPTV retorna new_exp_date: "25/05/2026 23:59"
      // Elite P2P  retorna new_end_time: "2026-07-25 23:30:00"
      const rawDate = renovarData?.new_exp_date ?? renovarData?.new_end_time
      if (!rawDate) throw new Error('Renovação feita mas data não retornada pelo painel.')

      // Detecta formato pela presença de '-' no início (ISO) ou '/' (BR)
      const novaDataStr = rawDate.includes('-')
        ? isoParaBR(rawDate)       // "2026-07-25 23:30:00" → "25/07/2026"
        : dtBRParaBR(rawDate)      // "25/05/2026 23:59"    → "25/05/2026"

      await updateDoc(doc(db, 'clientes', cliente.id), { vencimento: novaDataStr })
      // Limpa cache para próxima renovação buscar datas atualizadas
      setLinhasEliteCache([])
      mostrarMsgPainel('ok', `✅ ${cliente.nome} renovado! (${meses} ${meses === 1 ? 'mês' : 'meses'})\n👤 ${username} | 📅 ${novaDataStr}`)
    } catch (err: any) {
      mostrarMsgPainel('erro', `❌ Erro ao renovar ${cliente.nome}:\n${err.message}`)
    } finally {
      setRenovandoId(null)
    }
  }

  // ---- Sincronizar Central ----
  const sincronizarCentral = async () => {
    setSincronizandoCentral(true)
    setSyncCentralResult(null)
    try {
      const res = await fetch(`${BACKEND_URL}/central/sincronizar`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const linhas: any[] = data.linhas ?? []
      setLinhasCentralCache(linhas)

      let atualizados = 0
      for (const cliente of clientes) {
        if (!isCentral(cliente.servidor)) continue
        const linha = matchCentral(cliente, linhas)
        if (!linha) continue
        const updates: any = {}
        if (linha.username && linha.username !== cliente.usuario) updates.usuario = linha.username
        if (linha.password && linha.password !== cliente.senha) updates.senha = linha.password
        if (linha.exp_date && linha.exp_date !== cliente.vencimento) updates.vencimento = linha.exp_date
        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, 'clientes', cliente.id), updates)
          atualizados++
        }
      }
      setSyncCentralResult({ tipo: 'ok', msg: `Central sincronizado: ${atualizados} cliente(s) atualizado(s)` })
    } catch (e: any) {
      setSyncCentralResult({ tipo: 'erro', msg: `Erro Central: ${e.message}` })
    } finally {
      setSincronizandoCentral(false)
    }
  }

  const importarCentral = async (cliente: Cliente) => {
    setImportandoId(cliente.id)
    try {
      let linhas = linhasCentralCache
      if (linhas.length === 0) {
        const res = await fetch(`${BACKEND_URL}/central/sincronizar`)
        const data = await res.json()
        linhas = data.linhas ?? []
        setLinhasCentralCache(linhas)
      }
      const linha = matchCentral(cliente, linhas)
      if (!linha) throw new Error('Cliente não encontrado no Central')
      await updateDoc(doc(db, 'clientes', cliente.id), {
        usuario:    linha.username ?? cliente.usuario,
        senha:      linha.password ?? cliente.senha,
        vencimento: linha.exp_date ?? cliente.vencimento,
      })
      mostrarMsgPainel('ok', `Central: ${cliente.nome} importado com sucesso!`)
    } catch (e: any) {
      mostrarMsgPainel('erro', `Erro ao importar ${cliente.nome}: ${e.message}`)
    } finally {
      setImportandoId(null)
    }
  }

    // ---- Modal de período ----
  const abrirModalRenovar = (cliente: Cliente) => {
    setClienteParaRenovar(cliente)
    setPeriodoRenovar((isElite(cliente.servidor) || isCentral(cliente.servidor)) ? 1 : 30)
    setModalRenovar(true)
  }

  const confirmarRenovar = async () => {
    if (!clienteParaRenovar) return
    setModalRenovar(false)
    if (isCentral(clienteParaRenovar.servidor)) {
      const res = await fetch(`${BACKEND_URL}/central/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:       clienteParaRenovar.usuario,
          meses:    periodoRenovar,
          nome:     clienteParaRenovar.nome,
          telefone: clienteParaRenovar.telefone,
          usuario:  clienteParaRenovar.usuario,
          senha:    clienteParaRenovar.senha,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Falha ao renovar no Central')
      const novaData = data.exp_date
      if (novaData) await updateDoc(doc(db, 'clientes', clienteParaRenovar.id), { vencimento: novaData })
      mostrarMsgPainel('ok', `Central: ${clienteParaRenovar.nome} renovado até ${novaData ?? ''}`)
    } else if (isElite(clienteParaRenovar.servidor)) {
      await renovarClienteElite(clienteParaRenovar, periodoRenovar)
    } else {
      await renovarClienteWarez(clienteParaRenovar, periodoRenovar / 30)
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

          {/* Sincronizar Central */}
          <button
            onClick={sincronizarCentral}
            disabled={sincronizandoCentral}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(234,179,8,0.4)',
              background: sincronizandoCentral ? 'rgba(255,255,255,0.05)' : 'rgba(234,179,8,0.15)',
              color: sincronizandoCentral ? 'rgba(255,255,255,0.3)' : '#facc15',
              cursor: sincronizandoCentral ? 'not-allowed' : 'pointer',
              fontWeight: '600', fontSize: '14px',
            }}
          >
            <RefreshCw size={16} className={sincronizandoCentral ? 'spin' : ''} />
            {sincronizandoCentral ? 'Sincronizando...' : 'Sincronizar Central'}
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

      {_syncCentralResult && (
        <div style={{
          marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
          background: _syncCentralResult.tipo === 'ok' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
          border: _syncCentralResult.tipo === 'ok' ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(239,68,68,0.3)',
          color: _syncCentralResult.tipo === 'ok' ? '#facc15' : '#f87171',
          fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
        }}>
          {_syncCentralResult.msg}
        </div>
      )}

      {/* Busca */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Search size={18} color="rgba(255,255,255,0.4)" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone, servidor, usuário..."
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '15px', flex: 1 }}
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
              {['NOME','TELEFONE','TIPO','SERVIDOR','USUÁRIO','SENHA','VENCIMENTO','VALOR','STATUS','OBS',''].map(col => (
                <th key={col} style={{
                  padding: '8px 10px', textAlign: 'left',
                  color: 'rgba(255,255,255,0.4)', fontSize: '10px',
                  fontWeight: '700', letterSpacing: '0.06em', whiteSpace: 'nowrap',
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
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '8px 10px', color: 'white', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.55)', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.telefone || '—'}</td>
                <td style={{ padding: '8px 10px' }}>
                  {c.tipo ? (
                    <span style={{
                      padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
                      background: c.tipo === 'P2P' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)',
                      color: c.tipo === 'P2P' ? '#c084fc' : '#60a5fa',
                      border: c.tipo === 'P2P' ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(59,130,246,0.4)',
                    }}>{c.tipo}</span>
                  ) : '—'}
                </td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.7)', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.servidor || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.usuario || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.senha || '—'}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: corVencimento(c.vencimento), fontWeight: '600', fontSize: '11px' }}>
                    {formatarData(c.vencimento)}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', color: '#4ade80', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  {c.valor ? `R$ ${parseFloat(c.valor).toFixed(2).replace('.', ',')}` : '—'}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '600',
                    background: c.status === 'ativo' ? 'rgba(34,197,94,0.15)' : c.status === 'suspenso' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                    color: c.status === 'ativo' ? '#4ade80' : c.status === 'suspenso' ? '#fbbf24' : '#f87171',
                    border: c.status === 'ativo' ? '1px solid rgba(34,197,94,0.3)' : c.status === 'suspenso' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(239,68,68,0.3)',
                  }}>
                    {c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : '—'}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.4)', fontSize: '11px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.obs || '—'}
                </td>

                {/* Ações — dropdown */}
                <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    {/* Botão ⋮ */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuAbertoId(menuAbertoId === c.id ? null : c.id) }}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                        cursor: 'pointer', background: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.7)', fontSize: '18px', fontWeight: 'bold',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1,
                      }}
                    >⋮</button>

                    {/* Menu dropdown */}
                    {menuAbertoId === c.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute', right: 0, top: '38px', zIndex: 500,
                          background: '#1e1e30', border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '10px', padding: '6px', minWidth: '160px',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}
                      >
                        {/* Importar Central */}
                        {isCentral(c.servidor) && (
                          <button
                            onClick={() => { setMenuAbertoId(null); importarCentral(c) }}
                            disabled={importandoId === c.id}
                            style={{
                              width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
                              cursor: 'pointer', background: 'transparent', textAlign: 'left',
                              color: '#facc15', fontSize: '13px', fontWeight: '600',
                              display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(234,179,8,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Download size={13} /> {importandoId === c.id ? 'Importando...' : 'Importar Central'}
                          </button>
                        )}

                        {/* Importar Elite */}
                        {isElite(c.servidor) && (
                          <button
                            onClick={() => { setMenuAbertoId(null); importarElite(c) }}
                            disabled={importandoId === c.id}
                            style={{
                              width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
                              cursor: 'pointer', background: 'transparent', textAlign: 'left',
                              color: '#4ade80', fontSize: '13px', fontWeight: '600',
                              display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Download size={13} /> {importandoId === c.id ? 'Importando...' : 'Importar Elite'}
                          </button>
                        )}

                        {/* Renovar */}
                        {(isWarez(c.servidor) || isElite(c.servidor) || isCentral(c.servidor)) && (
                          <button
                            onClick={() => { setMenuAbertoId(null); abrirModalRenovar(c) }}
                            disabled={renovandoId === c.id}
                            style={{
                              width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
                              cursor: 'pointer', background: 'transparent', textAlign: 'left',
                              color: isCentral(c.servidor) ? '#facc15' : isElite(c.servidor) ? '#c084fc' : '#60a5fa',
                              fontSize: '13px', fontWeight: '600',
                              display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = isCentral(c.servidor) ? 'rgba(234,179,8,0.1)' : isElite(c.servidor) ? 'rgba(168,85,247,0.1)' : 'rgba(59,130,246,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <RefreshCw size={13} /> {renovandoId === c.id ? 'Renovando...' : 'Renovar'}
                          </button>
                        )}

                        {/* Separador */}
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

                        {/* Editar */}
                        <button
                          onClick={() => { setMenuAbertoId(null); abrirModal(c) }}
                          style={{
                            width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
                            cursor: 'pointer', background: 'transparent', textAlign: 'left',
                            color: '#818cf8', fontSize: '13px', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '8px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Pencil size={13} /> Editar
                        </button>

                        {/* Excluir */}
                        <button
                          onClick={() => { setMenuAbertoId(null); gerarLinkPagamento(c) }}
                          disabled={gerandoLinkId === c.id}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#34d399', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', opacity: gerandoLinkId === c.id ? 0.5 : 1 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          💳 {gerandoLinkId === c.id ? 'Gerando...' : 'Gerar Links'}
                        </button>
                        <button
                          onClick={() => { setMenuAbertoId(null); excluirCliente(c.id) }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#f87171', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== MODAL PERÍODO DE RENOVAÇÃO ===== */}
      {modalRenovar && clienteParaRenovar && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setModalRenovar(false) }}
        >
          <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ color: 'white', fontWeight: 'bold', fontSize: '18px', margin: 0 }}>Renovar Assinatura</h2>
              <button onClick={() => setModalRenovar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '20px', marginTop: '4px' }}>
              Cliente: <strong style={{ color: 'white' }}>{clienteParaRenovar.nome}</strong>
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Selecione o período
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '28px' }}>
              {(isElite(clienteParaRenovar.servidor)
                ? [{ label: '1 mês', value: 1 }, { label: '2 meses', value: 2 }, { label: '3 meses', value: 3 }, { label: '6 meses', value: 6 }]
                : [{ label: '30 dias', value: 30 }, { label: '60 dias', value: 60 }, { label: '90 dias', value: 90 }, { label: '180 dias', value: 180 }]
              ).map(opt => {
                const eliteClient = isElite(clienteParaRenovar.servidor)
                const selected = periodoRenovar === opt.value
                return (
                  <button key={opt.value} onClick={() => setPeriodoRenovar(opt.value)} style={{
                    padding: '14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'all 0.15s',
                    background: selected ? (eliteClient ? 'rgba(168,85,247,0.35)' : 'rgba(59,130,246,0.35)') : 'rgba(255,255,255,0.06)',
                    border: selected ? (eliteClient ? '1px solid rgba(168,85,247,0.7)' : '1px solid rgba(59,130,246,0.7)') : '1px solid rgba(255,255,255,0.1)',
                    color: selected ? (eliteClient ? '#c084fc' : '#60a5fa') : 'rgba(255,255,255,0.55)',
                  }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalRenovar(false)} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
              }}>Cancelar</button>
              <button onClick={confirmarRenovar} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'white',
                background: isCentral(clienteParaRenovar.servidor) ? 'linear-gradient(135deg,#eab308,#ca8a04)' : isElite(clienteParaRenovar.servidor) ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                <Check size={16} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL CADASTRO/EDIÇÃO ===== */}
      {modalAberto && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal() }}
        >
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
                { label: 'Nome', field: 'nome', type: 'text' },
                { label: 'Telefone', field: 'telefone', type: 'text' },
                { label: 'Servidor', field: 'servidor', type: 'text' },
                { label: 'Vencimento (DD/MM/AAAA)', field: 'vencimento', type: 'text' },
                { label: 'Usuário', field: 'usuario', type: 'text' },
                { label: 'Senha', field: 'senha', type: 'text' },
                { label: 'Valor (R$)', field: 'valor', type: 'number' },
                { label: 'Obs.', field: 'obs', type: 'text' },
              ] as { label: string; field: keyof Omit<Cliente, 'id'>; type: string }[]).map(({ label, field, type }) => (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                  <input
                    type={type}
                    value={(clienteEditando as any)[field] || ''}
                    onChange={e => setClienteEditando(prev => ({ ...prev, [field]: e.target.value }))}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</label>
                <select value={clienteEditando.tipo} onChange={e => setClienteEditando(prev => ({ ...prev, tipo: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' }}>
                  <option value="IPTV" style={{ background: '#1a1a2e' }}>IPTV</option>
                  <option value="P2P" style={{ background: '#1a1a2e' }}>P2P</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
                <select value={clienteEditando.status} onChange={e => setClienteEditando(prev => ({ ...prev, status: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' }}>
                  <option value="ativo" style={{ background: '#1a1a2e' }}>Ativo</option>
                  <option value="suspenso" style={{ background: '#1a1a2e' }}>Suspenso</option>
                  <option value="inativo" style={{ background: '#1a1a2e' }}>Inativo</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={fecharModal} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Cancelar</button>
              <button onClick={salvarCliente} disabled={carregando} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', cursor: carregando ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'white', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Check size={16} /> {carregando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Links Pagamento */}
      {linksModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ color: 'white', margin: '0 0 6px', fontSize: '18px' }}>💳 Links de Pagamento</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: '0 0 20px' }}>{linksModal.clienteNome}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {linksModal.links.map(({ plano, valor, link }) => (
                <div key={plano} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 16px' }}>
                  <div>
                    <span style={{ color: 'white', fontWeight: '700', fontSize: '15px' }}>{plano}</span>
                    <span style={{ color: '#4ade80', fontWeight: '700', fontSize: '14px', marginLeft: '12px' }}>R$ {valor.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(link); mostrarMsgPainel('ok', `Link ${plano} copiado!`) }}
                    style={{ padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', fontSize: '12px', fontWeight: '700' }}>
                    📋 Copiar
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setLinksModal(null)} style={{ width: '100%', padding: '12px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}