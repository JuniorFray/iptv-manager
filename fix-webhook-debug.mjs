import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = `  router.post('/webhook/whatsapp', async (req, res) => {
    res.sendStatus(200)
    try {
      const body = req.body
      const msgs = body?.data?.messages ?? (Array.isArray(body?.data) ? body.data : [])
      for (const msg of msgs) {
        const poll = msg?.message?.pollUpdateMessage
        if (!poll) continue`

const NOVO = `  router.post('/webhook/whatsapp', async (req, res) => {
    res.sendStatus(200)
    try {
      const body = req.body
      // DEBUG - loga tudo que chega
      console.log('[WEBHOOK] evento:', body?.event, '| keys:', Object.keys(body || {}).join(','))
      if (body?.data) console.log('[WEBHOOK] data sample:', JSON.stringify(body.data).substring(0, 300))
      const msgs = body?.data?.messages ?? (Array.isArray(body?.data) ? body.data : [])
      for (const msg of msgs) {
        console.log('[WEBHOOK] msg type:', msg?.messageType, '| keys:', Object.keys(msg?.message || {}).join(','))
        const poll = msg?.message?.pollUpdateMessage
        if (!poll) continue`

if (!s.includes(BUSCA)) { console.error('Padrao nao encontrado'); process.exit(1) }

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('Debug adicionado!')
