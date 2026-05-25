// backend/routes/afiliado.js
import express from 'express'
import crypto from 'crypto'

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
const gerarToken = () => crypto.randomBytes(32).toString('hex')

export default function createAfiliadoRouter(db, admin) {
  const router = express.Router()
  const BACKEND = 'https://iptv-manager-production.up.railway.app'

  // ── Auth middleware ─────────────────────────────────────────────────────────
  const authAfiliado = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Token obrigatorio' })
    const snap = await db.collection('afiliadoTokens').doc(token).get()
    if (!snap.exists || snap.data().expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Token invalido ou expirado' })
    }
    req.afiliadoId = snap.data().afiliadoId
    next()
  }

  // ── LOGIN ───────────────────────────────────────────────────────────────────
  router.post('/afiliado/login', async (req, res) => {
    try {
      const { email, senha } = req.body
      if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatorios' })
      const snap = await db.collection('afiliados').where('email', '==', email.toLowerCase().trim()).limit(1).get()
      if (snap.empty) return res.status(401).json({ error: 'Credenciais invalidas' })
      const doc  = snap.docs[0]
      const af   = doc.data()
      if (!af.ativo) return res.status(403).json({ error: 'Conta inativa' })
      if (af.senha !== sha256(senha)) return res.status(401).json({ error: 'Credenciais invalidas' })
      const token = gerarToken()
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 dias
      await db.collection('afiliadoTokens').doc(token).set({ afiliadoId: doc.id, expiresAt })
      res.json({ ok: true, token, afiliado: { id: doc.id, nome: af.nome, codigo: af.codigo, email: af.email } })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── PERFIL ──────────────────────────────────────────────────────────────────
  router.get('/afiliado/perfil', authAfiliado, async (req, res) => {
    try {
      const doc = await db.collection('afiliados').doc(req.afiliadoId).get()
      if (!doc.exists) return res.status(404).json({ error: 'Afiliado nao encontrado' })
      const { nome, email, codigo, comissaoTipo, comissaoValor } = doc.data()
      res.json({ ok: true, afiliado: { id: doc.id, nome, email, codigo, comissaoTipo, comissaoValor } })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── GERAR TESTE ─────────────────────────────────────────────────────────────
  router.post('/afiliado/teste', authAfiliado, async (req, res) => {
    try {
      const { clienteNome, clienteTelefone, servidor } = req.body
      if (!clienteNome || !clienteTelefone) return res.status(400).json({ error: 'Nome e telefone obrigatorios' })
      const srv = (servidor || 'WAREZ').toUpperCase()

      // Cria teste no servidor
      let testeRes
      if (srv === 'WAREZ') {
        testeRes = await fetch(`${BACKEND}/painel/criar-teste`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: clienteNome, telefone: clienteTelefone })
        }).then(r => r.json())
      } else if (srv === 'ELITE') {
        testeRes = await fetch(`${BACKEND}/elite/criar-teste`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: clienteNome, telefone: clienteTelefone })
        }).then(r => r.json())
      } else {
        return res.status(400).json({ error: 'Servidor invalido. Use WAREZ ou ELITE' })
      }

      if (!testeRes?.ok) return res.status(500).json({ error: testeRes?.error || 'Erro ao criar teste' })

      const { usuario, senha, expira } = testeRes

      // Busca dados do afiliado
      const afiliadoDoc = await db.collection('afiliados').doc(req.afiliadoId).get()
      const afiliado    = afiliadoDoc.data()

      // Cria cliente temporario no Firestore para gerar links
      const clienteRef = await db.collection('clientes').add({
        nome:       clienteNome,
        telefone:   clienteTelefone,
        servidor:   srv,
        usuario,
        senha,
        status:     'teste',
        obs:        'Afiliado: ' + afiliado.nome,
        afiliadoId: req.afiliadoId,
        criadoEm:   admin.firestore.FieldValue.serverTimestamp(),
      })

      // Gera links de pagamento com afiliadoId
      const linksRes = await fetch(`${BACKEND}/pagamento/criar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:   clienteRef.id,
          clienteNome,
          telefone:    clienteTelefone,
          servidor:    srv,
          usuario,
          senha,
          afiliadoId:  req.afiliadoId,
        })
      }).then(r => r.json())

      // Salva o teste vinculado ao afiliado (com links gerados)
      await db.collection('afiliadoTestes').add({
        afiliadoId:       req.afiliadoId,
        afiliadoNome:     afiliado.nome,
        afiliadoCodigo:   afiliado.codigo,
        clienteNome,
        clienteTelefone,
        servidor:         srv,
        usuario,
        senha,
        expira:           expira || null,
        links:            linksRes.links || [],
        criadoEm:         admin.firestore.FieldValue.serverTimestamp(),
      })

      res.json({ ok: true, usuario, senha, expira, links: linksRes.links })
    } catch (e) {
      console.error('[AFILIADO] Erro criar teste:', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  // ── VENDAS DO AFILIADO ──────────────────────────────────────────────────────
  router.get('/afiliado/vendas', authAfiliado, async (req, res) => {
    try {
      const [vendasSnap, testesSnap, afiliadoDoc] = await Promise.all([
        db.collection('afiliadoVendas').where('afiliadoId', '==', req.afiliadoId).get(),
        db.collection('afiliadoTestes').where('afiliadoId', '==', req.afiliadoId).get(),
        db.collection('afiliados').doc(req.afiliadoId).get(),
      ])

      const vendas  = vendasSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const testes  = testesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const af      = afiliadoDoc.data()

      const totalComissao  = vendas.reduce((s, v) => s + (v.comissao || 0), 0)
      const totalPendente  = vendas.filter(v => v.status === 'pendente').reduce((s, v) => s + (v.comissao || 0), 0)
      const totalPago      = vendas.filter(v => v.status === 'pago').reduce((s, v) => s + (v.comissao || 0), 0)

      res.json({ ok: true, vendas, testes, totalComissao, totalPendente, totalPago,
        comissaoTipo: af.comissaoTipo, comissaoValor: af.comissaoValor })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── AFILIADO: EXCLUIR TESTE ─────────────────────────────────────────────
  router.delete('/afiliado/teste/:id', authAfiliado, async (req, res) => {
    try {
      const doc = await db.collection('afiliadoTestes').doc(req.params.id).get()
      if (!doc.exists || doc.data().afiliadoId !== req.afiliadoId)
        return res.status(403).json({ error: 'Sem permissão' })
      await db.collection('afiliadoTestes').doc(req.params.id).delete()
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── ADMIN: LISTAR AFILIADOS ─────────────────────────────────────────────────
  router.get('/afiliados', async (req, res) => {
    try {
      const snap = await db.collection('afiliados').orderBy('criadoEm', 'desc').get()
      const lista = await Promise.all(snap.docs.map(async d => {
        const vendasSnap = await db.collection('afiliadoVendas').where('afiliadoId', '==', d.id).get()
        const vendas = vendasSnap.docs.map(v => v.data())
        return {
          id: d.id, ...d.data(), senha: undefined,
          totalVendas:    vendas.length,
          totalComissao:  vendas.reduce((s, v) => s + (v.comissao || 0), 0),
          totalPendente:  vendas.filter(v => v.status === 'pendente').reduce((s, v) => s + (v.comissao || 0), 0),
        }
      }))
      res.json({ ok: true, afiliados: lista })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── ADMIN: CRIAR AFILIADO ───────────────────────────────────────────────────
  router.post('/afiliados', async (req, res) => {
    try {
      const { nome, email, senha, comissaoTipo, comissaoValor } = req.body
      if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha obrigatorios' })
      const existe = await db.collection('afiliados').where('email', '==', email.toLowerCase()).limit(1).get()
      if (!existe.empty) return res.status(400).json({ error: 'Email ja cadastrado' })
      const codigo = nome.toLowerCase().replace(/\s+/g, '').substring(0, 8) + Math.floor(Math.random() * 100)
      const ref = await db.collection('afiliados').add({
        nome, email: email.toLowerCase().trim(), senha: sha256(senha),
        codigo, comissaoTipo: comissaoTipo || 'percent', comissaoValor: Number(comissaoValor) || 10,
        ativo: true, criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      })
      res.json({ ok: true, id: ref.id, codigo })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── ADMIN: EDITAR AFILIADO ──────────────────────────────────────────────────
  router.put('/afiliados/:id', async (req, res) => {
    try {
      const { nome, email, senha, comissaoTipo, comissaoValor, ativo } = req.body
      const upd = {}
      if (nome !== undefined) upd.nome = nome
      if (email !== undefined) upd.email = email.toLowerCase().trim()
      if (senha) upd.senha = sha256(senha)
      if (comissaoTipo !== undefined) upd.comissaoTipo = comissaoTipo
      if (comissaoValor !== undefined) upd.comissaoValor = Number(comissaoValor)
      if (ativo !== undefined) upd.ativo = ativo
      await db.collection('afiliados').doc(req.params.id).update(upd)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── ADMIN: EXCLUIR AFILIADO ─────────────────────────────────────────────────
  router.delete('/afiliados/:id', async (req, res) => {
    try {
      await db.collection('afiliados').doc(req.params.id).delete()
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── ADMIN: MARCAR COMISSÃO COMO PAGA ───────────────────────────────────────
  router.post('/afiliados/:id/pagar', async (req, res) => {
    try {
      const snap = await db.collection('afiliadoVendas')
        .where('afiliadoId', '==', req.params.id)
        .where('status', '==', 'pendente').get()
      const batch = db.batch()
      snap.docs.forEach(d => batch.update(d.ref, { status: 'pago', pagoEm: new Date().toISOString() }))
      await batch.commit()
      res.json({ ok: true, pagas: snap.size })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return { router }
}
