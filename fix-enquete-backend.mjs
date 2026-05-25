import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = `  // Webhook Evolution API - votos de enquete`

const NOVO = `  // Envia enquete via Evolution API
  router.post('/send/poll', async (req, res) => {
    try {
      const { phone, titulo, opcoes } = req.body
      if (!phone || !titulo || !opcoes?.length) return res.status(400).json({ error: 'phone, titulo e opcoes sao obrigatorios' })
      const num = normalizarTelefone(phone)
      const result = await evoFetch('/message/sendPoll/' + INSTANCE, 'POST', {
        number: num,
        name: titulo,
        values: opcoes,
        selectableCount: 1,
      })
      res.json({ ok: true, result })
    } catch (e) {
      console.error('[POLL]', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  // Webhook Evolution API - votos de enquete`

if (!s.includes(BUSCA)) { console.error('Padrao nao encontrado'); process.exit(1) }

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('Rota /send/poll adicionada!')
