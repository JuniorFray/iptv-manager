import express from 'express'
import cors from 'cors'
import fs from 'fs'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  Browsers
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import cron from 'node-cron'
import admin from 'firebase-admin'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY)

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const app = express()

// ---- CORS restrito por origem ----
const origens = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origens.includes(origin)) return callback(null, true)
    callback(new Error('Origem não permitida pelo CORS'))
  },
  methods: ['GET', 'POST'],
}))

app.use(express.json())

// ---- Middleware de autenticação por API Key ----
const API_KEY = process.env.API_KEY

const autenticar = (req, res, next) => {
  if (req.method === 'OPTIONS') return next()
  if (!API_KEY) return next()
  const chave = req.headers['x-api-key']
  if (chave !== API_KEY) {
    return res.status(401).json({ error: 'Não autorizado' })
  }
  next()
}

app.use(autenticar)

// ---- WhatsApp ----

let sock = null
let qrCodeBase64 = null
let clientReady = false

// ---- Auth State no Firestore com cache em memória ----
const useFirestoreAuthState = async () => {
  const docRef = db.collection('whatsappAuth').doc('session')

  const lerSessao = async () => {
    try {
      const snap = await docRef.get()
      return snap.exists ? snap.data() : {}
    } catch { return {} }
  }

  const sessao = await lerSessao()
  const creds = sessao?.creds ? JSON.parse(sessao.creds) : initAuthCreds()

  // Cache em memória das keys
  const keysCache = sessao?.keys ? JSON.parse(sessao.keys) : {}

  const writeKeys = async () => {
    try {
      await docRef.set({
        creds: JSON.stringify(creds),
        keys: JSON.stringify(keysCache)
      }, { merge: true })
    } catch (err) {
      console.error('Erro ao salvar keys:', err.message)
    }
  }

  const keyStore = {
    get: async (type, ids) => {
      const result = {}
      for (const id of ids) {
        const k = `${type}__${id}`.replace(/[^a-zA-Z0-9_]/g, '_')
        result[id] = keysCache[k] !== undefined ? JSON.parse(keysCache[k]) : undefined
      }
      return result
    },
    set: async (data) => {
      let changed = false
      for (const [type, values] of Object.entries(data)) {
        for (const [id, val] of Object.entries(values || {})) {
          const k = `${type}__${id}`.replace(/[^a-zA-Z0-9_]/g, '_')
          if (val !== null && val !== undefined) {
            keysCache[k] = JSON.stringify(val)
          } else {
            delete keysCache[k]
          }
          changed = true
        }
      }
      if (changed) await writeKeys()
    }
  }

  const state = {
    creds,
    keys: makeCacheableSignalKeyStore(keyStore, console)
  }

  const saveCreds = async () => {
    try {
      await docRef.set({
        creds: JSON.stringify(state.creds),
        keys: JSON.stringify(keysCache)
      }, { merge: true })
    } catch (err) {
      console.error('Erro ao salvar creds:', err.message)
    }
  }

  return { state, saveCreds }
}

const limparSessao = async () => {
  try {
    await db.collection('whatsappAuth').doc('session').delete()
    console.log('🗑️ Sessão do Firestore limpa.')
  } catch (err) {
    console.error('Erro ao limpar sessão:', err.message)
  }
}

const conectarWhatsApp = async () => {
  const { state, saveCreds } = await useFirestoreAuthState()
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    browser: Browsers.ubuntu('Chrome'),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 120000,
    retryRequestDelayMs: 5000,
    defaultQueryTimeoutMs: 60000,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrCodeBase64 = await qrcode.toDataURL(qr)
      clientReady = false
    }

    if (connection === 'close') {
      clientReady = false
      const statusCode = lastDisconnect?.error?.output?.statusCode
      console.log('❌ Desconectado:', statusCode)

      if (statusCode === 401) {
        return
      }

      if (statusCode === undefined) {
        console.log('🗑️ Sessão inválida, limpando...')
        await limparSessao()
      }

      const delay = statusCode === 408 ? 5000 : 10000
      console.log(`🔄 Reconectando em ${delay / 1000}s...`)
      setTimeout(conectarWhatsApp, delay)

    } else if (connection === 'open') {
      clientReady = true
      qrCodeBase64 = null
      console.log('✅ WhatsApp conectado!')
    }
  })
}

conectarWhatsApp()

// ---- Helpers ----

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const parseDate = (str) => {
  if (!str) return null
  const [d, m, y] = str.split('/').map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}

const diffDias = (dataStr) => {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const data = parseDate(dataStr)
  if (!data) return null
  return Math.round((data.getTime() - hoje.getTime()) / 86400000)
}

const formatarMensagem = (template, cliente) => {
  return template
    .replace(/NOME/g, cliente.nome || '')
    .replace(/VENCIMENTO/g, cliente.vencimento || '')
    .replace(/SERVIDOR/g, cliente.servidor || '')
    .replace(/VALOR/g, cliente.valor ? `R$ ${parseFloat(cliente.valor).toFixed(2).replace('.', ',')}` : '')
}

const normalizarTelefone = (tel) => {
  let num = String(tel).replace(/\D/g, '')
  if (num.startsWith('5555')) num = num.substring(2)
  else if (!num.startsWith('55')) num = '55' + num
  return num + '@s.whatsapp.net'
}

const salvarLog = async (clienteNome, telefone, gatilho, mensagem, status) => {
  await db.collection('logswhatsapp').add({
    clienteNome, telefone, gatilho, mensagem, status,
    enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
    data: new Date().toLocaleDateString('pt-BR'),
    hora: new Date().toLocaleTimeString('pt-BR'),
  })
}

// ---- Config ----

const configPadrao = {
  horario: '09:00',
  ativo: true,
  intervaloMs: 5000,
  regras: {
    dias7: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 7 dias, no dia VENCIMENTO. Entre em contato com antecedência! 🙏' },
    dias4: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 4 dias, no dia VENCIMENTO. Não deixe para a última hora!' },
    dia0:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence HOJE! Entre em contato agora. Valor: VALOR' },
    pos1:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR venceu ontem (VENCIMENTO). Entre em contato para reativar!' },
    pos3:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR está vencida há 3 dias (VENCIMENTO). Regularize o quanto antes!' },
  },
}

const getConfig = async () => {
  const snap = await db.collection('configwhatsapp').doc('principal').get()
  if (!snap.exists) { await db.collection('configwhatsapp').doc('principal').set(configPadrao); return configPadrao }
  return snap.data()
}

// ---- Sistema de Fila Robusta ----

const MAX_TENTATIVAS = 3
const BACKOFF_BASE_MS = 60000

const jaEnviouHoje = async (clienteId, gatilho) => {
  const hoje = new Date().toISOString().split('T')[0]
  const snap = await db.collection('notificacoesEnviadas')
    .where('clienteId', '==', clienteId)
    .where('gatilho', '==', gatilho)
    .where('data', '==', hoje)
    .limit(1)
    .get()
  return !snap.empty
}

const adicionarNaFila = async (cliente, gatilho, mensagem) => {
  if (await jaEnviouHoje(cliente.id, gatilho)) {
    console.log(`⏭️ Duplicata ignorada: ${cliente.nome} [${gatilho}]`)
    return false
  }
  await db.collection('filaEnvios').add({
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    telefone: cliente.telefone,
    mensagem,
    gatilho,
    status: 'pendente',
    tentativas: 0,
    maxTentativas: MAX_TENTATIVAS,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    proximaTentativa: admin.firestore.Timestamp.now(),
    enviadoEm: null,
    erro: null,
  })
  console.log(`📥 Adicionado na fila: ${cliente.nome} [${gatilho}]`)
  return true
}

let processandoFila = false

const processarFila = async () => {
  if (!clientReady || processandoFila) return
  processandoFila = true

  try {
    const agora = admin.firestore.Timestamp.now()
    const config = await getConfig()
    const intervalo = config.intervaloMs ?? 5000

    const snap = await db.collection('filaEnvios')
      .where('status', '==', 'pendente')
      .where('proximaTentativa', '<=', agora)
      .orderBy('proximaTentativa')
      .limit(10)
      .get()

    if (snap.empty) return

    console.log(`⚙️ Processando ${snap.size} itens da fila...`)

    for (const docSnap of snap.docs) {
      if (!clientReady) { console.log('📵 WhatsApp desconectou, pausando fila.'); break }

      const item = docSnap.data()
      const ref = docSnap.ref

      await ref.update({ status: 'enviando' })

      try {
        const numero = normalizarTelefone(item.telefone)
        await sock.sendMessage(numero, { text: item.mensagem })

        await ref.update({ status: 'enviado', enviadoEm: admin.firestore.FieldValue.serverTimestamp(), erro: null })

        await db.collection('notificacoesEnviadas').add({
          clienteId: item.clienteId,
          clienteNome: item.clienteNome,
          gatilho: item.gatilho,
          data: new Date().toISOString().split('T')[0],
          enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })

        await salvarLog(item.clienteNome, item.telefone, item.gatilho, item.mensagem, 'enviado')
        console.log(`✅ Enviado: ${item.clienteNome} [${item.gatilho}]`)

      } catch (err) {
        const novasTentativas = (item.tentativas || 0) + 1
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, novasTentativas - 1)
        const proximaTentativa = admin.firestore.Timestamp.fromMillis(Date.now() + backoffMs)

        if (novasTentativas >= MAX_TENTATIVAS) {
          await ref.update({ status: 'erro', tentativas: novasTentativas, erro: err.message, proximaTentativa })
          await salvarLog(item.clienteNome, item.telefone, item.gatilho, item.mensagem, 'erro')
          console.error(`❌ Falhou definitivamente: ${item.clienteNome} — ${err.message}`)
        } else {
          await ref.update({ status: 'pendente', tentativas: novasTentativas, erro: err.message, proximaTentativa })
          console.warn(`⚠️ Tentativa ${novasTentativas}/${MAX_TENTATIVAS}: ${item.clienteNome}. Retry em ${backoffMs / 1000}s`)
        }
      }

      await sleep(intervalo)
    }
  } finally {
    processandoFila = false
  }
}

// ---- Envio automático ----

const executarEnvioAutomatico = async () => {
  console.log('🚀 Iniciando envio automático...')
  if (!clientReady) { console.log('📵 WhatsApp não conectado.'); return }

  const config = await getConfig()
  if (!config.ativo) { console.log('⏸️ Envio automático desativado.'); return }

  const snapshot = await db.collection('clientes').get()
  const clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

  const regrasMap = [
    { key: 'dias7', diff: 7 }, { key: 'dias4', diff: 4 },
    { key: 'dia0', diff: 0 }, { key: 'pos1', diff: -1 }, { key: 'pos3', diff: -3 },
  ]

  let adicionados = 0
  for (const cliente of clientes) {
    if (!cliente.telefone) continue
    const diff = diffDias(cliente.vencimento)
    if (diff === null) continue

    for (const { key, diff: diffAlvo } of regrasMap) {
      if (diff !== diffAlvo) continue
      const regra = config.regras?.[key]
      if (!regra?.ativo) continue
      const mensagem = formatarMensagem(regra.mensagem, cliente)
      const adicionou = await adicionarNaFila(cliente, key, mensagem)
      if (adicionou) adicionados++
    }
  }

  console.log(`📥 ${adicionados} mensagens adicionadas na fila.`)
  processarFila()
}

// ---- Crons ----

cron.schedule('*/30 * * * * *', processarFila, { timezone: 'America/Sao_Paulo' })

let cronJob = null
const iniciarCron = async () => {
  const config = await getConfig()
  const [hora, minuto] = (config.horario || '09:00').split(':').map(Number)
  if (cronJob) cronJob.stop()
  cronJob = cron.schedule(`${minuto} ${hora} * * *`, executarEnvioAutomatico, { timezone: 'America/Sao_Paulo' })
  console.log(`🕐 Cron agendado para ${config.horario}`)
}
iniciarCron()

// ---- Rotas ----

app.get('/status', (req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const numero = sock.user?.id || 'Não detectado'
    res.json({ qr: qrCodeBase64, ready: clientReady, numero })
  } catch {
    res.json({ qr: null, ready: false, numero: 'Erro' })
  }
})

app.post('/send', async (req, res) => {
  const { phone, message } = req.body
  if (!clientReady) return res.status(503).json({ error: 'WhatsApp não conectado' })
  try {
    await sock.sendMessage(normalizarTelefone(phone), { text: message })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/send-automatico', async (req, res) => {
  await executarEnvioAutomatico()
  res.json({ success: true })
})

app.get('/config', async (req, res) => res.json(await getConfig()))

app.post('/config', async (req, res) => {
  await db.collection('configwhatsapp').doc('principal').set(req.body, { merge: true })
  await iniciarCron()
  res.json({ success: true })
})

app.get('/logs', async (req, res) => {
  const snap = await db.collection('logswhatsapp').orderBy('enviadoEm', 'desc').limit(100).get()
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
})

app.get('/fila', async (req, res) => {
  const snap = await db.collection('filaEnvios').orderBy('criadoEm', 'desc').limit(200).get()
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
})

app.post('/fila/:id/retry', async (req, res) => {
  try {
    await db.collection('filaEnvios').doc(req.params.id).update({
      status: 'pendente', tentativas: 0, erro: null,
      proximaTentativa: admin.firestore.Timestamp.now(),
    })
    processarFila()
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/fila/:id/cancelar', async (req, res) => {
  try {
    await db.collection('filaEnvios').doc(req.params.id).update({ status: 'cancelado' })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/fila/limpar', async (req, res) => {
  try {
    const snap = await db.collection('filaEnvios')
      .where('status', 'in', ['enviado', 'cancelado']).get()
    const batch = db.batch()
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    res.json({ success: true, removidos: snap.size })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/logout', async (req, res) => {
  try {
    await sock.logout()
    clientReady = false
    qrCodeBase64 = null
    await limparSessao()
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.listen(3001, () => console.log('Servidor rodando na porta 3001'))