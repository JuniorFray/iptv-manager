import express from 'express'
import cors from 'cors'
import fs from 'fs'
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import cron from 'node-cron'
import admin from 'firebase-admin'
import { createRequire } from 'module'
import { ProxyAgent, request as undiciRequest, fetch as undiciFetch } from 'undici'          // ← NOVO

const require = createRequire(import.meta.url)
const serviceAccount = JSON.parse(process.env.SERVICEACCOUNTKEY)

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const app = express()
app.use(cors())
app.use(express.json())

// ---- WhatsApp ----

let sock = null
let qrCodeBase64 = null
let clientReady = false

const conectarWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('authinfo')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    browser: ['Sistema TV', 'Chrome', '1.0'],
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    qrTimeout: 60000,
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
      console.log('Desconectado', statusCode)
      if (statusCode !== 401) {
        const delay = statusCode === 408 ? 5000 : 10000
        console.log(`Reconectando em ${delay / 1000}s...`)
        setTimeout(conectarWhatsApp, delay)
      }
    } else if (connection === 'open') {
      clientReady = true
      qrCodeBase64 = null
      console.log('WhatsApp conectado!')
    }
  })
}

conectarWhatsApp()

// ---- WWPanel (mcapi.knewcms.com) ----

let wpToken = null
let wpTokenExp = 0

const wpLogin = async () => {
  const res = await fetch('https://mcapi.knewcms.com:2087/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.WPAINEL_USER,
      password: process.env.WPAINEL_PASS
    })
  })
  const data = await res.json()
  if (!data.token) throw new Error('Login WWPanel falhou: ' + JSON.stringify(data))
  wpToken = data.token
  wpTokenExp = Date.now() + (1.5 * 60 * 60 * 1000)
  console.log('🔑 WWPanel token renovado!')
  return wpToken
}

const getWpToken = async () => {
  if (!wpToken || Date.now() > wpTokenExp) await wpLogin()
  return wpToken
}

const wpFetch = async (path, method = 'GET', body = null) => {
  const token = await getWpToken()
  const res = await fetch(`https://mcapi.knewcms.com:2087${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://wwpanel.link',
      'Referer': 'https://wwpanel.link/'
    },
    body: body ? JSON.stringify(body) : null
  })
  return res.json()
}

// ---- Elite (adminx.offo.dad) ----

// ← NOVO: proxy Webshare para contornar bloqueio Cloudflare
const eliteProxy = process.env.PROXY_URL
  ? new ProxyAgent(process.env.PROXY_URL)
  : undefined

let eliteToken = null
let eliteCookies = null

const eliteLogin = async () => {
  // Etapa 1 — pegar página e extrair _token do HTML + cookies
  const step1 = await undiciRequest('https://adminx.offo.dad/login', {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' },
    dispatcher: eliteProxy,
    maxRedirections: 0,
  })
  const html = await step1.body.text()

  // Extrai _token do input hidden no HTML
  const tokenMatch = html.match(/name="_token"\s+value="([^"]+)"/) 
                  ?? html.match(/value="([^"]+)"\s+name="_token"/)
  const formToken = tokenMatch?.[1] ?? ''
  console.log('🔍 _token do HTML:', formToken)

  const raw1 = step1.headers['set-cookie'] ?? []
  const arr1 = Array.isArray(raw1) ? raw1 : [raw1]
  const xsrfRaw    = arr1.find(c => c.startsWith('XSRF-TOKEN='))?.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''
  const sessionRaw = arr1.find(c => c.startsWith('office_session='))?.match(/office_session=([^;]+)/)?.[1] ?? ''
  const cookieStr  = `XSRF-TOKEN=${xsrfRaw}; office_session=${sessionRaw}`

  // Etapa 2 — POST com _token correto + timezone + remember
  const step2 = await undiciRequest('https://adminx.offo.dad/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'Origin': 'https://adminx.offo.dad',
      'Referer': 'https://adminx.offo.dad/login',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    body: new URLSearchParams({
      _token: formToken,
      timezone: 'America/Sao_Paulo',
      email: process.env.ELITEUSER,
      password: process.env.ELITEPASS,
      remember: 'on',
    }).toString(),
    dispatcher: eliteProxy,
    maxRedirections: 0,
  })
  await step2.body.text()

  const raw2 = step2.headers['set-cookie'] ?? []
  const arr2 = Array.isArray(raw2) ? raw2 : [raw2]
  console.log('🔍 Elite status login:', step2.statusCode)
  console.log('🔍 Elite cookies pós-login:', arr2)

  const newXsrfRaw = arr2.find(c => c.startsWith('XSRF-TOKEN='))?.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''

  eliteToken   = decodeURIComponent(newXsrfRaw)
  eliteCookies = arr2.map(c => c.split(';')[0]).join('; ')
  console.log('🔑 Elite login OK — status:', step2.statusCode)
  console.log('🔍 eliteCookies final:', eliteCookies.substring(0, 80) + '...')
}

const eliteFetch = async (path, method = 'GET', body = null, contentType = 'application/json') => {
  if (!eliteToken) await eliteLogin()

  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': contentType,
    'Cookie': eliteCookies,
    'Origin': 'https://adminx.offo.dad',
    'Referer': 'https://adminx.offo.dad/dashboard/iptv',
    'X-CSRF-TOKEN': eliteToken,
    'X-Requested-With': 'XMLHttpRequest',   // ← NOVO
    'User-Agent': 'Mozilla/5.0',
  }

  const bodyStr = body
    ? (contentType.includes('json')
        ? JSON.stringify(body)
        : new URLSearchParams(body).toString())
    : null

  console.log('📤 eliteFetch →', method, `https://adminx.offo.dad/${path}`)
  console.log('📤 X-CSRF-TOKEN:', eliteToken?.substring(0, 30))
  console.log('📤 Cookie:', eliteCookies?.substring(0, 80))
  if (bodyStr) console.log('📤 Body:', bodyStr.substring(0, 200))

  const res = await undiciFetch(`https://adminx.offo.dad/${path}`, {  // ← undiciFetch
    method,
    headers,
    body: bodyStr,
    dispatcher: eliteProxy,
  })

  const rawText = await res.text()
  console.log('📥 eliteFetch status:', res.status)
  console.log('📥 eliteFetch body:', rawText.substring(0, 500))

  if (res.status === 401 || res.status === 419) {
    console.log('🔄 Token expirado — fazendo novo login...')
    await eliteLogin()
    return eliteFetch(path, method, body, contentType)
  }

  try {
    return JSON.parse(rawText)
  } catch {
    console.error('❌ eliteFetch: resposta não é JSON válido')
    return { error: true, raw: rawText.substring(0, 300) }
  }
}

// ---- Helpers WhatsApp ----

const sleep = ms => new Promise(r => setTimeout(r, ms))

const parseDate = str => {
  if (!str) return null
  const [d, m, y] = str.split('/').map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}

const diffDias = dataStr => {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const data = parseDate(dataStr)
  if (!data) return null
  return Math.round((data.getTime() - hoje.getTime()) / 86400000)
}

const formatarMensagem = (template, cliente) => {
  return template
    .replace(/NOME/gi, cliente.nome || '')
    .replace(/VENCIMENTO/gi, cliente.vencimento || '')
    .replace(/SERVIDOR/gi, cliente.servidor || '')
    .replace(/VALOR/gi, cliente.valor ? `R$ ${parseFloat(cliente.valor).toFixed(2).replace('.', ',')}` : '')
}

const normalizarTelefone = tel => {
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
    dias7: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 7 dias, no dia VENCIMENTO. Entre em contato com antecedência!' },
    dias4: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 4 dias, no dia VENCIMENTO. Não deixe para a última hora!' },
    dia0:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence HOJE! Entre em contato agora. Valor VALOR' },
    pos1:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR venceu ontem VENCIMENTO. Entre em contato para reativar!' },
    pos3:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR está vencida há 3 dias VENCIMENTO. Regularize o quanto antes!' },
  }
}

const getConfig = async () => {
  const snap = await db.collection('configwhatsapp').doc('principal').get()
  if (!snap.exists) {
    await db.collection('configwhatsapp').doc('principal').set(configPadrao)
    return configPadrao
  }
  return snap.data()
}

// ---- Fila ----

const MAX_TENTATIVAS = 3
const BACKOFF_BASE_MS = 60000

const jaEnviouHoje = async (clienteId, gatilho) => {
  const hoje = new Date().toISOString().split('T')[0]
  const snap = await db.collection('notificacoesEnviadas')
    .where('clienteId', '==', clienteId)
    .where('gatilho', '==', gatilho)
    .where('data', '==', hoje)
    .limit(1).get()
  return !snap.empty
}

const adicionarNaFila = async (cliente, gatilho, mensagem) => {
  if (await jaEnviouHoje(cliente.id, gatilho)) {
    console.log(`Duplicata ignorada: ${cliente.nome} ${gatilho}`)
    return false
  }
  await db.collection('filaEnvios').add({
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    telefone: cliente.telefone,
    mensagem, gatilho,
    status: 'pendente',
    tentativas: 0,
    maxTentativas: MAX_TENTATIVAS,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    proximaTentativa: admin.firestore.Timestamp.now(),
    enviadoEm: null,
    erro: null,
  })
  console.log(`Adicionado na fila: ${cliente.nome} ${gatilho}`)
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
      .where('proximaTentativa', '<', agora)
      .orderBy('proximaTentativa')
      .limit(10).get()
    if (snap.empty) return
    console.log(`Processando ${snap.size} itens da fila...`)
    for (const docSnap of snap.docs) {
      if (!clientReady) { console.log('WhatsApp desconectou, pausando fila.'); break }
      const item = docSnap.data()
      const ref = docSnap.ref
      await ref.update({ status: 'enviando' })
      try {
        const numero = normalizarTelefone(item.telefone)
        await sock.sendMessage(numero, { text: item.mensagem })
        await ref.update({ status: 'enviado', enviadoEm: admin.firestore.FieldValue.serverTimestamp(), erro: null })
        await db.collection('notificacoesEnviadas').add({
          clienteId: item.clienteId, clienteNome: item.clienteNome,
          gatilho: item.gatilho, data: new Date().toISOString().split('T')[0],
          enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
        await salvarLog(item.clienteNome, item.telefone, item.gatilho, item.mensagem, 'enviado')
        console.log(`Enviado: ${item.clienteNome} ${item.gatilho}`)
      } catch (err) {
        const novasTentativas = (item.tentativas || 0) + 1
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, novasTentativas - 1)
        const proximaTentativa = admin.firestore.Timestamp.fromMillis(Date.now() + backoffMs)
        if (novasTentativas >= MAX_TENTATIVAS) {
          await ref.update({ status: 'erro', tentativas: novasTentativas, erro: err.message, proximaTentativa })
          await salvarLog(item.clienteNome, item.telefone, item.gatilho, item.mensagem, 'erro')
        } else {
          await ref.update({ status: 'pendente', tentativas: novasTentativas, erro: err.message, proximaTentativa })
        }
      }
      await sleep(intervalo)
    }
  } finally {
    processandoFila = false
  }
}

// ---- Envio Automático ----

const executarEnvioAutomatico = async () => {
  console.log('Iniciando envio automático...')
  if (!clientReady) { console.log('WhatsApp não conectado.'); return }
  const config = await getConfig()
  if (!config.ativo) { console.log('Envio automático desativado.'); return }
  const snapshot = await db.collection('clientes').get()
  const clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  const regrasMap = [
    { key: 'dias7', diff: 7 }, { key: 'dias4', diff: 4 },
    { key: 'dia0',  diff: 0 }, { key: 'pos1',  diff: -1 }, { key: 'pos3', diff: -3 },
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
  console.log(`${adicionados} mensagens adicionadas na fila.`)
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
  console.log(`Cron agendado para ${config.horario}`)
}
iniciarCron()

// ---- Rotas WhatsApp ----

app.get('/status', (req, res) => {
  try {
    const numero = sock?.user?.id || 'Não detectado'
    res.json({ qr: qrCodeBase64, ready: clientReady, numero })
  } catch {
    res.json({ qr: null, ready: false, numero: 'Erro' })
  }
})

app.post('/send', async (req, res) => {
  const { phone, message } = req.body
  if (!clientReady || !sock) return res.status(503).json({ error: 'WhatsApp não conectado' })
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

// ---- Rotas da Fila ----

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
    if (sock) {
      await sock.logout()
      sock = null
    }
    clientReady = false
    qrCodeBase64 = null

    const fs2 = await import('fs/promises')
    const arquivos = await fs2.readdir('authinfo').catch(() => [])
    for (const arq of arquivos) {
      await fs2.unlink(`authinfo/${arq}`).catch(() => {})
    }

    setTimeout(conectarWhatsApp, 2000)
    res.json({ success: true, msg: 'Sessão limpa. Novo QR sendo gerado...' })
  } catch (err) {
    clientReady = false
    qrCodeBase64 = null
    setTimeout(conectarWhatsApp, 2000)
    res.json({ success: true, msg: 'Sessão resetada.' })
  }
})

// ---- Rotas WWPanel ----

app.get('/painel/buscar/:termo', async (req, res) => {
  try {
    const termo = decodeURIComponent(req.params.termo)
    const byUsername = await wpFetch(`/lines?username=${encodeURIComponent(termo)}&limit=10`)
    if (byUsername?.items?.length > 0) return res.json(byUsername)
    const bySearch = await wpFetch(`/lines?search=${encodeURIComponent(termo)}&limit=10`)
    res.json(bySearch)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/painel/buscar-username/:username', async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username)
    const token = await getWpToken()
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://wwpanel.link',
      'Referer': 'https://wwpanel.link/'
    }
    const r1 = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=1`, { headers })
    const d1 = await r1.json()
    const totalPaginas = d1?.pagesQuantity ?? 1
    let linhas = d1?.items ?? []
    const paginas = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
    const resultados = await Promise.all(paginas.map(async (page) => {
      const r = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=${page}`, { headers })
      const d = await r.json()
      return d?.items ?? []
    }))
    resultados.forEach(items => linhas.push(...items))
    const linha = linhas.find(l => l.username === username)
    if (!linha) return res.status(404).json({ error: `Usuário "${username}" não encontrado.` })
    res.json({ items: [linha] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/painel/debug/:termo', async (req, res) => {
  try {
    const termo = decodeURIComponent(req.params.termo)
    const token = await getWpToken()
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://wwpanel.link',
      'Referer': 'https://wwpanel.link/'
    }
    const [r1, r2] = await Promise.all([
      fetch(`https://mcapi.knewcms.com:2087/lines?search=${encodeURIComponent(termo)}&limit=5`, { headers }),
      fetch(`https://mcapi.knewcms.com:2087/lines?username=${encodeURIComponent(termo)}&limit=5`, { headers }),
    ])
    res.json({
      search_param: await r1.json(),
      username_param: await r2.json(),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/painel/linha/:lineId', async (req, res) => {
  try {
    const data = await wpFetch(`/lines/${req.params.lineId}`)
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/painel/sincronizar', async (req, res) => {
  try {
    const token = await getWpToken()
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://wwpanel.link',
      'Referer': 'https://wwpanel.link/'
    }
    const r1 = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=1`, { headers })
    const d1 = await r1.json()
    const totalPaginas = d1?.pagesQuantity ?? 1
    let linhas = d1?.items ?? []
    const paginas = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
    const resultados = await Promise.all(paginas.map(async (page) => {
      const r = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=${page}`, { headers })
      const d = await r.json()
      return d?.items ?? []
    }))
    resultados.forEach(items => linhas.push(...items))
    const mapa = linhas.map(l => ({
      id: l.id,
      username: l.username,
      password: l.password,
      notes: l.notes?.trim() ?? '',
      exp_date: l.exp_date,
    }))
    res.json({ total: mapa.length, linhas: mapa })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/painel/renovar/:lineId', async (req, res) => {
  try {
    const lineId = req.params.lineId
    const credits = req.body?.credits ?? 1
    const data = await wpFetch(`/lines/extend/${lineId}`, 'PATCH', { credits })
    console.log(`[RENOVAR WAREZ] lineId=${lineId} credits=${credits} resposta=`, JSON.stringify(data))
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/painel/planos', async (req, res) => {
  try {
    const data = await wpFetch('/products')
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/painel/teste', async (req, res) => {
  try {
    const data = await wpFetch('/lines/trial', 'POST', req.body)
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ---- Rotas Elite ----

app.get('/elite/debug', async (req, res) => {
  try {
    await eliteLogin()
    const resIptv = await undiciFetch('https://adminx.offo.dad/dashboard/iptv/data?per_page=5', {  // ← undiciFetch
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Cookie': eliteCookies,
        'X-CSRF-TOKEN': eliteToken,
        'X-Requested-With': 'XMLHttpRequest',   // ← NOVO
        'Referer': 'https://adminx.offo.dad/dashboard/iptv',
        'User-Agent': 'Mozilla/5.0',
      },
      dispatcher: eliteProxy,
    })
    const rawText = await resIptv.text()
    const status = resIptv.status
    const contentType = resIptv.headers.get('content-type') ?? 'unknown'
    let parsed = null
    try { parsed = JSON.parse(rawText) } catch { parsed = null }
    res.json({ status, contentType, isJson: parsed !== null, preview: rawText.substring(0, 500), data: parsed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/elite/sincronizar', async (req, res) => {
  try {
    const [resIptv, resP2p] = await Promise.all([
      eliteFetch('dashboard/iptv/data?per_page=1000'),
      eliteFetch('dashboard/p2p/data?per_page=1000'),
    ])
    const iptv = (resIptv?.data ?? resIptv?.items ?? []).map(l => ({ ...l, _tipo: 'IPTV' }))
    const p2p  = (resP2p?.data  ?? resP2p?.items  ?? []).map(l => ({ ...l, _tipo: 'P2P'  }))
    const todas = [...iptv, ...p2p]
    const linhas = todas.map(l => ({
      id:       l.id,
      username: l.username,
      password: l.password,
      name:     l.name ?? l.member_name ?? l.notes ?? '',
      tipo:     l._tipo,
      exp_date: l.exp_date ?? l.expiry_date ?? null,
    }))
    res.json({ total: linhas.length, linhas })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/elite/renovar', async (req, res) => {
  try {
    const { id, tipo, meses = 1 } = req.body
    const tipoPath = tipo?.toLowerCase() === 'p2p' ? 'p2p' : 'iptv'
    let data
    if (Number(meses) <= 1) {
      data = await eliteFetch(`api/${tipoPath}/renewone/${id}`, 'POST')
    } else {
      data = await eliteFetch(`api/${tipoPath}/renewmulti/${id}`, 'POST', {
        user_id: id,
        months: Number(meses),
      })
    }
    console.log(`[RENOVAR ELITE] id=${id} tipo=${tipoPath} meses=${meses} resposta=`, JSON.stringify(data))
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/meu-ip', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json')
    const data = await r.json()
    res.json({ ip: data.ip })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => console.log('Servidor rodando na porta 3001'))