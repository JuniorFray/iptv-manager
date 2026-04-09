import express from 'express'
import { ProxyAgent, request as undiciRequest } from 'undici'
import { chromium as chromiumBase } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
chromium.use(StealthPlugin())

export default function createEliteRouter(enviarMensagemRenovacao) {
  const router = express.Router()

  const eliteProxy = process.env.PROXY_URL
    ? new ProxyAgent(process.env.PROXY_URL)
    : undefined

  const IPTV_PARAMS = 'draw=1&columns%5B0%5D%5Bdata%5D=&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=id&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=username&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=password&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=formatted_created_at&columns%5B5%5D%5Bname%5D=created_at&columns%5B5%5D%5Bsearchable%5D=false&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=formatted_exp_date&columns%5B6%5D%5Bname%5D=exp_date&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=max_connections&columns%5B7%5D%5Bname%5D=&columns%5B7%5D%5Bsearchable%5D=true&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=owner_username&columns%5B8%5D%5Bname%5D=regUser.username&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=false&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=reseller_notes&columns%5B9%5D%5Bname%5D=&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=is_trial&columns%5B10%5D%5Bname%5D=&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B11%5D%5Bdata%5D=enabled&columns%5B11%5D%5Bname%5D=&columns%5B11%5D%5Bsearchable%5D=true&columns%5B11%5D%5Borderable%5D=true&columns%5B11%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B11%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B12%5D%5Bdata%5D=&columns%5B12%5D%5Bname%5D=&columns%5B12%5D%5Bsearchable%5D=false&columns%5B12%5D%5Borderable%5D=false&columns%5B12%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B12%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=desc&order%5B0%5D%5Bname%5D=&start=0&length=1000&search%5Bvalue%5D=&search%5Bregex%5D=false'
  const P2P_PARAMS  = 'draw=1&columns%5B0%5D%5Bdata%5D=id&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=id&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=name&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=email&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=exField2&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=formatted_created_at&columns%5B6%5D%5Bname%5D=regTime&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=formatted_exp_date&columns%5B7%5D%5Bname%5D=endTime&columns%5B7%5D%5Bsearchable%5D=false&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=owner_username&columns%5B8%5D%5Bname%5D=regUser.username&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=false&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=exField4&columns%5B9%5D%5Bname%5D=&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=type&columns%5B10%5D%5Bname%5D=&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B11%5D%5Bdata%5D=status&columns%5B11%5D%5Bname%5D=&columns%5B11%5D%5Bsearchable%5D=true&columns%5B11%5D%5Borderable%5D=true&columns%5B11%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B11%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B12%5D%5Bdata%5D=action&columns%5B12%5D%5Bname%5D=&columns%5B12%5D%5Bsearchable%5D=false&columns%5B12%5D%5Borderable%5D=false&columns%5B12%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B12%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=desc&order%5B0%5D%5Bname%5D=&start=0&length=1000&search%5Bvalue%5D=&search%5Bregex%5D=false'

  let csrfToken    = null
  let cookieJar    = null
  let loginPromise = null
  let savedCfCookies = {}
  let flareSession = null
  let pwBrowser    = null
  let pwContext    = null
  let pwPage       = null
  const FLARESOLVERR = 'http://flaresolverr.railway.internal:8080/v1'

  const flareRequest = async (cmd, url, opts = {}) => {
    const payload = { cmd, url, maxTimeout: 60000, ...opts }
    if (flareSession) payload.session = flareSession
    const r = await fetch(FLARESOLVERR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const d = await r.json()
    if (d.status !== 'ok') throw new Error('[FlareSolverr] ' + cmd + ' falhou: ' + d.message)
    return d
  }

  const ensureFlareSession = async () => {
    if (flareSession) return
    const d = await fetch(FLARESOLVERR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'sessions.create' })
    })
    const data = await d.json()
    flareSession = data.session
    console.log('[Elite] FlareSolverr session criada:', flareSession)
  }

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
    const FLARESOLVERR = 'http://flaresolverr.railway.internal:8080/v1'
    const LOGIN_URL = 'https://adminx.offo.dad/login'

    // Step 1: GET login page via FlareSolverr
    console.log('[Elite] FlareSolverr GET /login...')
    const r1 = await fetch(FLARESOLVERR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url: LOGIN_URL, maxTimeout: 60000 })
    })
    const d1 = await r1.json()
    console.log('[Elite] FlareSolverr GET:', d1.status, 'http:', d1.solution?.status)
    if (d1.status !== 'ok') throw new Error('[FlareSolverr] GET falhou: ' + d1.message)

    const html1 = d1.solution?.response || ''
    const cookieArr1 = d1.solution?.cookies || []
    const ua = d1.solution?.userAgent || 'Mozilla/5.0'

    const fmMatch = html1.match(/name="_token"\s+value="([^"]+)"/) ?? html1.match(/value="([^"]+)"\s+name="_token"/)
    if (!fmMatch?.[1]) throw new Error('[Elite] _token nao encontrado via FlareSolverr')
    const formToken = fmMatch[1]
    console.log('[Elite] _token:', formToken.substring(0, 20) + '...')

    // Step 2: POST login via FlareSolverr
    console.log('[Elite] FlareSolverr POST /login...')
    const postData = '_token=' + encodeURIComponent(formToken) +
      '&timezone=America%2FSao_Paulo' +
      '&email=' + encodeURIComponent(process.env.ELITEUSER) +
      '&password=' + encodeURIComponent(process.env.ELITEPASS) +
      '&remember=on'

    const r2 = await fetch(FLARESOLVERR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'request.post',
        url: LOGIN_URL,
        postData,
        maxTimeout: 60000,
        cookies: cookieArr1,
      })
    })
    const d2 = await r2.json()
    console.log('[Elite] FlareSolverr POST:', d2.status, 'http:', d2.solution?.status)
    if (d2.status !== 'ok') throw new Error('[FlareSolverr] POST falhou: ' + d2.message)

    const cookieArr2 = d2.solution?.cookies || []
    const cookies = {}
    for (const c of [...cookieArr1, ...cookieArr2]) cookies[c.name] = c.value
    const html = d2.solution?.response || ''
    console.log('[Elite] Login via FlareSolverr OK! cookies:', Object.keys(cookies).join(', '))
    return { cookies, ua, html }
  }

  const _doLogin = async () => {
    console.log('[Elite] Iniciando login via Playwright...')

    // Fecha browser anterior se existir
    if (pwBrowser) { try { await pwBrowser.close() } catch(e) {} pwBrowser = null; pwContext = null; pwPage = null }

    // Usa proxy residencial - Railway IP de datacenter é bloqueado pelo Cloudflare
    const eliteProxyUrl = process.env.ELITE_PROXY_URL || process.env.PROXY_URL || ''
    let proxyOpts = undefined
    if (eliteProxyUrl) {
      const m = eliteProxyUrl.match(/http:\/\/([^:]+):([^@]+)@([^:]+):([0-9]+)/)
      if (m) proxyOpts = { server: 'http://' + m[3] + ':' + m[4], username: m[1], password: m[2] }
      console.log('[Elite] Usando proxy:', eliteProxyUrl.replace(/:[^:@]+@/, ':***@'))
    }

    pwBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
      proxy: proxyOpts,
    })
    pwContext = await pwBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      proxy: proxyOpts,
      viewport: { width: 1280, height: 800 },
    })
    pwPage = await pwContext.newPage()

    // Navega para login
    console.log('[Elite] Playwright navegando para /login...')
    await pwPage.goto('https://adminx.offo.dad/login', { waitUntil: 'domcontentloaded', timeout: 60000 })

    // Aguarda Cloudflare resolver e formulario aparecer
    console.log('[Elite] Aguardando formulario de login...')
    await pwPage.waitForSelector('input[name="email"]', { timeout: 60000, state: 'visible' })
    console.log('[Elite] Formulario visivel, URL:', pwPage.url())

    // Preenche formulario
    await pwPage.fill('input[name="email"]', process.env.ELITEUSER)
    await pwPage.fill('input[name="password"]', process.env.ELITEPASS)
    await pwPage.click('button[type="submit"]')
    await pwPage.waitForURL('**/dashboard**', { timeout: 60000 })
    console.log('[Elite] Playwright login OK, URL:', pwPage.url())

    // Pega csrf-token
    const csrfMeta = await pwPage.$('meta[name="csrf-token"]')
    csrfToken = csrfMeta ? await csrfMeta.getAttribute('content') : null
    if (!csrfToken) throw new Error('[Elite] csrf-token nao encontrado')

    // Pega cookies
    const cookies = await pwContext.cookies()
    cookieJar = {}
    for (const c of cookies) cookieJar[c.name] = c.value
    savedCfCookies = cookieJar

    console.log('[Elite] csrf-token:', csrfToken.substring(0, 20) + '...')
    console.log('[Elite] Cookies:', Object.keys(cookieJar).join(', '))
  }


  const eliteFetch = async (path, method = 'GET', body = null, retry = true) => {
    if (!csrfToken || !cookieJar || !pwPage) await eliteLogin()

    // Usa Playwright page para fazer fetch no contexto do browser (mesmo IP/TLS/fingerprint)
    let result
    try {
      result = await pwPage.evaluate(async ({ path, method, body, csrfToken }) => {
        const opts = {
          method,
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-CSRF-TOKEN': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://adminx.offo.dad',
            'Referer': 'https://adminx.offo.dad/dashboard',
          }
        }
        if (body) {
          opts.headers['Content-Type'] = 'application/json'
          opts.body = JSON.stringify(body)
        }
        const r = await fetch('https://adminx.offo.dad/' + path, opts)
        const text = await r.text()
        return { status: r.status, text }
      }, { path, method, body, csrfToken })
    } catch(e) {
      if (retry) {
        console.log('[Elite] Playwright evaluate erro, refazendo login:', e.message)
        csrfToken = null; cookieJar = null; pwPage = null
        return eliteFetch(path, method, body, false)
      }
      throw e
    }

    const { status: statusCode, text } = result
    console.log('[Elite] ' + method + ' /' + path.substring(0,60) + ' -> ' + statusCode + ' | ' + text.substring(0, 80))

    if ((statusCode === 401 || statusCode === 419 || text.includes('Logar no Sistema')) && retry) {
      console.log('[Elite] Sessao expirada, refazendo login...')
      csrfToken = null; cookieJar = null; pwPage = null
      return eliteFetch(path, method, body, false)
    }
    if (statusCode >= 400) throw new Error('[Elite] ' + method + ' /' + path.substring(0,60) + ' status ' + statusCode + ': ' + text.slice(0, 200))

    try { return JSON.parse(text) } catch { return { raw: text.substring(0, 500) } }
  }


  router.get('/elite/debug-api', async (req, res) => {
    try {
      // Forca re-login
      csrfToken = null; cookieJar = null; flareSession = null
      await eliteLogin()

      // Testa API imediatamente apos login
      const cookieArr = Object.entries(cookieJar).map(([name, value]) => ({ name, value, domain: '.adminx.offo.dad', path: '/' }))
      const d = await fetch(FLARESOLVERR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'request.get',
          url: 'https://adminx.offo.dad/dashboard/iptv?draw=1&start=0&length=5',
          maxTimeout: 60000,
          cookies: cookieArr,
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-CSRF-TOKEN': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
          }
        })
      })
      const data = await d.json()
      res.json({ httpStatus: data.solution?.status, isJSON: (data.solution?.response||'').startsWith('{') || (data.solution?.response||'').startsWith('['), preview: (data.solution?.response || '').substring(0, 300) })
    } catch(err) { res.status(500).json({ error: err.message }) }
  })

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
      const FLARESOLVERR = 'http://flaresolverr.railway.internal:8080/v1'
      const cookieArr = Object.entries(cookieJar).map(([name, value]) => ({ name, value }))
      const r = await fetch(FLARESOLVERR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'request.get', url: 'https://adminx.offo.dad/dashboard', maxTimeout: 60000, cookies: cookieArr })
      })
      const d = await r.json()
      const html = d.solution?.response || ''
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
