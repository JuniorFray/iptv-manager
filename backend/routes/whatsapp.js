import express from 'express'
import cron from 'node-cron'

/**
 * Módulo WhatsApp — Evolution API
 * Substitui o Baileys por chamadas REST para a Evolution API
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-b45b.up.railway.app'
const EVOLUTION_KEY  = process.env.EVOLUTION_API_KEY  || 'iptv123manager456'
const INSTANCE       = process.env.EVOLUTION_INSTANCE  || 'conectatv'

const evoFetch = async (path, method = 'GET', body = null, tentativas = 3) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    signal: AbortSignal.timeout(30000),
  }
  if (body) opts.body = JSON.stringify(body)
  let ultimoErro
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(`${EVOLUTION_URL}${path}`, opts)
      return res.json()
    } catch (err) {
      ultimoErro = err
      console.warn(`[EVO] fetch falhou (tentativa ${i+1}/${tentativas}): ${err.message}`)
      if (i < tentativas - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)))
    }
  }
  throw ultimoErro
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

  const formatarMensagem = async (template, cliente, cupomCodigo) => {
    const fmtValor = v => v ? `R$ ${parseFloat(String(v).replace(',','.')).toFixed(2).replace('.', ',')}` : ''
    const v3 = cliente.valor3meses || '95.00'
    const v6 = cliente.valor6meses || '170.00'
    const links = await gerarLinksCliente(cliente, cupomCodigo)
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
    // Substitui variáveis de cupom se cupomCodigo informado
    if (cupomCodigo) {
      try {
        const cSnap = await db.collection('cupons').doc(cupomCodigo.toUpperCase()).get()
        if (cSnap.exists && cSnap.data().ativo) {
          const c = cSnap.data()
          const v1 = parseFloat(String(cliente.valor || '35').replace(',', '.')) || 35
          const desc  = c.tipo === '%' ? v1 * c.valor / 100 : c.valor
          const final = Math.max(0, v1 - desc)
          const fmt   = (n) => Number(n).toFixed(2).replace('.', ',')
          msg = msg
            .replace(/{CUPOM}/gi,             c.codigo || '')
            .replace(/{DESCONTO}/gi,           'R$ ' + fmt(desc))
            .replace(/{VALOR_COM_DESCONTO}/gi, 'R$ ' + fmt(final))
            .replace(/{VALIDADE_CUPOM}/gi,     c.validade || '')
        }
      } catch (e) { console.warn('[FORMAT] erro cupom vars:', e.message) }
    } else {
      msg = msg
        .replace(/{CUPOM}/gi, '').replace(/{DESCONTO}/gi, '')
        .replace(/{VALOR_COM_DESCONTO}/gi, '').replace(/{VALIDADE_CUPOM}/gi, '')
    }

    // Fallback sem chaves
    msg = msg
      .replace(/NOME/gi,       cliente.nome        || '')
      .replace(/VENCIMENTO/gi, cliente.vencimento   || '')
      .replace(/SERVIDOR/gi,   cliente.servidor     || '')
    return msg
  }

  const gerarLinksCliente = async (cliente, cupomCodigo) => {
    try {
      const BACKEND = 'https://iptv-manager-production.up.railway.app'
      const res = await fetch(`${BACKEND}/pagamento/criar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: cliente.id, clienteNome: cliente.nome,
          telefone: cliente.telefone, servidor: cliente.servidor,
          usuario: cliente.usuario, senha: cliente.senha,
          valor: cliente.valor, valor3meses: cliente.valor3meses, valor6meses: cliente.valor6meses,
          cupomCodigo: cupomCodigo || undefined,
        })
      })
      const data = await res.json()
      console.log('[LINKS] resposta pagamento:', JSON.stringify(data).substring(0,200))
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
    if (processandoFila) return   // check síncrono ANTES de qualquer await
    processandoFila = true        // lock in-memory (protege instância única)
    try {
      const pronto = await isReady()
      if (!pronto) return

      // Reset de itens presos em "enviando" há mais de 5 minutos
      const cincoMinAtras = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000))
      const presosSnap = await db.collection('filaEnvios')
        .where('status', '==', 'enviando')
        .where('proximaTentativa', '<', cincoMinAtras)
        .limit(20).get()
      if (!presosSnap.empty) {
        const batch = db.batch()
        presosSnap.docs.forEach(d => batch.update(d.ref, {
          status: 'pendente',
          proximaTentativa: admin.firestore.Timestamp.now(),
        }))
        await batch.commit()
        console.log(`[FILA] ♻️ ${presosSnap.size} itens presos em "enviando" resetados para "pendente"`)
      }

      const agora      = admin.firestore.Timestamp.now()
      const config     = await getConfig()
      const intervaloMin = config.intervaloMin ?? config.intervaloMs ?? 5000
      const intervaloMax = config.intervaloMax ?? intervaloMin
      const snap      = await db.collection('filaEnvios')
        .where('status',           '==', 'pendente')
        .where('proximaTentativa', '<',  agora)
        .orderBy('proximaTentativa')
        .limit(10).get()
      if (snap.empty) return

      // Claim atômico — apenas uma instância processa cada item,
      // mesmo com múltiplos processos rodando (Railway zero-downtime deploy)
      const claimed = []
      for (const docSnap of snap.docs) {
        try {
          await db.runTransaction(async t => {
            const fresh = await t.get(docSnap.ref)
            if (!fresh.exists || fresh.data().status !== 'pendente') {
              throw new Error('already_claimed')
            }
            t.update(docSnap.ref, { status: 'enviando' })
          })
          claimed.push(docSnap)
        } catch (e) {
          if (e.message !== 'already_claimed') console.warn('[FILA] Claim err:', e.message)
          // outro processo já pegou este item — pula
        }
      }

      if (claimed.length === 0) return
      console.log(`Processando ${claimed.length} itens da fila...`)

      for (const docSnap of claimed) {
        const pronto2 = await isReady()
        if (!pronto2) {
          // Devolve itens não processados para pendente
          console.log('Evolution API desconectou, pausando fila.')
          await docSnap.ref.update({ status: 'pendente', proximaTentativa: admin.firestore.Timestamp.now() })
          break
        }
        const item = docSnap.data()
        const ref  = docSnap.ref
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
          const espera = intervaloMin === intervaloMax
            ? intervaloMin
            : Math.floor(Math.random() * (intervaloMax - intervaloMin + 1)) + intervaloMin
          console.log(`[FILA] ⏱ Aguardando ${(espera/1000).toFixed(1)}s antes do próximo...`)
          await sleep(espera)
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


  // Remove linhas de preço e link do template para multi-ponto
  const stripLinksDoTemplate = (template) => {
    const linhas = template.split('\n')
    const remover = new Set()
    for (let i = 0; i < linhas.length; i++) {
      if (/\{LINK_(1MES|3MESES|6MESES)\}/i.test(linhas[i])) {
        remover.add(i)           // remove linha {LINK_*}
        if (i > 0) remover.add(i - 1) // remove linha de preço acima
      }
    }
    return linhas.filter((_, i) => !remover.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }
  const executarEnvioAutomatico = async () => {
    if (cronRodando) { console.log('Envio automático já em execução, ignorando disparo duplicado.'); return }
    cronRodando = true
    console.log('Iniciando envio automático...')
    try {
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
    const jaEnfileirado = new Set() // rastreia telefone+gatilho neste ciclo

    for (const cliente of clientes) {
      if (!cliente.telefone) continue
      if (cliente.status === 'inativo') continue   // não envia para inativos
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
            const links = await gerarLinksCliente(p)  // auto-send sem cupom (cupom é só manual)
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
          const msgBase = stripLinksDoTemplate(regra.mensagem)
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

        // Previne duplicata no mesmo ciclo (mesmo telefone+gatilho)
        const chaveEnfila = `${cliente.telefone}|${key}`
        if (jaEnfileirado.has(chaveEnfila)) continue
        if (cliente.id && await jaEnviouHoje(cliente.id, key)) {
          console.log(`[AUTO] Já enviado hoje, pulando: ${cliente.nome} (${key})`)
          continue
        }
        jaEnfileirado.add(chaveEnfila)

        // Evita duplicata se ja existe item pendente/enviando na fila para este cliente+gatilho
        const filaPendente = await db.collection('filaEnvios')
          .where('clienteId', '==', cliente.id)
          .where('gatilho',   '==', key)
          .where('status',    'in', ['pendente', 'enviando'])
          .limit(1).get()
        if (!filaPendente.empty) {
          console.log(`[AUTO] Ja na fila, pulando: ${cliente.nome} (${key})`)
          continue
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
    } finally {
      cronRodando = false
    }
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
        .replace(/\{nome\}/gi, dados.nome ?? '')
        .replace(/\{usuario\}/gi, dados.usuario ?? '')
        .replace(/\{senha\}/gi, dados.senha ?? '')
        .replace(/\{vencimento\}/gi, dados.vencimento ?? '')

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

  // Restart automático da instância a cada 6 horas para manter conexão estável
  cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('[WA] 🔄 Restart automático da instância...')
      await evoFetch(`/instance/restart/${INSTANCE}`, 'POST')
      console.log('[WA] ✅ Restart enviado')
    } catch (e) {
      console.error('[WA] ❌ Erro no restart automático:', e.message)
    }
  }, { timezone: 'America/Sao_Paulo' })

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

      // Busca QR quando desconectado
      let qr = null
      if (!ready) {
        try {
          const conn = await evoFetch(`/instance/connect/${INSTANCE}`)
          // Evolution API retorna base64 direto ou dentro de .base64
          const raw = conn?.base64 ?? conn?.qrcode?.base64 ?? conn?.code ?? null
          if (raw) qr = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`
        } catch { /* ignora erro de QR */ }
      }

      res.json({ ready, numero: inst?.ownerJid || 'Não detectado', qr })
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
      const { clienteId, clienteNome, telefone, mensagem, gatilho, midiaUrl, midiaTipo, midiaNome, modoEnvio, cliente, pontos, cupomCodigo } = req.body
      if (!telefone || !mensagem) return res.status(400).json({ error: 'telefone e mensagem obrigatórios' })

      let mensagemFinal
      if (pontos && pontos.length > 1) {
        let pontosTexto = ''
        for (const p of pontos) {
          const links = await gerarLinksCliente(p, cupomCodigo)
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
        mensagemFinal = await formatarMensagem(mensagem, cliente, cupomCodigo)
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

  // Rotas no formato /fila/:id/acao (usado pelo frontend)
  router.post('/fila/:id/cancelar', async (req, res) => {
    try {
      await db.collection('filaEnvios').doc(req.params.id).update({ status: 'cancelado' })
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/fila/:id/retry', async (req, res) => {
    try {
      await db.collection('filaEnvios').doc(req.params.id).update({
        status: 'pendente',
        tentativas: 0,
        erro: null,
        proximaTentativa: admin.firestore.Timestamp.now(),
      })
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/fila/limpar', async (req, res) => {
    try {
      const snap = await db.collection('filaEnvios')
        .where('status', 'in', ['enviado', 'erro', 'cancelado']).limit(500).get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      res.json({ ok: true, removidos: snap.size })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.delete('/logs', async (req, res) => {
    try {
      const snap = await db.collection('logswhatsapp').limit(500).get()
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
    try {
      const snap = await db.collection('filaEnvios').where('status', '==', 'enviando').get()
      if (!snap.empty) {
        const batch = db.batch()
        snap.docs.forEach(d => batch.update(d.ref, { status: 'pendente', proximaTentativa: admin.firestore.Timestamp.now() }))
        await batch.commit()
        console.log(`[WA] ${snap.size} itens resetados de "enviando" para "pendente"`)
      }
    } catch (e) { console.error('[WA] Erro ao resetar fila:', e.message) }
  }

  // Mantém compatibilidade com server.js que usa getSock e isReady
  const getSock = () => null

  
  // ── Follow-up: contatos WA não cadastrados ─────────────────────────────────
  router.get('/followup/contatos', async (req, res) => {
    try {
      // Busca chats (conversas reais) e contatos (nomes)
      const [dataChats, dataContatos] = await Promise.all([
        evoFetch(`/chat/findChats/${INSTANCE}`, 'POST', {}),
        evoFetch(`/chat/findContacts/${INSTANCE}`, 'POST', {}),
      ])
      const chats    = Array.isArray(dataChats)    ? dataChats    : []
      const contatos = Array.isArray(dataContatos) ? dataContatos : []

      // Mapa de telefone → nome dos contatos
      const nomeMap = new Map()
      for (const c of contatos) {
        const jid = c.remoteJid || ''
        if (!jid.includes('@s.whatsapp.net')) continue
        const tel = normalizarTelefone(jid.replace('@s.whatsapp.net', ''))
        if (tel && c.pushName) nomeMap.set(tel, c.pushName)
      }

      // Clientes já cadastrados — gera variantes com e sem o 9 extra (reforma BR)
      const snap = await db.collection('clientes').get()
      const cadastrados = new Set()
      snap.docs.forEach(d => {
        const tel = normalizarTelefone(d.data().telefone || '')
        cadastrados.add(tel)
        // variante sem o 9 extra (13 → 12 digitos): 55 + DDD(2) + 9 + XXXXXXXX → 55 + DDD + XXXXXXXX
        if (tel.length === 13 && tel.startsWith('55')) {
          const semNove = tel.substring(0, 4) + tel.substring(5) // remove o 5º dígito (o 9)
          cadastrados.add(semNove)
        }
        // variante com o 9 extra (12 → 13 digitos)
        if (tel.length === 12 && tel.startsWith('55')) {
          const comNove = tel.substring(0, 4) + '9' + tel.substring(4)
          cadastrados.add(comNove)
        }
      })

      // Filtra chats individuais não cadastrados
      const vistos = new Set()
      const resultado = chats
        .filter(c => {
          const jid = c.remoteJid || ''
          if (!jid.includes('@s.whatsapp.net')) return false
          const tel = normalizarTelefone(jid.replace('@s.whatsapp.net', ''))
          if (!tel || tel.length < 10 || cadastrados.has(tel) || vistos.has(tel)) return false
          vistos.add(tel)
          return true
        })
        .map(c => {
          const tel = normalizarTelefone(c.remoteJid.replace('@s.whatsapp.net', ''))
          return { nome: nomeMap.get(tel) || c.name || 'Sem nome', telefone: tel }
        })
        .sort((a, b) => a.nome.localeCompare(b.nome))
      res.json({ ok: true, total: resultado.length, contatos: resultado })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  router.post('/followup/enviar', async (req, res) => {
    try {
      const { contatos, mensagens } = req.body
      if (!contatos?.length || !mensagens?.length) return res.status(400).json({ error: 'campos obrigatorios' })
      const msgs = mensagens.filter(m => m?.trim())
      if (!msgs.length) return res.status(400).json({ error: 'ao menos uma mensagem' })
      let enfileirados = 0
      const agora = new Date().toISOString()
      for (const c of contatos) {
        const phone = normalizarTelefone(c.telefone)
        if (!phone) continue
        const msg = msgs[Math.floor(Math.random() * msgs.length)]
        await db.collection('filaEnvios').add({
          clienteNome: c.nome || 'Contato', telefone: phone,
          mensagem: msg.replace(/\{NOME\}/gi, c.nome || ''),
          midiaUrl: null, midiaTipo: null, gatilho: 'followup',
          status: 'pendente',
          tentativas: 0,
          maxTentativas: 3,
          proximaTentativa: admin.firestore.Timestamp.now(),
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
        await db.collection('followupEnviados').doc(phone).set({
          telefone: phone, nome: c.nome || 'Contato', enviadoEm: agora
        })
        enfileirados++
      }
      res.json({ ok: true, enfileirados })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Envia enquete via Evolution API
  router.post('/send/poll', async (req, res) => {
    try {
      const { phone, titulo, opcoes, selectableCount } = req.body
      if (!phone || !titulo || !opcoes?.length) return res.status(400).json({ error: 'phone, titulo e opcoes sao obrigatorios' })
      const num = normalizarTelefone(phone)
      const result = await evoFetch('/message/sendPoll/' + INSTANCE, 'POST', {
        number: num,
        name: titulo,
        values: opcoes,
        selectableCount: selectableCount ?? 1,
      })
      console.log('[POLL] Resposta completa do envio:', JSON.stringify(result))
      res.json({ ok: true, result })
    } catch (e) {
      console.error('[POLL]', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  // ── PESQUISAS (numeradas, com captura de resposta) ──
  router.post('/pesquisa/criar', async (req, res) => {
    try {
      const { titulo, opcoes } = req.body
      if (!titulo?.trim() || !opcoes?.length || opcoes.length < 2) return res.status(400).json({ error: 'titulo e opcoes (min 2) sao obrigatorios' })
      const resultado = {}
      opcoes.forEach(o => { resultado[o.trim()] = 0 })
      const ref = await db.collection('pesquisas').add({
        titulo: titulo.trim(),
        opcoes: opcoes.map(o => o.trim()),
        totalEnviado: 0,
        totalRespondido: 0,
        resultado,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      })
      res.json({ ok: true, id: ref.id })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/pesquisa/enviar', async (req, res) => {
    try {
      const { pesquisaId, phone } = req.body
      if (!pesquisaId || !phone) return res.status(400).json({ error: 'pesquisaId e phone sao obrigatorios' })
      const pesqDoc = await db.collection('pesquisas').doc(pesquisaId).get()
      if (!pesqDoc.exists) return res.status(404).json({ error: 'Pesquisa nao encontrada' })
      const { titulo, opcoes } = pesqDoc.data()
      const num   = normalizarTelefone(phone)
      const texto = `📋 ${titulo}\n\n${opcoes.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nResponda só com o número da opção 👆`
      await enviarTexto(phone, texto)
      await db.collection('pesquisaAguardando').doc(num).set({
        pesquisaId, opcoes,
        enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
      })
      await db.collection('pesquisas').doc(pesquisaId).update({ totalEnviado: admin.firestore.FieldValue.increment(1) })
      res.json({ ok: true })
    } catch (e) {
      console.error('[PESQUISA] erro enviar:', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  router.get('/pesquisa/listar', async (req, res) => {
    try {
      const snap = await db.collection('pesquisas').orderBy('criadoEm', 'desc').get()
      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/pesquisa/:id', async (req, res) => {
    try {
      const id = req.params.id
      await db.collection('pesquisas').doc(id).delete()
      const aguardSnap = await db.collection('pesquisaAguardando').where('pesquisaId', '==', id).get()
      const batch = db.batch()
      aguardSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Webhook Evolution API - votos de enquete
  router.post('/webhook/whatsapp', async (req, res) => {
    res.sendStatus(200)
    try {
      const body = req.body
      // DEBUG - loga tudo que chega
      console.log('[WEBHOOK] evento:', body?.event, '| keys:', Object.keys(body || {}).join(','))
      if (body?.data) console.log('[WEBHOOK] data FULL:', JSON.stringify(body.data))
      const msgs = body?.data?.messages ?? (Array.isArray(body?.data) ? body.data : [])
      for (const msg of msgs) {
        console.log('[WEBHOOK] msg type:', msg?.messageType, '| keys:', Object.keys(msg?.message || {}).join(','))
        // Captura de resposta de pesquisa (numero ou texto da opcao)
        if (!msg.key?.fromMe) {
          const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim()
          const telefoneResp = (msg.key?.remoteJid || '').replace('@s.whatsapp.net', '').replace(/\D/g, '')
          if (texto && telefoneResp) {
            try {
              const aguardDoc = await db.collection('pesquisaAguardando').doc(telefoneResp).get()
              if (aguardDoc.exists) {
                const { pesquisaId, opcoes } = aguardDoc.data()
                const normalizar = (str) => String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
                const textoNorm = normalizar(texto)
                let opcaoEscolhida = null
                const numMatch = texto.match(/\d+/)
                if (numMatch) {
                  const idx = parseInt(numMatch[0], 10) - 1
                  if (idx >= 0 && idx < opcoes.length) opcaoEscolhida = opcoes[idx]
                }
                if (!opcaoEscolhida) {
                  opcaoEscolhida = opcoes.find(o => {
                    const oNorm = normalizar(o)
                    return textoNorm.includes(oNorm) || oNorm.includes(textoNorm)
                  })
                }
                if (opcaoEscolhida) {
                  const pesqRef = db.collection('pesquisas').doc(pesquisaId)
                  await db.runTransaction(async t => {
                    const pSnap = await t.get(pesqRef)
                    if (!pSnap.exists) return
                    const data = pSnap.data()
                    const novoResultado = { ...data.resultado }
                    novoResultado[opcaoEscolhida] = (novoResultado[opcaoEscolhida] || 0) + 1
                    t.update(pesqRef, { totalRespondido: admin.firestore.FieldValue.increment(1), resultado: novoResultado })
                  })
                  await aguardDoc.ref.delete()
                  console.log(`[PESQUISA] Voto registrado: ${telefoneResp} -> "${opcaoEscolhida}"`)
                }
              }
            } catch (e) { console.error('[PESQUISA] erro ao processar resposta:', e.message) }
          }
        }
        const poll = msg?.message?.pollUpdateMessage
        if (!poll) continue
        const votante   = (msg.key?.remoteJid || '').replace('@s.whatsapp.net', '')
        const enqueteId = poll.pollCreationMessageKey?.id || ''
        const opcoes    = poll.vote?.selectedOptions || []
        if (!enqueteId || !votante) continue
        console.log('[WEBHOOK] Voto:', enqueteId, votante, opcoes)
        await db.collection('enqueteVotos').doc(enqueteId + '_' + votante).set(
          { enqueteId, votante, opcoes, votadoEm: new Date().toISOString() },
          { merge: true }
        )
      }
    } catch (e) { console.error('[WEBHOOK] Erro:', e.message) }
  })

    return { router, inicializar, enviarMensagemRenovacao, getSock, isReady: () => isReady() }
}