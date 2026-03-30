import { useEffect, useState, useRef, useCallback } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { db, storage } from '../../firebase'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { Send, Users, CheckCircle, Plus, Trash2, X, BookOpen, Wifi, WifiOff, QrCode, Settings, Clock, CheckCircle2, XCircle, Play, Save, RefreshCw, Image, Music, FileText, Upload } from 'lucide-react'
import axios from 'axios'

const API = 'https://iptv-manager-production.up.railway.app'

interface Cliente { id: string; nome: string; telefone: string; servidor: string; tipo: string; status: string; vencimento: string; valor: string }
interface ModeloMensagem { id: string; titulo: string; texto: string }
interface LogEntry { id: string; clienteNome: string; telefone: string; gatilho: string; mensagem: string; status: string; data: string; hora: string }
interface Regra { ativo: boolean; mensagem: string; horario?: string; midiaUrl?: string; midiaTipo?: string; midiaNome?: string; midiaStoragePath?: string; modoEnvio?: 'junto' | 'separado' }
interface Config {
  horario: string
  ativo: boolean
  intervaloMs: number
  regras: { dias7: Regra; dias4: Regra; dia0: Regra; pos1: Regra; pos3: Regra }
}
interface FilaItem {
  id: string
  clienteNome: string
  telefone: string
  gatilho: string
  mensagem: string
  status: 'pendente' | 'enviando' | 'enviado' | 'erro' | 'cancelado'
  tentativas: number
  maxTentativas: number
  erro: string | null
}

interface Midia {
  id: string
  nome: string
  url: string
  tipo: 'imagem' | 'audio' | 'video' | 'documento'
  tamanho: number
  storagePath: string
  criadoEm: any
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

const filtros = [
  { id: 'todos',    label: 'Todos os Clientes',    cor: '34d399', bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.3)'  },
  { id: 'venchoje', label: 'Vencendo Hoje',        cor: 'f87171', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)'   },
  { id: 'venc4',    label: 'Vencendo em 4 dias',   cor: 'fbbf24', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)'  },
  { id: 'venc7',    label: 'Vencendo em 7 dias',   cor: '818cf8', bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.3)'  },
  { id: 'vencidos', label: 'Vencidos',             cor: 'ef4444', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)'   },
  { id: 'manual',   label: 'Mensagem Manual',      cor: '60a5fa', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.3)'  },
]

const intervalos = [
  { label: '1 segundo',   valor: 1000  },
  { label: '2 segundos',  valor: 2000  },
  { label: '3 segundos',  valor: 3000  },
  { label: '5 segundos',  valor: 5000  },
  { label: '10 segundos', valor: 10000 },
  { label: '30 segundos', valor: 30000 },
]

const REGRAS_INFO = [
  { key: 'dias7', label: '7 dias antes',         cor: '59,130,246' },
  { key: 'dias4', label: '4 dias antes',         cor: '251,191,36' },
  { key: 'dia0',  label: 'No dia do vencimento', cor: '239,68,68'  },
  { key: 'pos1',  label: '1 dia após vencer',    cor: '168,85,247' },
  { key: 'pos3',  label: '3 dias após vencer',   cor: '239,68,68'  },
]

const VARIAVEIS = ['NOME', 'VENCIMENTO', 'SERVIDOR', 'VALOR']

export default function Notificacoes() {
  const [clientes, setClientes]           = useState<Cliente[]>([])
  const [modelos, setModelos]             = useState<ModeloMensagem[]>([])
  const [filtro, setFiltro]               = useState('todos')
  const [clienteSel, setClienteSel]       = useState<Cliente | null>(null)
  const [mensagem, setMensagem]           = useState('')
  const [template, setTemplate]           = useState('')
  const [busca, setBusca]                 = useState('')
  const [intervalo, setIntervalo]         = useState(2000)
  const [modalModelo, setModalModelo]     = useState(false)
  const [novoTitulo, setNovoTitulo]       = useState('')
  const [novoTexto, setNovoTexto]         = useState('')
  const [enviando, setEnviando]           = useState(false)
  const [progresso, setProgresso]         = useState(0)
  const [midias, setMidias]               = useState<Midia[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(-1)
  const [uploadError, setUploadError]       = useState('')
  const [deletandoMidia, setDeletandoMidia] = useState<string | null>(null)
  const inputFileRef                        = useRef<HTMLInputElement>(null)
  const inputFileManualRef                  = useRef<HTMLInputElement>(null)
  const [midiaManual, setMidiaManual]       = useState<Midia | null>(null)
  const [modalMidias, setModalMidias]       = useState(false)
  const [modoEnvioMidia, setModoEnvioMidia] = useState<'junto' | 'separado'>('junto')
  const [uploadManualProg, setUploadManualProg] = useState(-1)
  const [modalMidiaRegra, setModalMidiaRegra]   = useState<string | null>(null)
  const [templateRenovacao, setTemplateRenovacao] = useState('')
  const [midiaRenovacao, setMidiaRenovacao]       = useState<Midia | null>(null)
  const [modoEnvioRenovacao, setModoEnvioRenovacao] = useState<'junto' | 'separado'>('junto')
  const [modalMidiaRenovacao, setModalMidiaRenovacao] = useState(false)
  const [whatsReady, setWhatsReady]       = useState(false)
  const [qrCode, setQrCode]               = useState<string | null>(null)
  const [mostrarQR, setMostrarQR]         = useState(false)
  const [resultado, setResultado]         = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [aba, setAba]                     = useState<'manual' | 'auto' | 'fila' | 'log' | 'midias'>('manual')
  const [logs, setLogs]                   = useState<LogEntry[]>([])
  const [salvando, setSalvando]           = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [disparando, setDisparando]       = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [fila, setFila]                   = useState<FilaItem[]>([])
  const [carregandoFila, setCarregandoFila] = useState(false)
  const [numero, setNumero] = useState('Detectando...')

  const [config, setConfig] = useState<Config>({
    horario: '09:00',
    ativo: true,
    intervaloMs: 5000,
    regras: {
      dias7: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 7 dias, no dia VENCIMENTO. Entre em contato com antecedência para não perder o acesso! 🙏' },
      dias4: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 4 dias, no dia VENCIMENTO. Não deixe para a última hora, entre em contato para renovar!' },
      dia0:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence HOJE! Entre em contato agora para não perder o acesso. Valor: VALOR' },
      pos1:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR venceu ontem (VENCIMENTO). Entre em contato para regularizar e reativar seu acesso!' },
      pos3:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR está vencida há 3 dias (VENCIMENTO). Regularize seu acesso o quanto antes!' },
    },
  })

  const intervalRef = useRef<any>(null)
  const prevReady   = useRef(false)
  const prevQr      = useRef('')

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
    color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const,
  }

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'clientes'), s => setClientes(s.docs.map(d => ({ id: d.id, ...d.data() } as Cliente))))
    const u2 = onSnapshot(collection(db, 'modelosMensagens'), s => setModelos(s.docs.map(d => ({ id: d.id, ...d.data() } as ModeloMensagem))))
    return () => { u1(); u2() }
  }, [])

  useEffect(() => {
    const verificar = async () => {
      try {
        const res = await fetch(`${API}/status`)
        const data = await res.json()
        if (data.ready !== prevReady.current) { prevReady.current = data.ready; setWhatsReady(data.ready) }
        if (data.numero !== undefined) { setNumero(data.numero) }
        const qr = data.qr
        if (!data.ready && qr && qr !== prevQr.current) { prevQr.current = qr; setQrCode(qr) }
      } catch {
        if (prevReady.current) { prevReady.current = false; setWhatsReady(false) }
      }
    }
    verificar()
    intervalRef.current = setInterval(verificar, 5000)
    return () => clearInterval(intervalRef.current)
  }, [])

  useEffect(() => {
    axios.get(`${API}/config`).then(res => setConfig(res.data)).catch(() => {})
  }, [])

  const carregarTemplateRenovacao = async () => {
    try {
      const snap = await getDocs(collection(db, 'config_whatsapp'))
      const doc  = snap.docs.find(d => d.id === 'template_renovacao')
      if (doc) {
        const d = doc.data()
        setTemplateRenovacao(d.mensagem || '')
        if (d.midiaUrl) {
          setMidiaRenovacao({ id: '', nome: d.midiaNome || '', url: d.midiaUrl, tipo: d.midiaTipo || 'imagem', tamanho: 0, storagePath: d.midiaStoragePath || '', criadoEm: null })
        }
        setModoEnvioRenovacao(d.modoEnvio || 'junto')
      }
    } catch (err) { console.error('Erro ao carregar template:', err) }
  }

  const carregarMidias = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'midias'))
      setMidias(snap.docs.map(d => ({ id: d.id, ...d.data() } as Midia)))
    } catch (err) {
      console.error('Erro ao carregar mídias:', err)
    }
  }, [])

  const uploadMidia = async (file: File) => {
    if (!file) return
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) { setUploadError('Arquivo muito grande. Máximo: 50MB'); return }
    setUploadError('')
    const ext  = file.name.split('.').pop()?.toLowerCase() || ''
    const tipo: Midia['tipo'] =
      ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'imagem' :
      ['ogg','opus','mp3','wav','m4a'].includes(ext)  ? 'audio'  :
      ['mp4','mov','avi','webm'].includes(ext)        ? 'video'  : 'documento'
    const path = `midias/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const storageRef = ref(storage, path)
    const task = uploadBytesResumable(storageRef, file)
    setUploadProgress(0)
    task.on('state_changed',
      snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      err  => {
        console.error('[Upload] Erro storage:', err.code, err.message)
        setUploadError(`Erro: ${err.message}`)
        setUploadProgress(-1)
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          const nova = {
            nome: file.name, url, tipo,
            tamanho: file.size, storagePath: path,
            criadoEm: new Date()
          }
          const docRef = await addDoc(collection(db, 'midias'), nova)
          console.log('[Upload] Salvo no Firestore:', docRef.id)
          setMidias(prev => [{ id: docRef.id, ...nova }, ...prev])
          setUploadProgress(-1)
        } catch (err: any) {
          console.error('[Upload] Erro ao salvar no Firestore:', err)
          setUploadError(`Upload OK mas erro ao salvar: ${err.message}`)
          setUploadProgress(-1)
        }
      }
    )
  }

  const excluirMidia = async (midia: Midia) => {
    // Check if in use in regras
    try {
      const cfg = await getDocs(collection(db, 'configwhatsapp'))
      const principal = cfg.docs.find(d => d.id === 'principal')?.data()
      const emUso = principal?.regras && Object.values(principal.regras).some((r: any) => r.midiaUrl === midia.url)
      if (emUso) {
        if (!window.confirm(`⚠️ Esta mídia está em uso em uma regra de envio automático.\nDeseja excluir mesmo assim?`)) return
      } else {
        if (!window.confirm(`Excluir "${midia.nome}"? Esta ação não pode ser desfeita.`)) return
      }
      setDeletandoMidia(midia.id)
      await deleteObject(ref(storage, midia.storagePath))
      await deleteDoc(doc(db, 'midias', midia.id))
      setMidias(prev => prev.filter(m => m.id !== midia.id))
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message)
    } finally {
      setDeletandoMidia(null)
    }
  }

  const formatBytes = (b: number) => b > 1048576 ? `${(b/1048576).toFixed(1)}MB` : `${(b/1024).toFixed(0)}KB`

  const uploadMidiaManual = async (file: File) => {
    const ext  = file.name.split('.').pop()?.toLowerCase() || ''
    const tipo: Midia['tipo'] =
      ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'imagem' :
      ['ogg','opus','mp3','wav'].includes(ext)        ? 'audio'  :
      ['mp4','mov','webm'].includes(ext)              ? 'video'  : 'documento'
    const path = `midias/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const storageRef = ref(storage, path)
    const task = uploadBytesResumable(storageRef, file)
    setUploadManualProg(0)
    task.on('state_changed',
      snap => setUploadManualProg(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      err  => { alert('Erro upload: ' + err.message); setUploadManualProg(-1) },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        const docRef = await addDoc(collection(db, 'midias'), {
          nome: file.name, url, tipo, tamanho: file.size,
          storagePath: path, criadoEm: new Date()
        })
        const nova: Midia = { id: docRef.id, nome: file.name, url, tipo, tamanho: file.size, storagePath: path, criadoEm: new Date() }
        setMidias(prev => [nova, ...prev])
        setMidiaManual(nova)
        setUploadManualProg(-1)
      }
    )
  }

  const carregarLogs = async () => {
    try { const res = await axios.get(`${API}/logs`); setLogs(res.data) } catch {}
  }

  const carregarFila = async () => {
    setCarregandoFila(true)
    try { const res = await axios.get(`${API}/fila`); setFila(res.data) }
    finally { setCarregandoFila(false) }
  }

  const retryItem = async (id: string) => {
    await axios.post(`${API}/fila/${id}/retry`)
    carregarFila()
  }

  const cancelarItem = async (id: string) => {
    await axios.post(`${API}/fila/${id}/cancelar`)
    carregarFila()
  }

  const limparHistorico = async () => {
    if (!window.confirm('Limpar todo o histórico de mensagens enviadas?')) return
    try {
      await axios.delete(`${API}/logs`)
      setLogs([])
    } catch (err: any) {
      alert('Erro ao limpar: ' + (err.message ?? ''))
    }
  }

  const limparFila = async () => {
    await axios.post(`${API}/fila/limpar`)
    carregarFila()
  }

  const filtroAtual = filtros.find(f => f.id === filtro)!

  const clientesFiltrados = (() => {
    let lista = clientes.filter(c => c.telefone)

    if (filtro === 'venchoje') {
      lista = lista.filter(c => {
        const d = parseData(c.vencimento)
        return d ? diferencaDias(d) === 0 : false
      })
    } else if (filtro === 'venc4') {
      lista = lista.filter(c => {
        const d = parseData(c.vencimento)
        return d ? diferencaDias(d) === 4 : false
      })
    } else if (filtro === 'venc7') {
      lista = lista.filter(c => {
        const d = parseData(c.vencimento)
        return d ? diferencaDias(d) === 7 : false
      })
    } else if (filtro === 'vencidos') {
      lista = lista.filter(c => {
        const d = parseData(c.vencimento)
        return d ? diferencaDias(d) < 0 : false
      })
    }

    if (busca) {
      lista = lista.filter(
        c =>
          c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
          c.telefone?.includes(busca),
      )
    }

    return lista
  })()

  const substituir = (texto: string, c: Cliente) => {
    const valor = c.valor ? `R$ ${parseFloat(c.valor).toFixed(2).replace('.', ',')}` : ''
    return texto
      .replace(/NOME/gi, c.nome).replace(/VENCIMENTO/gi, c.vencimento)
      .replace(/SERVIDOR/gi, c.servidor).replace(/VALOR/gi, valor)
  }

  const formatarTelefone = (tel: string) => {
    let num = tel.replace(/\D/g, '')
    if (num.startsWith('5555')) num = num.substring(2)
    else if (!num.startsWith('55')) num = '55' + num
    return num
  }

  const salvarModelo = async () => {
    if (!novoTitulo.trim() || !novoTexto.trim()) return
    await addDoc(collection(db, 'modelosMensagens'), { titulo: novoTitulo, texto: novoTexto })
    setNovoTitulo(''); setNovoTexto(''); setModalModelo(false)
  }

  const excluirModelo = async (id: string) => {
    if (confirm('Excluir este modelo?')) await deleteDoc(doc(db, 'modelosMensagens', id))
  }

  const aplicarModelo = (m: ModeloMensagem) => {
    setTemplate(m.texto)
    setMensagem(clienteSel ? substituir(m.texto, clienteSel) : m.texto)
  }

  const enviarUm = async () => {
    if (!clienteSel) return
    if (!mensagem.trim() && !midiaManual) return
    const textoFinal = substituir(mensagem, clienteSel)
    const phone = formatarTelefone(clienteSel.telefone)
    try {
      if (!midiaManual) {
        // Só texto
        const res = await fetch(`${API}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: textoFinal }) })
        const data = await res.json()
        if (data.success) setResultado({ tipo: 'ok', msg: `Mensagem enviada para ${clienteSel.nome}!` })
        else setResultado({ tipo: 'erro', msg: data.error || 'Erro ao enviar.' })
      } else if (modoEnvioMidia === 'junto') {
        // Mídia com legenda
        const res = await fetch(`${API}/send-midia`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: textoFinal }) })
        const data = await res.json()
        if (data.success) setResultado({ tipo: 'ok', msg: `Mensagem + mídia enviada para ${clienteSel.nome}!` })
        else setResultado({ tipo: 'erro', msg: data.error || 'Erro ao enviar.' })
      } else {
        // Separado: texto depois mídia
        if (mensagem.trim()) {
          await fetch(`${API}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: textoFinal }) })
          await new Promise(r => setTimeout(r, 1000))
        }
        const res = await fetch(`${API}/send-midia`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: '' }) })
        const data = await res.json()
        if (data.success) setResultado({ tipo: 'ok', msg: `Mensagem + mídia enviada para ${clienteSel.nome}!` })
        else setResultado({ tipo: 'erro', msg: data.error || 'Erro ao enviar.' })
      }
    } catch { setResultado({ tipo: 'erro', msg: 'Backend offline.' }) }
    setTimeout(() => setResultado(null), 5000)
  }

  const enviarTodos = async () => {
    if (enviando || clientesFiltrados.length === 0) return
    if (!mensagem.trim() && !midiaManual) return
    setEnviando(true); setProgresso(0)
    const base = template || mensagem
    for (let i = 0; i < clientesFiltrados.length; i++) {
      const c = clientesFiltrados[i]
      const phone = formatarTelefone(c.telefone)
      const textoFinal = substituir(base, c)
      try {
        if (!midiaManual) {
          await fetch(`${API}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: textoFinal }) })
        } else if (modoEnvioMidia === 'junto') {
          await fetch(`${API}/send-midia`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: textoFinal }) })
        } else {
          if (textoFinal.trim()) {
            await fetch(`${API}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: textoFinal }) })
            await new Promise(r => setTimeout(r, 1000))
          }
          await fetch(`${API}/send-midia`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: '' }) })
        }
      } catch {}
      setProgresso(i + 1)
      await new Promise(r => setTimeout(r, intervalo))
    }
    setEnviando(false)
    setResultado({ tipo: 'ok', msg: 'Envio concluído!' })
    setTimeout(() => setResultado(null), 4000)
  }

  const salvarConfig = async () => {
    if (!config) return
    setSalvando(true)
    try {
      await axios.post(`${API}/config`, config)
      // Salva template renovação com mídia no Firestore
      const { setDoc, doc: fsDoc } = await import('firebase/firestore')
      const renovDoc: any = { mensagem: templateRenovacao }
      if (midiaRenovacao?.url) {
        renovDoc.midiaUrl         = midiaRenovacao.url
        renovDoc.midiaTipo        = midiaRenovacao.tipo
        renovDoc.midiaNome        = midiaRenovacao.nome
        renovDoc.midiaStoragePath = midiaRenovacao.storagePath
        renovDoc.modoEnvio        = modoEnvioRenovacao
      } else {
        renovDoc.midiaUrl = null; renovDoc.midiaTipo = null
        renovDoc.midiaNome = null; renovDoc.modoEnvio = 'junto'
      }
      await setDoc(fsDoc(db, 'config_whatsapp', 'template_renovacao'), renovDoc, { merge: true })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  const dispararAgora = async () => {
    setDisparando(true)
    try {
      await axios.post(`${API}/send-automatico`)
      await carregarLogs()
      setResultado({ tipo: 'ok', msg: 'Disparo automático executado! Mensagens adicionadas na fila.' })
      setTimeout(() => setResultado(null), 4000)
    } finally { setDisparando(false) }
  }

  const updateRegra = (key: string, field: string, value: any) => {
    if (!config) return
    setConfig({ ...config, regras: { ...config.regras, [key]: { ...config.regras[key as keyof typeof config.regras], [field]: value } } })
  }

  const desconectarWhatsApp = async () => {
    setDesconectando(true)
    try { await axios.post(`${API}/logout`) } catch {}
    setDesconectando(false); setMostrarQR(false)
  }

  const gatilhoLabel = (key: string) => REGRAS_INFO.find(r => r.key === key)?.label || key
  const gatilhoCor   = (key: string) => REGRAS_INFO.find(r => r.key === key)?.cor || '255,255,255'

  const statusFilaConfig: Record<string, { cor: string; label: string }> = {
    pendente:  { cor: '251,191,36',  label: '⏳ Pendente'   },
    enviando:  { cor: '59,130,246',  label: '📤 Enviando'   },
    enviado:   { cor: '34,197,94',   label: '✅ Enviado'    },
    erro:      { cor: '239,68,68',   label: '❌ Erro'       },
    cancelado: { cor: '156,163,175', label: '🚫 Cancelado'  },
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>WhatsApp</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontSize: '14px' }}>Envie notificações para seus clientes</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div onClick={() => setMostrarQR(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', background: whatsReady ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: whatsReady ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)' }}>
            {whatsReady ? (
              <>
                <Wifi size={16} color="#4ade80" />
                <span style={{ color: '#4ade80', fontSize: '13px', fontWeight: 600 }}>
                  Conectado: <strong>{numero || 'Detectando...'}</strong>
                </span>
              </>
            ) : (
              <>
                <WifiOff size={16} color="#f87171" />
                <span style={{ color: '#f87171', fontSize: '13px', fontWeight: '600' }}>Desconectado</span>
                <QrCode size={14} color="#f87171" />
              </>
            )}
          </div>
          <button onClick={() => setModalModelo(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 18px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
            <Plus size={16} /> Novo Modelo
          </button>
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '12px', background: resultado.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: resultado.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: resultado.tipo === 'ok' ? '#4ade80' : '#f87171', fontWeight: '600', fontSize: '14px' }}>
          {resultado.msg}
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { key: 'manual', label: 'Envio Manual',     icon: <Send size={15} />     },
          { key: 'auto',   label: 'Envio Automático', icon: <Settings size={15} /> },
          { key: 'fila',   label: 'Fila',             icon: <RefreshCw size={15} /> },
          { key: 'log',    label: 'Histórico',        icon: <Clock size={15} />    },
          { key: 'midias', label: 'Mídias',            icon: <Image size={15} />    },
        ].map(a => (
          <button key={a.key} onClick={() => { setAba(a.key as any); if (a.key === 'log') carregarLogs(); if (a.key === 'fila') carregarFila(); if (a.key === 'midias') carregarMidias(); if (a.key === 'auto') carregarTemplateRenovacao() }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', background: aba === a.key ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)', border: aba === a.key ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', color: aba === a.key ? 'white' : 'rgba(255,255,255,0.5)' }}>
            {a.icon}{a.label}
          </button>
        ))}
      </div>

      {/* ── ABA MANUAL ── */}
      {aba === 'manual' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Filtrar Clientes</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtros.map(f => (
                  <button key={f.id} onClick={() => { setFiltro(f.id); setClienteSel(null); setBusca('') }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', background: filtro === f.id ? f.bg : 'rgba(255,255,255,0.03)', border: filtro === f.id ? `1px solid ${f.border}` : '1px solid rgba(255,255,255,0.06)', color: filtro === f.id ? `#${f.cor}` : 'rgba(255,255,255,0.5)', fontWeight: filtro === f.id ? '600' : '400', fontSize: '14px' }}>
                    {f.label}
                    <span style={{ marginLeft: 'auto', color: filtro === f.id ? `#${f.cor}` : 'rgba(255,255,255,0.3)', fontSize: '12px', fontWeight: '700' }}>
                      {f.id === 'venchoje'
                        ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false }).length
                        : f.id === 'venc4'
                        ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false }).length
                        : f.id === 'venc7'
                        ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false }).length
                        : f.id === 'vencidos'
                        ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) < 0 : false }).length
                        : clientes.filter(c => c.telefone).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 12px', fontSize: '15px' }}>Selecionar Cliente</h3>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." style={{ ...inputStyle, marginBottom: '10px' }} />
              <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {clientesFiltrados.length === 0
                  ? <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', padding: '16px 0', margin: 0 }}>Nenhum cliente</p>
                  : clientesFiltrados.map(c => (
                    <button key={c.id} onClick={() => { setClienteSel(c); if (template) setMensagem(substituir(template, c)) }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', background: clienteSel?.id === c.id ? filtroAtual.bg : 'rgba(255,255,255,0.03)', border: clienteSel?.id === c.id ? `1px solid ${filtroAtual.border}` : '1px solid rgba(255,255,255,0.06)', color: 'white', textAlign: 'left' }}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>{c.nome}</span>
                        <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{c.telefone}</span>
                      </div>
                      {clienteSel?.id === c.id && <CheckCircle size={14} color={`#${filtroAtual.cor}`} />}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <BookOpen size={18} color="#818cf8" />
                <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>Modelos Salvos</h3>
              </div>
              {modelos.length === 0
                ? <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', margin: 0 }}>Nenhum modelo salvo ainda.</p>
                : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {modelos.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '6px 12px' }}>
                      <button onClick={() => aplicarModelo(m)} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: 0 }}>{m.titulo}</button>
                      <button onClick={() => excluirModelo(m.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', padding: 0, display: 'flex' }}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>}
            </div>

            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Editar Mensagem</h3>
              <textarea value={mensagem} onChange={e => { setMensagem(e.target.value); setTemplate(e.target.value) }} placeholder="Selecione um modelo ou escreva sua mensagem. Use NOME, VENCIMENTO, SERVIDOR, VALOR." rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }} />
              {/* ── Mídia Manual ── */}
              <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600' }}>📎 Mídia (opcional)</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { carregarMidias(); setModalMidias(true) }} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                      🗂️ Biblioteca
                    </button>
                    <button onClick={() => inputFileManualRef.current?.click()} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
                      ⬆️ Upload
                    </button>
                    {midiaManual && <button onClick={() => setMidiaManual(null)} style={{ padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>✕</button>}
                  </div>
                </div>
                <input ref={inputFileManualRef} type="file" accept="image/*,audio/*,video/mp4,.ogg,.opus" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadMidiaManual(f); e.target.value = '' }} />

                {uploadManualProg >= 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                      <div style={{ height: '100%', width: `${uploadManualProg}%`, background: '#6366f1', borderRadius: '4px', transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Enviando... {uploadManualProg}%</span>
                  </div>
                )}

                {midiaManual ? (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {midiaManual.tipo === 'imagem' && <img src={midiaManual.url} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} alt="" />}
                    {midiaManual.tipo === 'audio'  && <Music size={32} style={{ color: '#a78bfa', flexShrink: 0 }} />}
                    {midiaManual.tipo === 'video'  && <video src={midiaManual.url} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} muted />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: 'white', fontSize: '12px', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{midiaManual.nome}</p>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {(['junto', 'separado'] as const).map(modo => (
                          <button key={modo} onClick={() => setModoEnvioMidia(modo)} style={{ padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                            background: modoEnvioMidia === modo ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                            border: modoEnvioMidia === modo ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)',
                            color: modoEnvioMidia === modo ? '#a5b4fc' : 'rgba(255,255,255,0.4)' }}>
                            {modo === 'junto' ? '📎 Com legenda' : '✉️ Separado'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', margin: 0, textAlign: 'center' }}>Nenhuma mídia selecionada</p>
                )}
              </div>

              {/* ── Modal Biblioteca ── */}
              {modalMidias && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                  <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ color: 'white', margin: 0 }}>🗂️ Selecionar Mídia</h3>
                      <button onClick={() => setModalMidias(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {midias.length === 0 ? (
                        <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>Nenhuma mídia na biblioteca. Faça upload na aba Mídias.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                          {midias.map(m => (
                            <div key={m.id} onClick={() => { setMidiaManual(m); setModalMidias(false) }}
                              style={{ cursor: 'pointer', border: midiaManual?.id === m.id ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', transition: 'border 0.15s' }}>
                              <div style={{ height: '100px', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {m.tipo === 'imagem' && <img src={m.url} alt={m.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                {m.tipo === 'audio'  && <Music size={28} style={{ color: '#a78bfa' }} />}
                                {m.tipo === 'video'  && <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />}
                                {m.tipo === 'documento' && <FileText size={28} style={{ color: '#60a5fa' }} />}
                              </div>
                              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button onClick={enviarUm} disabled={!clienteSel || (!mensagem.trim() && !midiaManual) || !whatsReady} style={{ width: '100%', marginTop: '12px', padding: '13px', borderRadius: '12px', border: 'none', cursor: !clienteSel || (!mensagem.trim() && !midiaManual) || !whatsReady ? 'not-allowed' : 'pointer', background: !clienteSel || (!mensagem.trim() && !midiaManual) || !whatsReady ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#25d366,#128c7e)', color: !clienteSel || (!mensagem.trim() && !midiaManual) || !whatsReady ? 'rgba(255,255,255,0.3)' : 'white', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Send size={18} /> {!whatsReady ? 'WhatsApp desconectado' : `Enviar para ${clienteSel ? clienteSel.nome : '...'}`}
              </button>
            </div>

            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Users size={18} color={`#${filtroAtual.cor}`} />
                <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>Envio em Massa</h3>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Intervalo entre envios</label>
                  <select value={intervalo} onChange={e => setIntervalo(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {intervalos.map(i => <option key={i.valor} value={i.valor} style={{ background: '#1e1e2e' }}>{i.label}</option>)}
                  </select>
                </div>
                <div style={{ background: filtroAtual.bg, border: `1px solid ${filtroAtual.border}`, borderRadius: '10px', padding: '10px 16px', textAlign: 'center' }}>
                  <span style={{ color: `#${filtroAtual.cor}`, fontWeight: 'bold', fontSize: '18px' }}>{clientesFiltrados.length}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', display: 'block' }}>clientes</span>
                </div>
              </div>
              {enviando && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Enviando...</span>
                    <span style={{ color: `#${filtroAtual.cor}`, fontSize: '13px', fontWeight: '600' }}>{progresso}/{clientesFiltrados.length}</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '99px', height: '6px' }}>
                    <div style={{ width: `${(progresso / clientesFiltrados.length) * 100}%`, height: '100%', background: `#${filtroAtual.cor}`, borderRadius: '99px' }} />
                  </div>
                </div>
              )}
              <button onClick={enviarTodos} disabled={enviando || clientesFiltrados.length === 0 || !mensagem.trim() || !whatsReady} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: `1px solid ${filtroAtual.border}`, background: enviando || !whatsReady ? 'rgba(255,255,255,0.05)' : filtroAtual.bg, color: enviando || !whatsReady ? 'rgba(255,255,255,0.3)' : `#${filtroAtual.cor}`, cursor: enviando || !whatsReady ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Send size={16} /> {enviando ? 'Enviando...' : `Enviar para todos (${clientesFiltrados.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA AUTOMÁTICO ── */}
      {aba === 'auto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ color: 'white', margin: '0 0 20px', fontSize: '16px', fontWeight: '600' }}>Configurações Gerais</h3>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Horário de envio diário</label>
                <input type="time" value={config.horario} onChange={e => setConfig({ ...config, horario: e.target.value })} style={{ ...inputStyle, width: '140px' }} />
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>⏱️ Intervalo entre mensagens</label>
                <select value={config.intervaloMs ?? 5000} onChange={e => setConfig({ ...config, intervaloMs: Number(e.target.value) })} style={{ ...inputStyle, width: '200px', cursor: 'pointer' }}>
                  <option value={3000}  style={{ background: '#1e1e2e' }}>3 segundos (rápido)</option>
                  <option value={5000}  style={{ background: '#1e1e2e' }}>5 segundos (padrão)</option>
                  <option value={10000} style={{ background: '#1e1e2e' }}>10 segundos (seguro)</option>
                  <option value={15000} style={{ background: '#1e1e2e' }}>15 segundos</option>
                  <option value={30000} style={{ background: '#1e1e2e' }}>30 segundos (lento)</option>
                  <option value={60000} style={{ background: '#1e1e2e' }}>1 minuto (muito lento)</option>
                </select>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '4px 0 0 2px' }}>Evita bloqueio por spam no WhatsApp</p>
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Envio automático</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[{ v: true, l: 'Ativado' }, { v: false, l: 'Desativado' }].map(({ v, l }) => (
                    <button key={String(v)} onClick={() => setConfig({ ...config, ativo: v })} style={{ padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', background: config.ativo === v ? (v ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.05)', border: config.ativo === v ? (v ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(239,68,68,0.6)') : '1px solid rgba(255,255,255,0.1)', color: config.ativo === v ? (v ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.4)' }}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Disparar agora</label>
                <button onClick={dispararAgora} disabled={disparando || !whatsReady} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', cursor: disparando || !whatsReady ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '13px', background: disparando || !whatsReady ? 'rgba(255,255,255,0.05)' : 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.4)', color: disparando || !whatsReady ? 'rgba(255,255,255,0.3)' : '#a5b4fc' }}>
                  <Play size={14} /> {disparando ? 'Disparando...' : 'Executar agora'}
                </button>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '4px' }}>Variáveis disponíveis:</p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {VARIAVEIS.map(v => (
                    <span key={v} style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}>{v}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {REGRAS_INFO.map(({ key, label, cor }) => {
            const regra = config.regras[key as keyof typeof config.regras]
            return (
              <div key={key} className="glass-card" style={{ padding: '24px', borderLeft: `3px solid rgba(${cor},0.6)` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ background: `rgba(${cor},0.15)`, border: `1px solid rgba(${cor},0.3)`, color: `rgb(${cor})`, padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>{label}</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[{ v: true, l: 'Ativo' }, { v: false, l: 'Inativo' }].map(({ v, l }) => (
                      <button key={String(v)} onClick={() => updateRegra(key, 'ativo', v)} style={{ padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', background: regra.ativo === v ? (v ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.05)', border: regra.ativo === v ? (v ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(239,68,68,0.6)') : '1px solid rgba(255,255,255,0.1)', color: regra.ativo === v ? (v ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.4)' }}>{l}</button>
                    ))}
                  </div>
                </div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Mensagem</label>
                <textarea value={regra.mensagem} onChange={e => updateRegra(key, 'mensagem', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />

                {/* Mídia da regra */}
                <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: regra.midiaUrl ? '10px' : '0' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600' }}>📎 Mídia (opcional)</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { carregarMidias(); setModalMidiaRegra(key) }} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                        🗂️ {regra.midiaUrl ? 'Trocar' : 'Selecionar'}
                      </button>
                      {regra.midiaUrl && (
                        <button onClick={() => updateRegra(key, 'midiaUrl', '')} style={{ padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>✕ Remover</button>
                      )}
                    </div>
                  </div>
                  {regra.midiaUrl && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {regra.midiaTipo === 'imagem' && <img src={regra.midiaUrl} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} alt="" />}
                      {regra.midiaTipo === 'audio'  && <Music size={28} style={{ color: '#a78bfa', flexShrink: 0 }} />}
                      {regra.midiaTipo === 'video'  && <video src={regra.midiaUrl} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} muted />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{regra.midiaNome}</p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(['junto', 'separado'] as const).map(modo => (
                            <button key={modo} onClick={() => updateRegra(key, 'modoEnvio', modo)} style={{ padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                              background: (regra.modoEnvio ?? 'junto') === modo ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                              border:     (regra.modoEnvio ?? 'junto') === modo ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)',
                              color:      (regra.modoEnvio ?? 'junto') === modo ? '#a5b4fc' : 'rgba(255,255,255,0.4)' }}>
                              {modo === 'junto' ? '📎 Com legenda' : '✉️ Separado'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Modal seleção mídia para regra */}
          {modalMidiaRegra && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ color: 'white', margin: 0 }}>🗂️ Selecionar Mídia para Regra</h3>
                  <button onClick={() => setModalMidiaRegra(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {midias.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>Nenhuma mídia. Faça upload na aba Mídias primeiro.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                      {midias.map(m => (
                        <div key={m.id} onClick={() => {
                          updateRegra(modalMidiaRegra, 'midiaUrl', m.url)
                          updateRegra(modalMidiaRegra, 'midiaTipo', m.tipo)
                          updateRegra(modalMidiaRegra, 'midiaNome', m.nome)
                          updateRegra(modalMidiaRegra, 'midiaStoragePath', m.storagePath)
                          if (!(config.regras as any)[modalMidiaRegra]?.modoEnvio) {
                            updateRegra(modalMidiaRegra, 'modoEnvio', 'junto')
                          }
                          setModalMidiaRegra(null)
                        }}
                          style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ height: '90px', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {m.tipo === 'imagem' && <img src={m.url} alt={m.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {m.tipo === 'audio'  && <Music size={28} style={{ color: '#a78bfa' }} />}
                            {m.tipo === 'video'  && <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />}
                            {m.tipo === 'documento' && <FileText size={28} style={{ color: '#60a5fa' }} />}
                          </div>
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Template de Renovação ── */}
          <div className="glass-card" style={{ padding: '24px', borderLeft: '3px solid rgba(34,197,94,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>
                🔄 Template de Renovação
              </span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 12px' }}>
              Variáveis: {'{usuario}'} {'{senha}'} {'{vencimento}'}
            </p>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Mensagem</label>
            <textarea
              value={templateRenovacao}
              onChange={e => setTemplateRenovacao(e.target.value)}
              rows={5}
              placeholder="✅ *Renovação realizada!*&#10;&#10;Seus dados de acesso:&#10;👤 Usuário: *{usuario}*&#10;🔑 Senha: *{senha}*&#10;📅 Válido até: *{vencimento}*"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }}
            />

            {/* Mídia do template */}
            <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: midiaRenovacao ? '10px' : '0' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600' }}>📎 Mídia (opcional)</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { carregarMidias(); setModalMidiaRenovacao(true) }} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                    🗂️ {midiaRenovacao ? 'Trocar' : 'Selecionar'}
                  </button>
                  {midiaRenovacao && (
                    <button onClick={() => setMidiaRenovacao(null)} style={{ padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>✕ Remover</button>
                  )}
                </div>
              </div>
              {midiaRenovacao && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {midiaRenovacao.tipo === 'imagem' && <img src={midiaRenovacao.url} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} alt="" />}
                  {midiaRenovacao.tipo === 'audio'  && <Music size={28} style={{ color: '#a78bfa', flexShrink: 0 }} />}
                  {midiaRenovacao.tipo === 'video'  && <video src={midiaRenovacao.url} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} muted />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{midiaRenovacao.nome}</p>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['junto', 'separado'] as const).map(modo => (
                        <button key={modo} onClick={() => setModoEnvioRenovacao(modo)} style={{ padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                          background: modoEnvioRenovacao === modo ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)',
                          border:     modoEnvioRenovacao === modo ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)',
                          color:      modoEnvioRenovacao === modo ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                          {modo === 'junto' ? '📎 Com legenda' : '✉️ Separado'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal mídia renovação */}
          {modalMidiaRenovacao && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ color: 'white', margin: 0 }}>🗂️ Mídia para Renovação</h3>
                  <button onClick={() => setModalMidiaRenovacao(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {midias.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>Nenhuma mídia. Faça upload na aba Mídias primeiro.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                      {midias.map(m => (
                        <div key={m.id} onClick={() => { setMidiaRenovacao(m); setModalMidiaRenovacao(false) }}
                          style={{ cursor: 'pointer', border: midiaRenovacao?.id === m.id ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ height: '90px', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {m.tipo === 'imagem' && <img src={m.url} alt={m.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {m.tipo === 'audio'  && <Music size={28} style={{ color: '#a78bfa' }} />}
                            {m.tipo === 'video'  && <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />}
                            {m.tipo === 'documento' && <FileText size={28} style={{ color: '#60a5fa' }} />}
                          </div>
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={salvarConfig} disabled={salvando} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: saved ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#3b82f6,#6366f1)', border: saved ? '1px solid rgba(34,197,94,0.5)' : 'none', color: 'white', borderRadius: '12px', padding: '12px 28px', cursor: salvando ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', opacity: salvando ? 0.6 : 1 }}>
              <Save size={16} /> {saved ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </div>
      )}


      {/* ── ABA MÍDIAS ── */}
      {aba === 'midias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Upload */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ color: 'white', margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>📁 Upload de Mídia</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: '0 0 16px' }}>
              Suportado: Imagens (JPG, PNG), Áudio (.ogg, .opus), Vídeo (.mp4) — Máximo 50MB
            </p>

            {/* Drop zone */}
            <div
              onClick={() => inputFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadMidia(f) }}
              style={{ border: '2px dashed rgba(99,102,241,0.4)', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', background: 'rgba(99,102,241,0.05)', transition: 'all 0.2s' }}
            >
              <Upload size={32} style={{ color: 'rgba(99,102,241,0.6)', marginBottom: '12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: '14px' }}>Clique ou arraste o arquivo aqui</p>
            </div>
            <input ref={inputFileRef} type="file" accept="image/*,audio/*,video/mp4,.ogg,.opus" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadMidia(f); e.target.value = '' }} />

            {/* Progress */}
            {uploadProgress >= 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>Enviando...</span>
                  <span style={{ color: '#a5b4fc', fontSize: '13px', fontWeight: '600' }}>{uploadProgress}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: '4px', transition: 'width 0.3s' }} />
                </div>
              </div>
            )}
            {uploadError && <p style={{ color: '#f87171', fontSize: '13px', margin: '12px 0 0' }}>❌ {uploadError}</p>}
          </div>

          {/* Grid de mídias */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                🗂️ Mídias Salvas <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', fontWeight: '400' }}>({midias.length})</span>
              </h3>
              <button onClick={carregarMidias} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
                <RefreshCw size={13} /> Atualizar
              </button>
            </div>

            {midias.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>
                <Image size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                <p style={{ margin: 0 }}>Nenhuma mídia enviada ainda</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                {midias.map(midia => (
                  <div key={midia.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>

                    {/* Preview */}
                    <div style={{ height: '140px', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {midia.tipo === 'imagem' && (
                        <img src={midia.url} alt={midia.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      {midia.tipo === 'audio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px' }}>
                          <Music size={36} style={{ color: '#a78bfa' }} />
                          <audio controls style={{ width: '100%', height: '32px' }} src={midia.url} />
                        </div>
                      )}
                      {midia.tipo === 'video' && (
                        <video src={midia.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls={false} muted
                          onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                        />
                      )}
                      {midia.tipo === 'documento' && (
                        <FileText size={36} style={{ color: '#60a5fa' }} />
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ padding: '12px' }}>
                      <p style={{ color: 'white', fontSize: '12px', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={midia.nome}>{midia.nome}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{formatBytes(midia.tamanho)}</span>
                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', fontWeight: '600',
                          background: midia.tipo === 'imagem' ? 'rgba(34,197,94,0.2)' : midia.tipo === 'audio' ? 'rgba(167,139,250,0.2)' : midia.tipo === 'video' ? 'rgba(251,191,36,0.2)' : 'rgba(96,165,250,0.2)',
                          color:      midia.tipo === 'imagem' ? '#4ade80'              : midia.tipo === 'audio' ? '#c4b5fd'              : midia.tipo === 'video' ? '#fcd34d'              : '#93c5fd',
                        }}>
                          {midia.tipo}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                        <a href={midia.url} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '6px', borderRadius: '7px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '11px', fontWeight: '600', textDecoration: 'none' }}>
                          Abrir
                        </a>
                        <button onClick={() => excluirMidia(midia)} disabled={deletandoMidia === midia.id} style={{ flex: 1, padding: '6px', borderRadius: '7px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                          {deletandoMidia === midia.id ? '...' : '🗑️ Excluir'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ABA FILA ── */}
      {aba === 'fila' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Cards resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'Pendente', status: 'pendente', cor: '251,191,36', emoji: '⏳' },
              { label: 'Enviando', status: 'enviando', cor: '59,130,246', emoji: '📤' },
              { label: 'Enviado',  status: 'enviado',  cor: '34,197,94',  emoji: '✅' },
              { label: 'Erro',     status: 'erro',     cor: '239,68,68',  emoji: '❌' },
            ].map(({ label, status, cor, emoji }) => (
              <div key={status} className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '6px' }}>{emoji}</div>
                <div style={{ color: `rgb(${cor})`, fontWeight: 'bold', fontSize: '28px' }}>
                  {fila.filter(f => f.status === status).length}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginTop: '2px' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabela da fila */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                Fila de Envios <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '400' }}>({fila.length})</span>
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={carregarFila} disabled={carregandoFila} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
                  <RefreshCw size={13} /> {carregandoFila ? 'Carregando...' : 'Atualizar'}
                </button>
                <button onClick={limparFila} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
                  Limpar concluídos
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Cliente', 'Gatilho', 'Tentativas', 'Status', 'Erro', 'Ações'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fila.length === 0
                    ? <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Fila vazia. Dispare o envio automático para popular.</td></tr>
                    : fila.map(item => {
                      const sc = statusFilaConfig[item.status] ?? statusFilaConfig.pendente
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '12px 16px', color: 'white', fontWeight: '500' }}>
                            {item.clienteNome}
                            <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{item.telefone}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>
                              {gatilhoLabel(item.gatilho)}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)', fontSize: '13px', textAlign: 'center' }}>
                            {item.tentativas}/{item.maxTentativas}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ background: `rgba(${sc.cor},0.15)`, border: `1px solid rgba(${sc.cor},0.3)`, color: `rgb(${sc.cor})`, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                              {sc.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#f87171', fontSize: '12px', maxWidth: '160px' }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.erro || ''}>
                              {item.erro || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {item.status === 'erro' && (
                                <button onClick={() => retryItem(item.id)} style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                  Retry
                                </button>
                              )}
                              {item.status === 'pendente' && (
                                <button onClick={() => cancelarItem(item.id)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA LOG ── */}
      {aba === 'log' && (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'white', margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>Histórico de Envios</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={carregarLogs} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>Atualizar</button>
              <button onClick={limparHistorico} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>Limpar histórico</button>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Data/Hora', 'Cliente', 'Telefone', 'Gatilho', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0
                ? <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Nenhum envio registrado.</td></tr>
                : logs.map(log => {
                  const cor = gatilhoCor(log.gatilho)
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{log.data} {log.hora}</td>
                      <td style={{ padding: '12px 20px', color: 'white', fontWeight: '500' }}>{log.clienteNome}</td>
                      <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{log.telefone}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{ background: `rgba(${cor},0.15)`, border: `1px solid rgba(${cor},0.3)`, color: `rgb(${cor})`, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>{gatilhoLabel(log.gatilho)}</span>
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: log.status === 'enviado' ? '#4ade80' : '#f87171' }}>
                          {log.status === 'enviado' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {log.status === 'enviado' ? 'Enviado' : 'Erro'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal QR */}
      {mostrarQR && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-card" style={{ padding: '32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: '20px' }}>Conectar WhatsApp</h2>
              <button onClick={() => setMostrarQR(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}><X size={20} /></button>
            </div>
            {whatsReady ? (
              <div style={{ padding: '24px' }}>
                <CheckCircle2 size={48} color="#4ade80" style={{ marginBottom: '12px' }} />
                <p style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '16px', marginBottom: '20px' }}>WhatsApp Conectado!</p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button onClick={() => setMostrarQR(false)} style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#25d366,#128c7e)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Fechar</button>
                  <button onClick={desconectarWhatsApp} disabled={desconectando} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: '#f87171', cursor: desconectando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: desconectando ? 0.6 : 1 }}>
                    <WifiOff size={14} /> {desconectando ? 'Desconectando...' : 'Desconectar'}
                  </button>
                </div>
              </div>
            ) : qrCode ? (
              <div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '20px' }}>Abra o WhatsApp, vá em Aparelhos conectados e escaneie</p>
                <img src={qrCode} alt="QR Code" style={{ width: '260px', height: '260px', borderRadius: '16px', background: 'white', padding: '8px' }} />
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', padding: '24px' }}>Aguardando backend...</p>
            )}
          </div>
        </div>
      )}

      {/* Modal Novo Modelo */}
      {modalModelo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-card" style={{ padding: '32px', width: '100%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: '20px' }}>Novo Modelo</h2>
              <button onClick={() => setModalModelo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Nome</label>
                <input value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} className="input-glass" placeholder="Ex: Aviso de Vencimento" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>Texto</label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {VARIAVEIS.map(v => (
                      <span key={v} onClick={() => setNovoTexto(t => t + v)} style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer' }} title="Clique para inserir">{v}</span>
                    ))}
                  </div>
                </div>
                <textarea value={novoTexto} onChange={e => setNovoTexto(e.target.value)} placeholder="Ex: Olá NOME! Seu plano vence em VENCIMENTO." rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setModalModelo(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvarModelo} disabled={!novoTitulo.trim() || !novoTexto.trim()} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', cursor: 'pointer', fontWeight: 'bold', opacity: !novoTitulo.trim() || !novoTexto.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Plus size={16} /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}