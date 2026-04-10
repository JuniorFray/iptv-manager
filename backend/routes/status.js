import express from 'express'
import cron from 'node-cron'
import { isJidUser } from '@whiskeysockets/baileys'

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

  const normalizarJid = (tel) => {
    let num = String(tel).replace(/\D/g, '')
    if (!num.startsWith('55')) num = '55' + num
    return num + '@s.whatsapp.net'
  }

  const publicarStatus = async (data, ref) => {
    const sock = getSock()
    if (!sock || !isReady()) throw new Error('WhatsApp nao conectado')
    const jid = 'status@broadcast'

    // Busca contatos do Firestore (clientes)
    let statusJidList = []
    try {
      const snap = await db.collection('clientes').where('telefone', '!=', '').get()
      const jids = snap.docs
        .map(d => d.data().telefone)
        .filter(Boolean)
        .map(normalizarJid)
      // Remove duplicatas
      statusJidList = [...new Set(jids)]
      console.log('[STATUS] statusJidList com ' + statusJidList.length + ' contatos do Firestore')
    } catch (e) {
      console.log('[STATUS] Erro ao buscar contatos:', e.message)
    }

    // Filtra apenas JIDs de usuários válidos
    const validJids = statusJidList.filter(j => isJidUser(j))
    console.log('[STATUS] JIDs válidos: ' + validJids.length)

    const opts = {
      broadcast: true,
      statusJidList: validJids.length > 0 ? validJids : statusJidList,
    }

    if (data.midiaUrl && data.midiaTipo === 'imagem') {
      await sock.sendMessage(jid, { image: { url: data.midiaUrl }, caption: data.legenda || '' }, opts)
    } else if (data.midiaUrl && data.midiaTipo === 'video') {
      await sock.sendMessage(jid, { video: { url: data.midiaUrl }, caption: data.legenda || '' }, opts)
    } else {
      await sock.sendMessage(jid, { text: data.legenda || '' }, opts)
    }
    await ref.update({ status: 'publicado', publicadoEm: admin.firestore.FieldValue.serverTimestamp(), erro: null })
    console.log('[STATUS] Postagem publicada: ' + ref.id + ' para ' + statusJidList.length + ' contatos')
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
