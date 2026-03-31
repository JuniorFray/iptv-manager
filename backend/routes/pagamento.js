// backend/routes/pagamento.js
import express from 'express'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

const PLANOS = [
  { id: '1mes',   label: '1 Mês',    valor: 35.00, meses: 1, creditos: 1 },
  { id: '2meses', label: '2 Meses',  valor: 70.00, meses: 2, creditos: 2 },
  { id: '6meses', label: '6 Meses',  valor: 170.00, meses: 6, creditos: 6 },
]

export default function createPagamentoRouter(db, admin, enviarMensagemRenovacao) {
  const router = express.Router()

  const getMpClient = () => {
    const token = process.env.MP_ACCESS_TOKEN
    if (!token) throw new Error('MP_ACCESS_TOKEN não configurado')
    return new MercadoPagoConfig({ accessToken: token })
  }

  // ── Criar preferência de pagamento ──
  router.post('/pagamento/criar', async (req, res) => {
    try {
      const { clienteId, clienteNome, telefone, servidor, usuario, senha } = req.body
      if (!clienteId || !clienteNome || !servidor || !usuario) {
        return res.status(400).json({ error: 'Campos obrigatórios: clienteId, clienteNome, servidor, usuario' })
      }

      const client     = getMpClient()
      const preference = new Preference(client)
      const externalRef = `${clienteId}|${servidor}|${usuario}|${telefone ?? ''}|${senha ?? ''}`

      const result = await preference.create({
        body: {
          items: PLANOS.map(p => ({
            id:          p.id,
            title:       `IPTV ${p.label}`,
            quantity:    1,
            unit_price:  p.valor,
            currency_id: 'BRL',
          })),
          payer:               { name: clienteNome },
          external_reference:  externalRef,
          back_urls: {
            success: `${process.env.FRONTEND_URL ?? 'https://sistema-tv.up.railway.app'}/dashboard`,
            failure: `${process.env.FRONTEND_URL ?? 'https://sistema-tv.up.railway.app'}/dashboard`,
          },
          auto_return:          'approved',
          statement_descriptor: 'IPTV SERVICE',
          expires:              true,
          expiration_date_to:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }
      })

      await db.collection('pagamentos').add({
        clienteId, clienteNome, telefone: telefone ?? '', servidor,
        usuario, senha: senha ?? '',
        mpPreferenceId: result.id,
        mpPaymentId:    null,
        valor:          null,
        plano:          null,
        status:         'pendente',
        link:           result.init_point,
        renovadoEm:     null,
        criadoEm:       admin.firestore.FieldValue.serverTimestamp(),
      })

      res.json({ ok: true, link: result.init_point, preferenceId: result.id })
    } catch (err) {
      console.error('[PAGAMENTO] criar erro:', err.message)
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── Webhook Mercado Pago ──
  router.post('/pagamento/webhook', async (req, res) => {
    try {
      const { type, data } = req.body
      if (type !== 'payment' || !data?.id) return res.sendStatus(200)

      const client  = getMpClient()
      const payment = new Payment(client)
      const mp      = await payment.get({ id: data.id })

      if (mp.status !== 'approved') return res.sendStatus(200)

      const ref   = mp.external_reference ?? ''
      const parts = ref.split('|')
      if (parts.length < 3) {
        console.error('[WEBHOOK] external_reference inválido:', ref)
        return res.sendStatus(200)
      }

      const [clienteId, servidor, usuario, telefone, senha] = parts
      const valorPago = mp.transaction_amount
      const plano     = PLANOS.find(p => Math.abs(p.valor - valorPago) < 1) ?? PLANOS[0]

      console.log(`[WEBHOOK] Aprovado — ${clienteId} ${servidor} R$${valorPago} plano=${plano.label}`)

      const clienteSnap = await db.collection('clientes').doc(clienteId).get()
      const cliente     = clienteSnap.exists ? clienteSnap.data() : null

      // Renova no servidor
      let vencimento = null
      const BACKEND  = 'https://iptv-manager-production.up.railway.app'
      try {
        if (servidor.toUpperCase() === 'WAREZ') {
          const buscar = await fetch(`${BACKEND}/painel/buscar-linha/${encodeURIComponent(usuario)}`).then(r => r.json())
          if (buscar.ok) {
            const ren = await fetch(`${BACKEND}/painel/renovar/${buscar.id}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credits: plano.creditos, nome: cliente?.nome, telefone, usuario, senha })
            }).then(r => r.json())
            vencimento = ren.vencimento ?? null
          }
        } else if (servidor.toUpperCase() === 'ELITE') {
          const ren = await fetch(`${BACKEND}/elite/renovar`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: usuario, meses: plano.meses, nome: cliente?.nome, telefone, usuario, senha })
          }).then(r => r.json())
          vencimento = ren.vencimento ?? null
        } else if (servidor.toUpperCase() === 'CENTRAL') {
          const ren = await fetch(`${BACKEND}/central/renovar`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: usuario, meses: plano.meses, nome: cliente?.nome, telefone, usuario, senha })
          }).then(r => r.json())
          vencimento = ren.vencimento ?? null
        }
      } catch (e) { console.error('[WEBHOOK] renovar erro:', e.message) }

      // Atualiza Firestore
      const pagSnap = await db.collection('pagamentos')
        .where('mpPreferenceId', '==', mp.metadata?.preference_id ?? '___')
        .limit(1).get()

      if (!pagSnap.empty) {
        await pagSnap.docs[0].ref.update({
          mpPaymentId: String(mp.id), valor: valorPago,
          plano: plano.label, status: 'aprovado',
          renovadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
      } else {
        await db.collection('pagamentos').add({
          clienteId, clienteNome: cliente?.nome ?? usuario,
          telefone, servidor, usuario, senha,
          mpPaymentId: String(mp.id), mpPreferenceId: '',
          valor: valorPago, plano: plano.label, status: 'aprovado',
          link: null,
          renovadoEm: admin.firestore.FieldValue.serverTimestamp(),
          criadoEm:   admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      // Notifica WA
      if (telefone && enviarMensagemRenovacao) {
        await enviarMensagemRenovacao(telefone, {
          nome:       cliente?.nome ?? usuario,
          usuario,
          senha:      senha || cliente?.senha || '',
          vencimento: vencimento ?? 'Atualizado',
        })
      }

      res.sendStatus(200)
    } catch (err) {
      console.error('[WEBHOOK] erro:', err.message)
      res.sendStatus(500)
    }
  })

  // ── Histórico ──
  router.get('/pagamento/historico', async (req, res) => {
    try {
      const snap = await db.collection('pagamentos')
        .orderBy('criadoEm', 'desc').limit(200).get()
      const docs = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        criadoEm:   d.data().criadoEm?.toDate?.()?.toISOString()  ?? null,
        renovadoEm: d.data().renovadoEm?.toDate?.()?.toISOString() ?? null,
      }))
      res.json({ ok: true, pagamentos: docs })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  return { router }
}
