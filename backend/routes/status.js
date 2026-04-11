import express from 'express'
import cron from 'node-cron'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-b45b.up.railway.app'
const EVOLUTION_KEY  = process.env.EVOLUTION_API_KEY  || 'iptv123manager456'
const INSTANCE       = process.env.EVOLUTION_INSTANCE  || 'conectatv'

const evoFetch = async (path, method = 'GET', body = null, timeoutMs = 15000) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    signal: AbortSignal.timeout(timeoutMs),
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${EVOLUTION_URL}${path}`, opts)
  return res.json()
}

export default function createStatusRouter(db, admin, getSock, isReady) {
  const router = express.Router()

  router.post('/status/agendar', async (req, res) => {
    try {
      const { legenda, midiaUrl, midiaTipo, agendarPara } = req.body
      if (!agendarPara) return res.status(400).json({ error: 'agendarPara obrigatorio' })
      const doc = await db.collection('statusAgendados').add({
        legenda: legenda || '',
        midiaUrl: midiaUrl || null,
        midiaTipo: midiaTipo || null,
        agendarPara: new Date(agendarPara),
        status: 'agendado',
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        publicadoEm: null,
        erro: null,
      })
      res.json({ ok: true, id: doc.id })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/status/listar', async (req, res) => {
    try {
      const snap = await db.collection('statusAgendados')
        .orderBy('agendarPara', 'desc').limit(100).get()
      const docs = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        agendarPara: d.data().agendarPara?.toDate?.()?.toISOString() ?? null,
        publicadoEm: d.data().publicadoEm?.toDate?.()?.toISOString() ?? null,
        criadoEm:    d.data().criadoEm?.toDate?.()?.toISOString()    ?? null,
      }))
      res.json({ ok: true, postagens: docs })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.delete('/status/:id', async (req, res) => {
    try {
      await db.collection('statusAgendados').doc(req.params.id).delete()
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/status/publicar/:id', async (req, res) => {
    try {
      const doc = await db.collection('statusAgendados').doc(req.params.id).get()
      if (!doc.exists) return res.status(404).json({ error: 'nao encontrada' })
      await publicarStatus(doc.data(), doc.ref)
      res.json({ ok: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  const normalizarTelefone = (tel) => {
    let num = String(tel).replace(/\D/g, '')
    if (num.startsWith('5555')) num = num.substring(2)
    else if (num.length <= 11 && !num.startsWith('55')) num = '55' + num
    return num
  }

  const publicarStatus = async (data, ref) => {
    // Verifica conexão
    const inst = await evoFetch(`/instance/fetchInstances`)
    const instData = Array.isArray(inst) ? inst.find(i => i.name === INSTANCE) : inst
    if (instData?.connectionStatus !== 'open') throw new Error('WhatsApp nao conectado')

    // Busca contatos do Firestore
    let contatos = []
    try {
      const snap = await db.collection('clientes').where('telefone', '!=', '').get()
      const nums = snap.docs
        .map(d => d.data().telefone)
        .filter(Boolean)
        .map(normalizarTelefone)
      contatos = [...new Set(nums)]
      console.log('[STATUS] ' + contatos.length + ' contatos encontrados')
    } catch (e) {
      console.log('[STATUS] Erro ao buscar contatos:', e.message)
    }

    // Publica via Evolution API
    let resultado
    if (data.midiaUrl && data.midiaTipo === 'imagem') {
      resultado = await evoFetch(`/message/sendStatus/${INSTANCE}`, 'POST', {
        type: 'image',
        content: data.midiaUrl,
        caption: data.legenda || '',
        statusJidList: contatos,
        allContacts: contatos.length === 0,
      }, 20000)
    } else if (data.midiaUrl && data.midiaTipo === 'video') {
      resultado = await evoFetch(`/message/sendStatus/${INSTANCE}`, 'POST', {
        type: 'video',
        content: data.midiaUrl,
        caption: data.legenda || '',
        statusJidList: contatos,
        allContacts: contatos.length === 0,
      }, 20000)
    } else {
      resultado = await evoFetch(`/message/sendStatus/${INSTANCE}`, 'POST', {
        type: 'text',
        content: data.legenda || '',
        statusJidList: contatos,
        allContacts: contatos.length === 0,
      }, 20000)
    }

    console.log('[STATUS] Resultado:', JSON.stringify(resultado))
    await ref.update({ status: 'publicado', publicadoEm: admin.firestore.FieldValue.serverTimestamp(), erro: null })
    console.log('[STATUS] Postagem publicada: ' + ref.id + ' para ' + contatos.length + ' contatos')
  }

  cron.schedule('* * * * *', async () => {
    try {
      const agora = new Date()
      const snap = await db.collection('statusAgendados')
        .where('status', '==', 'agendado')
        .where('agendarPara', '<=', agora)
        .limit(5).get()
      for (const docSnap of snap.docs) {
        try { await publicarStatus(docSnap.data(), docSnap.ref) }
        catch (err) {
          if (err.message && err.message.includes('nao conectado')) {
            console.log('[STATUS] WA desconectado, aguardando reconexao para publicar:', docSnap.id)
          } else {
            console.error('[STATUS] Erro ao publicar:', err.message)
            await docSnap.ref.update({ status: 'erro', erro: err.message })
          }
        }
      }
    } catch (err) { console.error('[STATUS] Cron erro:', err.message) }
  }, { timezone: 'America/Sao_Paulo' })

  return { router }
}