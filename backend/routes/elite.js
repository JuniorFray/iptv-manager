  1: import express from 'express'
  2: import { ProxyAgent, request as undiciRequest } from 'undici'
  3: 
  4: /**
  5:  * Módulo Elite — adminx.offo.dad
  6:  * Parâmetros DataTables completos copiados do Network do browser.
  7:  */
  8: export default function createEliteRouter(enviarMensagemRenovacao) {
  9:   const router = express.Router()
 10: 
 11:   const eliteProxy = process.env.PROXY_URL
 12:     ? new ProxyAgent(process.env.PROXY_URL)
 13:     : undefined
 14: 
 15:   // Parâmetros exatos que o DataTables envia — sem eles o servidor retorna 500
 16:   const IPTV_PARAMS = 'draw=1&columns%5B0%5D%5Bdata%5D=&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=id&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=username&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=password&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=formatted_created_at&columns%5B5%5D%5Bname%5D=created_at&columns%5B5%5D%5Bsearchable%5D=false&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=formatted_exp_date&columns%5B6%5D%5Bname%5D=exp_date&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=max_connections&columns%5B7%5D%5Bname%5D=&columns%5B7%5D%5Bsearchable%5D=true&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=owner_username&columns%5B8%5D%5Bname%5D=regUser.username&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=false&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=reseller_notes&columns%5B9%5D%5Bname%5D=&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=is_trial&columns%5B10%5D%5Bname%5D=&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B11%5D%5Bdata%5D=enabled&columns%5B11%5D%5Bname%5D=&columns%5B11%5D%5Bsearchable%5D=true&columns%5B11%5D%5Borderable%5D=true&columns%5B11%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B11%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B12%5D%5Bdata%5D=&columns%5B12%5D%5Bname%5D=&columns%5B12%5D%5Bsearchable%5D=false&columns%5B12%5D%5Borderable%5D=false&columns%5B12%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B12%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=desc&order%5B0%5D%5Bname%5D=&start=0&length=1000&search%5Bvalue%5D=&search%5Bregex%5D=false'
 17:   const P2P_PARAMS  = 'draw=1&columns%5B0%5D%5Bdata%5D=id&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=id&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=name&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=email&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=exField2&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=formatted_created_at&columns%5B6%5D%5Bname%5D=regTime&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=formatted_exp_date&columns%5B7%5D%5Bname%5D=endTime&columns%5B7%5D%5Bsearchable%5D=false&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=owner_username&columns%5B8%5D%5Bname%5D=regUser.username&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=false&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=exField4&columns%5B9%5D%5Bname%5D=&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=type&columns%5B10%5D%5Bname%5D=&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B11%5D%5Bdata%5D=status&columns%5B11%5D%5Bname%5D=&columns%5B11%5D%5Bsearchable%5D=true&columns%5B11%5D%5Borderable%5D=true&columns%5B11%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B11%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B12%5D%5Bdata%5D=action&columns%5B12%5D%5Bname%5D=&columns%5B12%5D%5Bsearchable%5D=false&columns%5B12%5D%5Borderable%5D=false&columns%5B12%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B12%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=desc&order%5B0%5D%5Bname%5D=&start=0&length=1000&search%5Bvalue%5D=&search%5Bregex%5D=false'
 18: 
 19:   let csrfToken   = null
 20:   let cookieJar   = null
 21:   let loginPromise = null  // lock para evitar logins simultâneos
 22: 
 23:   const parseCookies = (arr) => {
 24:     const obj = {}
 25:     for (const raw of arr) {
 26:       const pair = raw.split(';')[0]
 27:       const idx  = pair.indexOf('=')
 28:       if (idx === -1) continue
 29:       const name = pair.substring(0, idx).trim()
 30:       const val  = decodeURIComponent(pair.substring(idx + 1).trim())
 31:       if (name) obj[name] = val
 32:     }
 33:     return obj
 34:   }
 35: 
 36:   const buildCookieHeader = (obj) =>
 37:     Object.entries(obj).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
 38: 
 39:   const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : [])
 40: 
 41:   const eliteLogin = async () => {
 42:     // Se já há um login em andamento, aguarda ele terminar
 43:     if (loginPromise) return loginPromise
 44:     loginPromise = _doLogin().finally(() => { loginPromise = null })
 45:     return loginPromise
 46:   }
 47: 
 48:   const _doLogin = async () => {
 49:     console.log('🔐 [Elite] Iniciando login...')
 50: 
 51:     const s1 = await undiciRequest('https://adminx.offo.dad/login', {
 52:       method: 'GET',
 53:       headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' },
 54:       dispatcher: eliteProxy,
 55:       maxRedirections: 0,
 56:       headersTimeout: 30000,
 57:       bodyTimeout: 30000,
 58:     })
 59:     const html1 = await s1.body.text()
 60:     console.log('🔍 [Elite] GET /login status:', s1.statusCode)
 61:     console.log('🔍 [Elite] HTML preview:', html1.substring(0, 200).replace(/\n/g, ' '))
 62: 
 63:     if (s1.statusCode === 404 || html1.includes('MANUTENCAO') || html1.includes('manutenção') || html1.includes('manutencao')) {
 64:       throw new Error('[Elite] Servidor em manutenção. Tente novamente mais tarde.')
 65:     }
 66:     if (s1.statusCode !== 200) {
 67:       throw new Error(`[Elite] GET /login retornou status ${s1.statusCode}`)
 68:     }
 69: 
 70:     const fmMatch = html1.match(/name="_token"\s+value="([^"]+)"/) ?? html1.match(/value="([^"]+)"\s+name="_token"/)
 71:     if (!fmMatch?.[1]) {
 72:       console.error('❌ [Elite] HTML (500 chars):', html1.substring(0, 500))
 73:       throw new Error('[Elite] _token nao encontrado no formulario de login')
 74:     }
 75:     const formToken = fmMatch[1]
 76:     const c1 = parseCookies(toArray(s1.headers['set-cookie']))
 77: 
 78:     const s2 = await undiciRequest('https://adminx.offo.dad/login', {
 79:       method: 'POST',
 80:       headers: {
 81:         'Content-Type': 'application/x-www-form-urlencoded',
 82:         'Cookie':       buildCookieHeader(c1),
 83:         'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
 84:         'Origin':       'https://adminx.offo.dad',
 85:         'Referer':      'https://adminx.offo.dad/login',
 86:         'Accept':       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
 87:       },
 88:       body: new URLSearchParams({
 89:         _token: formToken, timezone: 'America/Sao_Paulo',
 90:         email: process.env.ELITEUSER, password: process.env.ELITEPASS, remember: 'on',
 91:       }).toString(),
 92:       dispatcher: eliteProxy,
 93:       maxRedirections: 0,
 94:       headersTimeout: 30000,
 95:       bodyTimeout: 30000,
 96:     })
 97:     await s2.body.text()
 98:     if (s2.statusCode !== 302 && s2.statusCode !== 200) throw new Error(`[Elite] Login falhou (${s2.statusCode})`)
 99:     const c2 = { ...c1, ...parseCookies(toArray(s2.headers['set-cookie'])) }
100: 
101:     const s3 = await undiciRequest('https://adminx.offo.dad/dashboard', {
102:       method: 'GET',
103:       headers: {
104:         'Cookie':     buildCookieHeader(c2),
105:         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
106:       },
107:       dispatcher: eliteProxy,
108:       headersTimeout: 30000,
109:       bodyTimeout: 30000,
110:     })
111:     const html3 = await s3.body.text()
112:     const mm = html3.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)
113:     if (!mm?.[1]) throw new Error('[Elite] csrf-token nao encontrado no dashboard')
114:     csrfToken = mm[1]
115:     cookieJar = { ...c2, ...parseCookies(toArray(s3.headers['set-cookie'])) }
116:     console.log('🔑 [Elite] csrf-token:', csrfToken.substring(0, 20) + '...')
117:     console.log('🍪 [Elite] Cookies:', Object.keys(cookieJar).join(', '))
118:   }
119: 
120:   const eliteFetch = async (path, method = 'GET', body = null, retry = true) => {
121:     if (!csrfToken || !cookieJar) await eliteLogin()
122: 
123:     const res = await undiciRequest(`https://adminx.offo.dad/${path}`, {
124:       method,
125:       headers: {
126:         'Accept':           'application/json, text/javascript, */*; q=0.01',
127:         'Content-Type':     body ? 'application/json' : undefined,
128:         'Cookie':           buildCookieHeader(cookieJar),
129:         'Origin':           'https://adminx.offo.dad',
130:         'Referer':          'https://adminx.offo.dad/dashboard',
131:         'X-CSRF-TOKEN':     csrfToken,
132:         'X-Requested-With': 'XMLHttpRequest',
133:         'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
134:       },
135:       body:           body ? JSON.stringify(body) : undefined,
136:       dispatcher:     eliteProxy,
137:       headersTimeout: 30000,
138:       bodyTimeout:    30000,
139:     })
140: 
141:     const text = await res.body.text()
142:     console.log(`📥 [Elite] ${method} /${path.substring(0,60)} → ${res.statusCode} | ${text.substring(0, 200)}`)
143: 
144:     if ((res.statusCode === 401 || res.statusCode === 419) && retry) {
145:       console.log('🔄 [Elite] Sessao expirada, refazendo login...')
146:       csrfToken = null; cookieJar = null
147:       return eliteFetch(path, method, body, false)
148:     }
149:     if (res.statusCode >= 400) throw new Error(`[Elite] ${method} /${path.substring(0,60)} status ${res.statusCode}: ${text.slice(0, 200)}`)
150: 
151:     try { return JSON.parse(text) } catch { return { raw: text.substring(0, 500) } }
152:   }
153: 
154:   // ---- Rotas ----
155: 
156:   router.get('/elite/debug', async (req, res) => {
157:     try {
158:       await eliteLogin()
159:       res.json({ ok: true, csrfToken: csrfToken?.substring(0, 20) + '...', cookies: Object.keys(cookieJar ?? {}) })
160:     } catch (err) {
161:       res.status(500).json({ error: err.message })
162:     }
163:   })
164: 
165:   router.get('/elite/sincronizar', async (req, res) => {
166:     try {
167:       console.log('🔄 [Elite] Buscando IPTV...')
168:       const iptvResp = await eliteFetch(`dashboard/iptv?${IPTV_PARAMS}`)
169:       console.log('🔄 [Elite] Buscando P2P...')
170:       const p2pResp  = await eliteFetch(`dashboard/p2p?${P2P_PARAMS}`)
171: 
172:       const iptv = (iptvResp?.data ?? []).map(l => ({
173:         id: l.id, username: l.username, password: l.password,
174:         name: l.reseller_notes ?? '', tipo: 'IPTV', exp_date: l.exp_date_formatted ?? null,
175:       }))
176:       const p2p = (p2pResp?.data ?? []).map(l => ({
177:         id: l.id, id_p2p: l.id_p2p, username: l.email ?? '',
178:         name: l.name ?? '', tipo: 'P2P', exp_date: l.exp_date_formatted ?? null,
179:       }))
180: 
181:       res.json({ total: iptv.length + p2p.length, iptv: iptv.length, p2p: p2p.length, linhas: [...iptv, ...p2p] })
182:     } catch (err) {
183:       console.error('[Elite] sincronizar erro:', err.message)
184:       res.status(500).json({ error: err.message })
185:     }
186:   })
187: 
188:   router.post('/elite/renovar', async (req, res) => {
189:     try {
190:       const { id, tipo, meses = 1 } = req.body
191:       if (!id || !tipo) return res.status(400).json({ error: 'id e tipo sao obrigatorios' })
192:       const t    = tipo.toLowerCase() === 'p2p' ? 'p2p' : 'iptv'
193:       const n    = Number(meses)
194:       const path = n <= 1 ? `api/${t}/renewone/${id}` : `api/${t}/renewmulti/${id}`
195:       const body = n <= 1 ? null : { user_id: id, months: n }
196:       const data = await eliteFetch(path, 'POST', body)
197:       console.log(`[Elite] RENOVAR id=${id} tipo=${t} meses=${n}`, JSON.stringify(data))
198:       res.json(data)
199:     } catch (err) {
200:       console.error('[Elite] renovar erro:', err.message)
201:       res.status(500).json({ error: err.message })
202:     }
203:   })
204: 
205:   return { router }
206: }