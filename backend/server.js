import express from 'express'
import cors from 'cors'
import admin from 'firebase-admin'
import { createRequire } from 'module'

import createWhatsAppRouter from './routes/whatsapp.js'
import createWarezRouter    from './routes/warez.js'
import createEliteRouter    from './routes/elite.js'
import createCentralRouter  from './routes/central.js'

const require = createRequire(import.meta.url)
const serviceAccount = JSON.parse(process.env.SERVICEACCOUNTKEY)

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const app = express()
app.use(cors())
app.use(express.json())

// ---- Routers ----
const { router: whatsappRouter, inicializar: inicializarWA } = createWhatsAppRouter(db, admin)
const { router: warezRouter }   = createWarezRouter()
const { router: eliteRouter }   = createEliteRouter()
const { router: centralRouter } = createCentralRouter()

app.use('/', whatsappRouter)
app.use('/', warezRouter)
app.use('/', eliteRouter)
app.use('/', centralRouter)

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