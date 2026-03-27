import express from 'express'

export default function createCentralRouter(db, admin, enviarMensagemRenovacao) {
  const router = express.Router()
  const BASE_URL = 'https://api.controle.fit/api'

  let centralToken    = null
  let centralTokenExp = 0
  let loginPromise    = null

    // ---- CapSolver: Cloudflare Turnstile ----
  const resolverCaptcha = async () => {
    const apiKey  = process.env.CAPSOLVER_KEY
    const sitekey = '0x4AAAAAACFhU7XJduqvbHH2'
    const pageURL = 'https://controle.vip'

    console.log('🤖 [Central] Resolvendo Turnstile via CapSolver...')

    const createRes = await fetch('https://api.capsolver.com/createTask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type:       'AntiTurnstileTaskProxyLess',
          websiteURL: pageURL,
          websiteKey: sitekey,
        }
      })
    })

    const createData = await createRes.json()
    console.log('🤖 [CapSolver] create:', JSON.stringify(createData))
    if (createData.errorId) throw new Error(`[CapSolver] Erro: ${createData.errorDescription}`)

    const taskId = createData.taskId

    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId })
      })
      const result = await resultRes.json()
      console.log(`⏳ [CapSolver] ${result.status} (${(i+1)*5}s)`)

      if (result.status === 'ready') {
        const token = result.solution?.token
        if (!token) throw new Error('[CapSolver] Token vazio')
        console.log('✅ [Central] Turnstile resolvido!')
        return token
      }
      if (result.status === 'failed') {
        console.log('❌ [CapSolver]:', JSON.stringify(result))
        throw new Error(`[CapSolver] Tarefa falhou: ${result.errorDescription}`)
      }
    }
    throw new Error('[Central] CapSolver timeout')
  }

    // ---- Login ----
  const _doLogin = async () => {
    console.log('🔐 [Central] Iniciando login...')
    const captchaToken = await resolverCaptcha()

    const res = await fetch(`${BASE_URL}/auth/sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json, text/plain, */*',
        'Origin':       'https://painel.fun',
        'Referer':      'https://painel.fun/',
      },
      body: JSON.stringify({
        username: process.env.CENTRAL_USER,
        password: process.env.CENTRAL_PASS,
        'cf-turnstile-response': captchaToken,
      }),
    })

    const data = await res.json()
    if (!data.token) throw new Error('[Central] Login falhou: ' + JSON.stringify(data).substring(0, 200))

    centralToken    = data.token
    centralTokenExp = Date.now() + (55 * 60 * 1000)

    // Salva no Firestore
    if (db) {
      try {
        await db.collection('config_central').doc('central_token').set({
          token: centralToken,
          exp:   Math.floor(centralTokenExp / 1000),
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (e) {
        console.warn('[Central] Falha ao salvar Firestore:', e.message)
      }
    }

    console.log('✅ [Central] Login OK:', data.user?.username)
    return centralToken
  }

  const centralLogin = async () => {
    if (loginPromise) return loginPromise
    loginPromise = _doLogin().finally(() => { loginPromise = null })
    return loginPromise
  }

  const getToken = async () => {
    if (centralToken && Date.now() < centralTokenExp) return centralToken

    // Tenta recuperar token salvo no Firestore
    if (db) {
      try {
        const snap = await db.collection('config_central').doc('central_token').get()
        if (snap.exists) {
          const { token, exp } = snap.data()
          if (token && (exp * 1000) > Date.now() + 60000) {
            centralToken    = token
            centralTokenExp = exp * 1000
            console.log('[Central] Token do Firestore OK')
            return centralToken
          }
        }
      } catch (e) {
        console.warn('[Central] Firestore err:', e.message)
      }
    }

    return centralLogin()
  }

  const centralFetch = async (path, method = 'GET', body = null, retry = true) => {
    const token = await getToken()
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Accept':        'application/json, text/plain, */*',
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Origin':        'https://painel.fun',
        'Referer':       'https://painel.fun/',
      },
      body: body ? JSON.stringify(body) : null,
    })

    const text = await res.text()
    console.log(`📥 [Central] ${method} ${path} → ${res.status}`)

    if (res.status === 401 && retry) {
      console.log('🔄 [Central] Token expirado, refazendo login...')
      centralToken = null; centralTokenExp = 0
      return centralFetch(path, method, body, false)
    }
    if (res.status >= 400) throw new Error(`[Central] ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)

    try { return JSON.parse(text) } catch { return { raw: text.substring(0, 500) } }
  }

  const tsParaBR = (ts) => {
    if (!ts) return null
    const d = new Date(ts * 1000)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  }

  // ---- Rotas ----

  router.post('/central/set-token', async (req, res) => {
    try {
      const { token } = req.body
      if (!token) return res.status(400).json({ error: 'token obrigatorio' })
      centralToken = token
      try {
        const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
        centralTokenExp = p.exp ? p.exp * 1000 : Date.now() + 55 * 60 * 1000
      } catch { centralTokenExp = Date.now() + 55 * 60 * 1000 }

      if (db) {
        await db.collection('config_central').doc('central_token').set({
          token, exp: Math.floor(centralTokenExp / 1000),
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
      res.json({ ok: true, expira: new Date(centralTokenExp).toISOString() })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/central/debug', async (req, res) => {
    try {
      await centralFetch('/reseller/check-message')
      res.json({ ok: true, tokenExp: new Date(centralTokenExp).toISOString() })
    } catch (err) {
      console.error('[Central] debug err:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/central/sincronizar', async (req, res) => {
    try {
      const username = process.env.CENTRAL_USERNAME
      if (!username) throw new Error('CENTRAL_USERNAME nao configurado')

      const first = await centralFetch(`/users?page=1&per=100&reseller=${username}`)
      const totalPages = first?.meta?.pages ?? 1
      let linhas = first?.data ?? []

      if (totalPages > 1) {
        const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
        const results = await Promise.all(pages.map(p => centralFetch(`/users?page=${p}&per=100&reseller=${username}`)))
        results.forEach(r => { if (r?.data) linhas.push(...r.data) })
      }

      const mapa = linhas.map(l => ({
        id: l.id, username: l.username, password: l.password,
        name: l.full_name ?? l.reseller_notes ?? '',
        tipo: 'IPTV', exp_date: tsParaBR(l.exp_date), enabled: l.enabled,
      }))

      console.log(`[Central] Sincronizados: ${mapa.length}`)
      res.json({ total: mapa.length, linhas: mapa })
    } catch (err) {
      console.error('[Central] sincronizar err:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/central/renovar', async (req, res) => {
    try {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id obrigatorio' })
      const packageId = Number(process.env.CENTRAL_PACKAGE_ID ?? 17)
      const data = await centralFetch(`/users/${id}/renew`, 'POST', { package_id: packageId })
      res.json({ success: true, exp_date: tsParaBR(data?.exp_date), raw: data })
    } catch (err) {
      console.error('[Central] renovar err:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return { router }
}