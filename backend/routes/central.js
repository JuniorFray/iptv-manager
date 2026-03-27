  1: import express from 'express'
  2: 
  3: export default function createCentralRouter(db, admin, enviarMensagemRenovacao) {
  4:   const router = express.Router()
  5:   const BASE_URL = 'https://api.controle.fit/api'
  6: 
  7:   let centralToken    = null
  8:   let centralTokenExp = 0
  9:   let loginPromise    = null
 10: 
 11:     // ---- CapSolver: Cloudflare Turnstile ----
 12:   const resolverCaptcha = async () => {
 13:     const apiKey  = process.env.CAPSOLVER_KEY
 14:     const sitekey = '0x4AAAAAACFhU7XJduqvbHH2'
 15:     const pageURL = 'https://controle.vip'
 16: 
 17:     console.log('🤖 [Central] Resolvendo Turnstile via CapSolver...')
 18: 
 19:     const createRes = await fetch('https://api.capsolver.com/createTask', {
 20:       method: 'POST',
 21:       headers: { 'Content-Type': 'application/json' },
 22:       body: JSON.stringify({
 23:         clientKey: apiKey,
 24:         task: {
 25:           type:       'AntiTurnstileTaskProxyLess',
 26:           websiteURL: pageURL,
 27:           websiteKey: sitekey,
 28:         }
 29:       })
 30:     })
 31: 
 32:     const createData = await createRes.json()
 33:     console.log('🤖 [CapSolver] create:', JSON.stringify(createData))
 34:     if (createData.errorId) throw new Error(`[CapSolver] Erro: ${createData.errorDescription}`)
 35: 
 36:     const taskId = createData.taskId
 37: 
 38:     for (let i = 0; i < 24; i++) {
 39:       await new Promise(r => setTimeout(r, 5000))
 40:       const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
 41:         method: 'POST',
 42:         headers: { 'Content-Type': 'application/json' },
 43:         body: JSON.stringify({ clientKey: apiKey, taskId })
 44:       })
 45:       const result = await resultRes.json()
 46:       console.log(`⏳ [CapSolver] ${result.status} (${(i+1)*5}s)`)
 47: 
 48:       if (result.status === 'ready') {
 49:         const token = result.solution?.token
 50:         if (!token) throw new Error('[CapSolver] Token vazio')
 51:         console.log('✅ [Central] Turnstile resolvido!')
 52:         return token
 53:       }
 54:       if (result.status === 'failed') {
 55:         console.log('❌ [CapSolver]:', JSON.stringify(result))
 56:         throw new Error(`[CapSolver] Tarefa falhou: ${result.errorDescription}`)
 57:       }
 58:     }
 59:     throw new Error('[Central] CapSolver timeout')
 60:   }
 61: 
 62:     // ---- Login ----
 63:   const _doLogin = async () => {
 64:     console.log('🔐 [Central] Iniciando login...')
 65:     const captchaToken = await resolverCaptcha()
 66: 
 67:     const res = await fetch(`${BASE_URL}/auth/sign-in`, {
 68:       method: 'POST',
 69:       headers: {
 70:         'Content-Type': 'application/json',
 71:         'Accept':       'application/json, text/plain, */*',
 72:         'Origin':       'https://painel.fun',
 73:         'Referer':      'https://painel.fun/',
 74:       },
 75:       body: JSON.stringify({
 76:         username: process.env.CENTRAL_USER,
 77:         password: process.env.CENTRAL_PASS,
 78:         'cf-turnstile-response': captchaToken,
 79:       }),
 80:     })
 81: 
 82:     const data = await res.json()
 83:     if (!data.token) throw new Error('[Central] Login falhou: ' + JSON.stringify(data).substring(0, 200))
 84: 
 85:     centralToken    = data.token
 86:     centralTokenExp = Date.now() + (55 * 60 * 1000)
 87: 
 88:     // Salva no Firestore
 89:     if (db) {
 90:       try {
 91:         await db.collection('config_central').doc('central_token').set({
 92:           token: centralToken,
 93:           exp:   Math.floor(centralTokenExp / 1000),
 94:           atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
 95:         })
 96:       } catch (e) {
 97:         console.warn('[Central] Falha ao salvar Firestore:', e.message)
 98:       }
 99:     }
100: 
101:     console.log('✅ [Central] Login OK:', data.user?.username)
102:     return centralToken
103:   }
104: 
105:   const centralLogin = async () => {
106:     if (loginPromise) return loginPromise
107:     loginPromise = _doLogin().finally(() => { loginPromise = null })
108:     return loginPromise
109:   }
110: 
111:   const getToken = async () => {
112:     if (centralToken && Date.now() < centralTokenExp) return centralToken
113: 
114:     // Tenta recuperar token salvo no Firestore
115:     if (db) {
116:       try {
117:         const snap = await db.collection('config_central').doc('central_token').get()
118:         if (snap.exists) {
119:           const { token, exp } = snap.data()
120:           if (token && (exp * 1000) > Date.now() + 60000) {
121:             centralToken    = token
122:             centralTokenExp = exp * 1000
123:             console.log('[Central] Token do Firestore OK')
124:             return centralToken
125:           }
126:         }
127:       } catch (e) {
128:         console.warn('[Central] Firestore err:', e.message)
129:       }
130:     }
131: 
132:     return centralLogin()
133:   }
134: 
135:   const centralFetch = async (path, method = 'GET', body = null, retry = true) => {
136:     const token = await getToken()
137:     const res = await fetch(`${BASE_URL}${path}`, {
138:       method,
139:       headers: {
140:         'Accept':        'application/json, text/plain, */*',
141:         'Authorization': `Bearer ${token}`,
142:         'Content-Type':  'application/json',
143:         'Origin':        'https://painel.fun',
144:         'Referer':       'https://painel.fun/',
145:       },
146:       body: body ? JSON.stringify(body) : null,
147:     })
148: 
149:     const text = await res.text()
150:     console.log(`📥 [Central] ${method} ${path} → ${res.status}`)
151: 
152:     if (res.status === 401 && retry) {
153:       console.log('🔄 [Central] Token expirado, refazendo login...')
154:       centralToken = null; centralTokenExp = 0
155:       return centralFetch(path, method, body, false)
156:     }
157:     if (res.status >= 400) throw new Error(`[Central] ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)
158: 
159:     try { return JSON.parse(text) } catch { return { raw: text.substring(0, 500) } }
160:   }
161: 
162:   const tsParaBR = (ts) => {
163:     if (!ts) return null
164:     const d = new Date(ts * 1000)
165:     return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
166:   }
167: 
168:   // ---- Rotas ----
169: 
170:   router.post('/central/set-token', async (req, res) => {
171:     try {
172:       const { token } = req.body
173:       if (!token) return res.status(400).json({ error: 'token obrigatorio' })
174:       centralToken = token
175:       try {
176:         const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
177:         centralTokenExp = p.exp ? p.exp * 1000 : Date.now() + 55 * 60 * 1000
178:       } catch { centralTokenExp = Date.now() + 55 * 60 * 1000 }
179: 
180:       if (db) {
181:         await db.collection('config_central').doc('central_token').set({
182:           token, exp: Math.floor(centralTokenExp / 1000),
183:           atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
184:         })
185:       }
186:       res.json({ ok: true, expira: new Date(centralTokenExp).toISOString() })
187:     } catch (err) { res.status(500).json({ error: err.message }) }
188:   })
189: 
190:   router.get('/central/debug', async (req, res) => {
191:     try {
192:       await centralFetch('/reseller/check-message')
193:       res.json({ ok: true, tokenExp: new Date(centralTokenExp).toISOString() })
194:     } catch (err) {
195:       console.error('[Central] debug err:', err.message)
196:       res.status(500).json({ error: err.message })
197:     }
198:   })
199: 
200:   router.get('/central/sincronizar', async (req, res) => {
201:     try {
202:       const username = process.env.CENTRAL_USERNAME
203:       if (!username) throw new Error('CENTRAL_USERNAME nao configurado')
204: 
205:       const first = await centralFetch(`/users?page=1&per=100&reseller=${username}`)
206:       const totalPages = first?.meta?.pages ?? 1
207:       let linhas = first?.data ?? []
208: 
209:       if (totalPages > 1) {
210:         const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
211:         const results = await Promise.all(pages.map(p => centralFetch(`/users?page=${p}&per=100&reseller=${username}`)))
212:         results.forEach(r => { if (r?.data) linhas.push(...r.data) })
213:       }
214: 
215:       const mapa = linhas.map(l => ({
216:         id: l.id, username: l.username, password: l.password,
217:         name: l.full_name ?? l.reseller_notes ?? '',
218:         tipo: 'IPTV', exp_date: tsParaBR(l.exp_date), enabled: l.enabled,
219:       }))
220: 
221:       console.log(`[Central] Sincronizados: ${mapa.length}`)
222:       res.json({ total: mapa.length, linhas: mapa })
223:     } catch (err) {
224:       console.error('[Central] sincronizar err:', err.message)
225:       res.status(500).json({ error: err.message })
226:     }
227:   })
228: 
229:   router.post('/central/renovar', async (req, res) => {
230:     try {
231:       const { id } = req.body
232:       if (!id) return res.status(400).json({ error: 'id obrigatorio' })
233:       const packageId = Number(process.env.CENTRAL_PACKAGE_ID ?? 17)
234:       const data = await centralFetch(`/users/${id}/renew`, 'POST', { package_id: packageId })
235:       res.json({ success: true, exp_date: tsParaBR(data?.exp_date), raw: data })
236:     } catch (err) {
237:       console.error('[Central] renovar err:', err.message)
238:       res.status(500).json({ error: err.message })
239:     }
240:   })
241: 
242:   return { router }
243: }