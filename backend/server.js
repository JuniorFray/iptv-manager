 1: import express from 'express'
 2: import cors from 'cors'
 3: import admin from 'firebase-admin'
 4: import { createRequire } from 'module'
 5: 
 6: import createWhatsAppRouter from './routes/whatsapp.js'
 7: import createWarezRouter    from './routes/warez.js'
 8: import createEliteRouter    from './routes/elite.js'
 9: import createCentralRouter  from './routes/central.js'
10: 
11: const require = createRequire(import.meta.url)
12: const serviceAccount = JSON.parse(process.env.SERVICEACCOUNTKEY)
13: 
14: admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
15: const db = admin.firestore()
16: 
17: const app = express()
18: app.use(cors())
19: app.use(express.json())
20: 
21: // ---- Routers ----
22: const { router: whatsappRouter, inicializar: inicializarWA } = createWhatsAppRouter(db, admin)
23: const { router: warezRouter }   = createWarezRouter()
24: const { router: eliteRouter }   = createEliteRouter()
25: const { router: centralRouter } = createCentralRouter()
26: 
27: app.use('/', whatsappRouter)
28: app.use('/', warezRouter)
29: app.use('/', eliteRouter)
30: app.use('/', centralRouter)
31: 
32: // Inicializar WhatsApp (conexão + cron)
33: inicializarWA()
34: 
35: // ---- Rota utilitária ----
36: app.get('/meu-ip', async (req, res) => {
37:   try {
38:     const r    = await fetch('https://api.ipify.org?format=json')
39:     const data = await r.json()
40:     res.json({ ip: data.ip })
41:   } catch (err) {
42:     res.status(500).json({ error: err.message })
43:   }
44: })
45: 
46: app.listen(3001, () => console.log('Servidor rodando na porta 3001'))