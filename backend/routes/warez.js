import express from 'express'

/**
 * Módulo Warez — WWPanel (mcapi.knewcms.com)
 * Responsável por: autenticação, renovação de linhas e rotas /painel/*
 */
export default function createWarezRouter(enviarMensagemRenovacao) {
  const router = express.Router()

  // ---- Autenticação WWPanel ----

  let wpToken    = null
  let wpTokenExp = 0

  const wpLogin = async () => {
    const res = await fetch('https://mcapi.knewcms.com:2087/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.WPAINEL_USER,
        password: process.env.WPAINEL_PASS
      })
    })
    const data = await res.json()
    if (!data.token) throw new Error('Login WWPanel falhou: ' + JSON.stringify(data))
    wpToken    = data.token
    wpTokenExp = Date.now() + (1.5 * 60 * 60 * 1000)
    console.log('🔑 WWPanel token renovado!')
    return wpToken
  }

  const getWpToken = async () => {
    if (!wpToken || Date.now() > wpTokenExp) await wpLogin()
    return wpToken
  }

  const wpFetch = async (path, method = 'GET', body = null) => {
    const token = await getWpToken()
    const res   = await fetch(`https://mcapi.knewcms.com:2087${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Origin':        'https://wwpanel.link',
        'Referer':       'https://wwpanel.link/'
      },
      body: body ? JSON.stringify(body) : null
    })
    return res.json()
  }

  // ---- Rotas WWPanel ----

  router.get('/painel/buscar/:termo', async (req, res) => {
    try {
      const termo      = decodeURIComponent(req.params.termo)
      const byUsername = await wpFetch(`/lines?username=${encodeURIComponent(termo)}&limit=10`)
      if (byUsername?.items?.length > 0) return res.json(byUsername)
      const bySearch   = await wpFetch(`/lines?search=${encodeURIComponent(termo)}&limit=10`)
      res.json(bySearch)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/painel/buscar-username/:username', async (req, res) => {
    try {
      const username = decodeURIComponent(req.params.username)
      const token    = await getWpToken()
      const headers  = {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Origin':        'https://wwpanel.link',
        'Referer':       'https://wwpanel.link/'
      }
      const r1          = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=1`, { headers })
      const d1          = await r1.json()
      const totalPaginas = d1?.pagesQuantity ?? 1
      let linhas        = d1?.items ?? []
      const paginas     = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
      const resultados  = await Promise.all(paginas.map(async (page) => {
        const r = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=${page}`, { headers })
        const d = await r.json()
        return d?.items ?? []
      }))
      resultados.forEach(items => linhas.push(...items))
      const linha = linhas.find(l => l.username === username)
      if (!linha) return res.status(404).json({ error: `Usuário "${username}" não encontrado.` })
      res.json({ items: [linha] })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/painel/debug/:termo', async (req, res) => {
    try {
      const termo   = decodeURIComponent(req.params.termo)
      const token   = await getWpToken()
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Origin':        'https://wwpanel.link',
        'Referer':       'https://wwpanel.link/'
      }
      const [r1, r2] = await Promise.all([
        fetch(`https://mcapi.knewcms.com:2087/lines?search=${encodeURIComponent(termo)}&limit=5`,   { headers }),
        fetch(`https://mcapi.knewcms.com:2087/lines?username=${encodeURIComponent(termo)}&limit=5`, { headers }),
      ])
      res.json({
        search_param:   await r1.json(),
        username_param: await r2.json(),
      })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/painel/linha/:lineId', async (req, res) => {
    try {
      const data = await wpFetch(`/lines/${req.params.lineId}`)
      res.json(data)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/painel/sincronizar', async (req, res) => {
    try {
      const token   = await getWpToken()
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Origin':        'https://wwpanel.link',
        'Referer':       'https://wwpanel.link/'
      }
      const r1          = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=1`, { headers })
      const d1          = await r1.json()
      const totalPaginas = d1?.pagesQuantity ?? 1
      let linhas        = d1?.items ?? []
      const paginas     = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
      const resultados  = await Promise.all(paginas.map(async (page) => {
        const r = await fetch(`https://mcapi.knewcms.com:2087/lines?limit=100&page=${page}`, { headers })
        const d = await r.json()
        return d?.items ?? []
      }))
      resultados.forEach(items => linhas.push(...items))
      const mapa = linhas.map(l => ({
        id:       l.id,
        username: l.username,
        password: l.password,
        notes:    l.notes?.trim() ?? '',
        exp_date: l.exp_date,
      }))
      res.json({ total: mapa.length, linhas: mapa })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/painel/renovar/:lineId', async (req, res) => {
    try {
      const lineId  = req.params.lineId
      const credits = req.body?.credits ?? 1
      const { nome, telefone, usuario, senha } = req.body ?? {}
      const data    = await wpFetch(`/lines/extend/${lineId}`, 'PATCH', { credits })
      console.log(`[RENOVAR WAREZ] lineId=${lineId} credits=${credits} resposta=`, JSON.stringify(data))

      // Extrai nova data de vencimento
      let vencimento = null
      const expRaw = data?.exp_date ?? data?.expiry_date
      if (expRaw) {
        const d = new Date(expRaw)
        if (!isNaN(d.getTime())) {
          vencimento = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
        }
      }
      if (enviarMensagemRenovacao && telefone) {
        enviarMensagemRenovacao(telefone, { nome, usuario, senha, vencimento })
      }
      res.json(data)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/painel/planos', async (req, res) => {
    try {
      const data = await wpFetch('/products')
      res.json(data)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post('/painel/teste', async (req, res) => {
    try {
      const data = await wpFetch('/lines/trial', 'POST', req.body)
      res.json(data)
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/painel/buscar-linha/:username', async (req, res) => {
    try {
      const username = String(decodeURIComponent(req.params.username))
      console.log(`[Warez] buscar-linha: "${username}"`)

      // Busca nas linhas normais com paginação
      let page = 1
      while (page <= 10) {
        const data = await wpFetch(`/lines?page=${page}&quantityPerPage=100&trash=0&generalSearch=${encodeURIComponent(username)}`)
        const items = data?.items ?? (Array.isArray(data) ? data : [])
        const total = data?.total ?? items.length
        const pagesQty = data?.pagesQuantity ?? Math.ceil(total / 100) ?? 1

        const linha = items.find(l => String(l.username) === username)
        if (linha) {
          console.log(`[Warez] buscar-linha encontrado: id=${linha.id} (página ${page})`)
          return res.json({ ok: true, id: linha.id, username: linha.username, isTrial: false })
        }
        if (page >= pagesQty) break
        page++
      }

      // Busca nos testes (is_trial=1)
      const dataTest = await wpFetch(`/lines/test?page=1&quantityPerPage=100&is_trial=1&trash=0&generalSearch=${encodeURIComponent(username)}`)
      const itemsTest = dataTest?.items ?? (Array.isArray(dataTest) ? dataTest : [])
      const linhaTeste = itemsTest.find(l => String(l.username) === username)
      if (linhaTeste) {
        console.log(`[Warez] buscar-linha encontrado em testes: id=${linhaTeste.id}`)
        return res.json({ ok: true, id: linhaTeste.id, username: linhaTeste.username, isTrial: true })
      }

      console.log(`[Warez] buscar-linha NÃO encontrado para "${username}"`)
      res.status(404).json({ ok: false, error: `Usuário "${username}" não encontrado no painel Warez.` })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.get('/painel/saldo', async (req, res) => {
    try {
      const data = await wpFetch('/users/logged')
      res.json({ ok: true, creditos: data?.credits ?? null })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.post('/painel/criar-teste', async (req, res) => {
    try {
      const { horas = 4 } = req.body
      const data = await wpFetch('/lines/test', 'POST', {
        notes: 'TESTE SISTEMA', package_p2p: '5da17892133a1d61888029aa',
        package_iptv: '95', testDuration: Number(horas), krator_package: '1',
      })
      res.json({ ok: true, usuario: data.username, senha: data.password, expira: data.exp_date, id: data.id })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.get('/painel/saldo', async (req, res) => {
    try {
      const data = await wpFetch('/users/logged')
      res.json({ ok: true, creditos: data?.credits ?? null })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.post('/painel/criar-teste', async (req, res) => {
    try {
      const { horas = 4 } = req.body
      const data = await wpFetch('/lines/test', 'POST', {
        notes: 'TESTE SISTEMA', package_p2p: '5da17892133a1d61888029aa',
        package_iptv: '95', testDuration: Number(horas), krator_package: '1',
      })
      res.json({ ok: true, usuario: data.username, senha: data.password, expira: data.exp_date, id: data.id })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  return { router }
}