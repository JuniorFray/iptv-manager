import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = '  return { router, inicializar, enviarMensagemRenovacao, getSock, isReady'

if (!s.includes(BUSCA)) { console.error('Padrao nao encontrado'); process.exit(1) }

const WEBHOOK = `  // Webhook Evolution API - votos de enquete
  router.post('/webhook/whatsapp', async (req, res) => {
    res.sendStatus(200)
    try {
      const body = req.body
      const msgs = body?.data?.messages ?? (Array.isArray(body?.data) ? body.data : [])
      for (const msg of msgs) {
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

  `

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, WEBHOOK + BUSCA), 'utf8')
console.log('Webhook adicionado!')
