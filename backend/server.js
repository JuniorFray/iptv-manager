import express from 'express'

// Handler global â€” impede que erros nao tratados do Baileys matem o processo
process.on('uncaughtException', (err) => {
  console.error('[PROCESSO] Erro nao tratado (mantendo servidor no ar):', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESSO] Promise rejeitada nao tratada (mantendo servidor no ar):', reason?.message ?? reason)
})
import cors from 'cors'
import admin from 'firebase-admin'
import { createRequire } from 'module'

import createWhatsAppRouter from './routes/whatsapp.js'
import createWarezRouter    from './routes/warez.js'
import createEliteRouter    from './routes/elite.js'
import createCentralRouter  from './routes/central.js'
import createPagamentoRouter from './routes/pagamento.js'

const require = createRequire(import.meta.url)
const serviceAccount = JSON.parse(process.env.SERVICEACCOUNTKEY)

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const app = express()
app.use(cors())
app.use(express.json({ type: ['application/json', 'text/plain', '*/*'] }))

// ---- Routers ----
const { router: whatsappRouter, inicializar: inicializarWA, enviarMensagemRenovacao } = createWhatsAppRouter(db, admin)
const { router: warezRouter }   = createWarezRouter(enviarMensagemRenovacao)
const { router: eliteRouter }   = createEliteRouter(enviarMensagemRenovacao)
const { router: centralRouter }   = createCentralRouter(db, admin, enviarMensagemRenovacao)
const { router: pagamentoRouter }  = createPagamentoRouter(db, admin, enviarMensagemRenovacao)

app.use('/', whatsappRouter)
app.use('/', warezRouter)
app.use('/', eliteRouter)
app.use('/', centralRouter)
app.use('/', pagamentoRouter)

// Inicializar WhatsApp (conexão + cron)
inicializarWA()

// ---- Rota utilitária ----
app.get('/meu-ip', async (req, res) => {
  try {
    const r    = await fetch('https://api.ipify.org?format=json')
    const data = await r.json()
    res.json({ ip: data.ip })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => console.log('Servidor rodando na porta 3001'))