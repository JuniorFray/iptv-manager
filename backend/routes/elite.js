import express from 'express'
import { ProxyAgent, request as undiciRequest } from 'undici'

export default function createEliteRouter(enviarMensagemRenovacao) {
  const router = express.Router()

  const eliteProxy = process.env.PROXY_URL
    ? new ProxyAgent(process.env.PROXY_URL)
    : undefined

  const IPTV_PARAMS = 'draw=1&columns%5B0%5D%5Bdata%5D=&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=id&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=username&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=password&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=formatted_created_at&columns%5B5%5D%5Bname%5D=created_at&columns%5B5%5D%5Bsearchable%5D=false&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=formatted_exp_date&columns%5B6%5D%5Bname%5D=exp_date&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=max_connections&columns%5B7%5D%5Bname%5D=&columns%5B7%5D%5Bsearchable%5D=true&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=owner_username&columns%5B8%5D%5Bname%5D=regUser.username&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=false&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=reseller_notes&columns%5B9%5D%5Bname%5D=&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=is_trial&columns%5B10%5D%5Bname%5D=&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B11%5D%5Bdata%5D=enabled&columns%5B11%5D%5Bname%5D=&columns%5B11%5D%5Bsearchable%5D=true&columns%5B11%5D%5Borderable%5D=true&columns%5B11%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B11%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B12%5D%5Bdata%5D=&columns%5B12%5D%5Bname%5D=&columns%5B12%5D%5Bsearchable%5D=false&columns%5B12%5D%5Borderable%5D=false&columns%5B12%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B12%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=desc&order%5B0%5D%5Bname%5D=&start=0&length=1000&search%5Bvalue%5D=&search%5Bregex%5D=false'
  const P2P_PARAMS  = 'draw=1&columns%5B0%5D%5Bdata%5D=id&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=id&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=name&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=email&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=exField2&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=formatted_created_at&columns%5B6%5D%5Bname%5D=regTime&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=formatted_exp_date&columns%5B7%5D%5Bname%5D=endTime&columns%5B7%5D%5Bsearchable%5D=false&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=owner_username&columns%5B8%5D%5Bname%5D=regUser.username&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=false&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=exField4&columns%5B9%5D%5Bname%5D=&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=type&columns%5B10%5D%5Bname%5D=&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B11%5D%5Bdata%5D=status&columns%5B11%5D%5Bname%5D=&columns%5B11%5D%5Bsearchable%5D=true&columns%5B11%5D%5Borderable%5D=true&columns%5B11%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B11%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B12%5D%5Bdata%5D=action&columns%5B12%5D%5Bname%5D=&columns%5B12%5D%5Bsearchable%5D=false&columns%5B12%5D%5Borderable%5D=false&columns%5B12%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B12%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=desc&order%5B0%5D%5Bname%5D=&start=0&length=1000&search%5Bvalue%5D=&search%5Bregex%5D=false'

  let csrfToken   = null
  let cookieJar   = null
  let loginPromise = null
  let savedCfCookies = {}

  const parseCookies = (arr) => {
    const obj = {}
    for (const raw of arr) {
      const pair = raw.split(';')[0]
      const idx  = pair.indexOf('=')
      if (idx === -1) continue
      const name = pair.substring(0, idx).trim()
      const val  = decodeURIComponent(pair.substring(idx + 1).trim())
      if (name) obj[name] = val
    }
    return obj
  }

  const buildCookieHeader = (obj) =>
    Object.entries(obj).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')

  const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : [])

  const eliteLogin = async () => {
    if (loginPromise) return loginPromise
    loginPromise = _doLogin().finally(() => { loginPromise = null })
    return loginPromise
  }

  const resolverCaptchaElite = async () => {
    const apiKey  = process.env.CAPSOLVER_KEY
    const pageURL = 'https://adminx.offo.dad/login'

    // Parse proxy
    const proxyUrl = process.env.PROXY_URL || ''
    let proxyHost = '', proxyPort = '', proxyUser = '', proxyPass = ''
    if (proxyUrl) {
      const m = proxyUrl.match(/http:\/\/([^:]+):([^@]+)@([^:]+):([0-9]+)/)
      if (m) { proxyUser = m[1]; proxyPass = m[2]; proxyHost = m[3]; proxyPort = m[4] }
    }

    console.log('[Elite] Resolvendo Cloudflare via CapSolver...')

    const taskBody = {
      clientKey: apiKey,
      task: {
        type:        'AntiCloudflareTask',
        websiteURL:  pageURL,
        proxy:       proxyHost ? 'http://' + proxyUser + ':' + proxyPass + '@' + proxyHost + ':' + proxyPort : undefined,
      }
    }

    const createRes = await fetch('https://api.capsolver.com/createTask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskBody)
    })
    const createData = await createRes.json()
    console.log('[CapSolver] Elite create:', JSON.stringify(createData))
    if (createData.errorId) throw new Error('[CapSolver] Erro: ' + createData.errorDescription)

    const taskId = createData.taskId
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId })
      })
      const result = await resultRes.json()
      console.log('[CapSolver] Elite status (' + ((i+1)*5) + 's):', result.status)
      if (result.status === 'ready') {
        const cookies = result.solution?.cookies
        const ua      = result.solution?.userAgent
        console.log('[Elite] Cloudflare resolvido! cookies:', JSON.stringify(cookies))
        return { cookies, ua }
      }
      if (result.status === 'failed') throw new Error('[CapSolver] Elite falhou: ' + result.errorDescription)
    }
    throw new Error('[Elite] CapSolver timeout')
  }

  const _doLogin = async () => {
    console.log('🔐 [Elite] Iniciando login...')

    // Resolve Cloudflare primeiro
    let cfCookies = {}
    let cfUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    try {
      const sol = await resolverCaptchaElite()
      cfCookies = sol.cookies || {}
      savedCfCookies = cfCookies
      if (sol.ua) cfUA = sol.ua
    } catch (e) {
      console.log('[Elite] CapSolver falhou, tentando sem:', e.message)
    }

    const cfCookieHeader = Object.entries(cfCookies).map(([k,v]) => k + '=' + v).join('; ')

    const s1 = await undiciRequest('https://adminx.offo.dad/login', {
      method: 'GET',
      headers: {
        'User-Agent': cfUA,
        'Cookie':     cfCookieHeader,
      },
      dispatcher: eliteProxy,
      maxRedirections: 5,
      headersTimeout: 30000,
      bodyTimeout: 30000,
    })
    const html1 = await s1.body.text()
    console.log('🔍 [Elite] GET /login status:', s1.statusCode)
    console.log('🔍 [Elite] HTML preview:', html1.substring(0, 200).replace(/\n/g, ' '))

    if (s1.statusCode === 404 || html1.includes('MANUTENCAO') || html1.includes('manutenção') || html1.includes('manutencao')) {
      throw new Error('[Elite] Servidor em manutenção. Tente novamente mais tarde.')
    }
    if (s1.statusCode !== 200) {
      throw new Error(`[Elite] GET /login retornou status ${s1.statusCode}`)
    }

    const fmMatch = html1.match(/name="_token"\s+value="([^"]+)"/) ?? html1.match(/value="([^"]+)"\s+name="_token"/)
    if (!fmMatch?.[1]) {
      console.error('❌ [Elite] HTML (500 chars):', html1.substring(0, 500))
      throw new Error('[Elite] _token nao encontrado no formulario de login')
    }
    const formToken = fmMatch[1]
    const c1 = parseCookies(toArray(s1.headers['set-cookie']))

    const s2 = await undiciRequest('https://adminx.offo.dad/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie':       buildCookieHeader({...cfCookies, ...c1}),
        'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Origin':       'https://adminx.offo.dad',
        'Referer':      'https://adminx.offo.dad/login',
        'Accept':       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: new URLSearchParams({
        _token: formToken, timezone: 'America/Sao_Paulo',
        email: process.env.ELITEUSER, password: process.env.ELITEPASS, remember: 'on',
      }).toString(),
      dispatcher: eliteProxy,
      maxRedirections: 0,
      headersTimeout: 30000,
      bodyTimeout: 30000,
    })
    const s2body = await s2.body.text()
    console.log('[Elite] POST /login status:', s2.statusCode, 'body preview:', s2body.substring(0, 150).replace(/\n/g, ' '))
    if (s2.statusCode !== 302 && s2.statusCode !== 200) throw new Error(`[Elite] Login falhou (${s2.statusCode})`)
    const c2 = { ...c1, ...parseCookies(toArray(s2.headers['set-cookie'])) }

    const s3 = await undiciRequest('https://adminx.offo.dad/dashboard', {
      method: 'GET',
      headers: {
        'Cookie':     buildCookieHeader(c2),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
      dispatcher: eliteProxy,
      headersTimeout: 30000,
      bodyTimeout: 30000,
    })
    const html3 = await s3.body.text()
    const mm = html3.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)
    if (!mm?.[1]) throw new Error('[Elite] csrf-token nao encontrado no dashboard')
    csrfToken = mm[1]
    cookieJar = { ...savedCfCookies, ...c2, ...parseCookies(toArray(s3.headers['set-cookie'])) }
    console.log('🔑 [Elite] csrf-token:', csrfToken.substring(0, 20) + '...')
    console.log('🍪 [Elite] Cookies:', Object.keys(cookieJar).join(', '))
  }

  const eliteFetch = async (path, method = 'GET', body = null, retry = true) => {
    if (!csrfToken || !cookieJar) await eliteLogin()

    const res = await undiciRequest(`https://adminx.offo.dad/${path}`, {
      method,
      headers: {
        'Accept':           'application/json, text/javascript, */*; q=0.01',
        'Content-Type':     body ? 'application/json' : undefined,
        'Cookie':           buildCookieHeader(cookieJar),
        'Origin':           'https://adminx.offo.dad',
        'Referer':          'https://adminx.offo.dad/dashboard',
        'X-CSRF-TOKEN':     csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
      body:           body ? JSON.stringify(body) : undefined,
      dispatcher:     eliteProxy,
      headersTimeout: 30000,
      bodyTimeout:    30000,
    })

    const text = await res.body.text()
    console.log(`📥 [Elite] ${method} /${path.substring(0,60)} → ${res.statusCode} | ${text.substring(0, 200)}`)

    if ((res.statusCode === 401 || res.statusCode === 419) && retry) {
      console.log('🔄 [Elite] Sessao expirada, refazendo login...')
      csrfToken = null; cookieJar = null
      return eliteFetch(path, method, body, false)
    }
    if (res.statusCode >= 400) throw new Error(`[Elite] ${method} /${path.substring(0,60)} status ${res.statusCode}: ${text.slice(0, 200)}`)

    try { return JSON.parse(text) } catch { return { raw: text.substring(0, 500) } }
  }

  router.get('/elite/debug', async (req, res) => {
    try {
      await eliteLogin()
      res.json({ ok: true, csrfToken: csrfToken?.substring(0, 20) + '...', cookies: Object.keys(cookieJar ?? {}) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/elite/sincronizar', async (req, res) => {
    try {
      console.log('🔄 [Elite] Buscando IPTV...')
      const iptvResp = await eliteFetch(`dashboard/iptv?${IPTV_PARAMS}`)
      console.log('🔄 [Elite] Buscando P2P...')
      const p2pResp  = await eliteFetch(`dashboard/p2p?${P2P_PARAMS}`)

      const iptv = (iptvResp?.data ?? []).map(l => ({
        id: l.id, username: l.username, password: l.password,
        name: l.reseller_notes ?? '', tipo: 'IPTV', exp_date: l.exp_date_formatted ?? null,
      }))
      const p2p = (p2pResp?.data ?? []).map(l => ({
        id: l.id, id_p2p: l.id_p2p, username: l.email ?? '',
        name: l.name ?? '', tipo: 'P2P', exp_date: l.exp_date_formatted ?? null,
      }))

      res.json({ total: iptv.length + p2p.length, iptv: iptv.length, p2p: p2p.length, linhas: [...iptv, ...p2p] })
    } catch (err) {
      console.error('[Elite] sincronizar erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/elite/renovar', async (req, res) => {
    try {
      const { id, tipo, meses = 1, nome, telefone, usuario, senha, skipWA } = req.body
      if (!id || !tipo) return res.status(400).json({ error: 'id e tipo sao obrigatorios' })
      const t    = tipo.toLowerCase() === 'p2p' ? 'p2p' : 'iptv'
      const n    = Number(meses)
      const path = n <= 1 ? `api/${t}/renewone/${id}` : `api/${t}/renewmulti/${id}`
      const body = n <= 1 ? null : { user_id: id, months: n }
      const data = await eliteFetch(path, 'POST', body)
      console.log(`[Elite] RENOVAR id=${id} tipo=${t} meses=${n}`, JSON.stringify(data))

      let vencimento = null
      if (data?.new_exp_date) {
        const m = data.new_exp_date.match(/(\d{2})\/(\d{2})\/(\d{4})/)
        vencimento = m ? `${m[1]}/${m[2]}/${m[3]}` : null
      } else if (data?.new_end_time) {
        const d = new Date(data.new_end_time)
        vencimento = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
      }
      if (enviarMensagemRenovacao && telefone && !skipWA) {
        try { await enviarMensagemRenovacao(telefone, { nome, usuario, senha, vencimento }) } catch (e) { console.error('[Elite] WA erro:', e.message) }
      }
      console.log('[Elite] vencimento extraido: ' + vencimento)
      res.json({ ...data, vencimento })
    } catch (err) {
      console.error('[Elite] renovar erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/elite/saldo', async (req, res) => {
    try {
      if (!csrfToken || !cookieJar) await eliteLogin()
      const { request: undiciReq } = await import('undici')
      const r = await undiciReq('https://adminx.offo.dad/dashboard', {
        method: 'GET',
        headers: { 'Accept': 'text/html', 'Cookie': buildCookieHeader(cookieJar), 'User-Agent': 'Mozilla/5.0' },
        dispatcher: eliteProxy, headersTimeout: 30000, bodyTimeout: 30000,
      })
      const html = await r.body.text()
      const match = html.match(/id="navbarCredits"[^>]*>[\s\S]*?([0-9]+[.,][0-9]+)[\s\S]*?<\/span>/)
      const creditos = match ? parseFloat(match[1].replace(',', '.')) : null
      res.json({ ok: true, creditos })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // FIX: buscar-linha — P2P usa campo 'email', nao 'username'
  router.get('/elite/buscar-linha/:username', async (req, res) => {
    try {
      const username = decodeURIComponent(req.params.username)

      // IPTV — full scan
      console.log(`[Elite] buscar-linha IPTV: "${username}"`)
      let start = 0
      while (true) {
        const iptvData = await eliteFetch(`dashboard/iptv?draw=1&start=${start}&length=100`)
        const items = iptvData?.data ?? []
        const found = items.find(l => l.username === username)
        if (found) {
          console.log(`[Elite] buscar-linha encontrado IPTV: id=${found.id}`)
          return res.json({ ok: true, id: found.id, tipo: 'IPTV', username })
        }
        if (items.length < 100) break
        start += 100
      }

      // P2P — full scan (FIX: campo 'email' na API bruta, nao 'username')
      console.log(`[Elite] buscar-linha P2P: "${username}"`)
      start = 0
      while (true) {
        const p2pData = await eliteFetch(`dashboard/p2p?draw=1&start=${start}&length=100`)
        const items = p2pData?.data ?? []
        // CORRIGIDO: API P2P usa 'email' como campo de username
        const found = items.find(l => (l.email ?? '') === username)
        if (found) {
          console.log(`[Elite] buscar-linha encontrado P2P: id=${found.id} email=${found.email}`)
          return res.json({ ok: true, id: found.id, tipo: 'P2P', username })
        }
        if (items.length < 100) break
        start += 100
      }

      console.log(`[Elite] buscar-linha NAO encontrado: "${username}"`)
      res.status(404).json({ ok: false, error: `Usuario "${username}" nao encontrado no Elite` })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  return { router }
}
