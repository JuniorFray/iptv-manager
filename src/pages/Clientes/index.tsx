import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { Plus, Search, Pencil, Trash2, RefreshCw, Check, X, Download, Users, AlertTriangle } from 'lucide-react'

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
  responsavel?: string  // telefone do responsável pelo pagamento (para múltiplos pontos)
  valor3meses?: string
  valor6meses?: string
  grupoLinha?: string
  vencimentoLinha?: string
}

const clienteVazio: Omit<Cliente, 'id'> = {
  nome: '', telefone: '', tipo: 'IPTV', servidor: '', usuario: '',
  senha: '', vencimento: '', valor: '', status: 'ativo', obs: '', responsavel: '', valor3meses: '', valor6meses: '',
  grupoLinha: '', vencimentoLinha: '',
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
  const [cupomLink, setCupomLink]           = useState('')
  const [cupomModal, setCupomModal]         = useState<any>(null)
  const [linksModal, setLinksModal]       = useState<{clienteNome: string, links: {ponto?: string, plano: string, valor: number, link: string}[], pontos?: boolean} | null>(null)
  const [importandoId, setImportandoId] = useState<string | null>(null)
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null)
  const [editandoInline, setEditandoInline] = useState<{ id: string; field: string; valor: string } | null>(null)
  const [msgPainel, setMsgPainel] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  // Modal Criar/Editar Grupo
  const [modalGrupoAberto, setModalGrupoAberto]   = useState(false)
  const [grupoEditando, setGrupoEditando]         = useState<string | null>(null)
  const [grupoNome, setGrupoNome]                 = useState('')
  const [grupoMembrosBusca, setGrupoMembrosBusca] = useState('')
  const [grupoMembrosIds, setGrupoMembrosIds]     = useState<string[]>([])
  const [grupoSalvando, setGrupoSalvando]         = useState(false)
  const [grupoEnviarMsg, setGrupoEnviarMsg]       = useState(true)

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

  const salvarInline = async (id: string, field: string, valor: string) => {
    setEditandoInline(null)
    try {
      await updateDoc(doc(db, 'clientes', id), { [field]: valor })
    } catch (err: any) {
      mostrarMsgPainel('erro', 'Erro ao salvar: ' + err.message)
    }
  }

  const mostrarMsgPainel = (tipo: 'ok' | 'erro', msg: string) => {
    setMsgPainel({ tipo, msg })
    setTimeout(() => setMsgPainel(null), 6000)
  }

  const CelulaEditavel = ({ c, field, valor, style }: { c: Cliente; field: string; valor: string; style: React.CSSProperties }) => {
    const ativo = editandoInline?.id === c.id && editandoInline?.field === field
    if (ativo) {
      return (
        <input
          autoFocus
          defaultValue={editandoInline!.valor}
          onBlur={e => salvarInline(c.id, field, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditandoInline(null)
          }}
          style={{
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.6)',
            borderRadius: '4px', color: 'white', fontSize: '11px', padding: '2px 6px',
            outline: 'none', width: '100%', fontFamily: 'inherit',
          }}
        />
      )
    }
    return (
      <span
        style={{ ...style, cursor: 'text', display: 'block' }}
        onDoubleClick={e => { e.stopPropagation(); setEditandoInline({ id: c.id, field, valor }) }}
        title="Duplo clique para editar"
      >
        {valor || '—'}
      </span>
    )
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
  const gerarLinkPagamento = async (cliente: Cliente, cupom?: string) => {
    setCupomModal(null)
    setGerandoLinkId(cliente.id)
    try {
      const telResp = cliente.responsavel?.trim() || cliente.telefone
      const pontos = clientes.filter(c =>
        (c.responsavel?.trim() || c.telefone) === telResp && c.status === 'ativo'
      )
      const allLinks: { ponto: string; plano: string; valor: number; link: string }[] = []
      for (const ponto of pontos) {
        const res = await fetch(`${BACKEND_URL}/pagamento/criar`, {
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
      const buscarCentral = await fetch(`${BACKEND_URL}/central/buscar-linha/${encodeURIComponent(clienteParaRenovar.usuario)}`).then(r => r.json())
      if (!buscarCentral.ok) throw new Error(`Usuário "${clienteParaRenovar.usuario}" não encontrado no Central`)
      const res = await fetch(`${BACKEND_URL}/central/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:       buscarCentral.id,
          meses:    periodoRenovar,
          system:   buscarCentral.system ?? 1,
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

  // ---- Helpers de grupo ----
  const diffDiasGrupo = (v: string): number | null => {
    if (!v) return null
    const p = v.split('/')
    if (p.length !== 3) return null
    const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]))
    const h = new Date(); h.setHours(0,0,0,0)
    return Math.round((d.getTime() - h.getTime()) / 86400000)
  }
  const corVencGrupo = (v: string) => {
    const d = diffDiasGrupo(v)
    if (d === null) return 'rgba(255,255,255,0.5)'
    if (d < 0)  return '#f87171'
    if (d <= 4) return '#fbbf24'
    return '#4ade80'
  }
  const proximoNomeGrupo = () => {
    const nums = clientes
      .map(c => c.grupoLinha).filter(Boolean)
      .map(g => { const m = g!.match(/(\d+)$/); return m ? parseInt(m[1]) : 0 })
    return `GRUPO ${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3,'0')}`
  }
  const abrirCriarGrupo = () => {
    setGrupoEditando(null); setGrupoNome(proximoNomeGrupo())
    setGrupoMembrosIds([]); setGrupoMembrosBusca(''); setModalGrupoAberto(true)
  }
  const abrirEditarGrupo = (nomeGrupo: string) => {
    const membros = clientes.filter(c => c.grupoLinha === nomeGrupo)
    setGrupoEditando(nomeGrupo); setGrupoNome(nomeGrupo)
    setGrupoMembrosIds(membros.map(c => c.id))
    setGrupoMembrosBusca(''); setModalGrupoAberto(true)
  }
  const vencedorDoGrupo = (ids: string[]) => {
    const membros = ids.map(id => clientes.find(c => c.id === id)!).filter(Boolean)
    return membros.reduce((a, b) => {
      const pa = a.vencimento?.split('/'); const pb = b.vencimento?.split('/')
      if (!pa || pa.length<3) return b; if (!pb || pb.length<3) return a
      const da = new Date(Number(pa[2]),Number(pa[1])-1,Number(pa[0]))
      const db2 = new Date(Number(pb[2]),Number(pb[1])-1,Number(pb[0]))
      return da >= db2 ? a : b
    })
  }
  const salvarGrupo = async () => {
    if (!grupoNome.trim() || grupoMembrosIds.length < 2) return
    setGrupoSalvando(true)
    try {
      const vencedor = vencedorDoGrupo(grupoMembrosIds)
      const vencimentoLinha = vencedor.vencimento
      for (const id of grupoMembrosIds) {
        const upd: any = { grupoLinha: grupoNome.trim(), vencimentoLinha, titularNome: vencedor.nome }
        if (id !== vencedor.id) { upd.usuario = vencedor.usuario; upd.senha = vencedor.senha }
        await updateDoc(doc(db, 'clientes', id), upd)
      }
      if (grupoEditando) {
        const antigos = clientes.filter(c => c.grupoLinha === grupoEditando && !grupoMembrosIds.includes(c.id))
        for (const c of antigos) await updateDoc(doc(db, 'clientes', c.id), { grupoLinha: '', vencimentoLinha: '' })
      }
      // Envia msg para quem teve login alterado
      if (grupoEnviarMsg) {
        const alterados = grupoMembrosIds
          .map(id => clientes.find(c => c.id === id)!)
          .filter(c => c && c.id !== vencedor.id)
        for (const c of alterados) {
          try {
            await fetch(`https://iptv-manager-production.up.railway.app/fila/adicionar`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clienteId: c.id, clienteNome: c.nome, telefone: c.telefone,
                mensagem: `Olá ${c.nome}! 📺 Atualizamos os dados de acesso da sua linha:\n\n👤 Usuário: ${vencedor.usuario}\n🔑 Senha: ${vencedor.senha}\n\nPor favor, atualize esses dados no seu aplicativo. Qualquer dúvida estamos à disposição!`,
                gatilho: 'grupo-novo-acesso',
              })
            })
          } catch {}
        }
      }
      setModalGrupoAberto(false)
      mostrarMsgPainel('ok', `✅ ${grupoNome.trim()} salvo! Login: ${vencedor.usuario} / ${vencedor.senha}${grupoEnviarMsg ? ' · Mensagens enfileiradas' : ''}`)
    } catch (e: any) { mostrarMsgPainel('erro', '❌ Erro: ' + e.message) }
    finally { setGrupoSalvando(false) }
  }

  // ---- JSX ----

  const exportarCSV = () => {
    const hoje = new Date().toLocaleDateString('pt-BR')
    const dados = clientes.map(c => [
      c.nome                       ?? '',
      String(c.telefone            ?? ''),
      c.tipo                       ?? '',
      c.servidor                   ?? '',
      String(c.usuario             ?? ''),
      String(c.senha               ?? ''),
      c.vencimento                 ?? '',
      c.valor                      ?? '',
      c.status                     ?? '',
      c.obs                        ?? '',
      (c as any).grupoLinha        ?? '',
      (c as any).vencimentoLinha   ?? '',
    ])
    const headers = ['Nome','Telefone','Tipo','Servidor','Usuário','Senha','Vencimento','Valor','Status','Obs','Grupo','Venc. da Linha']
    const wb = XLSX.utils.book_new()
    const ws: Record<string, any> = {}
    ws['A1'] = { v: `Clientes — Exportado em ${hoje} — Total: ${clientes.length}`, t: 's' }
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }]
    headers.forEach((h, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 1, c: ci })
      ws[addr] = { v: h, t: 's' }
    })
    const textoCols = new Set([1, 4, 5])
    dados.forEach((row, ri) => {
      row.forEach((val, ci) => {
        const addr = XLSX.utils.encode_cell({ r: ri + 2, c: ci })
        ws[addr] = textoCols.has(ci)
          ? { v: String(val), t: 's', z: '@' }
          : { v: val, t: 's' }
      })
    })
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dados.length + 1, c: 12 } })
    ws['!cols'] = [
      { wch: 28 }, { wch: 18 }, { wch: 8  }, { wch: 10 },
      { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
      { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 16 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, `clientes_${hoje.replace(/\//g, '-')}.xlsx`)
  }

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

          {/* Exportar CSV */}
          <button onClick={exportarCSV} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(34,197,94,0.15)', color: '#4ade80',
            border: '1px solid rgba(34,197,94,0.3)', borderRadius: '12px',
            padding: '12px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
          }}>
            <Download size={18} /> Exportar CSV
          </button>

          {/* Criar Grupo */}
          <button onClick={abrirCriarGrupo} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
            border: '1px solid rgba(99,102,241,0.3)', borderRadius: '12px',
            padding: '12px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
          }}>
            <Users size={18} /> Criar Grupo
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

      {/* ── GRUPOS ── */}
      {(() => {
        const gruposMap: Record<string, Cliente[]> = {}
        for (const c of clientesFiltrados) {
          if (c.grupoLinha?.trim()) {
            if (!gruposMap[c.grupoLinha]) gruposMap[c.grupoLinha] = []
            gruposMap[c.grupoLinha].push(c)
          }
        }
        return Object.entries(gruposMap).sort((a,b)=>{const na=parseInt(a[0].match(/\d+/)?.[0]||'0');const nb=parseInt(b[0].match(/\d+/)?.[0]||'0');return na-nb}).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            {Object.entries(gruposMap).sort((a,b)=>{const na=parseInt(a[0].match(/\d+/)?.[0]||'0');const nb=parseInt(b[0].match(/\d+/)?.[0]||'0');return na-nb}).map(([nomeGrupo, membros]) => {
              const atrasados = membros.filter(m => { const d = diffDiasGrupo(m.vencimento); return d !== null && d < -3 })
              const alerta = atrasados.length > 0
              return (
                <div key={nomeGrupo} style={{ borderRadius: '14px', border: alerta ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(99,102,241,0.25)', background: 'rgba(255,255,255,0.02)' }}>
                  {/* Header do grupo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: alerta ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)', borderBottom: alerta ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(99,102,241,0.15)' }}>
                    {alerta ? <AlertTriangle size={15} color="#ef4444" /> : <Users size={15} color="#818cf8" />}
                    <span style={{ color: alerta ? '#f87171' : '#a5b4fc', fontWeight: 700, fontSize: 13 }}>{nomeGrupo}</span>
                    {alerta && <span style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: 99, border: '1px solid rgba(239,68,68,0.3)' }}>⚠️ Membro em atraso</span>}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>Linha: {membros[0]?.vencimentoLinha || '—'}</span>
                    {membros[0]?.titularNome && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
                        🔑 Titular: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{membros[0].titularNome}</strong>
                      </span>
                    )}
                    <button onClick={() => abrirEditarGrupo(nomeGrupo)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                      <Pencil size={12} /> Editar Grupo
                    </button>
                  </div>
                  {/* Membros */}
                  {membros.map(c => (
                    <div key={c.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ flex: 3, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }} onClick={() => { abrirModal(c); setMenuAbertoId(null) }}>{c.nome}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: c.tipo === 'P2P' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)', color: c.tipo === 'P2P' ? '#c084fc' : '#60a5fa', border: c.tipo === 'P2P' ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(59,130,246,0.4)' }}>{c.tipo || '—'}</span>
                      </span>
                      <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{c.usuario}</span>
                      <span style={{ flex: 1, color: corVencGrupo(c.vencimento), fontWeight: 600, fontSize: 12 }}>{c.vencimento}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: c.status === 'ativo' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: c.status === 'ativo' ? '#4ade80' : '#f87171', border: c.status === 'ativo' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)' }}>
                          {c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : '—'}
                        </span>
                      </span>
                      <div style={{ position: 'relative' }}>
                        <button onClick={e => { e.stopPropagation(); setMenuAbertoId(menuAbertoId === c.id ? null : c.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '4px 8px', borderRadius: 6, fontSize: 18, lineHeight: 1 }}>⋮</button>
                        {menuAbertoId === c.id && (
                          <div style={{ position: 'absolute', right: 0, top: '100%', background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 6, zIndex: 100, minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                            onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setMenuAbertoId(null); setCupomModal(c); setCupomLink('') }}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#34d399', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.1)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              💳 Gerar Links
                            </button>
                            <button onClick={() => { setMenuAbertoId(null); navigator.clipboard.writeText('Nome: '+c.nome+'\nUsuário: '+c.usuario+'\nSenha: '+c.senha+'\nVencimento: '+c.vencimento) }}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.1)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              📋 Copiar dados
                            </button>
                            {isWarez(c.servidor) && (
                              <button onClick={() => { setMenuAbertoId(null); abrirModalRenovar(c) }}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#60a5fa', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.1)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <RefreshCw size={13} /> Renovar
                              </button>
                            )}
                            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                            <button onClick={() => { setMenuAbertoId(null); abrirModal(c) }}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#818cf8', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <Pencil size={13} /> Editar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : null
      })()}

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
            ) : clientesFiltrados.filter(c => !c.grupoLinha?.trim()).map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '8px 10px', maxWidth: '160px' }}>
                  <CelulaEditavel c={c} field="nome" valor={c.nome} style={{ color: 'white', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                </td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="telefone" valor={c.telefone} style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }} />
                </td>
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
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="servidor" valor={c.servidor} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }} />
                </td>
                <td style={{ padding: '8px 10px', maxWidth: '110px' }}>
                  <CelulaEditavel c={c} field="usuario" valor={c.usuario} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                </td>
                <td style={{ padding: '8px 10px', maxWidth: '100px' }}>
                  <CelulaEditavel c={c} field="senha" valor={c.senha} style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                </td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="vencimento" valor={c.vencimento} style={{ color: corVencimento(c.vencimento), fontWeight: '600', fontSize: '11px' }} />
                </td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="valor" valor={c.valor} style={{ color: '#4ade80', fontWeight: '600', fontSize: '11px' }} />
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
                <td style={{ padding: '8px 10px', maxWidth: '100px' }}>
                  <CelulaEditavel c={c} field="obs" valor={c.obs ?? ''} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
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
                          onClick={() => { setMenuAbertoId(null); setCupomModal(c); setCupomLink('') }}
                          disabled={gerandoLinkId === c.id}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#34d399', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', opacity: gerandoLinkId === c.id ? 0.5 : 1 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          💳 {gerandoLinkId === c.id ? 'Gerando...' : 'Gerar Links'}
                        </button>
                        {/* Copiar dados */}
                        <button
                          onClick={() => {
                            setMenuAbertoId(null)
                            const texto = [
                              `Nome: ${c.nome || ''}`,
                              `Usuário: ${c.usuario || ''}`,
                              `Senha: ${c.senha || ''}`,
                              `Vencimento: ${c.vencimento || ''}`,
                            ].join('\n')
                            navigator.clipboard.writeText(texto)
                          }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left', color: '#94a3b8', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          📋 Copiar dados
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


      {/* Modal Criar/Editar Grupo */}
      {modalGrupoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setModalGrupoAberto(false)}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={20} color="#a5b4fc" /> {grupoEditando ? 'Editar Grupo' : 'Criar Grupo'}
              </h2>
              <button onClick={() => setModalGrupoAberto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 22 }}>✕</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, display: 'block', marginBottom: 6 }}>NOME DO GRUPO</label>
              <input value={grupoNome} onChange={e => setGrupoNome(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, display: 'block', marginBottom: 8 }}>MEMBROS ({grupoMembrosIds.length}) — mínimo 2, máximo 3</label>
              {grupoMembrosIds.map(id => {
                const c = clientes.find(x => x.id === id)
                if (!c) return null
                const ehVencedor = grupoMembrosIds.length >= 2 && vencedorDoGrupo(grupoMembrosIds)?.id === id
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: ehVencedor ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', border: ehVencedor ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)', marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.nome}</span>
                      {ehVencedor && <span style={{ marginLeft: 8, fontSize: 10, color: '#a5b4fc', background: 'rgba(99,102,241,0.2)', padding: '1px 6px', borderRadius: 99 }}>🔑 titular da linha</span>}
                      <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{c.tipo} · venc: {c.vencimento} · {c.usuario}</span>
                    </div>
                    <button onClick={() => setGrupoMembrosIds(prev => prev.filter(i => i !== id))}
                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                      Remover
                    </button>
                  </div>
                )
              })}
              {grupoMembrosIds.length < 3 && (
                <div style={{ marginTop: 8 }}>
                  <input value={grupoMembrosBusca} onChange={e => setGrupoMembrosBusca(e.target.value)}
                    placeholder="Buscar cliente Warez para adicionar..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  {grupoMembrosBusca.length >= 2 && (
                    <div style={{ maxHeight: 180, overflowY: 'auto', background: '#1e1e38', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', marginTop: 4 }}>
                      {clientes.filter(c => !grupoMembrosIds.includes(c.id) && c.servidor?.toUpperCase() === 'WAREZ' && c.status?.toLowerCase() === 'ativo' && (c.nome?.toLowerCase().includes(grupoMembrosBusca.toLowerCase()) || c.telefone?.includes(grupoMembrosBusca))).slice(0,8).map(c => (
                        <div key={c.id} onClick={() => { setGrupoMembrosIds(p => [...p, c.id]); setGrupoMembrosBusca('') }}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.nome}</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>{c.tipo} · {c.vencimento}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {grupoMembrosIds.length >= 2 && (() => {
              const v = vencedorDoGrupo(grupoMembrosIds)
              return v ? (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 16, fontSize: 12 }}>
                  <p style={{ color: '#a5b4fc', margin: '0 0 3px', fontWeight: 600 }}>Preview:</p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>Login compartilhado: <strong style={{ color: 'white' }}>{v.usuario} / {v.senha}</strong></p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>Vencimento da linha: <strong style={{ color: '#4ade80' }}>{v.vencimento}</strong></p>
                </div>
              ) : null
            })()}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <input type="checkbox" id="chkEnviarMsg" checked={grupoEnviarMsg} onChange={e => setGrupoEnviarMsg(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#6366f1' }} />
              <label htmlFor="chkEnviarMsg" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>
                Enviar mensagem de novo acesso para os membros que tiveram login alterado
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalGrupoAberto(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Cancelar</button>
              <button onClick={salvarGrupo} disabled={grupoSalvando || grupoMembrosIds.length < 2 || !grupoNome.trim()}
                style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: grupoSalvando || grupoMembrosIds.length < 2 ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: grupoSalvando || grupoMembrosIds.length < 2 ? 'rgba(255,255,255,0.3)' : 'white', cursor: grupoSalvando || grupoMembrosIds.length < 2 ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 14 }}>
                {grupoSalvando ? 'Salvando...' : grupoEditando ? '✓ Salvar Alterações' : '✓ Criar Grupo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE CARDS ── */}
      <div className="clientes-cards-mobile" style={{ display: 'none', flexDirection: 'column' }}>
        {clientesFiltrados.map(c => (
          <div key={c.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ color: 'white', fontWeight: '700', fontSize: '15px' }}>{c.nome}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '2px' }}>{c.telefone}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                  background: c.status === 'ativo' ? 'rgba(34,197,94,0.15)' : c.status === 'suspenso' ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
                  color: c.status === 'ativo' ? '#4ade80' : c.status === 'suspenso' ? '#fbbf24' : '#f87171',
                  border: `1px solid ${c.status === 'ativo' ? 'rgba(34,197,94,0.3)' : c.status === 'suspenso' ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>{c.status}</span>
                <button onClick={() => setMenuAbertoId(menuAbertoId === c.id ? null : c.id)}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'white', fontSize: '16px' }}>
                  ⋮
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: menuAbertoId === c.id ? '10px' : '0' }}>
              {([['Servidor', c.servidor], ['Tipo', c.tipo], ['Usuário', c.usuario], ['Senha', c.senha], ['Vencimento', c.vencimento], ['Valor', c.valor ? `R$ ${c.valor}` : '—']] as [string,string][]).map(([label, val]) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, marginBottom: '2px' }}>{label}</div>
                  <div style={{ color: 'white', fontSize: '12px', wordBreak: 'break-all' as const }}>{val || '—'}</div>
                </div>
              ))}
            </div>
            {menuAbertoId === c.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {([
                  { label: '✏️ Editar', action: () => { setMenuAbertoId(null); abrirModal(c) }, color: 'white' },
                  { label: '🔄 Renovar', action: () => { setMenuAbertoId(null); setClienteParaRenovar(c); setModalRenovar(true) }, color: '#60a5fa' },
                  { label: '💳 Gerar Links', action: () => { setMenuAbertoId(null); gerarLinkPagamento(c) }, color: '#34d399' },
                  { label: '🗑️ Excluir', action: () => { setMenuAbertoId(null); excluirCliente(c.id) }, color: '#f87171' },
                ] as {label:string,action:()=>void,color:string}[]).map(({ label, action, color }) => (
                  <button key={label} onClick={action}
                    style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
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
                { label: 'Obs.', field: 'obs', type: 'text' },
                { label: 'Valor 1 Mês (R$)', field: 'valor', type: 'number' },
                { label: 'Valor 3 Meses (R$)', field: 'valor3meses', type: 'number' },
                { label: 'Valor 6 Meses (R$)', field: 'valor6meses', type: 'number' },
                { label: 'Responsável (tel.)', field: 'responsavel', type: 'text' },
                { label: 'Grupo (Linha compartilhada)', field: 'grupoLinha', type: 'text' },
                { label: 'Vencimento da Linha (DD/MM/AAAA)', field: 'vencimentoLinha', type: 'text' },
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
                  <option value="teste" style={{ background: '#1a1a2e' }}>Teste</option>
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
      {/* Modal Cupom */}
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
                {cupomLink ? `🎟️ Aplicar "${cupomLink}" e Gerar` : '🔗 Gerar sem cupom'}
              </button>
            </div>
          </div>
        </div>
      )}

      {linksModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ color: 'white', margin: '0 0 6px', fontSize: '18px' }}>💳 Links de Pagamento</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: '0 0 20px' }}>{linksModal.clienteNome}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {linksModal.pontos
                ? /* Agrupado por ponto */
                  (() => {
                    const pontoNames = [...new Set(linksModal.links.map(l => l.ponto))]
                    return pontoNames.map(pontoNome => (
                      <div key={pontoNome} style={{ marginBottom: '12px' }}>
                        <div style={{ color: '#818cf8', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', paddingLeft: '4px' }}>
                          📺 {pontoNome}
                        </div>
                        {linksModal.links.filter(l => l.ponto === pontoNome).map(({ plano, valor, link }) => (
                          <div key={`${pontoNome}-${plano}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px', marginBottom: '6px' }}>
                            <div>
                              <span style={{ color: 'white', fontWeight: '700', fontSize: '14px' }}>{plano}</span>
                              <span style={{ color: '#4ade80', fontWeight: '700', fontSize: '13px', marginLeft: '10px' }}>R$ {typeof valor === 'number' ? valor.toFixed(2).replace('.', ',') : valor}</span>
                            </div>
                            <button onClick={() => { navigator.clipboard.writeText(link); mostrarMsgPainel('ok', `Link ${plano} copiado!`) }}
                              style={{ padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', fontSize: '12px', fontWeight: '700' }}>
                              📋
                            </button>
                          </div>
                        ))}
                      </div>
                    ))
                  })()
                : /* Ponto único */
                  linksModal.links.map(({ plano, valor, link }) => (
                    <div key={plano} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 16px' }}>
                      <div>
                        <span style={{ color: 'white', fontWeight: '700', fontSize: '15px' }}>{plano}</span>
                        <span style={{ color: '#4ade80', fontWeight: '700', fontSize: '14px', marginLeft: '12px' }}>R$ {typeof valor === 'number' ? valor.toFixed(2).replace('.', ',') : valor}</span>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(link); mostrarMsgPainel('ok', `Link ${plano} copiado!`) }}
                        style={{ padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', fontSize: '12px', fontWeight: '700' }}>
                        📋 Copiar
                      </button>
                    </div>
                  ))
              }
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