  1: import express from 'express'
  2: 
  3: /**
  4:  * Módulo Warez — WWPanel (mcapi.knewcms.com)
  5:  * Responsável por: autenticação, renovação de linhas e rotas /painel/*
  6:  */
  7: export default function createWarezRouter(enviarMensagemRenovacao) {
  8:   const router = express.Router()
  9: 
 10:   // ---- Autenticação WWPanel ----
 11: 
 12:   let wpToken    = null
 13:   let wpTokenExp = 0
 14: 
 15:   const wpLogin = async () => {
 16:     const res = await fetch('https://mcapi.knewcms.com:2087/auth/login', {
 17:       method: 'POST',
 18:       headers: { 'Content-Type': 'application/json' },
 19:       body: JSON.stringify({
 20:         username: process.env.WPAINEL_USER,
 21:         password: process.env.WPAINEL_PASS
 22:       })
 23:     })
 24:     const data = await res.json()
 25:     if (!data.token) throw new Error('Login WWPanel falhou: ' + JSON.stringify(data))
 26:     wpToken    = data.token
 27:     wpTokenExp = Date.now() + (1.5 * 60 * 60 * 1000)
 28:     console.log('🔑 WWPanel token renovado!')
 29:     return wpToken
 30:   }
 31: 
 32:   const getWpToken = async () => {
 33:     if (!wpToken || Date.now() > wpTokenExp) await wpLogin()
 34:     return wpToken
 35:   }
 36: 
 37:   const wpFetch = async (path, method = 'GET', body = null) => {
 38:     const token = await getWpToken()
 39:     const res   = await fetch(`https://mcapi.knewcms.com:2087${path}`, {
 40:       method,
 41:       headers: {
 42:         'Authorization': `Bearer ${token}`,
 43:         'Content-Type':  'application/json',
 44:         'Origin':        'https://wwpanel.link',
 45:         'Referer':       'https://wwpanel.link/'
 46:       },
 47:       body: body ? JSON.stringify(body) : null
 48:     })
 49:     return res.json()
 50:   }
 51: 
 52:   // ---- Rotas WWPanel ----
 53: 
 54:   router.get('/painel/buscar/:termo', async (req, res) => {
 55:     try {
 56:       const termo      = decodeURIComponent(req.params.termo)
 57:       const byUsername = await wpFetch(`/lines?username=${encodeURIComponent(termo)}&limit=10`)
 58:       if (byUsername?.items?.length > 0) return res.json(byUsername)
 59:       const bySearch   = await wpFetch(`/lines?search=${encodeURIComponent(termo)}&limit=10`)
 60:       res.json(bySearch)
 61:     } catch (err) { res.status(500).json({ error: err.message }) }
 62:   })
 63: 
 64:   router.get('/painel/buscar-username/:username', async (req, res) => {
 65:     try {
 66:       const username = decodeURIComponent(req.params.username)
 67:       const token    = await getWpToken()
 68:       const headers  = {
 69:         'Authorization': `Bearer ${token}`,
 70:         'Content-Type':  'application/json',
 71:         'Origin':        'https://wwpanel.link',
 72:         'Referer':       'https://wwpanel.link/'
 73:       }
 74:       const r1          = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=1`, { headers })
 75:       const d1          = await r1.json()
 76:       const totalPaginas = d1?.pagesQuantity ?? 1
 77:       let linhas        = d1?.items ?? []
 78:       const paginas     = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
 79:       const resultados  = await Promise.all(paginas.map(async (page) => {
 80:         const r = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=${page}`, { headers })
 81:         const d = await r.json()
 82:         return d?.items ?? []
 83:       }))
 84:       resultados.forEach(items => linhas.push(...items))
 85:       const linha = linhas.find(l => l.username === username)
 86:       if (!linha) return res.status(404).json({ error: `Usuário "${username}" não encontrado.` })
 87:       res.json({ items: [linha] })
 88:     } catch (err) { res.status(500).json({ error: err.message }) }
 89:   })
 90: 
 91:   router.get('/painel/debug/:termo', async (req, res) => {
 92:     try {
 93:       const termo   = decodeURIComponent(req.params.termo)
 94:       const token   = await getWpToken()
 95:       const headers = {
 96:         'Authorization': `Bearer ${token}`,
 97:         'Content-Type':  'application/json',
 98:         'Origin':        'https://wwpanel.link',
 99:         'Referer':       'https://wwpanel.link/'
100:       }
101:       const [r1, r2] = await Promise.all([
102:         fetch(`https://mcapi.knewcms.com:2087/lines?search=${encodeURIComponent(termo)}&limit=5`,   { headers }),
103:         fetch(`https://mcapi.knewcms.com:2087/lines?username=${encodeURIComponent(termo)}&limit=5`, { headers }),
104:       ])
105:       res.json({
106:         search_param:   await r1.json(),
107:         username_param: await r2.json(),
108:       })
109:     } catch (err) { res.status(500).json({ error: err.message }) }
110:   })
111: 
112:   router.get('/painel/linha/:lineId', async (req, res) => {
113:     try {
114:       const data = await wpFetch(`/lines/${req.params.lineId}`)
115:       res.json(data)
116:     } catch (err) { res.status(500).json({ error: err.message }) }
117:   })
118: 
119:   router.get('/painel/sincronizar', async (req, res) => {
120:     try {
121:       const token   = await getWpToken()
122:       const headers = {
123:         'Authorization': `Bearer ${token}`,
124:         'Content-Type':  'application/json',
125:         'Origin':        'https://wwpanel.link',
126:         'Referer':       'https://wwpanel.link/'
127:       }
128:       const r1          = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=1`, { headers })
129:       const d1          = await r1.json()
130:       const totalPaginas = d1?.pagesQuantity ?? 1
131:       let linhas        = d1?.items ?? []
132:       const paginas     = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
133:       const resultados  = await Promise.all(paginas.map(async (page) => {
134:         const r = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=${page}`, { headers })
135:         const d = await r.json()
136:         return d?.items ?? []
137:       }))
138:       resultados.forEach(items => linhas.push(...items))
139:       const mapa = linhas.map(l => ({
140:         id:       l.id,
141:         username: l.username,
142:         password: l.password,
143:         notes:    l.notes?.trim() ?? '',
144:         exp_date: l.exp_date,
145:       }))
146:       res.json({ total: mapa.length, linhas: mapa })
147:     } catch (err) { res.status(500).json({ error: err.message }) }
148:   })
149: 
150:   router.post('/painel/renovar/:lineId', async (req, res) => {
151:     try {
152:       const lineId  = req.params.lineId
153:       const credits = req.body?.credits ?? 1
154:       const data    = await wpFetch(`/lines/extend/${lineId}`, 'PATCH', { credits })
155:       console.log(`[RENOVAR WAREZ] lineId=${lineId} credits=${credits} resposta=`, JSON.stringify(data))
156:       res.json(data)
157:     } catch (err) { res.status(500).json({ error: err.message }) }
158:   })
159: 
160:   router.get('/painel/planos', async (req, res) => {
161:     try {
162:       const data = await wpFetch('/products')
163:       res.json(data)
164:     } catch (err) { res.status(500).json({ error: err.message }) }
165:   })
166: 
167:   router.post('/painel/teste', async (req, res) => {
168:     try {
169:       const data = await wpFetch('/lines/trial', 'POST', req.body)
170:       res.json(data)
171:     } catch (err) { res.status(500).json({ error: err.message }) }
172:   })
173: 
174:   return { router }
175: }