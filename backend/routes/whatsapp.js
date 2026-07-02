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
  let enviosDesdeUltimaPausa = 0

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
    if (midiaTipo === 'figurinha') {
      // Tenta enviar URL direto (Evolution API aceita URL no campo sticker)
      // Se for base64, manda direto; se for URL publica, manda a URL
      let stickerData = midiaUrl
      if (!midiaUrl.startsWith('data:') && !midiaUrl.startsWith('http')) {
        // fallback: converte via sharp
        try {
          const resp = await fetch(midiaUrl)
          const arrBuf = await resp.arrayBuffer()
          const webpBuffer = await sharp(Buffer.from(arrBuf)).resize(512, 512, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).webp({ lossless: true }).toBuffer()
          stickerData = `data:image/webp;base64,${webpBuffer.toString('base64')}`
        } catch(e) { console.error('[STICKER] erro conversao:', e.message) }
      }
      console.log(`[STICKER] Enviando para ${numero}, tipo: ${midiaUrl.startsWith('data:') ? 'base64' : 'url'}`)
      const result = await evoFetch(`/message/sendSticker/${INSTANCE}`, 'POST', {
        number: numero,
        sticker: stickerData,
      })
      console.log('[STICKER] resultado:', JSON.stringify(result))
      return result
    } else if (midiaTipo === 'imagem') {
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

  // ---- Controle de acesso por inadimplência em grupos ----
  const PKG_P2P_BRASIL18  = '646d1492db22a7b1bc518941'
  const PKG_P2P_VAZIO     = '64b9ce3689aaac1f86acb99b'
  const PKG_IPTV_BRASIL18 = 70
  const PKG_IPTV_SEM      = 103
  const PLAN_ID           = 2
  const WAREZ_BACKEND     = 'https://iptv-manager-production.up.railway.app'

  const calcularEstadoGrupo = (membros) => {
    const hoje = new Date(); hoje.setHours(0,0,0,0)
    const iptvVencidos = membros.filter(m => m.tipo?.toUpperCase() === 'IPTV' && (() => {
      const p = (m.vencimento || '').split('/'); if (p.length < 3) return false
      return new Date(Number(p[2]),Number(p[1])-1,Number(p[0])) < hoje
    })())
    const p2pVencido = membros.find(m => m.tipo?.toUpperCase() === 'P2P' && (() => {
      const p = (m.vencimento || '').split('/'); if (p.length < 3) return false
      return new Date(Number(p[2]),Number(p[1])-1,Number(p[0])) < hoje
    })())
    return {
      iptvVencidos: iptvVencidos.length,
      p2pVencido: !!p2pVencido,
      todosEmDia: iptvVencidos.length === 0 && !p2pVencido,
    }
  }

  const aplicarEstadoGrupo = async (nomeGrupo, membros) => {
    // Busca o ID da linha Warez pelo usuario compartilhado (qualquer membro serve)
    const usuarioGrupo = membros[0]?.usuario
    if (!usuarioGrupo) { console.log(`[GRUPO-CTRL] ${nomeGrupo}: usuario nao encontrado`); return }

    const buscar = await fetch(`${WAREZ_BACKEND}/painel/buscar-linha/${encodeURIComponent(usuarioGrupo)}`).then(r => r.json()).catch(() => null)
    if (!buscar?.ok) { console.log(`[GRUPO-CTRL] ${nomeGrupo}: linha nao encontrada na Warez`); return }
    const lineId = buscar.id

    const { iptvVencidos, p2pVencido, todosEmDia } = calcularEstadoGrupo(membros)

    let body = {}
    let descricao = ''

    if (todosEmDia) {
      // Restaura tudo
      body = { access: 2, package_iptv: PKG_IPTV_BRASIL18, package_p2p: PKG_P2P_BRASIL18, addons: [] }
      descricao = 'RESTAURADO (todos em dia)'
    } else if (iptvVencidos >= 2 && p2pVencido) {
      // Tudo vencido: sem conteúdo IPTV + sem P2P + 1 acesso
      body = { access: 1, package_iptv: PKG_IPTV_SEM, package_p2p: PKG_P2P_VAZIO, addons: [] }
      descricao = 'BLOQUEADO (2 IPTV + P2P vencidos)'
    } else if (iptvVencidos >= 2) {
      // 2 IPTV vencidos: sem conteúdo IPTV + 1 acesso (P2P ok)
      body = { access: 1, package_iptv: PKG_IPTV_SEM, package_p2p: PKG_P2P_BRASIL18, addons: [] }
      descricao = 'RESTRITO (2 IPTV vencidos, P2P ok)'
    } else if (iptvVencidos === 1 && p2pVencido) {
      // 1 IPTV + P2P vencidos
      body = { access: 1, package_iptv: PKG_IPTV_BRASIL18, package_p2p: PKG_P2P_VAZIO, addons: [] }
      descricao = 'RESTRITO (1 IPTV + P2P vencidos)'
    } else if (iptvVencidos === 1) {
      // 1 IPTV vencido: reduz para 1 acesso simultâneo
      body = { access: 1, package_iptv: PKG_IPTV_BRASIL18, package_p2p: PKG_P2P_BRASIL18, addons: [] }
      descricao = 'RESTRITO (1 IPTV vencido)'
    } else if (p2pVencido) {
      // Só P2P vencido: pacote P2P vazio
      body = { access: 2, package_iptv: PKG_IPTV_BRASIL18, package_p2p: PKG_P2P_VAZIO, addons: [] }
      descricao = 'RESTRITO (P2P vencido)'
    }

    if (Object.keys(body).length === 0) return

    const resp = await fetch(`${WAREZ_BACKEND}/painel/manage-plan/${lineId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))

    console.log(`[GRUPO-CTRL] ${nomeGrupo}: ${descricao} | lineId=${lineId} | resp=${JSON.stringify(resp?.data ?? resp)}`)
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
      const blocoTamanho  = Number(config.blocoTamanho)  || 0
      const blocoPausaMin = Number(config.blocoPausaMin) || 0
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

          enviosDesdeUltimaPausa++
          if (blocoTamanho > 0 && blocoPausaMin > 0 && enviosDesdeUltimaPausa >= blocoTamanho) {
            console.log(`[FILA] 🛑 ${blocoTamanho} envios atingidos, pausando ${blocoPausaMin}min...`)
            await sleep(blocoPausaMin * 60 * 1000)
            enviosDesdeUltimaPausa = 0
          }
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
    // ---- Alerta de atraso em grupo (membro vencido > 3 dias) ----
    const configGrupo = config.regras?.grupoAtraso
    if (configGrupo?.ativo && configGrupo?.mensagem) {
      for (const cliente of clientes) {
        if (!cliente.telefone || !cliente.grupoLinha) continue
        if (cliente.status === 'inativo') continue
        const diff = diffDias(cliente.vencimento)
        if (diff === null || diff > -3) continue  // so vencidos ha mais de 3 dias
        // Verifica se algum outro membro do grupo ainda esta ativo (linha coberta)
        const grupo = clientes.filter(c => c.grupoLinha === cliente.grupoLinha && c.id !== cliente.id)
        const grupoAtivo = grupo.some(c => {
          const d = diffDias(c.vencimento)
          return d !== null && d >= 0
        })
        if (!grupoAtivo) continue  // grupo todo vencido, cobranca normal ja cobre
        if (cliente.id && await jaEnviouHoje(cliente.id, 'grupo-atraso')) continue
        const links = await gerarLinksCliente(cliente)
        const diasVencido = Math.abs(diff)
        const mensagemGrupo = configGrupo.mensagem
          .replace(/{NOME}/gi, cliente.nome || '')
          .replace(/{DIAS}/gi, String(diasVencido))
          .replace(/{GRUPO}/gi, cliente.grupoLinha || '')
          .replace(/{VALOR}/gi, cliente.valor || '')
          .replace(/{LINK_1MES}/gi, links?.['1mes'] || '')
          .replace(/{LINK_3MESES}/gi, links?.['3meses'] || '')
          .replace(/{LINK_6MESES}/gi, links?.['6meses'] || '')
          .replace(/{VENCIMENTO}/gi, cliente.vencimento || '')
        await db.collection('filaEnvios').add({
          clienteId: cliente.id, clienteNome: cliente.nome,
          telefone: cliente.telefone, mensagem: mensagemGrupo,
          midiaUrl: null, midiaTipo: null, midiaNome: null, modoEnvio: 'junto',
          gatilho: 'grupo-atraso', status: 'pendente', tentativas: 0,
          maxTentativas: MAX_TENTATIVAS,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          proximaTentativa: admin.firestore.Timestamp.now(),
          enviadoEm: null, erro: null,
        })
        adicionados++
        console.log(`[AUTO] Enfileirado grupo-atraso: ${cliente.nome} (${cliente.grupoLinha}, ${diasVencido}d vencido)`)
      }
    }

    // ---- Controle Warez por inadimplência em grupos (dias > 3) ----
    try {
      // Agrupa clientes por grupoLinha
      const gruposMap = {}
      for (const c of clientes) {
        if (!c.grupoLinha?.trim() || c.servidor?.toUpperCase() !== 'WAREZ') continue
        if (!gruposMap[c.grupoLinha]) gruposMap[c.grupoLinha] = []
        gruposMap[c.grupoLinha].push(c)
      }
      for (const [nomeGrupo, membros] of Object.entries(gruposMap)) {
        // Só age se algum membro estiver vencido
        const temVencido = membros.some(m => {
          const p = (m.vencimento||'').split('/')
          if (p.length < 3) return false
          return new Date(Number(p[2]),Number(p[1])-1,Number(p[0])) < new Date()
        })
        if (!temVencido) continue
        await aplicarEstadoGrupo(nomeGrupo, membros)
      }
    } catch(e) { console.error('[GRUPO-CTRL] Erro geral:', e.message) }

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

  // ===== APLICACAO EM LOTE DE GRUPOS WAREZ (uso unico) =====
  const REGISTROS_GRUPOS = [
  {
    "telefone": "554888504613",
    "nome": "Misael Inacio",
    "usuario": "d59h011",
    "senha": "35131az",
    "grupoLinha": "GRUPO 003",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519982153098",
    "nome": "Danielle Silva",
    "usuario": "d59h011",
    "senha": "35131az",
    "grupoLinha": "GRUPO 003",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519998598764",
    "nome": "Damiana Souza",
    "usuario": "d59h011",
    "senha": "35131az",
    "grupoLinha": "GRUPO 003",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5598988484555",
    "nome": "Wilker Rodrigues",
    "usuario": "7576872",
    "senha": "2875495",
    "grupoLinha": "GRUPO 004",
    "vencimentoLinha": "22/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519991809824",
    "nome": "Edilene Marques",
    "usuario": "7576872",
    "senha": "2875495",
    "grupoLinha": "GRUPO 004",
    "vencimentoLinha": "22/06/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519996374530",
    "nome": "Jonatan Dorigan",
    "usuario": "7576872",
    "senha": "2875495",
    "grupoLinha": "GRUPO 004",
    "vencimentoLinha": "22/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519989861225",
    "nome": "Rafael Cesar",
    "usuario": "z59z184",
    "senha": "35hx856",
    "grupoLinha": "GRUPO 005",
    "vencimentoLinha": "23/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519999545654",
    "nome": "Wilton alves",
    "usuario": "z59z184",
    "senha": "35hx856",
    "grupoLinha": "GRUPO 005",
    "vencimentoLinha": "23/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5562999080926",
    "nome": "Stephanie Silva",
    "usuario": "z59z184",
    "senha": "35hx856",
    "grupoLinha": "GRUPO 005",
    "vencimentoLinha": "23/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5564992251278",
    "nome": "Stefany Rosa",
    "usuario": "2943937",
    "senha": "3799571",
    "grupoLinha": "GRUPO 006",
    "vencimentoLinha": "27/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519983196741",
    "nome": "Bruna Franca",
    "usuario": "2943937",
    "senha": "3799571",
    "grupoLinha": "GRUPO 006",
    "vencimentoLinha": "27/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519996326881",
    "nome": "Guilherme GP",
    "usuario": "2943937",
    "senha": "3799571",
    "grupoLinha": "GRUPO 006",
    "vencimentoLinha": "27/06/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5518988066585",
    "nome": "kaique",
    "usuario": "6694086",
    "senha": "9504691",
    "grupoLinha": "GRUPO 007",
    "vencimentoLinha": "28/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "551998066515",
    "nome": "Claudineia Alves",
    "usuario": "6694086",
    "senha": "9504691",
    "grupoLinha": "GRUPO 007",
    "vencimentoLinha": "28/06/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519996832507",
    "nome": "Eric Ramalho",
    "usuario": "6694086",
    "senha": "9504691",
    "grupoLinha": "GRUPO 007",
    "vencimentoLinha": "28/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519997960039",
    "nome": "Andrey Vinicius",
    "usuario": "1909924",
    "senha": "9027778",
    "grupoLinha": "GRUPO 008",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519995536306",
    "nome": "Fabiana Jorge",
    "usuario": "1909924",
    "senha": "9027778",
    "grupoLinha": "GRUPO 008",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519997860405",
    "nome": "Laura Rodrigues",
    "usuario": "1909924",
    "senha": "9027778",
    "grupoLinha": "GRUPO 008",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5512974041227",
    "nome": "Giulia Nascimento",
    "usuario": "t157s17",
    "senha": "5520x1e",
    "grupoLinha": "GRUPO 009",
    "vencimentoLinha": "30/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519999273405",
    "nome": "Vitor Campos",
    "usuario": "t157s17",
    "senha": "5520x1e",
    "grupoLinha": "GRUPO 009",
    "vencimentoLinha": "30/06/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519987030981",
    "nome": "Josuel Melo",
    "usuario": "t157s17",
    "senha": "5520x1e",
    "grupoLinha": "GRUPO 009",
    "vencimentoLinha": "30/06/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519995270876",
    "nome": "Guilherme Faria",
    "usuario": "4r0969a",
    "senha": "277gv63",
    "grupoLinha": "GRUPO 010",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5511987545048",
    "nome": "Elisonia Ferreira",
    "usuario": "4r0969a",
    "senha": "277gv63",
    "grupoLinha": "GRUPO 010",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519984505504",
    "nome": "Agatha Tochetti",
    "usuario": "4r0969a",
    "senha": "277gv63",
    "grupoLinha": "GRUPO 010",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5567996672867",
    "nome": "Rogerio Lima",
    "usuario": "40a6c76",
    "senha": "198bg68",
    "grupoLinha": "GRUPO 011",
    "vencimentoLinha": "02/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519997564436",
    "nome": "Danilo Adorno",
    "usuario": "40a6c76",
    "senha": "198bg68",
    "grupoLinha": "GRUPO 011",
    "vencimentoLinha": "02/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519999124243",
    "nome": "Silas Junior",
    "usuario": "40a6c76",
    "senha": "198bg68",
    "grupoLinha": "GRUPO 011",
    "vencimentoLinha": "02/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519996414675",
    "nome": "Wagner Aguiar",
    "usuario": "48907655",
    "senha": "5689220",
    "grupoLinha": "GRUPO 012",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519998717581",
    "nome": "Cleber Ramos",
    "usuario": "48907655",
    "senha": "5689220",
    "grupoLinha": "GRUPO 012",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "551974157651",
    "nome": "Priscila Gomes",
    "usuario": "48907655",
    "senha": "5689220",
    "grupoLinha": "GRUPO 012",
    "vencimentoLinha": "16/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519998381767",
    "nome": "Antonio Jose",
    "usuario": "36795829",
    "senha": "69687258",
    "grupoLinha": "GRUPO 013",
    "vencimentoLinha": "17/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519983133313",
    "nome": "Alvaro Rosa",
    "usuario": "36795829",
    "senha": "69687258",
    "grupoLinha": "GRUPO 013",
    "vencimentoLinha": "17/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519982681534",
    "nome": "Thaís Glauser",
    "usuario": "36795829",
    "senha": "69687258",
    "grupoLinha": "GRUPO 013",
    "vencimentoLinha": "17/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519981738211",
    "nome": "Fatima Santos",
    "usuario": "4384470",
    "senha": "5611492",
    "grupoLinha": "GRUPO 014",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519996316712",
    "nome": "Claudia Almeida",
    "usuario": "4384470",
    "senha": "5611492",
    "grupoLinha": "GRUPO 014",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519971168301",
    "nome": "Mayara Rodrigues",
    "usuario": "4384470",
    "senha": "5611492",
    "grupoLinha": "GRUPO 014",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5514988413661",
    "nome": "Josias Leal",
    "usuario": "45q29w7",
    "senha": "f749p00",
    "grupoLinha": "GRUPO 015",
    "vencimentoLinha": "08/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "555194151286",
    "nome": "Patricia Coelho",
    "usuario": "45q29w7",
    "senha": "f749p00",
    "grupoLinha": "GRUPO 015",
    "vencimentoLinha": "08/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519983107552",
    "nome": "Marcus Vinícius",
    "usuario": "45q29w7",
    "senha": "f749p00",
    "grupoLinha": "GRUPO 015",
    "vencimentoLinha": "08/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5511959169480",
    "nome": "Luciana Almeida",
    "usuario": "4033h5x",
    "senha": "59037re",
    "grupoLinha": "GRUPO 016",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519996767627",
    "nome": "Camila Roncato",
    "usuario": "4033h5x",
    "senha": "59037re",
    "grupoLinha": "GRUPO 016",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5574999024666",
    "nome": "Micaela Lopes",
    "usuario": "4033h5x",
    "senha": "59037re",
    "grupoLinha": "GRUPO 016",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519991427899",
    "nome": "Luis Facca",
    "usuario": "616b0r4",
    "senha": "g1t6486",
    "grupoLinha": "GRUPO 017",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519999965231",
    "nome": "Mara Rubia",
    "usuario": "616b0r4",
    "senha": "g1t6486",
    "grupoLinha": "GRUPO 017",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519998664413",
    "nome": "Marcia Claudino",
    "usuario": "616b0r4",
    "senha": "g1t6486",
    "grupoLinha": "GRUPO 017",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5547984324640",
    "nome": "Mauro Woscnak",
    "usuario": "7567561",
    "senha": "2560062",
    "grupoLinha": "GRUPO 018",
    "vencimentoLinha": "14/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519999050282",
    "nome": "Anderson Paes",
    "usuario": "7567561",
    "senha": "2560062",
    "grupoLinha": "GRUPO 018",
    "vencimentoLinha": "14/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519920041503",
    "nome": "Fernanda Longo",
    "usuario": "7567561",
    "senha": "2560062",
    "grupoLinha": "GRUPO 018",
    "vencimentoLinha": "14/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5551992600736",
    "nome": "Roberto Petter",
    "usuario": "9588341",
    "senha": "5256332",
    "grupoLinha": "GRUPO 019",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519994414924",
    "nome": "Juliana Valle",
    "usuario": "9588341",
    "senha": "5256332",
    "grupoLinha": "GRUPO 019",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519991362068",
    "nome": "Murilo Coimbra",
    "usuario": "9588341",
    "senha": "5256332",
    "grupoLinha": "GRUPO 019",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5521993762992",
    "nome": "Stephanny Mariano",
    "usuario": "12t14t0",
    "senha": "441j5m8",
    "grupoLinha": "GRUPO 020",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5511993162840",
    "nome": "Cristiane Pereira",
    "usuario": "12t14t0",
    "senha": "441j5m8",
    "grupoLinha": "GRUPO 020",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5562998490912",
    "nome": "Thainne Cavalcante",
    "usuario": "12t14t0",
    "senha": "441j5m8",
    "grupoLinha": "GRUPO 020",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519981514802",
    "nome": "Wirnna",
    "usuario": "8363423",
    "senha": "4903664",
    "grupoLinha": "GRUPO 021",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5511963132055",
    "nome": "Adeni Rosa",
    "usuario": "8363423",
    "senha": "4903664",
    "grupoLinha": "GRUPO 021",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5521993677888",
    "nome": "Vanderlei Coelho",
    "usuario": "8363423",
    "senha": "4903664",
    "grupoLinha": "GRUPO 021",
    "vencimentoLinha": "18/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5564992109325",
    "nome": "kayllany",
    "usuario": "53h5x50",
    "senha": "p080c61",
    "grupoLinha": "GRUPO 022",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5551992931097",
    "nome": "Alice Rosa",
    "usuario": "53h5x50",
    "senha": "p080c61",
    "grupoLinha": "GRUPO 022",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519993789860",
    "nome": "Aline Vivaldo",
    "usuario": "53h5x50",
    "senha": "p080c61",
    "grupoLinha": "GRUPO 022",
    "vencimentoLinha": "19/07/2026",
    "mudaLogin": false
  },
  {
    "telefone": "5519971698475",
    "nome": "Carmen Oliveira",
    "usuario": "303y03f",
    "senha": "1nr7576",
    "grupoLinha": "GRUPO 023",
    "vencimentoLinha": "23/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "‪5519997038404‬",
    "nome": "Joseane",
    "usuario": "303y03f",
    "senha": "1nr7576",
    "grupoLinha": "GRUPO 023",
    "vencimentoLinha": "23/07/2026",
    "mudaLogin": true
  },
  {
    "telefone": "5519981831084",
    "nome": "Sergio Perches",
    "usuario": "303y03f",
    "senha": "1nr7576",
    "grupoLinha": "GRUPO 023",
    "vencimentoLinha": "23/07/2026",
    "mudaLogin": false
  }
]

  // Reversao temporaria: Claudia Almeida e Camila Roncato voltam ao login proprio
  // Rota temporaria: seta titularNome nos grupos existentes
  // Rota temporaria: corrige titular do GRUPO 1 e GRUPO 2 (sem zeros)
  // Rota temporaria: bloqueia (move para lixeira) os 20 logins liberados grupos 025-034
  router.post('/grupos/bloquear-logins-025-034', async (req, res) => {
    const LOGINS = [{"usuario":"3014048","nome":"Bruno Alves"},{"usuario":"6645740","nome":"Jeferson Pinheiro"},{"usuario":"71156tq","nome":"Alex Gutemberg"},{"usuario":"9s78h86","nome":"Isabele Campos"},{"usuario":"b93p331","nome":"Felipe Rocha"},{"usuario":"y372g14","nome":"Paulo Rodrigo"},{"usuario":"7543115","nome":"Paulo Roberto"},{"usuario":"73h8g99","nome":"Elizabete Paiva"},{"usuario":"1933736","nome":"Rosilda Adao"},{"usuario":"2f0f181","nome":"Mary Zanotti"},{"usuario":"9399376","nome":"Elaine Pardo"},{"usuario":"6264nc0","nome":"Michele Mariconi"},{"usuario":"5291kr9","nome":"Maria Augusta"},{"usuario":"3928x6v","nome":"Henrique Alcantara"},{"usuario":"1070q2d","nome":"Marcelo Goudard"},{"usuario":"5rx6648","nome":"Josi Almeida"},{"usuario":"91q225f","nome":"Glaucia da Silva"},{"usuario":"0bz2393","nome":"Andre Sa"},{"usuario":"74103ud","nome":"Jose Luciano"},{"usuario":"529p74y","nome":"Fernanda Sampaio"}]
    const resultado = []
    for (const l of LOGINS) {
      try {
        const BKND = 'https://iptv-manager-production.up.railway.app'
        const buscar = await fetch(`${BKND}/painel/buscar-linha/${encodeURIComponent(l.usuario)}`).then(r => r.json()).catch(() => null)
        if (!buscar?.ok) {
          resultado.push({ usuario: l.usuario, nome: l.nome, ok: false, erro: 'nao encontrado' })
          continue
        }
        await fetch(`${BKND}/painel/linha/${buscar.id}`, { method: 'DELETE' })
        resultado.push({ usuario: l.usuario, nome: l.nome, ok: true, id: linha.id })
        console.log(`[BLOQUEAR] ${l.nome} (${l.usuario}) id=${linha.id} -> movido para lixeira`)
      } catch(e) {
        resultado.push({ usuario: l.usuario, nome: l.nome, ok: false, erro: e.message })
      }
    }
    const sucesso = resultado.filter(r => r.ok).length
    const falhas  = resultado.filter(r => !r.ok)
    console.log(`[BLOQUEAR] ${sucesso}/${LOGINS.length} movidos para lixeira`)
    res.json({ ok: true, total: LOGINS.length, sucesso, falhas })
  })

  router.post('/grupos/corrigir-grupo006', async (req, res) => {
    try {
      const snap = await db.collection('clientes').where('grupoLinha', '==', 'GRUPO 006').get()
      const batch = db.batch()
      let atualizados = 0, msgs = []
      snap.docs.forEach(d => {
        const data = d.data()
        batch.update(d.ref, { usuario: 'p4021n2', senha: '1r637t1', titularNome: 'Guilherme GP' })
        // Enfileira msg apenas para Bruna e Stefany (não para o Guilherme que já tem o login certo)
        if (data.nome !== 'Guilherme GP' && data.telefone) {
          msgs.push({ nome: data.nome, telefone: data.telefone })
        }
        atualizados++
      })
      await batch.commit()
      // Enfileira mensagens
      for (const m of msgs) {
        await db.collection('filaEnvios').add({
          clienteId: null, clienteNome: m.nome, telefone: m.telefone,
          mensagem: `Olá ${m.nome}! 📺 Seus dados de acesso foram atualizados:\n\n👤 Usuário: p4021n2\n🔑 Senha: 1r637t1\n\nAtualize no seu aplicativo. Qualquer dúvida estamos à disposição!`,
          midiaUrl: null, midiaTipo: null, midiaNome: null, modoEnvio: 'junto',
          gatilho: 'grupo006-correcao', status: 'pendente', tentativas: 0,
          maxTentativas: MAX_TENTATIVAS,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          proximaTentativa: admin.firestore.Timestamp.now(),
          enviadoEm: null, erro: null,
        })
      }
      console.log(`[GRUPO006] ${atualizados} membros atualizados, ${msgs.length} msgs enfileiradas`)
      res.json({ ok: true, atualizados, mensagensEnfileiradas: msgs.length })
    } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  router.post('/grupos/corrigir-senhas-divergentes', async (req, res) => {
    try {
      const correcoes = [
        { grupo: 'GRUPO 2',   usuario: 'q4281r6', senha: '4625y0g' },
        { grupo: 'GRUPO 015', usuario: '45q29w7', senha: 'mj26245' },
      ]
      let total = 0
      for (const c of correcoes) {
        const snap = await db.collection('clientes').where('grupoLinha', '==', c.grupo).get()
        const batch = db.batch()
        snap.docs.forEach(d => batch.update(d.ref, { senha: c.senha, usuario: c.usuario }))
        await batch.commit()
        total += snap.size
        console.log(`[CORRECAO] ${c.grupo}: corrigido para ${snap.size} membros`)
      }
      res.json({ ok: true, total })
    } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // Atualizacao emergencial 139 logins
  const PLANO_139_DATA = [{"id_warez":"75516330","novo_usuario":"qa22768","nova_senha":"dpbhsah","clientes":[{"nome":"Francilene Nicoleti","telefone":"5519998085579","grupo":""}]},{"id_warez":"46593478","novo_usuario":"qo25808","nova_senha":"zmf8mdd","clientes":[{"nome":"Mayara Santos","telefone":"5511910621131","grupo":""}]},{"id_warez":"101374120","novo_usuario":"wp87593","nova_senha":"t3w5uzb","clientes":[{"nome":"Regiane Salvador","telefone":"5519996907617","grupo":""}]},{"id_warez":"102575781","novo_usuario":"fh02126","nova_senha":"nnhj7xv","clientes":[{"nome":"Vitor Spironello","telefone":"5519995777311","grupo":""}]},{"id_warez":"101868457","novo_usuario":"es13965","nova_senha":"y41iblj","clientes":[{"nome":"Giselle Lopes","telefone":"5592994681985","grupo":""}]},{"id_warez":"100786230","novo_usuario":"fy83639","nova_senha":"qjiujv6","clientes":[{"nome":"Claudia Almeida","telefone":"5519996316712","grupo":""}]},{"id_warez":"64903689","novo_usuario":"kf95001","nova_senha":"w2pcn9t","clientes":[{"nome":"Jose Orlando","telefone":"5519991991270","grupo":""}]},{"id_warez":"101413773","novo_usuario":"zw07652","nova_senha":"xepq85j","clientes":[{"nome":"Odirlei Amaral","telefone":"5519999578404","grupo":""}]},{"id_warez":"49817191","novo_usuario":"ne98266","nova_senha":"f1t2tal","clientes":[{"nome":"Eli Pereira","telefone":"5519997980332","grupo":""}]},{"id_warez":"102369872","novo_usuario":"ay88308","nova_senha":"8drc11e","clientes":[{"nome":"Claudinha","telefone":"5519982202992","grupo":""}]},{"id_warez":"101595924","novo_usuario":"mo28425","nova_senha":"0hl9xps","clientes":[{"nome":"Sergio Antonio","telefone":"5519988036259","grupo":""}]},{"id_warez":"369804","novo_usuario":"df35220","nova_senha":"wi64ciy","clientes":[{"nome":"Kamila Gonçalves","telefone":"5519981727724","grupo":""}]},{"id_warez":"23365736","novo_usuario":"fd95478","nova_senha":"gdppq0y","clientes":[{"nome":"Alexandre Pereira","telefone":"555496078997","grupo":""}]},{"id_warez":"11490083","novo_usuario":"zc43821","nova_senha":"qpki7p5","clientes":[{"nome":"Jonatas Reis","telefone":"5521993409110","grupo":""}]},{"id_warez":"100865449","novo_usuario":"ob98998","nova_senha":"frhocn9","clientes":[{"nome":"Sueli Nolasco","telefone":"5519992147337","grupo":""}]},{"id_warez":"43359","novo_usuario":"gu44995","nova_senha":"zfk8ut0","clientes":[{"nome":"Mony Santos","telefone":"5519981987861","grupo":""}]},{"id_warez":"102486295","novo_usuario":"bp58190","nova_senha":"gvyie6i","clientes":[{"nome":"Adao Severino","telefone":"5527998035932","grupo":""}]},{"id_warez":"102538208","novo_usuario":"pq45592","nova_senha":"zioykl1","clientes":[{"nome":"Stefany Biscalchim","telefone":"5519991974721","grupo":""}]},{"id_warez":"2870506","novo_usuario":"bl99022","nova_senha":"755nf4z","clientes":[{"nome":"Rosemeire Dantas","telefone":"5519971654704","grupo":""}]},{"id_warez":"26824432","novo_usuario":"pz60826","nova_senha":"7eedtjv","clientes":[{"nome":"Carlos Manesco","telefone":"5519981762098","grupo":""}]},{"id_warez":"100807336","novo_usuario":"sf62498","nova_senha":"dpja1wj","clientes":[{"nome":"Adelia Ribeiro","telefone":"5519987208833","grupo":""}]},{"id_warez":"100015229","novo_usuario":"to40089","nova_senha":"t4ufel6","clientes":[{"nome":"Rodrigo Joly","telefone":"5519998883002","grupo":""}]},{"id_warez":"60619973","novo_usuario":"uw82217","nova_senha":"5owf759","clientes":[{"nome":"Graziela Costa","telefone":"5519996773501","grupo":""}]},{"id_warez":"100634147","novo_usuario":"vw07398","nova_senha":"53j2d54","clientes":[{"nome":"Priscila Melo","telefone":"5511977289932","grupo":""}]},{"id_warez":"116655","novo_usuario":"fv43720","nova_senha":"gl58kxo","clientes":[{"nome":"Lucas Schiavon","telefone":"5519974199291","grupo":""}]},{"id_warez":"100207551","novo_usuario":"zn91919","nova_senha":"jdp0lvs","clientes":[{"nome":"Bruno Henrique","telefone":"5519971525960","grupo":""}]},{"id_warez":"102002518","novo_usuario":"ko27095","nova_senha":"z0yncxl","clientes":[{"nome":"Daniel Evaristo","telefone":"5519983234069","grupo":""}]},{"id_warez":"101293889","novo_usuario":"iw73344","nova_senha":"kep7y6w","clientes":[{"nome":"Jeans douglas","telefone":"5519992542585","grupo":""}]},{"id_warez":"102410811","novo_usuario":"ho02456","nova_senha":"qphr62g","clientes":[{"nome":"Ana Paula Eduardo","telefone":"5524999076009","grupo":""}]},{"id_warez":"102406541","novo_usuario":"cn63876","nova_senha":"ihair4c","clientes":[{"nome":"Motta","telefone":"5524981142657","grupo":""}]},{"id_warez":"101744868","novo_usuario":"kq16426","nova_senha":"a11dpg8","clientes":[{"nome":"Rafaella Ferraz","telefone":"5519981562527","grupo":""}]},{"id_warez":"102591172","novo_usuario":"nb28486","nova_senha":"9v86wzs","clientes":[{"nome":"Camila Roncato","telefone":"5519996767627","grupo":""}]},{"id_warez":"100913334","novo_usuario":"vo87422","nova_senha":"w1swjck","clientes":[{"nome":"Renata Thomaz","telefone":"5535910019091","grupo":""}]},{"id_warez":"102060973","novo_usuario":"hi51267","nova_senha":"cotohp6","clientes":[{"nome":"Luiz Deoclecio","telefone":"5519991748850","grupo":""}]},{"id_warez":"28642822","novo_usuario":"ps87303","nova_senha":"148p0tv","clientes":[{"nome":"Pedrilia","telefone":"5519998624314","grupo":""}]},{"id_warez":"100107057","novo_usuario":"ff40364","nova_senha":"fqewaou","clientes":[{"nome":"Elias","telefone":"5519998160882","grupo":""}]},{"id_warez":"100142643","novo_usuario":"aq14032","nova_senha":"l1n13jc","clientes":[{"nome":"Rosangela Freitas","telefone":"5521979018640","grupo":""}]},{"id_warez":"280230","novo_usuario":"ao93676","nova_senha":"18hafey","clientes":[{"nome":"Everton Queiroz","telefone":"5519987341692","grupo":""}]},{"id_warez":"101735950","novo_usuario":"of67167","nova_senha":"e38daly","clientes":[{"nome":"Iris Bezutte","telefone":"5519981630006","grupo":""}]},{"id_warez":"101438213","novo_usuario":"yk70661","nova_senha":"14ve92m","clientes":[{"nome":"Cristiane Titonelli","telefone":"5519978137676","grupo":""}]},{"id_warez":"101830805","novo_usuario":"lj53881","nova_senha":"8w3zp08","clientes":[{"nome":"Leandro Gomes","telefone":"5519982003332","grupo":""}]},{"id_warez":"102026312","novo_usuario":"hv54472","nova_senha":"43d5iqv","clientes":[{"nome":"Zilda Barco","telefone":"5519991840707","grupo":""}]},{"id_warez":"101759180","novo_usuario":"ja81273","nova_senha":"5zja8dz","clientes":[{"nome":"Wislei Rosa","telefone":"5516996042152","grupo":""}]},{"id_warez":"100769432","novo_usuario":"mt66470","nova_senha":"hylurtp","clientes":[{"nome":"Well Cardoso","telefone":"5519988101550","grupo":""}]},{"id_warez":"101932135","novo_usuario":"ti72211","nova_senha":"et1ghr0","clientes":[{"nome":"Higor Diego","telefone":"5519999863475","grupo":""}]},{"id_warez":"100683572","novo_usuario":"zn21121","nova_senha":"atj9tze","clientes":[{"nome":"Fernando Antonio","telefone":"5519995860122","grupo":""}]},{"id_warez":"102290162","novo_usuario":"wm85441","nova_senha":"b7r3ocw","clientes":[{"nome":"Agnaldo Pires","telefone":"5511985457492","grupo":""}]},{"id_warez":"100692682","novo_usuario":"bd53917","nova_senha":"v2isqp4","clientes":[{"nome":"Tamiris Santos","telefone":"5519998437680","grupo":""}]},{"id_warez":"101273374","novo_usuario":"zh66792","nova_senha":"hxfgcaq","clientes":[{"nome":"Rose Girotto","telefone":"5519997137268","grupo":""}]},{"id_warez":"2612917","novo_usuario":"ph27746","nova_senha":"72wx7pt","clientes":[{"nome":"Paulo Abibi","telefone":"5519996349432","grupo":""}]},{"id_warez":"449704","novo_usuario":"qx80137","nova_senha":"ukeyz7s","clientes":[{"nome":"Ademar","telefone":"5519989934135","grupo":""}]},{"id_warez":"100724541","novo_usuario":"mc04320","nova_senha":"84u89yj","clientes":[{"nome":"Michele Brito","telefone":"5519997717245","grupo":""}]},{"id_warez":"100866597","novo_usuario":"bt46915","nova_senha":"wrdmly4","clientes":[{"nome":"Anderson Paes","telefone":"5519999050282","grupo":"GRUPO 018"},{"nome":"Fernanda Longo","telefone":"5519920041503","grupo":"GRUPO 018"},{"nome":"Mauro Woscnak","telefone":"5547984324640","grupo":"GRUPO 018"}]},{"id_warez":"102454230","novo_usuario":"is29854","nova_senha":"ll8os9x","clientes":[{"nome":"Carlos Fava","telefone":"5511991112200","grupo":""}]},{"id_warez":"101746084","novo_usuario":"ok13767","nova_senha":"ht7pze9","clientes":[{"nome":"Yuri Rafael","telefone":"5519988018228","grupo":""}]},{"id_warez":"127325","novo_usuario":"pg15509","nova_senha":"6qe3rzs","clientes":[{"nome":"Daniela Porto","telefone":"5519981579512","grupo":""}]},{"id_warez":"102082458","novo_usuario":"hv92539","nova_senha":"s55j2o7","clientes":[{"nome":"Felipe Clazzer","telefone":"5519999214861","grupo":""}]},{"id_warez":"100884670","novo_usuario":"nv22594","nova_senha":"ftmttql","clientes":[{"nome":"Joao Eduardo","telefone":"5519981202955","grupo":""}]},{"id_warez":"102001627","novo_usuario":"es52707","nova_senha":"z3nx39r","clientes":[{"nome":"Leandro Facirolli","telefone":"5519981658787","grupo":""}]},{"id_warez":"102458713","novo_usuario":"an58845","nova_senha":"q0oxfq8","clientes":[{"nome":"Rafael Dezen","telefone":"5519998224568","grupo":""}]},{"id_warez":"62596593","novo_usuario":"is68883","nova_senha":"lz15bcw","clientes":[{"nome":"Marlene Lopes","telefone":"5571986887737","grupo":""}]},{"id_warez":"58019992","novo_usuario":"xz74068","nova_senha":"py6b2kn","clientes":[{"nome":"Cristiano Cazelato","telefone":"5519994521055","grupo":""}]},{"id_warez":"128602","novo_usuario":"dn57108","nova_senha":"wi6fqjj","clientes":[{"nome":"Gledson Gois","telefone":"5519996991982","grupo":""}]},{"id_warez":"102272308","novo_usuario":"au96143","nova_senha":"vxpj4hn","clientes":[{"nome":"Evandro Arruda","telefone":"5519953283406","grupo":""}]},{"id_warez":"100686195","novo_usuario":"mg55929","nova_senha":"xjuy0bv","clientes":[{"nome":"Viviane Arruda","telefone":"5519971522577","grupo":""}]},{"id_warez":"102481754","novo_usuario":"mx27636","nova_senha":"wyzx4w6","clientes":[{"nome":"Mayara Rodrigues","telefone":"5519971168301","grupo":"GRUPO 014"},{"nome":"Fatima Santos","telefone":"5519981738211","grupo":"GRUPO 014"}]},{"id_warez":"101590376","novo_usuario":"qi45702","nova_senha":"0get8t6","clientes":[{"nome":"Marcos Antonio","telefone":"5519997315686","grupo":""}]},{"id_warez":"101920759","novo_usuario":"vg84873","nova_senha":"e8f8409","clientes":[{"nome":"Murilo Coimbra","telefone":"5519991362068","grupo":"GRUPO 019"},{"nome":"Juliana Valle","telefone":"5519994414924","grupo":"GRUPO 019"},{"nome":"Roberto Petter","telefone":"5551992600736","grupo":"GRUPO 019"}]},{"id_warez":"79290","novo_usuario":"zu37054","nova_senha":"yyv37di","clientes":[{"nome":"Gerlandia","telefone":"5519997385270","grupo":""}]},{"id_warez":"81286872","novo_usuario":"aw59208","nova_senha":"6kof8kr","clientes":[{"nome":"Rodolfo Abreu","telefone":"5519996807152","grupo":""}]},{"id_warez":"101754079","novo_usuario":"cx14679","nova_senha":"p0fodro","clientes":[{"nome":"Jucilandia","telefone":"5519993880464","grupo":""}]},{"id_warez":"101102307","novo_usuario":"ya34980","nova_senha":"yt9moge","clientes":[{"nome":"Rafael Correa","telefone":"5519997503242","grupo":""}]},{"id_warez":"42316","novo_usuario":"wl66507","nova_senha":"ieuc1hh","clientes":[{"nome":"Tania Ferreira","telefone":"5519999330202","grupo":""}]},{"id_warez":"295055","novo_usuario":"wi19081","nova_senha":"ejgxaa2","clientes":[{"nome":"Carlos Silva","telefone":"5519983563165","grupo":""}]},{"id_warez":"102326630","novo_usuario":"gi10757","nova_senha":"r2sds8b","clientes":[{"nome":"Leticia Pavan","telefone":"5519983410409","grupo":""}]},{"id_warez":"101003799","novo_usuario":"uw54904","nova_senha":"oyr6ccv","clientes":[{"nome":"Ricardo Eleuterio","telefone":"5519996215702","grupo":""}]},{"id_warez":"100858780","novo_usuario":"bh65395","nova_senha":"qvdz4x1","clientes":[{"nome":"Alessandra Araujo","telefone":"5519999753032","grupo":""}]},{"id_warez":"100262111","novo_usuario":"sf42344","nova_senha":"dpxnf7c","clientes":[{"nome":"Jeferson Castilho","telefone":"5519996272526","grupo":""}]},{"id_warez":"102502166","novo_usuario":"vc07855","nova_senha":"ulemx15","clientes":[{"nome":"Cicero Telles","telefone":"5535991410178","grupo":""}]},{"id_warez":"101929473","novo_usuario":"sz63526","nova_senha":"id4n1u3","clientes":[{"nome":"Jonatan Dorigan","telefone":"5519996374530","grupo":"GRUPO 004"},{"nome":"Wilker Rodrigues","telefone":"5598988484555","grupo":"GRUPO 004"},{"nome":"Edilene Marques","telefone":"5519991809824","grupo":"GRUPO 004"}]},{"id_warez":"100652589","novo_usuario":"vz86609","nova_senha":"3jgzlma","clientes":[{"nome":"Jose Fernandes","telefone":"5519991246678","grupo":""}]},{"id_warez":"101656551","novo_usuario":"wo41607","nova_senha":"hpmnz1u","clientes":[{"nome":"Sandra de Sá","telefone":"5519983809760","grupo":""}]},{"id_warez":"102488576","novo_usuario":"cb16626","nova_senha":"rpj1epk","clientes":[{"nome":"Joice Tosini","telefone":"5511943548189","grupo":""}]},{"id_warez":"102438443","novo_usuario":"rm60350","nova_senha":"khejla0","clientes":[{"nome":"Paula Balbino","telefone":"5519996263373","grupo":""}]},{"id_warez":"102324884","novo_usuario":"ej75880","nova_senha":"5ba75uu","clientes":[{"nome":"Geraldo Sobrinho","telefone":"5519981255063","grupo":""}]},{"id_warez":"102325617","novo_usuario":"sk10386","nova_senha":"37d4ivs","clientes":[{"nome":"Juscelino Pereira","telefone":"5519984141570","grupo":""}]},{"id_warez":"101039603","novo_usuario":"ki33151","nova_senha":"s6m033i","clientes":[{"nome":"Nelson Roque","telefone":"5521985694315","grupo":""}]},{"id_warez":"100816193","novo_usuario":"df67617","nova_senha":"r11q7uw","clientes":[{"nome":"Alessandra Ruiz","telefone":"5519993322501","grupo":""}]},{"id_warez":"100785839","novo_usuario":"qw61043","nova_senha":"jcslqc3","clientes":[{"nome":"Geison Ongaro","telefone":"5519992764455","grupo":""}]},{"id_warez":"2577955","novo_usuario":"bw86545","nova_senha":"26q3xlr","clientes":[{"nome":"Israel Viana","telefone":"5519999601981","grupo":""}]},{"id_warez":"46275684","novo_usuario":"db18375","nova_senha":"gippsfn","clientes":[{"nome":"Roque Messias","telefone":"5511997991884","grupo":""}]},{"id_warez":"13516077","novo_usuario":"hk35760","nova_senha":"dyk0x65","clientes":[{"nome":"Roque Messias","telefone":"5511997991884","grupo":""}]},{"id_warez":"2725932","novo_usuario":"ip13963","nova_senha":"v7ln23y","clientes":[{"nome":"Sirlei Lima","telefone":"5519971132935","grupo":""}]},{"id_warez":"100676318","novo_usuario":"vt65643","nova_senha":"ngh8rie","clientes":[{"nome":"Carolina Henrique","telefone":"5511999966188","grupo":""}]},{"id_warez":"174719","novo_usuario":"cv17880","nova_senha":"m1enf31","clientes":[{"nome":"Vanessa Gregorio","telefone":"5519988019395","grupo":""}]},{"id_warez":"102006834","novo_usuario":"ve44624","nova_senha":"k0qtl3q","clientes":[{"nome":"Welinson Tiago","telefone":"5515998563175","grupo":""}]},{"id_warez":"101742548","novo_usuario":"vj99423","nova_senha":"s832ejx","clientes":[{"nome":"Claudineia Alves","telefone":"551998066515","grupo":"GRUPO 007"},{"nome":"kaique","telefone":"5518988066585","grupo":"GRUPO 007"},{"nome":"Eric Ramalho","telefone":"5519996832507","grupo":"GRUPO 007"}]},{"id_warez":"101371284","novo_usuario":"wo18827","nova_senha":"j6fp8hq","clientes":[{"nome":"Janaina Lima","telefone":"5519996671263","grupo":""}]},{"id_warez":"102386772","novo_usuario":"ja05293","nova_senha":"b74x2ek","clientes":[{"nome":"Rubens Barbosa","telefone":"5571981541569","grupo":""}]},{"id_warez":"101073898","novo_usuario":"vs17400","nova_senha":"j4t0sek","clientes":[{"nome":"Jose Carlos","telefone":"5519997104360","grupo":""}]},{"id_warez":"100546125","novo_usuario":"hb47419","nova_senha":"vasifpw","clientes":[{"nome":"Marco Pedronetti","telefone":"5519992013605","grupo":""}]},{"id_warez":"101927630","novo_usuario":"gk60905","nova_senha":"s9toqw9","clientes":[{"nome":"Mayra Schiabel","telefone":"5519997155655","grupo":""}]},{"id_warez":"68949806","novo_usuario":"ga73767","nova_senha":"0lbt3g2","clientes":[{"nome":"Maria Aparecida","telefone":"5519981898200","grupo":""}]},{"id_warez":"208234","novo_usuario":"ms68074","nova_senha":"kbhb7s9","clientes":[{"nome":"Jose Roberto","telefone":"5519992369902","grupo":""}]},{"id_warez":"43503569","novo_usuario":"og71378","nova_senha":"len606n","clientes":[{"nome":"Roberto Silva","telefone":"5519997738812","grupo":""}]},{"id_warez":"100735718","novo_usuario":"zm49587","nova_senha":"cv3tlcx","clientes":[{"nome":"Liliane Souza","telefone":"5519996722580","grupo":""}]},{"id_warez":"100858816","novo_usuario":"hp46308","nova_senha":"m9j98cw","clientes":[{"nome":"Adalberto Queiroz","telefone":"5521964617955","grupo":""}]},{"id_warez":"204173","novo_usuario":"ju69167","nova_senha":"bc2nnuv","clientes":[{"nome":"Lourival Martinelli","telefone":"5519997070136","grupo":""}]},{"id_warez":"116651","novo_usuario":"ry37553","nova_senha":"xie0rnu","clientes":[{"nome":"Victor Franco","telefone":"5519998711280","grupo":""}]},{"id_warez":"102253140","novo_usuario":"gg49294","nova_senha":"e4q6qdy","clientes":[{"nome":"Nicolas Alves","telefone":"5531999694729","grupo":""}]},{"id_warez":"100622697","novo_usuario":"vi30588","nova_senha":"z7w2seh","clientes":[{"nome":"Pedro Balbino","telefone":"5519995966553","grupo":""}]},{"id_warez":"420257","novo_usuario":"du05385","nova_senha":"wdl9zs1","clientes":[{"nome":"Pedro Ivo","telefone":"5519988009467","grupo":""}]},{"id_warez":"100623863","novo_usuario":"vb96463","nova_senha":"52xg8p6","clientes":[{"nome":"Rita Balbino","telefone":"5519995966553","grupo":""}]},{"id_warez":"100648145","novo_usuario":"bd11373","nova_senha":"764jwte","clientes":[{"nome":"Alessandra Ramire","telefone":"5519996781095","grupo":""}]},{"id_warez":"102218376","novo_usuario":"hn51916","nova_senha":"zv4u3bb","clientes":[{"nome":"Edna","telefone":"5519988717447","grupo":""}]},{"id_warez":"101883705","novo_usuario":"qo67464","nova_senha":"wk8r2yk","clientes":[{"nome":"Cris Rosa","telefone":"5554992105009","grupo":""}]},{"id_warez":"1127511","novo_usuario":"bb44263","nova_senha":"z049enu","clientes":[{"nome":"Luciano Galdino","telefone":"5511983663599","grupo":""}]},{"id_warez":"352742","novo_usuario":"im22023","nova_senha":"wi5flul","clientes":[{"nome":"Wilson Duarte","telefone":"5519999773954","grupo":""}]},{"id_warez":"31690533","novo_usuario":"tm54309","nova_senha":"s8hmbr5","clientes":[{"nome":"Carlos Luis","telefone":"5519998981942","grupo":""}]},{"id_warez":"101920734","novo_usuario":"rm58487","nova_senha":"1nouhtc","clientes":[{"nome":"Eduardo almeida","telefone":"5519994256527","grupo":"GRUPO 030"},{"nome":"Elaine Pardo","telefone":"5519983690442","grupo":"GRUPO 030"},{"nome":"Michele Mariconi","telefone":"5519981339214","grupo":"GRUPO 030"}]},{"id_warez":"101663534","novo_usuario":"nt29619","nova_senha":"o2m71hs","clientes":[{"nome":"Manuel Filho","telefone":"5519989713858","grupo":""}]},{"id_warez":"100906903","novo_usuario":"nb13446","nova_senha":"slwf90k","clientes":[{"nome":"Luis Fernando 2","telefone":"5519997553798","grupo":""}]},{"id_warez":"100207630","novo_usuario":"iv57283","nova_senha":"y9v20ya","clientes":[{"nome":"Maristela Barbosa","telefone":"5517981118650","grupo":""}]},{"id_warez":"202583","novo_usuario":"mz77575","nova_senha":"gww4fyb","clientes":[{"nome":"Cleber Ramos","telefone":"5519998717581","grupo":"GRUPO 012"},{"nome":"Wagner Aguiar","telefone":"5519996414675","grupo":"GRUPO 012"},{"nome":"Priscila Gomes","telefone":"551974157651","grupo":"GRUPO 012"}]},{"id_warez":"100879657","novo_usuario":"yc03164","nova_senha":"1750ceh","clientes":[{"nome":"Bruno Alves","telefone":"5519987190237","grupo":"GRUPO 025"},{"nome":"Jeferson Pinheiro","telefone":"5519999959212","grupo":"GRUPO 025"},{"nome":"Juliana Oliveira","telefone":"5519987070626","grupo":"GRUPO 025"}]},{"id_warez":"101272984","novo_usuario":"ir53193","nova_senha":"m1zxyvg","clientes":[{"nome":"Fabiana Jorge","telefone":"5519995536306","grupo":"GRUPO 008"},{"nome":"Laura Rodrigues","telefone":"5519997860405","grupo":"GRUPO 008"},{"nome":"Andrey Vinicius","telefone":"5519997960039","grupo":"GRUPO 008"}]},{"id_warez":"22276816","novo_usuario":"go29222","nova_senha":"zlm72je","clientes":[{"nome":"Thaís Glauser","telefone":"5519982681534","grupo":"GRUPO 013"},{"nome":"Antonio Jose","telefone":"5519998381767","grupo":"GRUPO 013"},{"nome":"Alvaro Rosa","telefone":"5519983133313","grupo":"GRUPO 013"}]},{"id_warez":"40818889","novo_usuario":"rj98982","nova_senha":"kzmpjrh","clientes":[{"nome":"Juliana Gomes","telefone":"5519993500722","grupo":"GRUPO 026"},{"nome":"Alex Gutemberg","telefone":"5521979888859","grupo":"GRUPO 026"},{"nome":"Isabele Campos","telefone":"5519971583288","grupo":"GRUPO 026"}]},{"id_warez":"102047284","novo_usuario":"oy61652","nova_senha":"ytwbozd","clientes":[{"nome":"Celia Zani","telefone":"5519994006075","grupo":""}]},{"id_warez":"102573143","novo_usuario":"ua59498","nova_senha":"rh8lx6d","clientes":[{"nome":"Helena Rocha","telefone":"5521980672161","grupo":""}]},{"id_warez":"102042646","novo_usuario":"on79918","nova_senha":"g79or78","clientes":[{"nome":"Josiane Leite 1","telefone":"5519997653022","grupo":""}]},{"id_warez":"102504779","novo_usuario":"yw05192","nova_senha":"9tr74qg","clientes":[{"nome":"Nadia Silvia","telefone":"5577998427769","grupo":""}]},{"id_warez":"162574","novo_usuario":"ce42177","nova_senha":"u1g463s","clientes":[{"nome":"Flavio Santos","telefone":"5519996507662","grupo":""}]},{"id_warez":"100733327","novo_usuario":"cr11322","nova_senha":"i18k0ax","clientes":[{"nome":"Renan Clemente","telefone":"5519993315226","grupo":""}]},{"id_warez":"28438882","novo_usuario":"sb13458","nova_senha":"zle6kwh","clientes":[{"nome":"Cristina Pedro","telefone":"5519988283115","grupo":""}]},{"id_warez":"10379755","novo_usuario":"dd76454","nova_senha":"txhi15c","clientes":[{"nome":"Jonas Bertolino","telefone":"5519996221529","grupo":""}]},{"id_warez":"5609901","novo_usuario":"ls05055","nova_senha":"uflsehu","clientes":[{"nome":"Verusca Fray","telefone":"5519998824307","grupo":""}]}]
  const REGISTROS_139_DATA = [{"id_warez":"75516330","usuario_antigo":"1800234","novo_usuario":"qa22768","nova_senha":"dpbhsah","nome":"Francilene Nicoleti","telefone":"5519998085579","grupo":""},{"id_warez":"46593478","usuario_antigo":"65358917","novo_usuario":"qo25808","nova_senha":"zmf8mdd","nome":"Mayara Santos","telefone":"5511910621131","grupo":""},{"id_warez":"101374120","usuario_antigo":"5383830","novo_usuario":"wp87593","nova_senha":"t3w5uzb","nome":"Regiane Salvador","telefone":"5519996907617","grupo":""},{"id_warez":"102575781","usuario_antigo":"7337263","novo_usuario":"fh02126","nova_senha":"nnhj7xv","nome":"Vitor Spironello","telefone":"5519995777311","grupo":""},{"id_warez":"101868457","usuario_antigo":"4499879","novo_usuario":"es13965","nova_senha":"y41iblj","nome":"Giselle Lopes","telefone":"5592994681985","grupo":""},{"id_warez":"100786230","usuario_antigo":"9347446","novo_usuario":"fy83639","nova_senha":"qjiujv6","nome":"Claudia Almeida","telefone":"5519996316712","grupo":""},{"id_warez":"64903689","usuario_antigo":"12272000","novo_usuario":"kf95001","nova_senha":"w2pcn9t","nome":"Jose Orlando","telefone":"5519991991270","grupo":""},{"id_warez":"101413773","usuario_antigo":"3274390","novo_usuario":"zw07652","nova_senha":"xepq85j","nome":"Odirlei Amaral","telefone":"5519999578404","grupo":""},{"id_warez":"49817191","usuario_antigo":"18967775","novo_usuario":"ne98266","nova_senha":"f1t2tal","nome":"Eli Pereira","telefone":"5519997980332","grupo":""},{"id_warez":"102369872","usuario_antigo":"4431198","novo_usuario":"ay88308","nova_senha":"8drc11e","nome":"Claudinha","telefone":"5519982202992","grupo":""},{"id_warez":"101595924","usuario_antigo":"4288501","novo_usuario":"mo28425","nova_senha":"0hl9xps","nome":"Sergio Antonio","telefone":"5519988036259","grupo":""},{"id_warez":"369804","usuario_antigo":"7497236","novo_usuario":"df35220","nova_senha":"wi64ciy","nome":"Kamila Gonçalves","telefone":"5519981727724","grupo":""},{"id_warez":"23365736","usuario_antigo":"37159739","novo_usuario":"fd95478","nova_senha":"gdppq0y","nome":"Alexandre Pereira","telefone":"555496078997","grupo":""},{"id_warez":"11490083","usuario_antigo":"63901526","novo_usuario":"zc43821","nova_senha":"qpki7p5","nome":"Jonatas Reis","telefone":"5521993409110","grupo":""},{"id_warez":"100865449","usuario_antigo":"3000650","novo_usuario":"ob98998","nova_senha":"frhocn9","nome":"Sueli Nolasco","telefone":"5519992147337","grupo":""},{"id_warez":"43359","usuario_antigo":"5588410","novo_usuario":"gu44995","nova_senha":"zfk8ut0","nome":"Mony Santos","telefone":"5519981987861","grupo":""},{"id_warez":"102486295","usuario_antigo":"6797315","novo_usuario":"bp58190","nova_senha":"gvyie6i","nome":"Adao Severino","telefone":"5527998035932","grupo":""},{"id_warez":"102538208","usuario_antigo":"8375834","novo_usuario":"pq45592","nova_senha":"zioykl1","nome":"Stefany Biscalchim","telefone":"5519991974721","grupo":""},{"id_warez":"2870506","usuario_antigo":"4917024","novo_usuario":"bl99022","nova_senha":"755nf4z","nome":"Rosemeire Dantas","telefone":"5519971654704","grupo":""},{"id_warez":"26824432","usuario_antigo":"2040301","novo_usuario":"pz60826","nova_senha":"7eedtjv","nome":"Carlos Manesco","telefone":"5519981762098","grupo":""},{"id_warez":"100807336","usuario_antigo":"1775327","novo_usuario":"sf62498","nova_senha":"dpja1wj","nome":"Adelia Ribeiro","telefone":"5519987208833","grupo":""},{"id_warez":"100015229","usuario_antigo":"7428320","novo_usuario":"to40089","nova_senha":"t4ufel6","nome":"Rodrigo Joly","telefone":"5519998883002","grupo":""},{"id_warez":"60619973","usuario_antigo":"44101040","novo_usuario":"uw82217","nova_senha":"5owf759","nome":"Graziela Costa","telefone":"5519996773501","grupo":""},{"id_warez":"100634147","usuario_antigo":"2881707","novo_usuario":"vw07398","nova_senha":"53j2d54","nome":"Priscila Melo","telefone":"5511977289932","grupo":""},{"id_warez":"116655","usuario_antigo":"8124377","novo_usuario":"fv43720","nova_senha":"gl58kxo","nome":"Lucas Schiavon","telefone":"5519974199291","grupo":""},{"id_warez":"100207551","usuario_antigo":"7238794","novo_usuario":"zn91919","nova_senha":"jdp0lvs","nome":"Bruno Henrique","telefone":"5519971525960","grupo":""},{"id_warez":"102002518","usuario_antigo":"6215935","novo_usuario":"ko27095","nova_senha":"z0yncxl","nome":"Daniel Evaristo","telefone":"5519983234069","grupo":""},{"id_warez":"101293889","usuario_antigo":"3677828","novo_usuario":"iw73344","nova_senha":"kep7y6w","nome":"Jeans douglas","telefone":"5519992542585","grupo":""},{"id_warez":"102410811","usuario_antigo":"1675431","novo_usuario":"ho02456","nova_senha":"qphr62g","nome":"Ana Paula Eduardo","telefone":"5524999076009","grupo":""},{"id_warez":"102406541","usuario_antigo":"3899505","novo_usuario":"cn63876","nova_senha":"ihair4c","nome":"Motta","telefone":"5524981142657","grupo":""},{"id_warez":"101744868","usuario_antigo":"9331453","novo_usuario":"kq16426","nova_senha":"a11dpg8","nome":"Rafaella Ferraz","telefone":"5519981562527","grupo":""},{"id_warez":"102591172","usuario_antigo":"9619938","novo_usuario":"nb28486","nova_senha":"9v86wzs","nome":"Camila Roncato","telefone":"5519996767627","grupo":""},{"id_warez":"100913334","usuario_antigo":"8816294","novo_usuario":"vo87422","nova_senha":"w1swjck","nome":"Renata Thomaz","telefone":"5535910019091","grupo":""},{"id_warez":"102060973","usuario_antigo":"1151168","novo_usuario":"hi51267","nova_senha":"cotohp6","nome":"Luiz Deoclecio","telefone":"5519991748850","grupo":""},{"id_warez":"28642822","usuario_antigo":"36038578","novo_usuario":"ps87303","nova_senha":"148p0tv","nome":"Pedrilia","telefone":"5519998624314","grupo":""},{"id_warez":"100107057","usuario_antigo":"6980809","novo_usuario":"ff40364","nova_senha":"fqewaou","nome":"Elias","telefone":"5519998160882","grupo":""},{"id_warez":"100142643","usuario_antigo":"3669772","novo_usuario":"aq14032","nova_senha":"l1n13jc","nome":"Rosangela Freitas","telefone":"5521979018640","grupo":""},{"id_warez":"280230","usuario_antigo":"8179460","novo_usuario":"ao93676","nova_senha":"18hafey","nome":"Everton Queiroz","telefone":"5519987341692","grupo":""},{"id_warez":"101735950","usuario_antigo":"3165459","novo_usuario":"of67167","nova_senha":"e38daly","nome":"Iris Bezutte","telefone":"5519981630006","grupo":""},{"id_warez":"101438213","usuario_antigo":"1456643","novo_usuario":"yk70661","nova_senha":"14ve92m","nome":"Cristiane Titonelli","telefone":"5519978137676","grupo":""},{"id_warez":"101830805","usuario_antigo":"1321097","novo_usuario":"lj53881","nova_senha":"8w3zp08","nome":"Leandro Gomes","telefone":"5519982003332","grupo":""},{"id_warez":"102026312","usuario_antigo":"7708441","novo_usuario":"hv54472","nova_senha":"43d5iqv","nome":"Zilda Barco","telefone":"5519991840707","grupo":""},{"id_warez":"101759180","usuario_antigo":"2906608","novo_usuario":"ja81273","nova_senha":"5zja8dz","nome":"Wislei Rosa","telefone":"5516996042152","grupo":""},{"id_warez":"100769432","usuario_antigo":"4781673","novo_usuario":"mt66470","nova_senha":"hylurtp","nome":"Well Cardoso","telefone":"5519988101550","grupo":""},{"id_warez":"101932135","usuario_antigo":"4070032","novo_usuario":"ti72211","nova_senha":"et1ghr0","nome":"Higor Diego","telefone":"5519999863475","grupo":""},{"id_warez":"100683572","usuario_antigo":"7629003","novo_usuario":"zn21121","nova_senha":"atj9tze","nome":"Fernando Antonio","telefone":"5519995860122","grupo":""},{"id_warez":"102290162","usuario_antigo":"6679037","novo_usuario":"wm85441","nova_senha":"b7r3ocw","nome":"Agnaldo Pires","telefone":"5511985457492","grupo":""},{"id_warez":"100692682","usuario_antigo":"2986565","novo_usuario":"bd53917","nova_senha":"v2isqp4","nome":"Tamiris Santos","telefone":"5519998437680","grupo":""},{"id_warez":"101273374","usuario_antigo":"5373867","novo_usuario":"zh66792","nova_senha":"hxfgcaq","nome":"Rose Girotto","telefone":"5519997137268","grupo":""},{"id_warez":"2612917","usuario_antigo":"11665549","novo_usuario":"ph27746","nova_senha":"72wx7pt","nome":"Paulo Abibi","telefone":"5519996349432","grupo":""},{"id_warez":"449704","usuario_antigo":"3510236","novo_usuario":"qx80137","nova_senha":"ukeyz7s","nome":"Ademar","telefone":"5519989934135","grupo":""},{"id_warez":"100724541","usuario_antigo":"8023974","novo_usuario":"mc04320","nova_senha":"84u89yj","nome":"Michele Brito","telefone":"5519997717245","grupo":""},{"id_warez":"100866597","usuario_antigo":"7567561","novo_usuario":"bt46915","nova_senha":"wrdmly4","nome":"Anderson Paes","telefone":"5519999050282","grupo":"GRUPO 018"},{"id_warez":"100866597","usuario_antigo":"7567561","novo_usuario":"bt46915","nova_senha":"wrdmly4","nome":"Fernanda Longo","telefone":"5519920041503","grupo":"GRUPO 018"},{"id_warez":"100866597","usuario_antigo":"7567561","novo_usuario":"bt46915","nova_senha":"wrdmly4","nome":"Mauro Woscnak","telefone":"5547984324640","grupo":"GRUPO 018"},{"id_warez":"102454230","usuario_antigo":"4904964","novo_usuario":"is29854","nova_senha":"ll8os9x","nome":"Carlos Fava","telefone":"5511991112200","grupo":""},{"id_warez":"101746084","usuario_antigo":"9161347","novo_usuario":"ok13767","nova_senha":"ht7pze9","nome":"Yuri Rafael","telefone":"5519988018228","grupo":""},{"id_warez":"127325","usuario_antigo":"2078928","novo_usuario":"pg15509","nova_senha":"6qe3rzs","nome":"Daniela Porto","telefone":"5519981579512","grupo":""},{"id_warez":"102082458","usuario_antigo":"2939952","novo_usuario":"hv92539","nova_senha":"s55j2o7","nome":"Felipe Clazzer","telefone":"5519999214861","grupo":""},{"id_warez":"100884670","usuario_antigo":"8964584","novo_usuario":"nv22594","nova_senha":"ftmttql","nome":"Joao Eduardo","telefone":"5519981202955","grupo":""},{"id_warez":"102001627","usuario_antigo":"28734420","novo_usuario":"es52707","nova_senha":"z3nx39r","nome":"Leandro Facirolli","telefone":"5519981658787","grupo":""},{"id_warez":"102458713","usuario_antigo":"3145275","novo_usuario":"an58845","nova_senha":"q0oxfq8","nome":"Rafael Dezen","telefone":"5519998224568","grupo":""},{"id_warez":"62596593","usuario_antigo":"6308613378","novo_usuario":"is68883","nova_senha":"lz15bcw","nome":"Marlene Lopes","telefone":"5571986887737","grupo":""},{"id_warez":"58019992","usuario_antigo":"44625138","novo_usuario":"xz74068","nova_senha":"py6b2kn","nome":"Cristiano Cazelato","telefone":"5519994521055","grupo":""},{"id_warez":"128602","usuario_antigo":"7428539","novo_usuario":"dn57108","nova_senha":"wi6fqjj","nome":"Gledson Gois","telefone":"5519996991982","grupo":""},{"id_warez":"102272308","usuario_antigo":"36489858","novo_usuario":"au96143","nova_senha":"vxpj4hn","nome":"Evandro Arruda","telefone":"5519953283406","grupo":""},{"id_warez":"100686195","usuario_antigo":"4117200","novo_usuario":"mg55929","nova_senha":"xjuy0bv","nome":"Viviane Arruda","telefone":"5519971522577","grupo":""},{"id_warez":"102481754","usuario_antigo":"4384470","novo_usuario":"mx27636","nova_senha":"wyzx4w6","nome":"Mayara Rodrigues","telefone":"5519971168301","grupo":"GRUPO 014"},{"id_warez":"102481754","usuario_antigo":"4384470","novo_usuario":"mx27636","nova_senha":"wyzx4w6","nome":"Fatima Santos","telefone":"5519981738211","grupo":"GRUPO 014"},{"id_warez":"101590376","usuario_antigo":"3234391","novo_usuario":"qi45702","nova_senha":"0get8t6","nome":"Marcos Antonio","telefone":"5519997315686","grupo":""},{"id_warez":"101920759","usuario_antigo":"9588341","novo_usuario":"vg84873","nova_senha":"e8f8409","nome":"Murilo Coimbra","telefone":"5519991362068","grupo":"GRUPO 019"},{"id_warez":"101920759","usuario_antigo":"9588341","novo_usuario":"vg84873","nova_senha":"e8f8409","nome":"Juliana Valle","telefone":"5519994414924","grupo":"GRUPO 019"},{"id_warez":"101920759","usuario_antigo":"9588341","novo_usuario":"vg84873","nova_senha":"e8f8409","nome":"Roberto Petter","telefone":"5551992600736","grupo":"GRUPO 019"},{"id_warez":"79290","usuario_antigo":"6580682","novo_usuario":"zu37054","nova_senha":"yyv37di","nome":"Gerlandia","telefone":"5519997385270","grupo":""},{"id_warez":"81286872","usuario_antigo":"5181212","novo_usuario":"aw59208","nova_senha":"6kof8kr","nome":"Rodolfo Abreu","telefone":"5519996807152","grupo":""},{"id_warez":"101754079","usuario_antigo":"3738950","novo_usuario":"cx14679","nova_senha":"p0fodro","nome":"Jucilandia","telefone":"5519993880464","grupo":""},{"id_warez":"101102307","usuario_antigo":"4295374","novo_usuario":"ya34980","nova_senha":"yt9moge","nome":"Rafael Correa","telefone":"5519997503242","grupo":""},{"id_warez":"42316","usuario_antigo":"2770472","novo_usuario":"wl66507","nova_senha":"ieuc1hh","nome":"Tania Ferreira","telefone":"5519999330202","grupo":""},{"id_warez":"295055","usuario_antigo":"3789853","novo_usuario":"wi19081","nova_senha":"ejgxaa2","nome":"Carlos Silva","telefone":"5519983563165","grupo":""},{"id_warez":"102326630","usuario_antigo":"2438680","novo_usuario":"gi10757","nova_senha":"r2sds8b","nome":"Leticia Pavan","telefone":"5519983410409","grupo":""},{"id_warez":"101003799","usuario_antigo":"8715167","novo_usuario":"uw54904","nova_senha":"oyr6ccv","nome":"Ricardo Eleuterio","telefone":"5519996215702","grupo":""},{"id_warez":"100858780","usuario_antigo":"4807156","novo_usuario":"bh65395","nova_senha":"qvdz4x1","nome":"Alessandra Araujo","telefone":"5519999753032","grupo":""},{"id_warez":"100262111","usuario_antigo":"8933047","novo_usuario":"sf42344","nova_senha":"dpxnf7c","nome":"Jeferson Castilho","telefone":"5519996272526","grupo":""},{"id_warez":"102502166","usuario_antigo":"4990894","novo_usuario":"vc07855","nova_senha":"ulemx15","nome":"Cicero Telles","telefone":"5535991410178","grupo":""},{"id_warez":"101929473","usuario_antigo":"7576872","novo_usuario":"sz63526","nova_senha":"id4n1u3","nome":"Jonatan Dorigan","telefone":"5519996374530","grupo":"GRUPO 004"},{"id_warez":"101929473","usuario_antigo":"7576872","novo_usuario":"sz63526","nova_senha":"id4n1u3","nome":"Wilker Rodrigues","telefone":"5598988484555","grupo":"GRUPO 004"},{"id_warez":"101929473","usuario_antigo":"7576872","novo_usuario":"sz63526","nova_senha":"id4n1u3","nome":"Edilene Marques","telefone":"5519991809824","grupo":"GRUPO 004"},{"id_warez":"100652589","usuario_antigo":"2732908","novo_usuario":"vz86609","nova_senha":"3jgzlma","nome":"Jose Fernandes","telefone":"5519991246678","grupo":""},{"id_warez":"101656551","usuario_antigo":"7041686","novo_usuario":"wo41607","nova_senha":"hpmnz1u","nome":"Sandra de Sá","telefone":"5519983809760","grupo":""},{"id_warez":"102488576","usuario_antigo":"4349188","novo_usuario":"cb16626","nova_senha":"rpj1epk","nome":"Joice Tosini","telefone":"5511943548189","grupo":""},{"id_warez":"102438443","usuario_antigo":"9767812","novo_usuario":"rm60350","nova_senha":"khejla0","nome":"Paula Balbino","telefone":"5519996263373","grupo":""},{"id_warez":"102324884","usuario_antigo":"4192081","novo_usuario":"ej75880","nova_senha":"5ba75uu","nome":"Geraldo Sobrinho","telefone":"5519981255063","grupo":""},{"id_warez":"102325617","usuario_antigo":"1909630","novo_usuario":"sk10386","nova_senha":"37d4ivs","nome":"Juscelino Pereira","telefone":"5519984141570","grupo":""},{"id_warez":"101039603","usuario_antigo":"7278070","novo_usuario":"ki33151","nova_senha":"s6m033i","nome":"Nelson Roque","telefone":"5521985694315","grupo":""},{"id_warez":"100816193","usuario_antigo":"1976655","novo_usuario":"df67617","nova_senha":"r11q7uw","nome":"Alessandra Ruiz","telefone":"5519993322501","grupo":""},{"id_warez":"100785839","usuario_antigo":"9364969","novo_usuario":"qw61043","nova_senha":"jcslqc3","nome":"Geison Ongaro","telefone":"5519992764455","grupo":""},{"id_warez":"2577955","usuario_antigo":"86314709","novo_usuario":"bw86545","nova_senha":"26q3xlr","nome":"Israel Viana","telefone":"5519999601981","grupo":""},{"id_warez":"46275684","usuario_antigo":"41272305","novo_usuario":"db18375","nova_senha":"gippsfn","nome":"Roque Messias","telefone":"5511997991884","grupo":""},{"id_warez":"13516077","usuario_antigo":"89045909","novo_usuario":"hk35760","nova_senha":"dyk0x65","nome":"Roque Messias","telefone":"5511997991884","grupo":""},{"id_warez":"2725932","usuario_antigo":"41245388","novo_usuario":"ip13963","nova_senha":"v7ln23y","nome":"Sirlei Lima","telefone":"5519971132935","grupo":""},{"id_warez":"100676318","usuario_antigo":"3739826","novo_usuario":"vt65643","nova_senha":"ngh8rie","nome":"Carolina Henrique","telefone":"5511999966188","grupo":""},{"id_warez":"174719","usuario_antigo":"1931435","novo_usuario":"cv17880","nova_senha":"m1enf31","nome":"Vanessa Gregorio","telefone":"5519988019395","grupo":""},{"id_warez":"102006834","usuario_antigo":"4926740","novo_usuario":"ve44624","nova_senha":"k0qtl3q","nome":"Welinson Tiago","telefone":"5515998563175","grupo":""},{"id_warez":"101742548","usuario_antigo":"6694086","novo_usuario":"vj99423","nova_senha":"s832ejx","nome":"Claudineia Alves","telefone":"551998066515","grupo":"GRUPO 007"},{"id_warez":"101742548","usuario_antigo":"6694086","novo_usuario":"vj99423","nova_senha":"s832ejx","nome":"kaique","telefone":"5518988066585","grupo":"GRUPO 007"},{"id_warez":"101742548","usuario_antigo":"6694086","novo_usuario":"vj99423","nova_senha":"s832ejx","nome":"Eric Ramalho","telefone":"5519996832507","grupo":"GRUPO 007"},{"id_warez":"101371284","usuario_antigo":"5596127","novo_usuario":"wo18827","nova_senha":"j6fp8hq","nome":"Janaina Lima","telefone":"5519996671263","grupo":""},{"id_warez":"102386772","usuario_antigo":"5994170","novo_usuario":"ja05293","nova_senha":"b74x2ek","nome":"Rubens Barbosa","telefone":"5571981541569","grupo":""},{"id_warez":"101073898","usuario_antigo":"7765019","novo_usuario":"vs17400","nova_senha":"j4t0sek","nome":"Jose Carlos","telefone":"5519997104360","grupo":""},{"id_warez":"100546125","usuario_antigo":"8587655","novo_usuario":"hb47419","nova_senha":"vasifpw","nome":"Marco Pedronetti","telefone":"5519992013605","grupo":""},{"id_warez":"101927630","usuario_antigo":"6974667","novo_usuario":"gk60905","nova_senha":"s9toqw9","nome":"Mayra Schiabel","telefone":"5519997155655","grupo":""},{"id_warez":"68949806","usuario_antigo":"13032891","novo_usuario":"ga73767","nova_senha":"0lbt3g2","nome":"Maria Aparecida","telefone":"5519981898200","grupo":""},{"id_warez":"208234","usuario_antigo":"4632896","novo_usuario":"ms68074","nova_senha":"kbhb7s9","nome":"Jose Roberto","telefone":"5519992369902","grupo":""},{"id_warez":"43503569","usuario_antigo":"71857179","novo_usuario":"og71378","nova_senha":"len606n","nome":"Roberto Silva","telefone":"5519997738812","grupo":""},{"id_warez":"100735718","usuario_antigo":"7746599","novo_usuario":"zm49587","nova_senha":"cv3tlcx","nome":"Liliane Souza","telefone":"5519996722580","grupo":""},{"id_warez":"100858816","usuario_antigo":"7555908","novo_usuario":"hp46308","nova_senha":"m9j98cw","nome":"Adalberto Queiroz","telefone":"5521964617955","grupo":""},{"id_warez":"204173","usuario_antigo":"7467928","novo_usuario":"ju69167","nova_senha":"bc2nnuv","nome":"Lourival Martinelli","telefone":"5519997070136","grupo":""},{"id_warez":"116651","usuario_antigo":"9878131","novo_usuario":"ry37553","nova_senha":"xie0rnu","nome":"Victor Franco","telefone":"5519998711280","grupo":""},{"id_warez":"102253140","usuario_antigo":"6151006","novo_usuario":"gg49294","nova_senha":"e4q6qdy","nome":"Nicolas Alves","telefone":"5531999694729","grupo":""},{"id_warez":"100622697","usuario_antigo":"8713649","novo_usuario":"vi30588","nova_senha":"z7w2seh","nome":"Pedro Balbino","telefone":"5519995966553","grupo":""},{"id_warez":"420257","usuario_antigo":"2454082","novo_usuario":"du05385","nova_senha":"wdl9zs1","nome":"Pedro Ivo","telefone":"5519988009467","grupo":""},{"id_warez":"100623863","usuario_antigo":"6659665","novo_usuario":"vb96463","nova_senha":"52xg8p6","nome":"Rita Balbino","telefone":"5519995966553","grupo":""},{"id_warez":"100648145","usuario_antigo":"7499458","novo_usuario":"bd11373","nova_senha":"764jwte","nome":"Alessandra Ramire","telefone":"5519996781095","grupo":""},{"id_warez":"102218376","usuario_antigo":"53382269","novo_usuario":"hn51916","nova_senha":"zv4u3bb","nome":"Edna","telefone":"5519988717447","grupo":""},{"id_warez":"101883705","usuario_antigo":"5185391","novo_usuario":"qo67464","nova_senha":"wk8r2yk","nome":"Cris Rosa","telefone":"5554992105009","grupo":""},{"id_warez":"1127511","usuario_antigo":"9555021","novo_usuario":"bb44263","nova_senha":"z049enu","nome":"Luciano Galdino","telefone":"5511983663599","grupo":""},{"id_warez":"352742","usuario_antigo":"8991365","novo_usuario":"im22023","nova_senha":"wi5flul","nome":"Wilson Duarte","telefone":"5519999773954","grupo":""},{"id_warez":"31690533","usuario_antigo":"98713485","novo_usuario":"tm54309","nova_senha":"s8hmbr5","nome":"Carlos Luis","telefone":"5519998981942","grupo":""},{"id_warez":"101920734","usuario_antigo":"9144827","novo_usuario":"rm58487","nova_senha":"1nouhtc","nome":"Eduardo almeida","telefone":"5519994256527","grupo":"GRUPO 030"},{"id_warez":"101920734","usuario_antigo":"9144827","novo_usuario":"rm58487","nova_senha":"1nouhtc","nome":"Elaine Pardo","telefone":"5519983690442","grupo":"GRUPO 030"},{"id_warez":"101920734","usuario_antigo":"9144827","novo_usuario":"rm58487","nova_senha":"1nouhtc","nome":"Michele Mariconi","telefone":"5519981339214","grupo":"GRUPO 030"},{"id_warez":"101663534","usuario_antigo":"5385922","novo_usuario":"nt29619","nova_senha":"o2m71hs","nome":"Manuel Filho","telefone":"5519989713858","grupo":""},{"id_warez":"100906903","usuario_antigo":"9981410","novo_usuario":"nb13446","nova_senha":"slwf90k","nome":"Luis Fernando 2","telefone":"5519997553798","grupo":""},{"id_warez":"100207630","usuario_antigo":"2444137","novo_usuario":"iv57283","nova_senha":"y9v20ya","nome":"Maristela Barbosa","telefone":"5517981118650","grupo":""},{"id_warez":"202583","usuario_antigo":"48907655","novo_usuario":"mz77575","nova_senha":"gww4fyb","nome":"Cleber Ramos","telefone":"5519998717581","grupo":"GRUPO 012"},{"id_warez":"202583","usuario_antigo":"48907655","novo_usuario":"mz77575","nova_senha":"gww4fyb","nome":"Wagner Aguiar","telefone":"5519996414675","grupo":"GRUPO 012"},{"id_warez":"202583","usuario_antigo":"48907655","novo_usuario":"mz77575","nova_senha":"gww4fyb","nome":"Priscila Gomes","telefone":"551974157651","grupo":"GRUPO 012"},{"id_warez":"100879657","usuario_antigo":"5151576","novo_usuario":"yc03164","nova_senha":"1750ceh","nome":"Bruno Alves","telefone":"5519987190237","grupo":"GRUPO 025"},{"id_warez":"100879657","usuario_antigo":"5151576","novo_usuario":"yc03164","nova_senha":"1750ceh","nome":"Jeferson Pinheiro","telefone":"5519999959212","grupo":"GRUPO 025"},{"id_warez":"100879657","usuario_antigo":"5151576","novo_usuario":"yc03164","nova_senha":"1750ceh","nome":"Juliana Oliveira","telefone":"5519987070626","grupo":"GRUPO 025"},{"id_warez":"101272984","usuario_antigo":"1909924","novo_usuario":"ir53193","nova_senha":"m1zxyvg","nome":"Fabiana Jorge","telefone":"5519995536306","grupo":"GRUPO 008"},{"id_warez":"101272984","usuario_antigo":"1909924","novo_usuario":"ir53193","nova_senha":"m1zxyvg","nome":"Laura Rodrigues","telefone":"5519997860405","grupo":"GRUPO 008"},{"id_warez":"101272984","usuario_antigo":"1909924","novo_usuario":"ir53193","nova_senha":"m1zxyvg","nome":"Andrey Vinicius","telefone":"5519997960039","grupo":"GRUPO 008"},{"id_warez":"22276816","usuario_antigo":"36795829","novo_usuario":"go29222","nova_senha":"zlm72je","nome":"Thaís Glauser","telefone":"5519982681534","grupo":"GRUPO 013"},{"id_warez":"22276816","usuario_antigo":"36795829","novo_usuario":"go29222","nova_senha":"zlm72je","nome":"Antonio Jose","telefone":"5519998381767","grupo":"GRUPO 013"},{"id_warez":"22276816","usuario_antigo":"36795829","novo_usuario":"go29222","nova_senha":"zlm72je","nome":"Alvaro Rosa","telefone":"5519983133313","grupo":"GRUPO 013"},{"id_warez":"40818889","usuario_antigo":"25318828","novo_usuario":"rj98982","nova_senha":"kzmpjrh","nome":"Juliana Gomes","telefone":"5519993500722","grupo":"GRUPO 026"},{"id_warez":"40818889","usuario_antigo":"25318828","novo_usuario":"rj98982","nova_senha":"kzmpjrh","nome":"Alex Gutemberg","telefone":"5521979888859","grupo":"GRUPO 026"},{"id_warez":"40818889","usuario_antigo":"25318828","novo_usuario":"rj98982","nova_senha":"kzmpjrh","nome":"Isabele Campos","telefone":"5519971583288","grupo":"GRUPO 026"},{"id_warez":"102047284","usuario_antigo":"1917564","novo_usuario":"oy61652","nova_senha":"ytwbozd","nome":"Celia Zani","telefone":"5519994006075","grupo":""},{"id_warez":"102573143","usuario_antigo":"9318210","novo_usuario":"ua59498","nova_senha":"rh8lx6d","nome":"Helena Rocha","telefone":"5521980672161","grupo":""},{"id_warez":"102042646","usuario_antigo":"5937317","novo_usuario":"on79918","nova_senha":"g79or78","nome":"Josiane Leite 1","telefone":"5519997653022","grupo":""},{"id_warez":"102504779","usuario_antigo":"18806982","novo_usuario":"yw05192","nova_senha":"9tr74qg","nome":"Nadia Silvia","telefone":"5577998427769","grupo":""},{"id_warez":"162574","usuario_antigo":"3842632","novo_usuario":"ce42177","nova_senha":"u1g463s","nome":"Flavio Santos","telefone":"5519996507662","grupo":""},{"id_warez":"100733327","usuario_antigo":"4285199","novo_usuario":"cr11322","nova_senha":"i18k0ax","nome":"Renan Clemente","telefone":"5519993315226","grupo":""},{"id_warez":"28438882","usuario_antigo":"79887473","novo_usuario":"sb13458","nova_senha":"zle6kwh","nome":"Cristina Pedro","telefone":"5519988283115","grupo":""},{"id_warez":"10379755","usuario_antigo":"65885402","novo_usuario":"dd76454","nova_senha":"txhi15c","nome":"Jonas Bertolino","telefone":"5519996221529","grupo":""},{"id_warez":"5609901","usuario_antigo":"68891357","novo_usuario":"ls05055","nova_senha":"uflsehu","nome":"Verusca Fray","telefone":"5519998824307","grupo":""}]

  router.post('/atualizacao139/warez', async (req, res) => {
    const resultado = []
    for (const linha of PLANO_139_DATA) {
      try {
        const BKND = 'https://iptv-manager-production.up.railway.app'
        const resp = await fetch(BKND + '/painel/linha-patch/' + linha.id_warez, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: linha.novo_usuario, password: linha.nova_senha })
        }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
        console.log('[139-WAREZ] ' + linha.id_warez + ' ' + linha.novo_usuario + ' -> ' + (resp?.data?.username || resp?.data?.message || 'ok'))
        resultado.push({ id: linha.id_warez, ok: !!resp.ok, novo: linha.novo_usuario })
      } catch(e) { resultado.push({ id: linha.id_warez, ok: false, erro: e.message }) }
    }
    const sucesso = resultado.filter(r => r.ok).length
    res.json({ ok: true, total: PLANO_139_DATA.length, sucesso, falhas: resultado.filter(r => !r.ok) })
  })

  router.post('/atualizacao139/firestore', async (req, res) => {
    let atualizado = 0, erros = []
    for (const reg of REGISTROS_139_DATA) {
      try {
        const num = normalizarTelefone(reg.telefone)
        const snap = await db.collection('clientes').where('telefone', '==', num).limit(1).get()
        if (snap.empty) { erros.push(reg.nome + ': nao encontrado'); continue }
        await snap.docs[0].ref.update({ usuario: reg.novo_usuario, senha: reg.nova_senha })
        atualizado++
      } catch(e) { erros.push(reg.nome + ': ' + e.message) }
    }
    console.log('[139-FIRESTORE] ' + atualizado + '/' + REGISTROS_139_DATA.length + ' atualizados')
    res.json({ ok: true, total: REGISTROS_139_DATA.length, atualizado, erros })
  })

  router.post('/atualizacao139/mensagens', async (req, res) => {
    let enfileirados = 0, erros = []
    for (const reg of REGISTROS_139_DATA) {
      try {
        const msg = 'Ola ' + reg.nome + '! Tivemos uma atualizacao emergencial no servidor e seus dados de acesso precisaram ser alterados.

Seus novos dados:

 Usuario: ' + reg.novo_usuario + '
 Senha: ' + reg.nova_senha + '

Atualiza no seu app assim que puder. Qualquer duvida e so me chamar!'
        await db.collection('filaEnvios').add({
          clienteId: null, clienteNome: reg.nome, telefone: reg.telefone,
          mensagem: msg, midiaUrl: null, midiaTipo: null, midiaNome: null,
          modoEnvio: 'junto', gatilho: 'atualizacao-emergencial-139',
          status: 'pendente', tentativas: 0, maxTentativas: MAX_TENTATIVAS,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          proximaTentativa: admin.firestore.Timestamp.now(),
          enviadoEm: null, erro: null,
        })
        enfileirados++
      } catch(e) { erros.push(reg.nome + ': ' + e.message) }
    }
    console.log('[139-MSGS] ' + enfileirados + ' mensagens enfileiradas')
    res.json({ ok: true, enfileirados, erros })
  })

  router.post('/grupos/setar-titular-g1g2', async (req, res) => {
    try {
      let total = 0
      for (const [grupo, titular] of [['GRUPO 1', 'Douglas Cruz'], ['GRUPO 2', 'Elaine Juraszek']]) {
        const snap = await db.collection('clientes').where('grupoLinha', '==', grupo).get()
        if (snap.empty) { console.log('[TITULAR] ' + grupo + ': nenhum membro'); continue }
        const batch = db.batch()
        snap.docs.forEach(d => batch.update(d.ref, { titularNome: titular }))
        await batch.commit()
        total += snap.size
        console.log('[TITULAR] ' + grupo + ': ' + titular + ' => ' + snap.size + ' membros')
      }
      res.json({ ok: true, total })
    } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  router.post('/grupos/setar-titular', async (req, res) => {
    const TITULARES = {"GRUPO 001":"Douglas Cruz","GRUPO 002":"Elaine Juraszek","GRUPO 003":"Damiana Souza","GRUPO 004":"Edilene Marques","GRUPO 005":"Stephanie Silva","GRUPO 006":"Guilherme GP","GRUPO 007":"Claudineia Alves","GRUPO 008":"Andrey Vinicius","GRUPO 009":"Josuel Melo","GRUPO 010":"Elisonia Santos","GRUPO 011":"Danilo Adorno","GRUPO 012":"Wagner Aguiar","GRUPO 013":"Antonio Jose","GRUPO 014":"Fatima Santos","GRUPO 015":"Marcus Vinicius","GRUPO 016":"Luciana Almeida","GRUPO 017":"Luis Facca","GRUPO 018":"Anderson Paes","GRUPO 019":"Roberto Petter","GRUPO 020":"Stephanny Mariano","GRUPO 021":"Wirnna","GRUPO 022":"Aline Vivaldo","GRUPO 023":"Sergio Perches","GRUPO 024":"Ary Moura"}
    try {
      let total = 0, erros = []
      for (const [grupo, titular] of Object.entries(TITULARES)) {
        const snap = await db.collection('clientes').where('grupoLinha', '==', grupo).get()
        if (snap.empty) { erros.push(grupo + ': nenhum membro'); continue }
        const batch = db.batch()
        snap.docs.forEach(d => batch.update(d.ref, { titularNome: titular }))
        await batch.commit()
        total += snap.size
        console.log('[TITULAR] ' + grupo + ': ' + titular + ' => ' + snap.size + ' membros')
      }
      res.json({ ok: true, total, erros })
    } catch(e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // Rota temporaria: aplica grupos 025-034
  const REGISTROS_025_034 = [{"telefone":"5519999959212","nome":"Jeferson Pinheiro","usuario":"5151576","senha":"3992875","grupoLinha":"GRUPO 025","vencimentoLinha":"16/07/2026","titularNome":"Juliana Oliveira","mudaLogin":true},{"telefone":"5519987190237","nome":"Bruno Alves","usuario":"5151576","senha":"3992875","grupoLinha":"GRUPO 025","vencimentoLinha":"16/07/2026","titularNome":"Juliana Oliveira","mudaLogin":true},{"telefone":"5519987070626","nome":"Juliana Oliveira","usuario":"5151576","senha":"3992875","grupoLinha":"GRUPO 025","vencimentoLinha":"16/07/2026","titularNome":"Juliana Oliveira","mudaLogin":false},{"telefone":"5521979888859","nome":"Alex Gutemberg","usuario":"25318828","senha":"908p4p3","grupoLinha":"GRUPO 026","vencimentoLinha":"18/07/2026","titularNome":"Juliana Gomes","mudaLogin":true},{"telefone":"5519993500722","nome":"Juliana Gomes","usuario":"25318828","senha":"908p4p3","grupoLinha":"GRUPO 026","vencimentoLinha":"18/07/2026","titularNome":"Juliana Gomes","mudaLogin":false},{"telefone":"5519971583288","nome":"Isabele Campos","usuario":"25318828","senha":"908p4p3","grupoLinha":"GRUPO 026","vencimentoLinha":"18/07/2026","titularNome":"Juliana Gomes","mudaLogin":true},{"telefone":"5519997398364","nome":"Felipe Rocha","usuario":"4367fc1","senha":"v532j71","grupoLinha":"GRUPO 027","vencimentoLinha":"24/07/2026","titularNome":"Edson Dias","mudaLogin":true},{"telefone":"5519993628538","nome":"Paulo Rodrigo","usuario":"4367fc1","senha":"v532j71","grupoLinha":"GRUPO 027","vencimentoLinha":"24/07/2026","titularNome":"Edson Dias","mudaLogin":true},{"telefone":"5519982537015","nome":"Edson Dias","usuario":"4367fc1","senha":"v532j71","grupoLinha":"GRUPO 027","vencimentoLinha":"24/07/2026","titularNome":"Edson Dias","mudaLogin":false},{"telefone":"5522996115792","nome":"Paulo Roberto","usuario":"3434g2k","senha":"109r63s","grupoLinha":"GRUPO 028","vencimentoLinha":"30/07/2026","titularNome":"Larissa Aparecida","mudaLogin":true},{"telefone":"5519998506443","nome":"Elizabete Paiva","usuario":"3434g2k","senha":"109r63s","grupoLinha":"GRUPO 028","vencimentoLinha":"30/07/2026","titularNome":"Larissa Aparecida","mudaLogin":true},{"telefone":"5519982475501","nome":"Larissa Aparecida","usuario":"3434g2k","senha":"109r63s","grupoLinha":"GRUPO 028","vencimentoLinha":"30/07/2026","titularNome":"Larissa Aparecida","mudaLogin":false},{"telefone":"5519996226467","nome":"Mary Zanotti","usuario":"w672e02","senha":"928x18k","grupoLinha":"GRUPO 029","vencimentoLinha":"01/08/2026","titularNome":"Gustavo Souza","mudaLogin":true},{"telefone":"5519997463180","nome":"Rosilda Adao","usuario":"w672e02","senha":"928x18k","grupoLinha":"GRUPO 029","vencimentoLinha":"01/08/2026","titularNome":"Gustavo Souza","mudaLogin":true},{"telefone":"5519971279930","nome":"Gustavo Souza","usuario":"w672e02","senha":"928x18k","grupoLinha":"GRUPO 029","vencimentoLinha":"01/08/2026","titularNome":"Gustavo Souza","mudaLogin":false},{"telefone":"5519981339214","nome":"Michele Mariconi","usuario":"9144827","senha":"5382794","grupoLinha":"GRUPO 030","vencimentoLinha":"08/08/2026","titularNome":"Eduardo almeida","mudaLogin":true},{"telefone":"5519983690442","nome":"Elaine Pardo","usuario":"9144827","senha":"5382794","grupoLinha":"GRUPO 030","vencimentoLinha":"08/08/2026","titularNome":"Eduardo almeida","mudaLogin":true},{"telefone":"5519994256527","nome":"Eduardo almeida","usuario":"9144827","senha":"5382794","grupoLinha":"GRUPO 030","vencimentoLinha":"08/08/2026","titularNome":"Eduardo almeida","mudaLogin":false},{"telefone":"5511985063670","nome":"Maria Augusta","usuario":"k534h81","senha":"m82r692","grupoLinha":"GRUPO 031","vencimentoLinha":"25/08/2026","titularNome":"Marcos Lemes","mudaLogin":true},{"telefone":"5519996452069","nome":"Henrique Alcantara","usuario":"k534h81","senha":"m82r692","grupoLinha":"GRUPO 031","vencimentoLinha":"25/08/2026","titularNome":"Marcos Lemes","mudaLogin":true},{"telefone":"‪5519992520801‬","nome":"Marcos Lemes","usuario":"k534h81","senha":"m82r692","grupoLinha":"GRUPO 031","vencimentoLinha":"25/08/2026","titularNome":"Marcos Lemes","mudaLogin":false},{"telefone":"554799765161","nome":"Marcelo Goudard","usuario":"94c67p9","senha":"1ym6952","grupoLinha":"GRUPO 032","vencimentoLinha":"02/09/2026","titularNome":"Adriano Ramos","mudaLogin":true},{"telefone":"5519998938595","nome":"Josi Almeida","usuario":"94c67p9","senha":"1ym6952","grupoLinha":"GRUPO 032","vencimentoLinha":"02/09/2026","titularNome":"Adriano Ramos","mudaLogin":true},{"telefone":"5519971293626","nome":"Adriano Ramos","usuario":"94c67p9","senha":"1ym6952","grupoLinha":"GRUPO 032","vencimentoLinha":"02/09/2026","titularNome":"Adriano Ramos","mudaLogin":false},{"telefone":"5519997189133","nome":"Andre Sá","usuario":"rm53026","senha":"47435da","grupoLinha":"GRUPO 033","vencimentoLinha":"17/09/2026","titularNome":"Murylo Soares","mudaLogin":true},{"telefone":"5511970926599","nome":"Glaucia da Silva","usuario":"rm53026","senha":"47435da","grupoLinha":"GRUPO 033","vencimentoLinha":"17/09/2026","titularNome":"Murylo Soares","mudaLogin":true},{"telefone":"5519981954238","nome":"Murylo Soares","usuario":"rm53026","senha":"47435da","grupoLinha":"GRUPO 033","vencimentoLinha":"17/09/2026","titularNome":"Murylo Soares","mudaLogin":false},{"telefone":"5519998522700","nome":"Jose Luciano","usuario":"66hd838","senha":"rj00499","grupoLinha":"GRUPO 034","vencimentoLinha":"02/11/2026","titularNome":"Odair José","mudaLogin":true},{"telefone":"5519996177466","nome":"Fernanda Sampaio","usuario":"66hd838","senha":"rj00499","grupoLinha":"GRUPO 034","vencimentoLinha":"02/11/2026","titularNome":"Odair José","mudaLogin":true},{"telefone":"5512996661108","nome":"Odair José","usuario":"66hd838","senha":"rj00499","grupoLinha":"GRUPO 034","vencimentoLinha":"02/11/2026","titularNome":"Odair José","mudaLogin":false}]

  router.post('/grupos/aplicar-025-034', async (req, res) => {
    try {
      const resultado = []
      for (const reg of REGISTROS_025_034) {
        const num = normalizarTelefone(reg.telefone)
        const snap = await db.collection('clientes').where('telefone', '==', num).limit(1).get()
        if (snap.empty) { resultado.push({ nome: reg.nome, ok: false, erro: 'nao encontrado' }); continue }
        await snap.docs[0].ref.update({
          grupoLinha: reg.grupoLinha, vencimentoLinha: reg.vencimentoLinha,
          titularNome: reg.titularNome,
          ...(reg.mudaLogin ? { usuario: reg.usuario, senha: reg.senha } : {})
        })
        resultado.push({ nome: reg.nome, ok: true, mudaLogin: reg.mudaLogin })
      }
      const sucesso = resultado.filter(r => r.ok).length
      const falhas  = resultado.filter(r => !r.ok)
      console.log('[GRUPOS-025-034] ' + sucesso + '/' + REGISTROS_025_034.length + ' | Falhas: ' + falhas.length)
      res.json({ ok: true, total: REGISTROS_025_034.length, sucesso, falhas })
    } catch(err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/grupos/disparar-025-034', async (req, res) => {
    try {
      let enfileirados = 0
      for (const reg of REGISTROS_025_034) {
        if (!reg.mudaLogin) continue
        const mensagem = 'Olá ' + reg.nome + '! 📺 Seus dados de acesso foram atualizados:\n\n👤 Usuário: ' + reg.usuario + '\n🔑 Senha: ' + reg.senha + '\n\nAtualize no seu aplicativo. Qualquer dúvida estamos à disposição!'
        await db.collection('filaEnvios').add({
          clienteId: null, clienteNome: reg.nome, telefone: reg.telefone,
          mensagem, midiaUrl: null, midiaTipo: null, midiaNome: null,
          modoEnvio: 'junto', gatilho: 'grupo-lote-025-034',
          status: 'pendente', tentativas: 0, maxTentativas: MAX_TENTATIVAS,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          proximaTentativa: admin.firestore.Timestamp.now(),
          enviadoEm: null, erro: null,
        })
        enfileirados++
      }
      console.log('[GRUPOS-025-034] ' + enfileirados + ' mensagens enfileiradas')
      res.json({ ok: true, enfileirados })
    } catch(err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/grupos/reverter-dois', async (req, res) => {
    try {
      const reversoes = [
        { telefone: '5519996316712', usuario: '9347446', senha: '1775088', nome: 'Claudia Almeida' },
        { telefone: '5519996767627', usuario: '9619938', senha: '8091913', nome: 'Camila Roncato' },
      ]
      const resultado = []
      for (const r of reversoes) {
        const num = normalizarTelefone(r.telefone)
        const snap = await db.collection('clientes').where('telefone', '==', num).limit(1).get()
        if (snap.empty) { resultado.push({ nome: r.nome, ok: false, erro: 'nao encontrado' }); continue }
        await snap.docs[0].ref.update({
          usuario: r.usuario, senha: r.senha,
          grupoLinha: '', vencimentoLinha: '',
        })
        resultado.push({ nome: r.nome, ok: true })
      }
      res.json({ ok: true, resultado })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/grupos/aplicar-lote', async (req, res) => {
    try {
      const resultado = []
      for (const reg of REGISTROS_GRUPOS) {
        const num = normalizarTelefone(reg.telefone)
        const snap = await db.collection('clientes').where('telefone', '==', num).limit(1).get()
        if (snap.empty) {
          resultado.push({ nome: reg.nome, telefone: reg.telefone, ok: false, erro: 'cliente nao encontrado' })
          continue
        }
        const ref = snap.docs[0].ref
        const updateData = {
          grupoLinha: reg.grupoLinha,
          vencimentoLinha: reg.vencimentoLinha,
        }
        if (reg.mudaLogin) {
          updateData.usuario = reg.usuario
          updateData.senha = reg.senha
        }
        await ref.update(updateData)
        resultado.push({ nome: reg.nome, telefone: reg.telefone, ok: true, mudaLogin: reg.mudaLogin })
      }
      const sucesso = resultado.filter(r => r.ok).length
      const falhas = resultado.filter(r => !r.ok)
      console.log(`[GRUPOS-LOTE] Aplicado: ${sucesso}/${REGISTROS_GRUPOS.length} | Falhas: ${falhas.length}`)
      if (falhas.length) console.log('[GRUPOS-LOTE] Falhas:', JSON.stringify(falhas))
      res.json({ ok: true, total: REGISTROS_GRUPOS.length, sucesso, falhas })
    } catch (err) {
      console.error('[GRUPOS-LOTE] erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/grupos/disparar-msgs', async (req, res) => {
    try {
      let enfileirados = 0
      for (const reg of REGISTROS_GRUPOS) {
        if (!reg.mudaLogin) continue
        const mensagem = `Olá ${reg.nome}! 📺 Atualizamos os dados de acesso da sua linha:

👤 Usuário: ${reg.usuario}
🔑 Senha: ${reg.senha}

Por favor, atualize esses dados no seu aplicativo. Qualquer dúvida estamos à disposição!`
        await db.collection('filaEnvios').add({
          clienteId: null,
          clienteNome: reg.nome,
          telefone: reg.telefone,
          mensagem,
          midiaUrl: null,
          midiaTipo: null,
          midiaNome: null,
          modoEnvio: 'junto',
          gatilho: 'grupo-lote',
          status: 'pendente',
          tentativas: 0,
          maxTentativas: MAX_TENTATIVAS,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          proximaTentativa: admin.firestore.Timestamp.now(),
          enviadoEm: null,
          erro: null,
        })
        enfileirados++
      }
      console.log(`[GRUPOS-LOTE] ${enfileirados} mensagens enfileiradas`)
      res.json({ ok: true, enfileirados })
    } catch (err) {
      console.error('[GRUPOS-LOTE] erro disparo:', err.message)
      res.status(500).json({ error: err.message })
    }
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
      const { multipla } = req.body
      const resultado = {}
      opcoes.forEach(o => { resultado[o.trim()] = 0 })
      const ref = await db.collection('pesquisas').add({
        titulo: titulo.trim(),
        opcoes: opcoes.map(o => o.trim()),
        multipla: !!multipla,
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
      const { titulo, opcoes, multipla } = pesqDoc.data()
      const num   = normalizarTelefone(phone)
      // Busca nome do cliente pelo telefone para substituir {NOME}
      let nomeCliente = ''
      try {
        const clienteSnap = await db.collection('clientes').where('telefone', '==', num).limit(1).get()
        if (!clienteSnap.empty) nomeCliente = clienteSnap.docs[0].data().nome ?? ''
        if (!nomeCliente) {
          const num2 = num.length === 13 ? num.slice(0,4) + num.slice(5) : num.slice(0,4) + '9' + num.slice(4)
          const snap2 = await db.collection('clientes').where('telefone', '==', num2).limit(1).get()
          if (!snap2.empty) nomeCliente = snap2.docs[0].data().nome ?? ''
        }
      } catch {}
      const tituloFinal = titulo.replace(/{NOME}/gi, nomeCliente)
      const instrucao = multipla
        ? 'Você pode escolher mais de uma opção (ex: 1,3 ou 1 e 3)'
        : 'Responda só com o número da opção'
      const texto = `📋 ${tituloFinal}\n\n${opcoes.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n${instrucao} 👆`
      await enviarTexto(phone, texto)
      await db.collection('pesquisaAguardando').doc(num).set({
        pesquisaId, opcoes, multipla: !!multipla,
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
  router.post(['/webhook/whatsapp', '/webhook/whatsapp/messages-upsert', '/webhook/whatsapp/messages-update'], async (req, res) => {
    res.sendStatus(200)
    try {
      const body = req.body
      // DEBUG - loga tudo que chega
      const _msgType = body?.data?.messageType ?? ''
      const _remetente = (body?.data?.key?.remoteJid ?? '').replace('@s.whatsapp.net','')
      const _texto = (body?.data?.message?.conversation ?? body?.data?.message?.extendedTextMessage?.text ?? '').substring(0,60)
      if (!body?.data?.key?.fromMe) console.log(`[WEBHOOK] ${body?.event} | ${_remetente} | ${_msgType}${_texto ? ' | "' + _texto + '"' : ''}`)
      const msgs = body?.data?.messages ?? (Array.isArray(body?.data) ? body.data : (body?.data?.key ? [body.data] : []))
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
                const { pesquisaId, opcoes, multipla } = aguardDoc.data()
                const normalizar = (str) => String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
                const textoNorm = normalizar(texto)

                // 1. Numeros encontrados na resposta
                let opcoesEscolhidas = [...texto.matchAll(/\d+/g)]
                  .map(m => parseInt(m[0], 10) - 1)
                  .filter(idx => idx >= 0 && idx < opcoes.length)
                  .map(idx => opcoes[idx])

                // 2. Sem numero - tenta texto de todas as opcoes que aparecem na resposta
                if (opcoesEscolhidas.length === 0) {
                  opcoesEscolhidas = opcoes.filter(o => textoNorm.includes(normalizar(o)))
                }
                // 3. Fallback - resposta contida no texto da opcao (ou vice-versa), so 1
                if (opcoesEscolhidas.length === 0) {
                  const single = opcoes.find(o => {
                    const oNorm = normalizar(o)
                    return textoNorm.includes(oNorm) || oNorm.includes(textoNorm)
                  })
                  if (single) opcoesEscolhidas = [single]
                }

                opcoesEscolhidas = [...new Set(opcoesEscolhidas)]
                if (!multipla && opcoesEscolhidas.length > 1) opcoesEscolhidas = [opcoesEscolhidas[0]]

                if (opcoesEscolhidas.length > 0) {
                  const pesqRef = db.collection('pesquisas').doc(pesquisaId)
                  await db.runTransaction(async t => {
                    const pSnap = await t.get(pesqRef)
                    if (!pSnap.exists) return
                    const data = pSnap.data()
                    const novoResultado = { ...data.resultado }
                    opcoesEscolhidas.forEach(op => { novoResultado[op] = (novoResultado[op] || 0) + 1 })
                    t.update(pesqRef, { totalRespondido: admin.firestore.FieldValue.increment(1), resultado: novoResultado })
                  })
                  await aguardDoc.ref.delete()
                  console.log(`[PESQUISA] Voto registrado: ${telefoneResp} -> ${JSON.stringify(opcoesEscolhidas)}`)
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