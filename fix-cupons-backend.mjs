import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

// ── 1. Rotas de cupom antes de "return { router }" ───────────────────────────
s = s.replace(
  `  // ---- Fila de Renovacoes (retry automatico) ----`,
  `  // ---- Cupons ----

  router.post('/cupom', async (req, res) => {
    try {
      const { codigo, tipo, valor, maxUsos, validade } = req.body
      if (!codigo || !tipo || !valor) return res.status(400).json({ error: 'codigo, tipo e valor obrigatorios' })
      const ref = db.collection('cupons').doc(codigo.toUpperCase())
      const snap = await ref.get()
      if (snap.exists) return res.status(400).json({ error: 'Cupom ja existe' })
      await ref.set({
        codigo: codigo.toUpperCase(), tipo, valor: Number(valor),
        maxUsos: maxUsos ? Number(maxUsos) : null, usos: 0,
        validade: validade || null, ativo: true,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get('/cupons', async (req, res) => {
    try {
      const snap = await db.collection('cupons').orderBy('criadoEm', 'desc').get()
      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/cupom/validar', async (req, res) => {
    try {
      const { codigo, valorOriginal } = req.body
      if (!codigo) return res.status(400).json({ error: 'codigo obrigatorio' })
      const snap = await db.collection('cupons').doc(codigo.toUpperCase()).get()
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'Cupom nao encontrado' })
      const c = snap.data()
      if (!c.ativo) return res.status(400).json({ ok: false, error: 'Cupom inativo' })
      if (c.maxUsos && c.usos >= c.maxUsos) return res.status(400).json({ ok: false, error: 'Cupom esgotado' })
      if (c.validade) {
        const [d, m, a] = c.validade.split('/').map(Number)
        if (new Date(a, m - 1, d) < new Date()) return res.status(400).json({ ok: false, error: 'Cupom expirado' })
      }
      const original = Number(valorOriginal) || 0
      const desconto = c.tipo === '%' ? (original * c.valor / 100) : c.valor
      const final    = Math.max(0, original - desconto)
      res.json({ ok: true, codigo: c.codigo, tipo: c.tipo, valor: c.valor, desconto, final })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/cupom/:codigo/toggle', async (req, res) => {
    try {
      const ref = db.collection('cupons').doc(req.params.codigo.toUpperCase())
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Cupom nao encontrado' })
      await ref.update({ ativo: !snap.data().ativo })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/cupom/:codigo', async (req, res) => {
    try {
      await db.collection('cupons').doc(req.params.codigo.toUpperCase()).delete()
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ---- Fila de Renovacoes (retry automatico) ----`
)

// ── 2. Aceitar cupomCodigo na criação de preferência ─────────────────────────
s = s.replace(
  `    const { clienteId, clienteNome, telefone, servidor, usuario, senha, valor, valor3meses, valor6meses } = req.body`,
  `    const { clienteId, clienteNome, telefone, servidor, usuario, senha, valor, valor3meses, valor6meses, cupomCodigo } = req.body`
)

s = s.replace(
  `    const planos = [`,
  `    // Aplica desconto do cupom se informado
    let cupomInfo = null
    if (cupomCodigo) {
      try {
        const cSnap = await db.collection('cupons').doc(cupomCodigo.toUpperCase()).get()
        if (cSnap.exists && cSnap.data().ativo) {
          cupomInfo = cSnap.data()
          await db.collection('cupons').doc(cupomCodigo.toUpperCase()).update({
            usos: admin.firestore.FieldValue.increment(1)
          })
        }
      } catch (e) { console.error('[PAGAMENTO] Erro ao aplicar cupom:', e.message) }
    }

    const aplicarDesconto = (v) => {
      if (!cupomInfo || !v) return Number(v) || 0
      const val = Number(v) || 0
      return cupomInfo.tipo === '%' ? Math.max(0, val - val * cupomInfo.valor / 100) : Math.max(0, val - cupomInfo.valor)
    }

    const planos = [`
)

// Aplica desconto nos valores dos planos
s = s.replace(
  `      { label: '1 Mês',   meses: 1, credits: 1, valor: Number(valor)        || 35,  id: 'plano_1mes'    },
      { label: '3 Meses',  meses: 3, credits: 3, valor: Number(valor3meses)   || 95,  id: 'plano_3meses'  },
      { label: '6 Meses',  meses: 6, credits: 6, valor: Number(valor6meses)   || 170, id: 'plano_6meses'  },`,
  `      { label: '1 Mês',   meses: 1, credits: 1, valor: aplicarDesconto(valor)        || 35,  id: 'plano_1mes'    },
      { label: '3 Meses',  meses: 3, credits: 3, valor: aplicarDesconto(valor3meses)   || 95,  id: 'plano_3meses'  },
      { label: '6 Meses',  meses: 6, credits: 6, valor: aplicarDesconto(valor6meses)   || 170, id: 'plano_6meses'  },`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ pagamento.js — rotas de cupom e desconto aplicados!')
