import express from 'express'
import makeWASocket, {
  initAuthCreds,
  BufferJSON,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import cron   from 'node-cron'

/**
 * Módulo WhatsApp
 * Responsável por: conexão Baileys, fila de envios, envio automático, crons e rotas /status /send /config /logs /fila /logout
 * @param {FirebaseFirestore.Firestore} db
 * @param {admin} admin  firebase-admin já inicializado
 */
export default function createWhatsAppRouter(db, admin) {
  const router = express.Router()

  // ---- Estado da conexão ----

  let sock          = null
  let qrCodeBase64  = null
  let clientReady   = false
  let reconexoes440 = 0

  // ---- Auth State no Firestore (persiste entre deploys) ----

  const useFirestoreAuthState = async () => {
    const col = db.collection('whatsapp_auth')

    const writeData = async (id, data) => {
      await col.doc(id).set({ data: JSON.stringify(data, BufferJSON.replacer) })
    }

    const readData = async (id) => {
      const snap = await col.doc(id).get()
      if (!snap.exists) return null
      return JSON.parse(snap.data().data, BufferJSON.reviver)
    }

    const removeData = async (id) => {
      await col.doc(id).delete()
    }

    const creds = (await readData('creds')) || initAuthCreds()

    return {
      state: {
        creds,
        keys: {
          get: async (type, ids) => {
            const data = {}
            await Promise.all(ids.map(async (id) => {
              const val = await readData(`${type}-${id}`)
              data[id]  = val
            }))
            return data
          },
          set: async (data) => {
            const tasks = []
            for (const [type, ids] of Object.entries(data)) {
              for (const [id, val] of Object.entries(ids)) {
                tasks.push(val ? writeData(`${type}-${id}`, val) : removeData(`${type}-${id}`))
              }
            }
            await Promise.all(tasks)
          }
        }
      },
      saveCreds: () => writeData('creds', creds)
    }
  }

  // ---- Conexão Baileys ----

  const conectarWhatsApp = async () => {
    try {
      const { state, saveCreds } = await useFirestoreAuthState()
      const { version }          = await fetchLatestBaileysVersion()

      sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
        browser: ['SistemaTV', 'Desktop', '1.0.0'],
        keepAliveIntervalMs: 25000,
        connectTimeoutMs:    60000,
        retryRequestDelayMs: 2000,
        qrTimeout:           60000,
        markOnlineOnConnect: false,
        syncFullHistory:     false,
        shouldSyncHistoryMessage: () => false,
        getMessage: async () => undefined,
        fireInitQueries: false,
      })

      sock.ev.on('creds.update', saveCreds)

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          try {
            qrCodeBase64 = await qrcode.toDataURL(qr)
          } catch {
            qrCodeBase64 = null
          }
          clientReady = false
        }

        if (connection === 'close') {
          clientReady = false
          processandoFila = false
          const statusCode = lastDisconnect?.error?.output?.statusCode
          console.log('Desconectado', statusCode)

          if (statusCode === 401) {
            console.log('Sessão inválida (401) — limpando auth...')
            try {
              const snap  = await db.collection('whatsapp_auth').get()
              const batch = db.batch()
              snap.docs.forEach(d => batch.delete(d.ref))
              await batch.commit()
              console.log('Auth limpo. Aguardando novo QR...')
            } catch (e) {
              console.error('Erro ao limpar auth:', e.message)
            }
            setTimeout(conectarWhatsApp, 3000)
          } else if (statusCode === 440) {
            reconexoes440++
            const delay = Math.min(reconexoes440 * 15000, 120000)
            console.log(`Sessão substituída (440) — tentativa ${reconexoes440}, reconectando em ${delay/1000}s...`)
            setTimeout(conectarWhatsApp, delay)
          } else if (statusCode === 428) {
            console.log('Reconectando em 15s...')
            setTimeout(conectarWhatsApp, 15000)
          } else {
            const delay = statusCode === 408 ? 5000 : 10000
            console.log(`Reconectando em ${delay / 1000}s...`)
            setTimeout(conectarWhatsApp, delay)
          }
        } else if (connection === 'open') {
          clientReady  = true
          qrCodeBase64 = null
          console.log('WhatsApp conectado!')
          setTimeout(() => { if (clientReady) reconexoes440 = 0 }, 60000)
          // Processa fila rapidamente ao conectar
          setTimeout(processarFila, 500)
        }
      })
    } catch (err) {
      console.error('Erro ao conectar WhatsApp:', err)
      setTimeout(conectarWhatsApp, 10000)
    }
  }

  // ---- Helpers ----

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

  const encurtarUrl = async (url) => {
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`)
      if (res.ok) { const short = await res.text(); if (short.startsWith('http')) return short.trim() }
    } catch { /* usa url original */ }
    return url
  }

  const gerarLinksCliente = async (cliente) => {
    try {
      const BACKEND = 'https://iptv-manager-production.up.railway.app'
      const res = await fetch(`${BACKEND}/pagamento/criar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: cliente.id, clienteNome: cliente.nome,
          telefone: cliente.telefone, servidor: cliente.servidor,
          usuario: cliente.usuario, senha: cliente.senha,
          valor: cliente.valor, valor3meses: cliente.valor3meses, valor6meses: cliente.valor6meses,
        })
      })
      const data = await res.json()
      if (!data.ok) { console.log('[Links] pagamento/criar falhou:', data.error); return null }
      const links = {}
      for (const l of data.links) {
        const short = await encurtarUrl(l.link)
        if      (l.plano.includes('1')) links['1mes']   = short
        else if (l.plano.includes('3')) links['3meses'] = short
        else if (l.plano.includes('6')) links['6meses'] = short
      }
      console.log('[Links] gerados para', cliente.nome, links)
      return links
    } catch (err) { console.error('[Links] Erro:', err.message); return null }
  }

  const formatarMensagem = async (template, cliente) => {
    const fmtValor = (v) => v ? `R$ ${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.', ',')}` : ''
    // Valores padrão se não cadastrados
    const v3 = cliente.valor3meses || '95.00'
    const v6 = cliente.valor6meses || '170.00'
    let msg = template
      .replace(/\{NOME\}/gi,         cliente.nome        || '')
      .replace(/\{VENCIMENTO\}/gi,   cliente.vencimento   || '')
      .replace(/\{SERVIDOR\}/gi,     cliente.servidor     || '')
      .replace(/\{VALOR\}/gi,        fmtValor(cliente.valor))
      .replace(/\{VALOR_3MESES\}/gi, fmtValor(v3))
      .replace(/\{VALOR_6MESES\}/gi, fmtValor(v6))
      .replace(/NOME/gi,         cliente.nome        || '')
      .replace(/VENCIMENTO/gi,   cliente.vencimento   || '')
      .replace(/SERVIDOR/gi,     cliente.servidor     || '')
      .replace(/VALOR/gi,        fmtValor(cliente.valor))

    if (/\{LINK_(1MES|3MESES|6MESES)\}/i.test(msg)) {
      console.log('[Links] Detectado link no template para', cliente.nome)
      const links = await gerarLinksCliente(cliente)
      const fallback = '(link indisponível)'
      msg = msg
        .replace(/\{LINK_1MES\}/gi,   links?.['1mes']   || fallback)
        .replace(/\{LINK_3MESES\}/gi, links?.['3meses'] || fallback)
        .replace(/\{LINK_6MESES\}/gi, links?.['6meses'] || fallback)
    }
    return msg
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

  // ---- Configuração ----

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

  // ---- Fila de Envios ----

  const MAX_TENTATIVAS  = 3
  const BACKOFF_BASE_MS = 60000

  const jaEnviouHoje = async (clienteId, gatilho) => {
    const hoje  = new Date().toISOString().split('T')[0]
    const snap  = await db.collection('notificacoesEnviadas')
      .where('clienteId', '==', clienteId)
      .where('gatilho',   '==', gatilho)
      .where('data',      '==', hoje)
      .limit(1).get()
    return !snap.empty
  }

  const adicionarNaFila = async (cliente, gatilho, mensagem, midia = {}) => {
    if (await jaEnviouHoje(cliente.id, gatilho)) {
      console.log(`Duplicata ignorada: ${cliente.nome} ${gatilho}`)
      return false
    }
    await db.collection('filaEnvios').add({
      clienteId:        cliente.id,
      clienteNome:      cliente.nome,
      telefone:         cliente.telefone,
      mensagem, gatilho,
      midiaUrl:         midia.midiaUrl  || null,
      midiaTipo:        midia.midiaTipo || null,
      midiaNome:        midia.midiaNome || null,
      modoEnvio:        midia.modoEnvio || 'junto',
      status:           'pendente',
      tentativas:       0,
      maxTentativas:    MAX_TENTATIVAS,
      criadoEm:         admin.firestore.FieldValue.serverTimestamp(),
      proximaTentativa: admin.firestore.Timestamp.now(),
      enviadoEm:        null,
      erro:             null,
    })
    console.log(`Adicionado na fila: ${cliente.nome} ${gatilho}`)
    return true
  }

  let processandoFila = false

  const processarFila = async () => {
    if (!clientReady || processandoFila) return
    processandoFila = true
    try {
      const agora    = admin.firestore.Timestamp.now()
      const config   = await getConfig()
      const intervalo = config.intervaloMs ?? 5000
      const snap     = await db.collection('filaEnvios')
        .where('status',            '==', 'pendente')
        .where('proximaTentativa',  '<',  agora)
        .orderBy('proximaTentativa')
        .limit(10).get()
      if (snap.empty) return
      console.log(`Processando ${snap.size} itens da fila...`)
      for (const docSnap of snap.docs) {
        if (!clientReady) { console.log('WhatsApp desconectou, pausando fila.'); break }
        const item = docSnap.data()
        const ref  = docSnap.ref
        await ref.update({ status: 'enviando' })
        try {
          const numero = normalizarTelefone(item.telefone)
          if (item.midiaUrl && item.midiaTipo) {
            // Envia com mídia
            if (item.modoEnvio === 'separado' && item.mensagem?.trim()) {
              await sock.sendMessage(numero, { text: item.mensagem })
              await sleep(1000)
            }
            if (item.midiaTipo === 'imagem') {
              await sock.sendMessage(numero, { image: { url: item.midiaUrl }, caption: item.modoEnvio !== 'separado' ? (item.mensagem || '') : '' })
            } else if (item.midiaTipo === 'audio') {
              await sock.sendMessage(numero, { audio: { url: item.midiaUrl }, mimetype: 'audio/ogg; codecs=opus', ptt: true })
            } else if (item.midiaTipo === 'video') {
              await sock.sendMessage(numero, { video: { url: item.midiaUrl }, caption: item.modoEnvio !== 'separado' ? (item.mensagem || '') : '' })
            } else {
              await sock.sendMessage(numero, { document: { url: item.midiaUrl }, fileName: item.midiaNome || 'arquivo' })
            }
          } else {
            await sock.sendMessage(numero, { text: item.mensagem })
          }
          await ref.update({
            status:    'enviado',
            enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
            erro:      null
          })
          await db.collection('notificacoesEnviadas').add({
            clienteId:   item.clienteId   ?? item.telefone ?? 'sem-id',
            clienteNome: item.clienteNome ?? item.nome     ?? '',
            gatilho:     item.gatilho     ?? 'renovacao',
            data:        new Date().toISOString().split('T')[0],
            enviadoEm:   admin.firestore.FieldValue.serverTimestamp(),
          })
          await salvarLog(item.clienteNome, item.telefone, item.gatilho, item.mensagem, 'enviado')
          console.log(`Enviado: ${item.clienteNome} ${item.gatilho}`)
        } catch (err) {
          console.error('Erro ao enviar mensagem WhatsApp:', err)
          const novasTentativas = (item.tentativas || 0) + 1
          const backoffMs       = BACKOFF_BASE_MS * Math.pow(2, novasTentativas - 1)
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
    // WA pode estar offline — adiciona na fila e processarFila envia quando reconectar
    const config = await getConfig()
    if (!config.ativo) { console.log('Envio automático desativado.'); return }
    const snapshot = await db.collection('clientes').get()
    const clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    const regrasMap = [
      { key: 'dias7', diff:  7 },
      { key: 'dias4', diff:  4 },
      { key: 'dia0',  diff:  0 },
      { key: 'pos1',  diff: -1 },
      { key: 'pos3',  diff: -3 },
    ]
    let adicionados = 0
    // Agrupa clientes: principal = sem responsavel, secundários = com responsavel
    const principaisSet = new Set(clientes.filter(c => !c.responsavel?.trim()).map(c => c.id))

    for (const cliente of clientes) {
      if (!cliente.telefone) continue
      // Pula pontos secundários — o principal já vai receber msg com todos os pontos
      if (cliente.responsavel?.trim()) continue
      const diff = diffDias(cliente.vencimento)
      if (diff === null) continue

      // Busca todos os pontos vinculados a este responsável (incluindo ele mesmo)
      const telResp = cliente.telefone
      const pontos = clientes.filter(c =>
        (c.responsavel?.trim() || c.telefone) === telResp && c.status === 'ativo'
      )

      for (const { key, diff: diffAlvo } of regrasMap) {
        // Dispara se o principal OU qualquer ponto vence no período
        const algumVence = pontos.some(p => {
          const d = diffDias(p.vencimento)
          return d !== null && d === diffAlvo
        })
        if (!algumVence) continue
        const regra = config.regras?.[key]
        if (!regra?.ativo) continue

        // Monta mensagem agrupada se tiver múltiplos pontos
        let mensagemFinal
        if (pontos.length > 1) {
          // Gera uma linha por ponto com links individuais
          let pontosTexto = ''
          for (const p of pontos) {
            const links = await gerarLinksCliente(p)
            const venc = p.vencimento || '—'
            pontosTexto += `\n📺 *${p.nome}* — vence ${venc}\n`
            if (links) {
              pontosTexto += `1 Mês: ${links['1mes'] || ''}\n`
              pontosTexto += `3 Meses: ${links['3meses'] || ''}\n`
              pontosTexto += `6 Meses: ${links['6meses'] || ''}\n`
            }
          }
          // Substitui variáveis básicas pelo cliente principal e adiciona pontos
          const msgBase = regra.mensagem
            .replace(/\{NOME\}/gi, cliente.nome).replace(/NOME/gi, cliente.nome)
            .replace(/\{LINK_1MES\}/gi, '').replace(/\{LINK_3MESES\}/gi, '').replace(/\{LINK_6MESES\}/gi, '')
          mensagemFinal = msgBase + '\n' + pontosTexto
        } else {
          mensagemFinal = await formatarMensagem(regra.mensagem, cliente)
        }

        const adicionou = await adicionarNaFila(cliente, key, mensagemFinal, {
          midiaUrl:        regra.midiaUrl        || null,
          midiaTipo:       regra.midiaTipo       || null,
          midiaNome:       regra.midiaNome       || null,
          modoEnvio:       regra.modoEnvio       || 'junto',
        })
        if (adicionou) adicionados++
      }
    }
    console.log(`${adicionados} mensagens adicionadas na fila.`)
    processarFila()
  }

  // ---- Crons ----

  cron.schedule('*/10 * * * * *', processarFila, { timezone: 'America/Sao_Paulo' })

  let cronJob = null
  const iniciarCron = async () => {
    const config = await getConfig()
    const [hora, minuto] = (config.horario || '09:00').split(':').map(Number)
    if (cronJob) cronJob.stop()
    cronJob = cron.schedule(
      `${minuto} ${hora} * * *`,
      executarEnvioAutomatico,
      { timezone: 'America/Sao_Paulo' }
    )
    console.log(`Cron agendado para ${config.horario}`)
  }

  // ---- Rotas WhatsApp ----

  router.get('/status', (req, res) => {
    try {
      const numero = sock?.user?.id || 'Não detectado'
      res.json({ qr: qrCodeBase64, ready: clientReady, numero })
    } catch {
      res.json({ qr: null, ready: false, numero: 'Erro' })
    }
  })

  router.post('/send', async (req, res) => {
    const { phone, message, cliente } = req.body
    if (!clientReady || !sock) return res.status(503).json({ error: 'WhatsApp não conectado' })
    try {
      const msg = cliente ? await formatarMensagem(message, cliente) : message
      await sock.sendMessage(normalizarTelefone(phone), { text: msg })
      res.json({ success: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/send-midia', async (req, res) => {
    const { phone, mediaUrl, mediaTipo, mediaNome, caption } = req.body
    if (!clientReady || !sock) return res.status(503).json({ error: 'WhatsApp não conectado' })
    if (!mediaUrl || !mediaTipo) return res.status(400).json({ error: 'mediaUrl e mediaTipo são obrigatórios' })
    try {
      const jid = normalizarTelefone(phone)
      if (mediaTipo === 'imagem') {
        await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: caption || '' })
      } else if (mediaTipo === 'audio') {
        await sock.sendMessage(jid, { audio: { url: mediaUrl }, mimetype: 'audio/ogg; codecs=opus', ptt: true })
      } else if (mediaTipo === 'video') {
        await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: caption || '' })
      } else {
        await sock.sendMessage(jid, { document: { url: mediaUrl }, fileName: mediaNome || 'arquivo', caption: caption || '' })
      }
      res.json({ success: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/send-automatico', async (req, res) => {
    await executarEnvioAutomatico()
    res.json({ success: true })
  })

  router.get('/config', async (req, res) => res.json(await getConfig()))

  router.post('/config', async (req, res) => {
    await db.collection('configwhatsapp').doc('principal').set(req.body, { merge: true })
    await iniciarCron()
    res.json({ success: true })
  })

  router.get('/logs', async (req, res) => {
    const snap = await db.collection('logswhatsapp')
      .orderBy('enviadoEm', 'desc').limit(100).get()
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })

  // ---- Rotas da Fila ----

  router.get('/fila', async (req, res) => {
    const snap = await db.collection('filaEnvios')
      .orderBy('criadoEm', 'desc').limit(200).get()
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })

  router.post('/fila/adicionar', async (req, res) => {
    try {
      const { clienteId, clienteNome, telefone, mensagem, gatilho, midiaUrl, midiaTipo, midiaNome, modoEnvio, cliente, pontos } = req.body
      if (!telefone || !mensagem) return res.status(400).json({ error: 'telefone e mensagem obrigatórios' })

      let mensagemFinal
      if (pontos && pontos.length > 1) {
        // Múltiplos pontos: monta mensagem agrupada com links de cada ponto
        let pontosTexto = ''
        for (const p of pontos) {
          const links = await gerarLinksCliente(p)
          const venc = p.vencimento || '—'
          pontosTexto += `\n📺 *${p.nome}* — vence ${venc}\n`
          if (links) {
            pontosTexto += `💰 1 Mês: ${links['1mes'] || '(indisponível)'}\n`
            pontosTexto += `💰 3 Meses: ${links['3meses'] || '(indisponível)'}\n`
            pontosTexto += `💰 6 Meses: ${links['6meses'] || '(indisponível)'}\n`
          }
        }
        const msgBase = cliente
          ? mensagem
            .replace(/\{NOME\}/gi, cliente.nome).replace(/NOME/gi, cliente.nome)
            .replace(/\{VENCIMENTO\}/gi, cliente.vencimento || '').replace(/VENCIMENTO/gi, cliente.vencimento || '')
            .replace(/\{SERVIDOR\}/gi, cliente.servidor || '').replace(/SERVIDOR/gi, cliente.servidor || '')
            .replace(/\{LINK_1MES\}/gi, '').replace(/\{LINK_3MESES\}/gi, '').replace(/\{LINK_6MESES\}/gi, '')
          : mensagem
        mensagemFinal = msgBase.trimEnd() + '\n' + pontosTexto
      } else {
        mensagemFinal = cliente ? await formatarMensagem(mensagem, cliente) : mensagem
      }
      await db.collection('filaEnvios').add({
        clienteId:        clienteId        ?? telefone,
        clienteNome:      clienteNome      ?? '',
        telefone, mensagem: mensagemFinal,
        gatilho:          gatilho          ?? 'manual',
        midiaUrl:         midiaUrl         ?? null,
        midiaTipo:        midiaTipo        ?? null,
        midiaNome:        midiaNome        ?? null,
        modoEnvio:        modoEnvio        ?? 'junto',
        status:           'pendente',
        tentativas:       0,
        maxTentativas:    3,
        criadoEm:         admin.firestore.FieldValue.serverTimestamp(),
        proximaTentativa: admin.firestore.Timestamp.now(),
        enviadoEm:        null,
        erro:             null,
      })
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/fila/:id/retry', async (req, res) => {
    try {
      await db.collection('filaEnvios').doc(req.params.id).update({
        status: 'pendente', tentativas: 0, erro: null,
        proximaTentativa: admin.firestore.Timestamp.now(),
      })
      processarFila()
      res.json({ success: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/fila/:id/cancelar', async (req, res) => {
    try {
      await db.collection('filaEnvios').doc(req.params.id).update({ status: 'cancelado' })
      res.json({ success: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/fila/limpar', async (req, res) => {
    try {
      const snap = await db.collection('filaEnvios')
        .where('status', 'in', ['enviado', 'cancelado']).get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      res.json({ success: true, removidos: snap.size })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/logout', async (req, res) => {
    try {
      if (sock) {
        await sock.logout()
        sock = null
      }
      clientReady  = false
      qrCodeBase64 = null

      // Apagar sessão do Firestore
      const snap  = await db.collection('whatsapp_auth').get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()

      setTimeout(conectarWhatsApp, 2000)
      res.json({ success: true, msg: 'Sessão limpa. Novo QR sendo gerado...' })
    } catch (err) {
      clientReady  = false
      qrCodeBase64 = null
      setTimeout(conectarWhatsApp, 2000)
      res.json({ success: true, msg: 'Sessão resetada.' })
    }
  })

  // ---- Inicializador (chamado pelo server.js) ----

  const inicializar = () => {
    conectarWhatsApp()
    iniciarCron()
  }

  // ---- Enviar mensagem de renovação ----
  const enviarMensagemRenovacao = async (telefone, dados) => {
    if (!telefone) return
    try {
      const snap = await db.collection('config_whatsapp').doc('template_renovacao').get()
      let template = snap.exists
        ? snap.data().mensagem
        : `✅ *Renovação realizada!*\n\nSeu serviço foi renovado com sucesso.\n\n📋 *Seus dados de acesso:*\n👤 Usuário: *{usuario}*\n🔑 Senha: *{senha}*\n📅 Válido até: *{vencimento}*\n\nEm caso de dúvidas, fale comigo! 😊`

      const mensagem = template
        .replace(/{nome}/g, dados.nome ?? '')
        .replace(/{usuario}/g, dados.usuario ?? '')
        .replace(/{senha}/g, dados.senha ?? '')
        .replace(/{vencimento}/g, dados.vencimento ?? '')

      // Lê mídia do template se existir
      const midiaUrl  = snap.exists ? (snap.data().midiaUrl  || null) : null
      const midiaTipo = snap.exists ? (snap.data().midiaTipo || null) : null
      const midiaNome = snap.exists ? (snap.data().midiaNome || null) : null
      const modoEnvio = snap.exists ? (snap.data().modoEnvio || 'junto') : 'junto'

      if (clientReady && sock) {
        const numero = normalizarTelefone(telefone)
        if (midiaUrl && midiaTipo) {
          if (modoEnvio === 'separado' && mensagem.trim()) {
            await sock.sendMessage(numero, { text: mensagem })
            await sleep(1000)
          }
          if (midiaTipo === 'imagem') {
            await sock.sendMessage(numero, { image: { url: midiaUrl }, caption: modoEnvio !== 'separado' ? mensagem : '' })
          } else if (midiaTipo === 'audio') {
            await sock.sendMessage(numero, { audio: { url: midiaUrl }, mimetype: 'audio/ogg; codecs=opus', ptt: true })
          } else if (midiaTipo === 'video') {
            await sock.sendMessage(numero, { video: { url: midiaUrl }, caption: modoEnvio !== 'separado' ? mensagem : '' })
          } else {
            await sock.sendMessage(numero, { document: { url: midiaUrl }, fileName: midiaNome || 'arquivo' })
          }
        } else {
          await sock.sendMessage(numero, { text: mensagem })
        }
        await salvarLog(dados.nome ?? '', telefone, 'renovacao', mensagem, 'enviado')
        console.log(`[WA] ✅ Renovação enviada para ${telefone}`)
      } else {
        await db.collection('filaEnvios').add({
          clienteNome: dados.nome ?? '', nome: dados.nome ?? '', telefone, mensagem,
          midiaUrl, midiaTipo, midiaNome, modoEnvio,
          status: 'pendente', gatilho: 'renovacao',
          tentativas: 0, maxTentativas: 3,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          proximaTentativa: admin.firestore.Timestamp.now(),
          enviadoEm: null, erro: null,
        })
        console.log(`[WA] 📋 Renovação na fila (WA offline): ${dados.nome}`)
      }
    } catch (err) {
      console.error('[WA] Erro msg renovação:', err.message)
    }
  }

  router.delete('/logs', async (req, res) => {
    try {
      const snap  = await db.collection('logswhatsapp').get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      res.json({ ok: true, removidos: snap.size })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return { router, inicializar, enviarMensagemRenovacao }
}