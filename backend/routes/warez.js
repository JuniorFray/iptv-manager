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

  const wpFetch = async (path, method = 'GET', body = null, retry = true) => {
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

    if (res.status === 401 && retry) {
      console.log('[Warez] Token expirado (401), renovando e tentando novamente...')
      wpToken = null
      wpTokenExp = 0
      return wpFetch(path, method, body, false)
    }

    const text = await res.text()
    console.log('[Warez] ' + method + ' ' + path.substring(0, 60) + ' -> ' + res.status)
    try { return JSON.parse(text) } catch { return { raw: text.substring(0, 200) } }
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
      res.json({ ...data, vencimento })
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
      const { nome, telefone, usuario, senha, skipWA } = req.body ?? {}
      const data    = await wpFetch(`/lines/extend/${lineId}`, 'PATCH', { credits })
      console.log(`[RENOVAR WAREZ] lineId=${lineId} credits=${credits} resposta=`, JSON.stringify(data))

      // Extrai nova data de vencimento
      let vencimento = null
      const expRaw = data?.exp_date ?? data?.expiry_date
      if (expRaw) {
        const d = new Date(expRaw)
        if (!isNaN(d.getTime())) {
          vencimento = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        }
      }
      // Envia msg de renovação via fila
      if (telefone && enviarMensagemRenovacao && !skipWA) {
        try {
          await enviarMensagemRenovacao(telefone, {
            nome: nome || '',
            usuario: usuario || '',
            senha: senha || '',
            vencimento: vencimento ?? 'Atualizado',
          })
        } catch(e) { console.error('[Warez] Erro msg renovacao:', e.message) }
      }

      res.json({ ...data, vencimento })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.get('/painel/planos', async (req, res) => {
    try {
      const data = await wpFetch('/products')
      // Envia msg de renovação via fila
      if (telefone && enviarMensagemRenovacao) {
        try {
          await enviarMensagemRenovacao(telefone, {
            nome: nome || '',
            usuario: usuario || '',
            senha: senha || '',
            vencimento: vencimento ?? 'Atualizado',
          })
        } catch(e) { console.error('[Warez] Erro msg renovacao:', e.message) }
      }

      res.json({ ...data, vencimento })
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
      // Fallback 1: buscar com username direto
      console.log('[Warez] buscar-linha fallback username= para ' + username)
      const byUser = await wpFetch('/lines?page=1&quantityPerPage=100&username=' + encodeURIComponent(username))
      const byUserItems = byUser?.items ?? (Array.isArray(byUser) ? byUser : [])
      const linhaByUser = byUserItems.find(l => String(l.username) === username)
      if (linhaByUser) {
        console.log('[Warez] buscar-linha encontrado via username=: id=' + linhaByUser.id)
        return res.json({ ok: true, id: linhaByUser.id, username: linhaByUser.username, isTrial: false })
      }

      // Fallback 2: buscar com search=
      console.log('[Warez] buscar-linha fallback search= para ' + username)
      const bySearch2 = await wpFetch('/lines?page=1&quantityPerPage=100&search=' + encodeURIComponent(username))
      const bySearch2Items = bySearch2?.items ?? (Array.isArray(bySearch2) ? bySearch2 : [])
      const linhaBySearch2 = bySearch2Items.find(l => String(l.username) === username)
      if (linhaBySearch2) {
        console.log('[Warez] buscar-linha encontrado via search=: id=' + linhaBySearch2.id)
        return res.json({ ok: true, id: linhaBySearch2.id, username: linhaBySearch2.username, isTrial: false })
      }

      console.log('[Warez] buscar-linha NAO encontrado para ' + username)
      res.status(404).json({ ok: false, error: 'Usuario ' + username + ' nao encontrado no painel Warez.' })
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