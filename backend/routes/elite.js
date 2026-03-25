import express from 'express'
import { ProxyAgent, request as undiciRequest, fetch as undiciFetch } from 'undici'

/**
 * Módulo Elite — adminx.offo.dad
 * Responsável por: autenticação via scraping, renovação IPTV/P2P e rotas /elite/*
 */
export default function createEliteRouter() {
  const router = express.Router()

  // ---- Proxy (opcional via env PROXY_URL) ----

  const eliteProxy = process.env.PROXY_URL
    ? new ProxyAgent(process.env.PROXY_URL)
    : undefined

  // ---- Estado de autenticação ----

  let eliteToken   = null
  let eliteCookies = null

  // ---- Login Elite (scraping de sessão) ----

  const eliteLogin = async () => {
    console.log('🔐 Iniciando eliteLogin...')

    // Etapa 1 — pegar página e extrair _token do HTML + cookies iniciais
    const step1 = await undiciRequest('https://adminx.offo.dad/login', {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
      },
      dispatcher:     eliteProxy,
      maxRedirections: 0,
    })

    const html = await step1.body.text()

    const tokenMatch =
      html.match(/name="_token"\s+value="([^"]+)"/) ??
      html.match(/value="([^"]+)"\s+name="_token"/)

    if (!tokenMatch?.[1]) {
      console.error('❌ eliteLogin: não encontrou _token no HTML')
      throw new Error('Elite: _token não encontrado no HTML de login')
    }

    const formToken = tokenMatch[1]
    console.log('🔍 _token do HTML:', formToken)

    const raw1 = step1.headers['set-cookie'] ?? []
    const arr1 = Array.isArray(raw1) ? raw1 : [raw1]

    const xsrfRaw = arr1
      .find(c => c.startsWith('XSRF-TOKEN='))?.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''

    const sessionRaw = arr1
      .find(c => c.startsWith('office_session='))?.match(/office_session=([^;]+)/)?.[1] ?? ''

    if (!xsrfRaw || !sessionRaw) {
      console.error('❌ eliteLogin: não conseguiu XSRF-TOKEN ou office_session no step1')
      throw new Error('Elite: cookies iniciais não encontrados')
    }

    const cookieStr = `XSRF-TOKEN=${xsrfRaw}; office_session=${sessionRaw}`
    console.log('🔍 step1 cookieStr:', cookieStr)

    // Etapa 2 — POST login
    const step2 = await undiciRequest('https://adminx.offo.dad/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Origin':  'https://adminx.offo.dad',
        'Referer': 'https://adminx.offo.dad/login',
        'Accept':  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: new URLSearchParams({
        _token:   formToken,
        timezone: 'America/Sao_Paulo',
        email:    process.env.ELITEUSER,
        password: process.env.ELITEPASS,
        remember: 'on',
      }).toString(),
      dispatcher:     eliteProxy,
      maxRedirections: 0,
    })

    const step2Text = await step2.body.text().catch(() => '')
    const raw2      = step2.headers['set-cookie'] ?? []
    const arr2      = Array.isArray(raw2) ? raw2 : [raw2]

    console.log('🔍 Elite status login:', step2.statusCode)
    console.log('🔍 step2 Location:',    step2.headers['location'])
    console.log('🔍 Elite cookies pós-login:', arr2)

    if (step2.statusCode !== 302 && step2.statusCode !== 200) {
      console.error('❌ eliteLogin: status inesperado', step2.statusCode, step2Text.slice(0, 300))
      throw new Error(`Elite login falhou (status ${step2.statusCode})`)
    }

    const newXsrfRaw = arr2
      .find(c => c.startsWith('XSRF-TOKEN='))?.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''

    if (!newXsrfRaw) {
      console.error('❌ eliteLogin: não achou XSRF-TOKEN pós-login')
      throw new Error('Elite: XSRF-TOKEN pós-login não encontrado')
    }

    eliteToken = decodeURIComponent(newXsrfRaw)

    eliteCookies = arr2
      .map(c => c.split(';')[0])
      .filter(Boolean)
      .map(pair => {
        const eqIdx = pair.indexOf('=')
        if (eqIdx === -1) return pair
        const name = pair.substring(0, eqIdx)
        const val  = decodeURIComponent(pair.substring(eqIdx + 1))
        return `${name}=${val}`
      })
      .join('; ')

    if (!eliteCookies) {
      console.error('❌ eliteLogin: eliteCookies final vazio')
      throw new Error('Elite: cookies pós-login vazios')
    }

    console.log('🔑 Elite login OK — status:', step2.statusCode)
    console.log('🔍 eliteCookies final:', eliteCookies.substring(0, 80) + '...')
  }

  // ---- Fetch autenticado Elite ----

  const eliteFetch = async (path, method = 'GET', body = null, contentType = 'application/json') => {
    if (!eliteToken || !eliteCookies) await eliteLogin()

    const headers = {
      'Accept':           'application/json, text/plain, */*',
      'Content-Type':     contentType,
      'Cookie':           eliteCookies,
      'Origin':           'https://adminx.offo.dad',
      'Referer':          'https://adminx.offo.dad/dashboard/iptv',
      'X-CSRF-TOKEN':     eliteToken,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':       'Mozilla/5.0',
    }

    const bodyStr = body
      ? (contentType.includes('json')
        ? JSON.stringify(body)
        : new URLSearchParams(body).toString())
      : null

    console.log('📤 eliteFetch →', method, `https://adminx.offo.dad/${path}`)
    console.log('📤 X-CSRF-TOKEN:', eliteToken?.substring(0, 30))
    console.log('📤 Cookie:', eliteCookies?.substring(0, 80))
    if (bodyStr) console.log('📤 Body:', bodyStr.substring(0, 200))

    const res = await undiciFetch(`https://adminx.offo.dad/${path}`, {
      method,
      headers,
      body: bodyStr,
      dispatcher: eliteProxy,
    })

    const rawText = await res.text()
    console.log('📥 eliteFetch status:', res.status)
    console.log('📥 eliteFetch body:',   rawText.substring(0, 500))

    if (res.status === 401 || res.status === 419) {
      console.log('🔄 Token expirado — fazendo novo login...')
      await eliteLogin()
      return eliteFetch(path, method, body, contentType)
    }

    if (res.status >= 400) {
      throw new Error(`EliteFetch falhou (status ${res.status}): ${rawText.slice(0, 300)}`)
    }

    try {
      return JSON.parse(rawText)
    } catch {
      console.error('❌ eliteFetch: resposta não é JSON válido')
      return { error: true, raw: rawText.substring(0, 300) }
    }
  }

  // ---- Rotas Elite ----

  router.get('/elite/debug', async (req, res) => {
    try {
      await eliteLogin()
      const resIptv = await undiciFetch('https://adminx.offo.dad/dashboard/iptv/data?per_page=5', {
        headers: {
          'Accept':           'application/json, text/plain, */*',
          'Cookie':           eliteCookies,
          'X-CSRF-TOKEN':     eliteToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer':          'https://adminx.offo.dad/dashboard/iptv',
          'User-Agent':       'Mozilla/5.0',
        },
        dispatcher: eliteProxy,
      })
      const rawText    = await resIptv.text()
      const status     = resIptv.status
      const contentType = resIptv.headers.get('content-type') ?? 'unknown'
      let parsed       = null
      try { parsed = JSON.parse(rawText) } catch { parsed = null }
      res.json({ status, contentType, isJson: parsed !== null, preview: rawText.substring(0, 500), data: parsed })
    } catch (err) {
      console.error('Erro em /elite/debug:', err)
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/elite/sincronizar', async (req, res) => {
    try {
      const [resIptv, resP2p] = await Promise.all([
        eliteFetch('dashboard/iptv/data?per_page=1000'),
        eliteFetch('dashboard/p2p/data?per_page=1000'),
      ])
      const iptv  = (resIptv?.data ?? resIptv?.items ?? []).map(l => ({ ...l, _tipo: 'IPTV' }))
      const p2p   = (resP2p?.data  ?? resP2p?.items  ?? []).map(l => ({ ...l, _tipo: 'P2P'  }))
      const todas = [...iptv, ...p2p]
      const linhas = todas.map(l => ({
        id:       l.id,
        username: l.username,
        password: l.password,
        name:     l.name ?? l.member_name ?? l.notes ?? '',
        tipo:     l._tipo,
        exp_date: l.exp_date ?? l.expiry_date ?? null,
      }))
      res.json({ total: linhas.length, linhas })
    } catch (err) {
      console.error('Erro em /elite/sincronizar:', err)
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/elite/renovar', async (req, res) => {
    try {
      const { id, tipo, meses = 1 } = req.body
      const tipoPath = tipo?.toLowerCase() === 'p2p' ? 'p2p' : 'iptv'
      let data
      if (Number(meses) <= 1) {
        data = await eliteFetch(`api/${tipoPath}/renewone/${id}`, 'POST')
      } else {
        data = await eliteFetch(`api/${tipoPath}/renewmulti/${id}`, 'POST', {
          user_id: id,
          months:  Number(meses),
        })
      }
      console.log(`[RENOVAR ELITE] id=${id} tipo=${tipoPath} meses=${meses} resposta=`, JSON.stringify(data))
      res.json(data)
    } catch (err) {
      console.error('Erro em /elite/renovar:', err)
      res.status(500).json({ error: err.message })
    }
  })

  return { router }
}
