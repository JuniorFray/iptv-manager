import express from 'express'

/**
 * Módulo Central — api.controle.fit
 * Painel: https://painel.fun
 *
 * Auth: JWT Bearer via POST /api/auth/sign-in
 * Token expira em ~1 hora — renovado automaticamente
 *
 * Endpoints:
 *   GET  /api/users?page=1&per=1000&reseller={user}  → lista clientes
 *   POST /api/users/{id}/renew { package_id }        → renova cliente
 *
 * Variáveis de ambiente:
 *   CENTRAL_USER        → usuário do painel
 *   CENTRAL_PASS        → senha do painel
 *   CENTRAL_USERNAME    → username do revendedor (ex: junior1510)
 *   CENTRAL_PACKAGE_ID  → package_id para renovação (padrão: 17)
 */
export default function createCentralRouter() {
  const router = express.Router()

  const BASE_URL = 'https://api.controle.fit/api'

  let centralToken    = null
  let centralTokenExp = 0

  // ---- Login ----
  const centralLogin = async () => {
    console.log('🔐 [Central] Iniciando login...')

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
        'cf-turnstile-response': '',
      }),
    })

    const data = await res.json()
    if (!data.token) throw new Error('[Central] Login falhou: ' + JSON.stringify(data).substring(0, 200))

    centralToken    = data.token
    // Token expira em ~1h — renova 5 min antes
    centralTokenExp = Date.now() + (55 * 60 * 1000)
    console.log('✅ [Central] Login OK — user:', data.user?.username, '| créditos:', data.user?.credits)
    return centralToken
  }

  const getToken = async () => {
    if (!centralToken || Date.now() > centralTokenExp) await centralLogin()
    return centralToken
  }

  // ---- Fetch autenticado ----
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
    console.log(`📥 [Central] ${method} ${path} → ${res.status} | ${text.substring(0, 200)}`)

    if (res.status === 401 && retry) {
      console.log('🔄 [Central] Token expirado, refazendo login...')
      centralToken = null
      return centralFetch(path, method, body, false)
    }

    if (res.status >= 400) {
      throw new Error(`[Central] ${method} ${path} → status ${res.status}: ${text.slice(0, 200)}`)
    }

    try { return JSON.parse(text) } catch { return { raw: text.substring(0, 500) } }
  }

  // ---- Helpers ----
  const tsParaBR = (ts) => {
    if (!ts) return null
    const d = new Date(ts * 1000)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  }

  // ---- Rotas Central ----

  router.get('/central/debug', async (req, res) => {
    try {
      await centralLogin()
      res.json({ ok: true, tokenExp: new Date(centralTokenExp).toISOString() })
    } catch (err) {
      console.error('[Central] debug erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/central/sincronizar', async (req, res) => {
    try {
      const username = process.env.CENTRAL_USERNAME
      if (!username) throw new Error('CENTRAL_USERNAME não configurado')

      // Busca primeira página para saber o total
      const first = await centralFetch(`/users?page=1&per=100&reseller=${username}`)
      const totalPages = first?.meta?.pages ?? 1
      let linhas = first?.data ?? []

      // Busca páginas restantes em paralelo
      if (totalPages > 1) {
        const paginas = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
        const resultados = await Promise.all(
          paginas.map(p => centralFetch(`/users?page=${p}&per=100&reseller=${username}`))
        )
        resultados.forEach(r => { if (r?.data) linhas.push(...r.data) })
      }

      const mapa = linhas.map(l => ({
        id:       l.id,
        username: l.username,
        password: l.password,
        name:     l.full_name ?? l.reseller_notes ?? '',
        tipo:     'IPTV',
        exp_date: tsParaBR(l.exp_date),
        enabled:  l.enabled,
      }))

      console.log(`[Central] Sincronizados: ${mapa.length} clientes`)
      res.json({ total: mapa.length, linhas: mapa })
    } catch (err) {
      console.error('[Central] sincronizar erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/central/renovar', async (req, res) => {
    try {
      const { id, meses = 1 } = req.body
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })

      const packageId = Number(process.env.CENTRAL_PACKAGE_ID ?? 17)

      // Se houver mapeamento de meses → package_id, pode ser expandido aqui
      const data = await centralFetch(`/users/${id}/renew`, 'POST', { package_id: packageId })

      // exp_date retorna como unix timestamp
      const novaData = tsParaBR(data?.exp_date)
      console.log(`[Central] RENOVAR id=${id} meses=${meses} nova_data=${novaData}`)
      res.json({ success: true, exp_date: novaData, raw: data })
    } catch (err) {
      console.error('[Central] renovar erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return { router }
}
