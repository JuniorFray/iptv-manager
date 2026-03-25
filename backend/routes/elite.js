import express from 'express'
import { ProxyAgent, request as undiciRequest, fetch as undiciFetch } from 'undici'

/**
 * Módulo Elite — adminx.offo.dad
 *
 * Fluxo de autenticação:
 *  1. GET /login  → extrai _token do form + cookies iniciais
 *  2. POST /login → autentica e obtém cookies de sessão
 *  3. GET /dashboard → extrai <meta name="csrf-token"> para usar nas requisições AJAX
 *
 * Endpoints corretos descobertos via Network:
 *  - Listagem:  GET /dashboard/iptv?draw=1&...  |  GET /dashboard/p2p?draw=1&...
 *  - Renovar 1 mês:  POST /api/iptv/renewone/{id}  |  POST /api/p2p/renewone/{id}
 *  - Renovar N meses: POST /api/iptv/renewmulti/{id}  |  POST /api/p2p/renewmulti/{id}
 */
export default function createEliteRouter() {
  const router = express.Router()

  // ---- Proxy (opcional via env PROXY_URL) ----
  const eliteProxy = process.env.PROXY_URL
    ? new ProxyAgent(process.env.PROXY_URL)
    : undefined

  // ---- Estado de autenticação ----
  let csrfToken = null  // token curto do <meta name="csrf-token">
  let cookieJar = null  // todos os cookies da sessão autenticada

  // ---- Helpers de cookie ----
  const parseCookies = (setCookieArray) => {
    const obj = {}
    for (const raw of setCookieArray) {
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

  // ---- Login Elite ----
  const eliteLogin = async () => {
    console.log('🔐 [Elite] Iniciando login...')

    // Etapa 1: GET /login — form token + cookies iniciais
    const step1 = await undiciRequest('https://adminx.offo.dad/login', {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' },
      dispatcher: eliteProxy,
      maxRedirections: 0,
    })

    const html1 = await step1.body.text()
    const formTokenMatch =
      html1.match(/name="_token"\s+value="([^"]+)"/) ??
      html1.match(/value="([^"]+)"\s+name="_token"/)

    if (!formTokenMatch?.[1]) throw new Error('[Elite] _token nao encontrado no HTML de login')
    const formToken = formTokenMatch[1]

    const raw1    = step1.headers['set-cookie'] ?? []
    const cookies1 = parseCookies(Array.isArray(raw1) ? raw1 : [raw1])
    console.log('🔍 [Elite] formToken:', formToken.substring(0, 20) + '...')

    // Etapa 2: POST /login — autenticar
    const step2 = await undiciRequest('https://adminx.offo.dad/login', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Cookie':        buildCookieHeader(cookies1),
        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Origin':        'https://adminx.offo.dad',
        'Referer':       'https://adminx.offo.dad/login',
        'Accept':        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: new URLSearchParams({
        _token:   formToken,
        timezone: 'America/Sao_Paulo',
        email:    process.env.ELITEUSER,
        password: process.env.ELITEPASS,
        remember: 'on',
      }).toString(),
      dispatcher:      eliteProxy,
      maxRedirections: 0,
    })

    await step2.body.text()

    if (step2.statusCode !== 302 && step2.statusCode !== 200) {
      throw new Error(`[Elite] Login falhou (status ${step2.statusCode})`)
    }

    const raw2    = step2.headers['set-cookie'] ?? []
    const cookies2 = { ...cookies1, ...parseCookies(Array.isArray(raw2) ? raw2 : [raw2]) }
    console.log('✅ [Elite] Login OK, status:', step2.statusCode)

    // Etapa 3: GET /dashboard — extrair <meta name="csrf-token">
    const step3 = await undiciRequest('https://adminx.offo.dad/dashboard', {
      method: 'GET',
      headers: {
        'Cookie':     buildCookieHeader(cookies2),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
      dispatcher: eliteProxy,
    })

    const html3      = await step3.body.text()
    const metaMatch  = html3.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)
    if (!metaMatch?.[1]) throw new Error('[Elite] csrf-token nao encontrado no dashboard')
    csrfToken = metaMatch[1]

    const raw3  = step3.headers['set-cookie'] ?? []
    cookieJar   = { ...cookies2, ...parseCookies(Array.isArray(raw3) ? raw3 : [raw3]) }

    console.log('🔑 [Elite] csrf-token:', csrfToken.substring(0, 20) + '...')
    console.log('🍪 [Elite] Cookies:', Object.keys(cookieJar).join(', '))
  }

  // ---- Fetch autenticado Elite ----
  const eliteFetch = async (path, method = 'GET', body = null, retry = true) => {
    if (!csrfToken || !cookieJar) await eliteLogin()

    const headers = {
      'Accept':           'application/json, text/javascript, */*; q=0.01',
      'Cookie':           buildCookieHeader(cookieJar),
      'Origin':           'https://adminx.offo.dad',
      'Referer':          'https://adminx.offo.dad/dashboard',
      'X-CSRF-TOKEN':     csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    }
    if (body) headers['Content-Type'] = 'application/json'

    const url = `https://adminx.offo.dad/${path}`
    console.log(`📤 [Elite] ${method} ${url}`)

    const res     = await undiciFetch(url, {
      method,
      headers,
      body:       body ? JSON.stringify(body) : null,
      dispatcher: eliteProxy,
    })

    const rawText = await res.text()
    console.log(`📥 [Elite] status: ${res.status} | body: ${rawText.substring(0, 300)}`)

    if ((res.status === 401 || res.status === 419) && retry) {
      console.log('🔄 [Elite] Sessão expirada, refazendo login...')
      csrfToken = null
      cookieJar = null
      return eliteFetch(path, method, body, false)
    }

    if (res.status >= 400) {
      throw new Error(`[Elite] ${method} ${path} → status ${res.status}: ${rawText.slice(0, 300)}`)
    }

    try { return JSON.parse(rawText) }
    catch { return { raw: rawText.substring(0, 500) } }
  }

  // ---- Sincronizar: busca clientes via DataTables ----
  const sincronizarTipo = async (tipo) => {
    const params = new URLSearchParams({
      draw:              '1',
      'order[0][column]': '1',
      'order[0][dir]':   'desc',
      start:             '0',
      length:            '1000',
      'search[value]':   '',
      'search[regex]':   'false',
    })
    const data = await eliteFetch(`dashboard/${tipo}?${params.toString()}`)
    return data?.data ?? []
  }

  // ---- Rotas Elite ----

  router.get('/elite/debug', async (req, res) => {
    try {
      await eliteLogin()
      res.json({
        ok:        true,
        csrfToken: csrfToken?.substring(0, 20) + '...',
        cookies:   Object.keys(cookieJar ?? {}),
      })
    } catch (err) {
      console.error('[Elite] /elite/debug erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/elite/sincronizar', async (req, res) => {
    try {
      const [iptvData, p2pData] = await Promise.all([
        sincronizarTipo('iptv'),
        sincronizarTipo('p2p'),
      ])

      const iptv = iptvData.map(l => ({
        id:       l.id,
        username: l.username,
        password: l.password,
        name:     l.reseller_notes ?? '',
        tipo:     'IPTV',
        exp_date: l.exp_date_formatted ?? null,
      }))

      const p2p = p2pData.map(l => ({
        id:       l.id,
        id_p2p:   l.id_p2p,
        username: l.email ?? '',
        name:     l.name ?? '',
        tipo:     'P2P',
        exp_date: l.exp_date_formatted ?? null,
      }))

      const todas = [...iptv, ...p2p]
      res.json({ total: todas.length, linhas: todas })
    } catch (err) {
      console.error('[Elite] /elite/sincronizar erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/elite/renovar', async (req, res) => {
    try {
      const { id, tipo, meses = 1 } = req.body
      if (!id || !tipo) return res.status(400).json({ error: 'id e tipo sao obrigatorios' })

      const t    = tipo.toLowerCase() === 'p2p' ? 'p2p' : 'iptv'
      const n    = Number(meses)
      const path = n <= 1
        ? `api/${t}/renewone/${id}`
        : `api/${t}/renewmulti/${id}`
      const body = n <= 1 ? null : { user_id: id, months: n }

      const data = await eliteFetch(path, 'POST', body)
      console.log(`[Elite] RENOVAR id=${id} tipo=${t} meses=${n}`, JSON.stringify(data))
      res.json(data)
    } catch (err) {
      console.error('[Elite] /elite/renovar erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return { router }
}
