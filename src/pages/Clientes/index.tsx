import { useEffect, useState, useRef } from 'react'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { Plus, Pencil, Trash2, X, Check, Search, Upload, Download, RefreshCw, FlaskConical } from 'lucide-react'
import * as XLSX from 'xlsx'

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
  status: string
  valor: string
  observacao: string
}

interface Servidor {
  id: string
  nome: string
}

const inputParaData = (val: string) => {
  if (!val) return ''
  const [y, m, d] = val.split('-')
  return `${d}/${m}/${y}`
}

const dataParaInput = (val: string) => {
  if (!val) return ''
  const parts = val.split('/')
  if (parts.length !== 3) return ''
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

const formatarValorDisplay = (val: string) => {
  if (!val) return ''
  const num = parseFloat(val)
  if (isNaN(num)) return ''
  return `R$ ${num.toFixed(2).replace('.', ',')}`
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [servidores, setServidores] = useState<Servidor[]>([])
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- WWPanel states ----
  const [renovandoId, setRenovandoId] = useState<string | null>(null)
  const [testandoId, setTestandoId] = useState<string | null>(null)
  const [painelMsg, setPainelMsg] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  const [form, setForm] = useState({
    nome: '', telefone: '', tipo: 'IPTV', servidor: '',
    usuario: '', senha: '', vencimento: '', status: 'ativo',
    valor: '', observacao: ''
  })

  useEffect(() => {
    const unsubClientes = onSnapshot(collection(db, 'clientes'), snapshot => {
      setClientes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)))
    })
    const unsubServidores = onSnapshot(collection(db, 'servidores'), snapshot => {
      setServidores(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Servidor)))
    })
    return () => { unsubClientes(); unsubServidores() }
  }, [])

  const mostrarMsgPainel = (tipo: 'ok' | 'erro', msg: string) => {
    setPainelMsg({ tipo, msg })
    setTimeout(() => setPainelMsg(null), 5000)
  }

  // ---- Renovar no WWPanel ----
  const renovarCliente = async (cliente: Cliente) => {
  setRenovandoId(cliente.id)
  try {
    // Busca por usuário OU por nome como fallback.
    const termoBusca = cliente.usuario?.trim() || cliente.nome?.trim()
    if (!termoBusca) throw new Error('Sem usuário ou nome para buscar.')

    const buscaRes = await fetch(`${BACKEND_URL}/painel/buscar/${encodeURIComponent(termoBusca)}`)
    const buscaData = await buscaRes.json()
    const lines = buscaData?.lines ?? buscaData ?? []
    const lineId = lines[0]?.id

    if (!lineId) throw new Error(`Usuário "${termoBusca}" não encontrado no painel Warez.`)

    const renovarRes = await fetch(`${BACKEND_URL}/painel/renovar/${lineId}`, { method: 'POST' })
    if (!renovarRes.ok) throw new Error('Falha ao renovar no painel.')

    mostrarMsgPainel('ok', `✅ ${cliente.nome} renovado com sucesso no Warez!`)
  } catch (err: any) {
    mostrarMsgPainel('erro', `❌ Erro ao renovar ${cliente.nome}: ${err.message}`)
  } finally {
    setRenovandoId(null)
  }
}

  // ---- Gerar Teste no WWPanel ----
  const gerarTeste = async (cliente: Cliente) => {
    if (!cliente.usuario || !cliente.senha) return mostrarMsgPainel('erro', `❌ ${cliente.nome} não tem usuário/senha cadastrados.`)
    setTestandoId(cliente.id)
    try {
      // Busca planos para pegar o package_p2p automaticamente
      const planosRes = await fetch(`${BACKEND_URL}/painel/planos`)
      const planosData = await planosRes.json()
      const planos = planosData?.products ?? planosData ?? []
      const pacote = planos[0]

      if (!pacote) throw new Error('Nenhum plano disponível no painel.')

      const testeRes = await fetch(`${BACKEND_URL}/painel/teste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cliente.usuario,
          password: cliente.senha,
          package_p2p: pacote._id ?? pacote.id,
          krator_package: '1',
          testDuration: 4,
        })
      })
      if (!testeRes.ok) throw new Error('Falha ao gerar teste no painel.')

      mostrarMsgPainel('ok', `✅ Teste gerado para ${cliente.nome}!\n👤 Usuário: ${cliente.usuario}\n🔑 Senha: ${cliente.senha}`)
    } catch (err: any) {
      mostrarMsgPainel('erro', `❌ Erro ao gerar teste para ${cliente.nome}: ${err.message}`)
    } finally {
      setTestandoId(null)
    }
  }

  // ── EXPORTAR EXCEL ──
  const exportarExcel = () => {
    const dados = clientes.map(c => ({
      'Nome': c.nome || '',
      'Telefone': c.telefone || '',
      'Tipo': c.tipo || '',
      'Servidor': c.servidor || '',
      'Usuário': c.usuario || '',
      'Senha': c.senha || '',
      'Vencimento': c.vencimento || '',
      'Valor': c.valor ? `R$ ${parseFloat(c.valor).toFixed(2).replace('.', ',')}` : '',
      'Status': c.status || '',
      'Observação': c.observacao || '',
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')
    XLSX.writeFile(wb, `clientes_backup_${data}.xlsx`)
  }

  // ── IMPORTAR EXCEL ──
  const parseExcelDate = (val: any): string => {
    if (!val) return ''
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000))
      return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`
    }
    const s = val.toString()
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
    const us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (us) {
      const year = us[3].length === 2 ? `20${us[3]}` : us[3]
      return `${String(us[2]).padStart(2, '0')}/${String(us[1]).padStart(2, '0')}/${year}`
    }
    return ''
  }

  const importarExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportResult(null)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { cellDates: false })
      const abas = ['ELITE', 'WAREZ', 'CENTRAL']
      let total = 0
      const ignorados: string[] = []
      for (const aba of abas) {
        const sheet = workbook.Sheets[aba]
        if (!sheet) continue
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[]
        let headerIdx = -1
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].includes('NOME')) { headerIdx = i; break }
        }
        if (headerIdx === -1) continue
        const headers = rows[headerIdx]
        const nomeIdx      = headers.indexOf('NOME')
        const servidorIdx  = headers.indexOf('SERVIDOR')
        const telefoneIdx  = headers.indexOf('TELEFONE')
        const validadeIdx  = headers.indexOf('VALIDADE')
        const pagamentoIdx = headers.indexOf('PAGAMENTO')
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i]
          const nome = row[nomeIdx]?.toString().trim()
          if (!nome) continue
          const telefoneRaw = row[telefoneIdx]?.toString() || ''
          const telefone = telefoneRaw.replace(/\D/g, '')
          if (!telefone || telefone.length < 6) {
            ignorados.push(`${nome} (${aba}) - tel "${telefoneRaw}"`)
            continue
          }
          const servidorVal = row[servidorIdx]?.toString().trim() || ''
          const tipo = servidorVal.toUpperCase().includes('IPTV') ? 'IPTV' : 'P2P'
          const vencimento = parseExcelDate(row[validadeIdx])
          const valorRaw = pagamentoIdx !== -1 ? row[pagamentoIdx] : ''
          const valor = valorRaw !== '' && valorRaw !== undefined
            ? parseFloat(valorRaw.toString().replace(',', '.')).toFixed(2)
            : ''
          await addDoc(collection(db, 'clientes'), {
            nome, telefone, tipo, servidor: aba,
            usuario: '', senha: '', vencimento, valor,
            status: 'ativo', observacao: '',
          })
          total++
        }
      }
      const msgIgnorados = ignorados.length > 0 ? `\nIgnorados: ${ignorados.length}\n${ignorados.join('\n')}` : ''
      setImportResult({ tipo: 'ok', msg: `${total} clientes importados!${msgIgnorados}` })
    } catch {
      setImportResult({ tipo: 'erro', msg: 'Erro ao ler o arquivo Excel.' })
    } finally {
      setImportando(false)
      e.target.value = ''
      setTimeout(() => setImportResult(null), 15000)
    }
  }

  const clientesFiltrados = clientes.filter(c =>
    c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    c.telefone?.includes(busca) ||
    c.servidor?.toLowerCase().includes(busca.toLowerCase())
  )

  const abrirModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditando(cliente)
      setForm({
        nome: cliente.nome || '',
        telefone: cliente.telefone || '',
        tipo: cliente.tipo || 'IPTV',
        servidor: cliente.servidor || '',
        usuario: cliente.usuario || '',
        senha: cliente.senha || '',
        vencimento: dataParaInput(cliente.vencimento || ''),
        status: cliente.status || 'ativo',
        valor: cliente.valor || '',
        observacao: cliente.observacao || '',
      })
    } else {
      setEditando(null)
      setForm({ nome: '', telefone: '', tipo: 'IPTV', servidor: '', usuario: '', senha: '', vencimento: '', status: 'ativo', valor: '', observacao: '' })
    }
    setModalAberto(true)
  }

  const fecharModal = () => { setModalAberto(false); setEditando(null) }

  const salvar = async () => {
    if (!form.nome.trim()) return
    setCarregando(true)
    try {
      const dados = { ...form, vencimento: inputParaData(form.vencimento) }
      if (editando) {
        await updateDoc(doc(db, 'clientes', editando.id), dados)
      } else {
        await addDoc(collection(db, 'clientes'), dados)
      }
      fecharModal()
    } finally {
      setCarregando(false)
    }
  }

  const excluir = async (id: string) => {
    if (confirm('Deseja excluir este cliente?')) await deleteDoc(doc(db, 'clientes', id))
  }

  const isWarez = (servidor: string) => servidor?.toUpperCase().includes('WAREZ')

  const statusColor = (status: string) => status === 'ativo'
    ? { bg: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', text: '#4ade80' }
    : { bg: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', text: '#f87171' }

  const tipoColor = (tipo: string) => tipo === 'IPTV'
    ? { bg: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', text: '#60a5fa' }
    : { bg: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', text: '#c084fc' }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
    color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    color: 'rgba(255,255,255,0.7)', fontSize: '13px',
    display: 'block', marginBottom: '6px'
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>Clientes</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontSize: '14px' }}>{clientes.length} clientes cadastrados</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={importarExcel} style={{ display: 'none' }} />
          <button onClick={exportarExcel} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
            border: '1px solid rgba(251,191,36,0.3)', borderRadius: '12px',
            padding: '12px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
          }}>
            <Download size={18} /> Exportar
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={importando} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: importando ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.15)',
            color: importando ? 'rgba(255,255,255,0.3)' : '#4ade80',
            border: '1px solid rgba(34,197,94,0.3)', borderRadius: '12px',
            padding: '12px 20px', cursor: importando ? 'not-allowed' : 'pointer',
            fontWeight: 'bold', fontSize: '14px'
          }}>
            <Upload size={18} /> {importando ? 'Importando...' : 'Importar'}
          </button>
          <button onClick={() => abrirModal()} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white',
            border: 'none', borderRadius: '12px', padding: '12px 20px',
            cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
            boxShadow: '0 4px 15px rgba(99,102,241,0.4)'
          }}>
            <Plus size={18} /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Mensagem WWPanel */}
      {painelMsg && (
        <div style={{
          marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
          background: painelMsg.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: painelMsg.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
          color: painelMsg.tipo === 'ok' ? '#4ade80' : '#f87171',
          fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap'
        }}>
          {painelMsg.msg}
        </div>
      )}

      {/* Resultado importação */}
      {importResult && (
        <div style={{
          marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
          background: importResult.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: importResult.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
          color: importResult.tipo === 'ok' ? '#4ade80' : '#f87171',
          fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          {importResult.msg}
        </div>
      )}

      {/* Busca */}
      <div className="glass-card" style={{ padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Search size={18} color="rgba(255,255,255,0.4)" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone ou servidor..."
          style={{ ...inputStyle, border: 'none', background: 'transparent', padding: '0' }}
        />
      </div>

      {/* Tabela */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Nome', 'Telefone', 'Tipo', 'Servidor', 'Vencimento', 'Valor', 'Status', 'Obs.', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Nenhum cliente encontrado.</td></tr>
              ) : clientesFiltrados.map(cliente => {
                const sc = statusColor(cliente.status)
                const tc = tipoColor(cliente.tipo || 'IPTV')
                const ehWarez = isWarez(cliente.servidor)
                const renovando = renovandoId === cliente.id
                const testando = testandoId === cliente.id
                return (
                  <tr key={cliente.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '14px 16px', color: 'white', fontWeight: '500' }}>{cliente.nome}</td>
                    <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{cliente.telefone}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: tc.bg, border: tc.border, color: tc.text, padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                        {cliente.tipo || 'IPTV'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{cliente.servidor}</td>
                    <td style={{ padding: '14px 16px', color: '#fbbf24', fontSize: '14px', fontWeight: '500' }}>{cliente.vencimento}</td>
                    <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: '600', fontSize: '14px' }}>
                      {cliente.valor ? `R$ ${parseFloat(cliente.valor).toFixed(2).replace('.', ',')}` : '-'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: sc.bg, border: sc.border, color: sc.text, padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                        {cliente.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.45)', fontSize: '13px', maxWidth: '160px' }}>
                      <span title={cliente.observacao || ''} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                        {cliente.observacao || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>

                        {/* Botão Renovar — só Warez */}
                        {ehWarez && (
                          <button
                            onClick={() => renovarCliente(cliente)}
                            disabled={renovando}
                            title="Renovar no Warez"
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              background: renovando ? 'rgba(255,255,255,0.05)' : 'rgba(34,197,94,0.15)',
                              border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px',
                              padding: '6px 10px', cursor: renovando ? 'not-allowed' : 'pointer',
                              color: renovando ? 'rgba(255,255,255,0.3)' : '#4ade80',
                              fontSize: '12px', fontWeight: '600'
                            }}
                          >
                            <RefreshCw size={13} style={{ animation: renovando ? 'spin 1s linear infinite' : 'none' }} />
                            {renovando ? '...' : 'Renovar'}
                          </button>
                        )}

                        {/* Botão Gerar Teste — só Warez */}
                        {ehWarez && (
                          <button
                            onClick={() => gerarTeste(cliente)}
                            disabled={testando}
                            title="Gerar Teste no Warez"
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              background: testando ? 'rgba(255,255,255,0.05)' : 'rgba(168,85,247,0.15)',
                              border: '1px solid rgba(168,85,247,0.3)', borderRadius: '8px',
                              padding: '6px 10px', cursor: testando ? 'not-allowed' : 'pointer',
                              color: testando ? 'rgba(255,255,255,0.3)' : '#c084fc',
                              fontSize: '12px', fontWeight: '600'
                            }}
                          >
                            <FlaskConical size={13} />
                            {testando ? '...' : 'Teste'}
                          </button>
                        )}

                        <button onClick={() => abrirModal(cliente)} style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '7px', cursor: 'pointer', color: '#818cf8' }}><Pencil size={14} /></button>
                        <button onClick={() => excluir(cliente.id)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '7px', cursor: 'pointer', color: '#f87171' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div className="glass-card" style={{ padding: '32px', width: '100%', maxWidth: '500px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: '20px' }}>{editando ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={fecharModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="input-glass" placeholder="Nome completo" />
              </div>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value.replace(/\D/g, '') })} className="input-glass" placeholder="Ex: 13999999999" maxLength={15} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Usuário</label>
                  <input value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value })} className="input-glass" placeholder="Usuário IPTV" />
                </div>
                <div>
                  <label style={labelStyle}>Senha</label>
                  <input value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} className="input-glass" placeholder="Senha IPTV" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Vencimento</label>
                <input type="date" value={form.vencimento} onChange={e => setForm({ ...form, vencimento: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={labelStyle}>Valor R$</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: '14px', pointerEvents: 'none' }}>R$</span>
                  <input type="number" min="0" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} className="input-glass" placeholder="0,00" style={{ ...inputStyle, paddingLeft: '38px' }} />
                </div>
                {form.valor && <p style={{ color: '#4ade80', fontSize: '12px', margin: '4px 0 0 4px' }}>= {formatarValorDisplay(form.valor)}</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="IPTV" style={{ background: '#1e1e2e' }}>IPTV</option>
                    <option value="P2P" style={{ background: '#1e1e2e' }}>P2P</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Servidor</label>
                  <select value={form.servidor} onChange={e => setForm({ ...form, servidor: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="" style={{ background: '#1e1e2e' }}>Selecione</option>
                    {servidores.map(s => (
                      <option key={s.id} value={s.nome} style={{ background: '#1e1e2e' }}>{s.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[{ val: 'ativo', label: 'Ativo', cor: '34,197,94' }, { val: 'inativo', label: 'Inativo', cor: '239,68,68' }].map(s => (
                    <button key={s.val} onClick={() => setForm({ ...form, status: s.val })} style={{
                      flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
                      background: form.status === s.val ? `rgba(${s.cor},0.25)` : 'rgba(255,255,255,0.05)',
                      border: form.status === s.val ? `1px solid rgba(${s.cor},0.5)` : '1px solid rgba(255,255,255,0.1)',
                      color: form.status === s.val ? `rgb(${s.cor})` : 'rgba(255,255,255,0.4)',
                    }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Observação</label>
                <textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} className="input-glass" placeholder="Anotações sobre o cliente..." rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={fecharModal} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '14px' }}>
                  Cancelar
                </button>
                <button onClick={salvar} disabled={carregando || !form.nome.trim()} style={{
                  flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                  background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white',
                  cursor: carregando || !form.nome.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold', fontSize: '14px',
                  opacity: carregando || !form.nome.trim() ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                  <Check size={16} /> {carregando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}