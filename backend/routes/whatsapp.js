import express from 'express'
import cron from 'node-cron'

/**
 * Módulo WhatsApp — Evolution API
 * Substitui o Baileys por chamadas REST para a Evolution API
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-b45b.up.railway.app'
const EVOLUTION_KEY  = process.env.EVOLUTION_API_KEY  || 'iptv123manager456'
const INSTANCE       = process.env.EVOLUTION_INSTANCE  || 'conectatv'

const evoFetch = async (path, method = 'GET', body = null) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${EVOLUTION_URL}${path}`, opts)
  return res.json()
}

export default function createWhatsAppRouter(db, admin) {
  const router = express.Router()

  // ---- Estado ----
  let cronJob     = null
  let cronRodando = false
  let processandoFila = false

  // ---- Helpers ----

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  const normalizarTelefone = tel => {
    let num = String(tel).replace(/\D/g, '')
    if (num.startsWith('5555')) num = num.substring(2)
    else if (num.length <= 11 && !num.startsWith('55')) num = '55' + num
    return num
  }

  const parseDate = str => {
    if (!str) return null
    const p = String(str).split('/')
    if (p.length === 3) return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]))
    const d = new Date(str)
    return isNaN(d) ? null : d
  }

  const diffDias = dataStr => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const data = parseDate(dataStr)
    if (!data) return null
    return Math.round((data.getTime() - hoje.getTime()) / 86400000)
  }

  const jaEnviouHoje = async (clienteId, gatilho) => {
    const hoje = new Date().toISOString().split('T')[0]
    const snap = await db.collection('notificacoesEnviadas')
      .where('clienteId', '==', clienteId)
      .where('gatilho',   '==', gatilho)
      .where('data',      '==', hoje)
      .limit(1).get()
    return !snap.empty
  }

  const salvarLog = async (clienteNome, telefone, gatilho, mensagem, status) => {
    await db.collection('logswhatsapp').add({
      clienteNome, telefone, gatilho, mensagem, status,
      enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
      data: new Date().toLocaleDateString('pt-BR'),
      hora: new Date().toLocaleTimeString('pt-BR'),
    })
  }

  const formatarMensagem = async (template, cliente) => {
    const fmtValor = v => v ? `R$ ${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.', ',')}` : ''
    const v3 = cliente.valor3meses || '95.00'
    const v6 = cliente.valor6meses || '170.00'
    const links = await gerarLinksCliente(cliente)
    let msg = template
      .replace(/\{NOME\}/gi,         cliente.nome        || '')
      .replace(/\{VENCIMENTO\}/gi,   cliente.vencimento   || '')
      .replace(/\{SERVIDOR\}/gi,     cliente.servidor     || '')
      .replace(/\{VALOR_3MESES\}/gi, fmtValor(v3))
      .replace(/\{VALOR_6MESES\}/gi, fmtValor(v6))
      .replace(/\{VALOR\}/gi,        fmtValor(cliente.valor))
      .replace(/\{LINK_1MES\}/gi,    links?.['1mes']    || '')
      .replace(/\{LINK_3MESES\}/gi,  links?.['3meses']  || '')
      .replace(/\{LINK_6MESES\}/gi,  links?.['6meses']  || '')
    // Fallback sem chaves
    msg = msg
      .replace(/NOME/gi,       cliente.nome        || '')
      .replace(/VENCIMENTO/gi, cliente.vencimento   || '')
      .replace(/SERVIDOR/gi,   cliente.servidor     || '')
    return msg
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
      if (!data.ok) return null
      const links = {}
      for (const l of data.links) {
        const link = l.link  // sem encurtador
        if      (l.plano.includes('1')) links['1mes']   = link
        else if (l.plano.includes('3')) links['3meses'] = link
        else if (l.plano.includes('6')) links['6meses'] = link
      }
      return links
    } catch { return null }
  }

  // ---- Envio via Evolution API ----

  const enviarTexto = async (telefone, mensagem) => {
    const numero = normalizarTelefone(telefone)
    return evoFetch(`/message/sendText/${INSTANCE}`, 'POST', {
      number: numero,
      text: mensagem,
    })
  }

  const enviarMidia = async (telefone, midiaUrl, midiaTipo, midiaNome, caption, modoEnvio, mensagem) => {
    const numero = normalizarTelefone(telefone)
    if (modoEnvio === 'separado' && mensagem?.trim()) {
      await enviarTexto(telefone, mensagem)
      await sleep(1000)
    }
    if (midiaTipo === 'imagem') {
      return evoFetch(`/message/sendMedia/${INSTANCE}`, 'POST', {
        number: numero,
        mediatype: 'image',
        media: midiaUrl,
        caption: modoEnvio !== 'separado' ? (caption || '') : '',
      })
    } else if (midiaTipo === 'audio') {
      return evoFetch(`/message/sendMedia/${INSTANCE}`, 'POST', {
        number: numero,
        mediatype: 'audio',
        media: midiaUrl,
      })
    } else if (midiaTipo === 'video') {
      return evoFetch(`/message/sendMedia/${INSTANCE}`, 'POST', {
        number: numero,
        mediatype: 'video',
        media: midiaUrl,
        caption: modoEnvio !== 'separado' ? (caption || '') : '',
      })
    } else {
      return evoFetch(`/message/sendMedia/${INSTANCE}`, 'POST', {
        number: numero,
        mediatype: 'document',
        media: midiaUrl,
        fileName: midiaNome || 'arquivo',
        caption: caption || '',
      })
    }
  }

  const isReady = async () => {
    try {
      const data = await evoFetch(`/instance/fetchInstances`)
      const inst = Array.isArray(data) ? data.find(i => i.name === INSTANCE) : data
      return inst?.connectionStatus === 'open'
    } catch { return false }
  }

  // ---- Config ----

  const configPadrao = {
    horario: '09:00',
    ativo: true,
    intervaloMs: 5000,
    regras: {
      dias7: { ativo: true, mensagem: 'Olá NOME! Seu serviço no servidor SERVIDOR vence em 7 dias VENCIMENTO. Renove para não perder o acesso!' },
      dias4: { ativo: true, mensagem: 'Olá NOME! Seu serviço no servidor SERVIDOR vence em 4 dias VENCIMENTO. Não deixe para última hora!' },
      dia0:  { ativo: true, mensagem: 'Olá NOME! Seu serviço no servidor SERVIDOR vence hoje VENCIMENTO. Renove agora!' },
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

  const MAX_TENTATIVAS = 3
  const BASE_DELAY_MS  = 60000

  const processarFila = async () => {
    const pronto = await isReady()
    if (!pronto || processandoFila) return
    processandoFila = true
    try {
      const agora     = admin.firestore.Timestamp.now()
      const config    = await getConfig()
      const intervalo = config.intervaloMs ?? 5000
      const snap      = await db.collection('filaEnvios')
        .where('status',           '==', 'pendente')
        .where('proximaTentativa', '<',  agora)
        .orderBy('proximaTentativa')
        .limit(10).get()
      if (snap.empty) return
      console.log(`Processando ${snap.size} itens da fila...`)
      for (const docSnap of snap.docs) {
        const pronto2 = await isReady()
        if (!pronto2) { console.log('Evolution API desconectou, pausando fila.'); break }
        const item = docSnap.data()
        const ref  = docSnap.ref
        await ref.update({ status: 'enviando' })
        try {
          if (item.clienteId && item.gatilho && await jaEnviouHoje(item.clienteId, item.gatilho)) {
            await ref.update({ status: 'enviado', enviadoEm: admin.firestore.FieldValue.serverTimestamp(), erro: null })
            console.log('Duplicata detectada na fila, ignorando: ' + item.clienteNome + ' ' + item.gatilho)
            await sleep(500)
            continue
          }
          if (item.midiaUrl && item.midiaTipo) {
            await enviarMidia(item.telefone, item.midiaUrl, item.midiaTipo, item.midiaNome, item.mensagem, item.modoEnvio || 'junto', item.mensagem)
          } else {
            await enviarTexto(item.telefone, item.mensagem)
          }
          await ref.update({ status: 'enviado', enviadoEm: admin.firestore.FieldValue.serverTimestamp(), erro: null })
          await salvarLog(item.clienteNome || '', item.telefone, item.gatilho || 'manual', item.mensagem, 'enviado')
          if (item.clienteId && item.gatilho) {
            await db.collection('notificacoesEnviadas').add({
              clienteId: item.clienteId,
              gatilho:   item.gatilho,
              data:      new Date().toISOString().split('T')[0],
              enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
            })
          }
          console.log(`[FILA] ✅ Enviado para ${item.clienteNome} (${item.telefone})`)
          await sleep(intervalo)
        } catch (err) {
          console.error(`[FILA] ❌ Erro ao enviar para ${item.clienteNome}:`, err.message)
          const tentativas = (item.tentativas || 0) + 1
          if (tentativas >= MAX_TENTATIVAS) {
            await ref.update({ status: 'erro', erro: err.message, tentativas })
          } else {
            const proxima = new Date(Date.now() + BASE_DELAY_MS * tentativas)
            await ref.update({
              status: 'pendente',
              tentativas,
              erro: err.message,
              proximaTentativa: admin.firestore.Timestamp.fromDate(proxima),
            })
          }
        }
      }
    } finally {
      processandoFila = false
    }
  }

  // ---- Envio Automático ----

  const executarEnvioAutomatico = async () => {
    if (cronRodando) { console.log('Envio automático já em execução, ignorando disparo duplicado.'); return }
    cronRodando = true
    console.log('Iniciando envio automático...')
    const config = await getConfig()
    if (!config.ativo) { console.log('Envio automático desativado.'); cronRodando = false; return }
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

    for (const cliente of clientes) {
      if (!cliente.telefone) continue
      if (cliente.responsavel?.trim()) continue
      const diff = diffDias(cliente.vencimento)
      if (diff === null) continue

      const telResp = cliente.telefone
      const pontos  = clientes.filter(c => (c.responsavel?.trim() || c.telefone) === telResp)

      for (const { key, diff: diffAlvo } of regrasMap) {
        const algumVence = pontos.some(p => {
          const d = diffDias(p.vencimento)
          return d !== null && d === diffAlvo
        })
        if (!algumVence) continue
        const regra = config.regras?.[key]
        if (!regra?.ativo) continue

        let mensagemFinal
        if (pontos.length > 1) {
          let pontosTexto = ''
          for (const p of pontos) {
            const links = await gerarLinksCliente(p)
            const venc  = p.vencimento || '—'
            const fmt   = (v, fb) => v ? `R$ ${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.',',')}` : fb
            const cv1   = fmt(p.valor, 'R$ 35,00')
            const cv3   = fmt(p.valor3meses, 'R$ 95,00')
            const cv6   = fmt(p.valor6meses, 'R$ 170,00')
            pontosTexto += `\n📺 *${p.nome}* — vence ${venc}\n`
            if (links) {
              pontosTexto += `💰 1 Mês — ${cv1}: ${links['1mes'] || ''}\n`
              pontosTexto += `💰 3 Meses — ${cv3}: ${links['3meses'] || ''}\n`
              pontosTexto += `💰 6 Meses — ${cv6}: ${links['6meses'] || ''}\n`
            }
          }
          const fmtV = (v, fb) => v ? `R$ ${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.',',')}` : fb
          const msgBase = regra.mensagem
            .replace(/\{NOME\}/gi, cliente.nome).replace(/NOME/gi, cliente.nome)
            .replace(/\{VENCIMENTO\}/gi, cliente.vencimento || '').replace(/VENCIMENTO/gi, cliente.vencimento || '')
            .replace(/\{SERVIDOR\}/gi, cliente.servidor || '').replace(/SERVIDOR/gi, cliente.servidor || '')
            .replace(/\{VALOR_3MESES\}/gi, fmtV(cliente.valor3meses, 'R$ 95,00'))
            .replace(/\{VALOR_6MESES\}/gi, fmtV(cliente.valor6meses, 'R$ 170,00'))
            .replace(/\{VALOR\}/gi, fmtV(cliente.valor, 'R$ 35,00'))
            .replace(/\{LINK_1MES\}/gi, '').replace(/\{LINK_3MESES\}/gi, '').replace(/\{LINK_6MESES\}/gi, '')
          mensagemFinal = msgBase + '\n' + pontosTexto
        } else {
          mensagemFinal = await formatarMensagem(regra.mensagem, cliente)
        }

        await db.collection('filaEnvios').add({
          clienteId:        cliente.id,
          clienteNome:      cliente.nome,
          telefone:         cliente.telefone,
          mensagem:         mensagemFinal,
          midiaUrl:         regra.midiaUrl    || null,
          midiaTipo:        regra.midiaTipo   || null,
          midiaNome:        regra.midiaNome   || null,
          modoEnvio:        regra.modoEnvio   || 'junto',
          gatilho:          key,
          status:           'pendente',
          tentativas:       0,
          maxTentativas:    MAX_TENTATIVAS,
          criadoEm:         admin.firestore.FieldValue.serverTimestamp(),
          proximaTentativa: admin.firestore.Timestamp.now(),
          enviadoEm:        null,
          erro:             null,
        })
        adicionados++
        console.log(`[AUTO] Enfileirado: ${cliente.nome} (${key})`)
      }
    }
    console.log(`Envio automático concluído. ${adicionados} mensagens enfileiradas.`)
    cronRodando = false
  }

  // ---- enviarMensagemRenovacao ----

  const enviarMensagemRenovacao = async (telefone, dados) => {
    if (!telefone) return
    try {
      const snap = await db.collection('config_whatsapp').doc('template_renovacao').get()
      let template = snap.exists
        ? snap.data().mensagem
        : `✅ *Renovação realizada!*\n\nSeu serviço foi renovado com sucesso.\n\n📋 *Seus dados de acesso:*\n👤 Usuário: *{usuario}*\n🔑 Senha: *{senha}*\n📅 Válido até: *{vencimento}*\n\nEm caso de dúvidas, fale comigo! 😊`

      const mensagem = template
        .replace(/\{nome\}/g, dados.nome ?? '')
        .replace(/\{usuario\}/g, dados.usuario ?? '')
        .replace(/\{senha\}/g, dados.senha ?? '')
        .replace(/\{vencimento\}/g, dados.vencimento ?? '')

      const midiaUrl  = snap.exists ? (snap.data().midiaUrl  || null) : null
      const midiaTipo = snap.exists ? (snap.data().midiaTipo || null) : null
      const midiaNome = snap.exists ? (snap.data().midiaNome || null) : null
      const modoEnvio = snap.exists ? (snap.data().modoEnvio || 'junto') : 'junto'

      // Sempre usa fila para garantir entrega
      await db.collection('filaEnvios').add({
        clienteNome: dados.nome ?? '', nome: dados.nome ?? '', telefone, mensagem,
        midiaUrl, midiaTipo, midiaNome, modoEnvio,
        status: 'pendente', gatilho: 'renovacao',
        tentativas: 0, maxTentativas: MAX_TENTATIVAS,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        proximaTentativa: admin.firestore.Timestamp.now(),
        enviadoEm: null, erro: null,
      })
      console.log(`[WA] 📋 Renovação na fila: ${dados.nome}`)
    } catch (err) {
      console.error('[WA] Erro msg renovação:', err.message)
    }
  }

  // ---- Cron ----

  cron.schedule('*/10 * * * * *', processarFila, { timezone: 'America/Sao_Paulo' })

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

  // ---- Rotas ----

  router.get('/status', async (req, res) => {
    try {
      const data = await evoFetch(`/instance/fetchInstances`)
      const inst = Array.isArray(data) ? data.find(i => i.name === INSTANCE) : data
      const ready = inst?.connectionStatus === 'open'
      res.json({ ready, numero: inst?.ownerJid || 'Não detectado', qr: null })
    } catch {
      res.json({ ready: false, numero: 'Erro', qr: null })
    }
  })

  router.post('/send', async (req, res) => {
    const { phone, message, cliente } = req.body
    try {
      const msg = cliente ? await formatarMensagem(message, cliente) : message
      await enviarTexto(phone, msg)
      res.json({ success: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/send-midia', async (req, res) => {
    const { phone, mediaUrl, mediaTipo, mediaNome, caption } = req.body
    if (!mediaUrl || !mediaTipo) return res.status(400).json({ error: 'mediaUrl e mediaTipo são obrigatórios' })
    try {
      await enviarMidia(phone, mediaUrl, mediaTipo, mediaNome, caption, 'junto', null)
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

  // ---- Fila ----

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
        let pontosTexto = ''
        for (const p of pontos) {
          const links = await gerarLinksCliente(p)
          const venc  = p.vencimento || '—'
          const fmt   = (v, fb) => v ? `R$ ${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.',',')}` : fb
          const val1  = fmt(p.valor, 'R$ 35,00')
          const val3  = fmt(p.valor3meses, 'R$ 95,00')
          const val6  = fmt(p.valor6meses, 'R$ 170,00')
          pontosTexto += `\n📺 *${p.nome}* — vence ${venc}\n`
          if (links) {
            pontosTexto += `💰 1 Mês — ${val1}: ${links['1mes'] || '(indisponível)'}\n`
            pontosTexto += `💰 3 Meses — ${val3}: ${links['3meses'] || '(indisponível)'}\n`
            pontosTexto += `💰 6 Meses — ${val6}: ${links['6meses'] || '(indisponível)'}\n`
          }
        }
        const fmtV2 = (v, fb) => v ? `R$ ${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.',',')}` : fb
        const msgBase = cliente
          ? mensagem
            .replace(/\{NOME\}/gi, cliente.nome).replace(/NOME/gi, cliente.nome)
            .replace(/\{VENCIMENTO\}/gi, cliente.vencimento || '').replace(/VENCIMENTO/gi, cliente.vencimento || '')
            .replace(/\{SERVIDOR\}/gi, cliente.servidor || '').replace(/SERVIDOR/gi, cliente.servidor || '')
            .replace(/\{VALOR_3MESES\}/gi, fmtV2(cliente.valor3meses, 'R$ 95,00'))
            .replace(/\{VALOR_6MESES\}/gi, fmtV2(cliente.valor6meses, 'R$ 170,00'))
            .replace(/\{VALOR\}/gi, fmtV2(cliente.valor, 'R$ 35,00'))
            .replace(/\{LINK_1MES\}/gi, '').replace(/\{LINK_3MESES\}/gi, '').replace(/\{LINK_6MESES\}/gi, '')
          : mensagem
        mensagemFinal = msgBase + '\n' + pontosTexto
      } else if (cliente) {
        mensagemFinal = await formatarMensagem(mensagem, cliente)
      } else {
        mensagemFinal = mensagem
      }

      await db.collection('filaEnvios').add({
        clienteId:        clienteId || null,
        clienteNome:      clienteNome || '',
        telefone, mensagem: mensagemFinal,
        midiaUrl:         midiaUrl  || null,
        midiaTipo:        midiaTipo || null,
        midiaNome:        midiaNome || null,
        modoEnvio:        modoEnvio || 'junto',
        gatilho:          gatilho   || 'manual',
        status:           'pendente',
        tentativas:       0,
        maxTentativas:    MAX_TENTATIVAS,
        criadoEm:         admin.firestore.FieldValue.serverTimestamp(),
        proximaTentativa: admin.firestore.Timestamp.now(),
        enviadoEm:        null,
        erro:             null,
      })
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/fila/cancelar/:id', async (req, res) => {
    try {
      await db.collection('filaEnvios').doc(req.params.id).update({ status: 'cancelado' })
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.delete('/fila/limpar', async (req, res) => {
    try {
      const snap = await db.collection('filaEnvios')
        .where('status', 'in', ['enviado', 'erro', 'cancelado']).limit(500).get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      res.json({ ok: true, removidos: snap.size })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // ---- QR / Logout ----

  router.get('/qr', async (req, res) => {
    res.json({ message: 'Use o Evolution Manager para gerenciar a conexão', url: `${EVOLUTION_URL}/manager` })
  })

  router.post('/logout', async (req, res) => {
    try {
      await evoFetch(`/instance/logout/${INSTANCE}`, 'DELETE')
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // ---- Inicializar ----

  const inicializar = async () => {
    await iniciarCron()
    console.log('[WA] Evolution API configurada. Instância:', INSTANCE)
    const pronto = await isReady()
    console.log('[WA] Status:', pronto ? '✅ Conectado' : '⚠️ Desconectado')
  }

  // Mantém compatibilidade com server.js que usa getSock e isReady
  const getSock = () => null

  return { router, inicializar, enviarMensagemRenovacao, getSock, isReady: () => isReady() }
}