// backend/routes/pagamento.js
import express from 'express'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

const PLANOS = [
  { id: '1mes',   label: '1 Mes',   valor: 35.00,  meses: 1, creditos: 1 },
  { id: '3meses', label: '3 Meses', valor: 95.00,  meses: 3, creditos: 3 },
  { id: '6meses', label: '6 Meses', valor: 170.00, meses: 6, creditos: 6 },
]

export default function createPagamentoRouter(db, admin, enviarMensagemRenovacao) {
  const router = express.Router()

  const getMpClient = () => {
    const token = process.env.MP_ACCESS_TOKEN
    if (!token) throw new Error('MP_ACCESS_TOKEN nao configurado')
    return new MercadoPagoConfig({ accessToken: token })
  }

  router.post('/pagamento/criar', async (req, res) => {
    try {
      const { clienteId, clienteNome, telefone, servidor, usuario, senha, valor, valor3meses, valor6meses } = req.body
      if (!clienteId || !clienteNome || !servidor || !usuario) {
        return res.status(400).json({ error: 'Campos obrigatorios faltando' })
      }

      const client     = getMpClient()
      const preference = new Preference(client)
      const links      = []

      const parseValor = (v) => v ? parseFloat(String(v).replace(',', '.')) : null
      const v1 = parseValor(valor)
      const v3 = parseValor(valor3meses)
      const v6 = parseValor(valor6meses)
      const planosCliente = [
        { id: '1mes',   label: '1 Mes',   valor: v1 && v1 > 0 ? v1 : PLANOS[0].valor, meses: 1, creditos: 1 },
        { id: '3meses', label: '3 Meses', valor: v3 && v3 > 0 ? v3 : PLANOS[1].valor, meses: 3, creditos: 3 },
        { id: '6meses', label: '6 Meses', valor: v6 && v6 > 0 ? v6 : PLANOS[2].valor, meses: 6, creditos: 6 },
      ]

      for (const plano of planosCliente) {
        const externalRef = `${clienteId}|${servidor}|${usuario}|${telefone ?? ''}|${senha ?? ''}|${plano.id}`

        const result = await preference.create({
          body: {
            items: [{
              id:          plano.id,
              title:       `Sistema ${plano.label}`,
              quantity:    1,
              unit_price:  plano.valor,
              currency_id: 'BRL',
            }],
            payer:               { name: clienteNome },
            external_reference:  externalRef,
            back_urls: {
              success: `${process.env.FRONTEND_URL ?? 'https://sistema-tv.up.railway.app'}/dashboard`,
              failure: `${process.env.FRONTEND_URL ?? 'https://sistema-tv.up.railway.app'}/dashboard`,
            },
            auto_return:          'approved',
            statement_descriptor: 'IPTV SERVICE',
            payment_methods: {
              excluded_payment_types: [
                { id: 'credit_card' },
                { id: 'debit_card' },
                { id: 'prepaid_card' },
                { id: 'ticket' },
                { id: 'atm' },
              ],
              installments: 1,
            },
            expires:              true,
            expiration_date_to:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }
        })

        links.push({ plano: plano.label, valor: plano.valor, link: result.init_point, preferenceId: result.id })

        await db.collection('pagamentos').add({
          clienteId, clienteNome, telefone: telefone ?? '', servidor,
          usuario, senha: senha ?? '',
          mpPreferenceId: result.id,
          mpPaymentId:    null,
          valor:          null,
          plano:          plano.label,
          status:         'pendente',
          link:           result.init_point,
          renovadoEm:     null,
          criadoEm:       admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      res.json({ ok: true, links })
    } catch (err) {
      console.error('[PAGAMENTO] criar erro:', err.message)
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  router.post('/pagamento/webhook', async (req, res) => {
    try {
      console.log('[WEBHOOK] Recebido:', req.body ? JSON.stringify(req.body).substring(0, 300) : '(body vazio)')
      const { type, data } = req.body
      if (type !== 'payment' || !data?.id) {
        console.log('[WEBHOOK] Ignorado: type=' + type + ' data.id=' + data?.id)
        return res.sendStatus(200)
      }

      const client  = getMpClient()
      const payment = new Payment(client)
      const mp      = await payment.get({ id: data.id })

      if (mp.status !== 'approved') return res.sendStatus(200)

      // Deduplicacao: ignora se mpPaymentId ja foi processado
      const mpPaymentId = String(mp.id)
      const dupSnap = await db.collection('pagamentos')
        .where('mpPaymentId', '==', mpPaymentId)
        .where('status', '==', 'aprovado')
        .limit(1)
        .get()
      if (!dupSnap.empty) {
        console.log('[WEBHOOK] Duplicata ignorada - mpPaymentId=' + mpPaymentId + ' ja processado')
        return res.sendStatus(200)
      }

      const ref   = mp.external_reference ?? ''
      const parts = ref.split('|')
      if (parts.length < 3) return res.sendStatus(200)

      const [clienteId, servidor, usuario, telefone, senha, planoId] = parts
      const valorPago = mp.transaction_amount
      const plano     = PLANOS.find(p => p.id === planoId) ?? PLANOS.find(p => Math.abs(p.valor - valorPago) < 1) ?? PLANOS[0]

      console.log(`[WEBHOOK] Aprovado — ${clienteId} ${servidor} R$${valorPago} plano=${plano.label}`)

      const clienteSnap = await db.collection('clientes').doc(clienteId).get()
      const cliente     = clienteSnap.exists ? clienteSnap.data() : null

      let vencimento = null
      const BACKEND  = 'https://iptv-manager-production.up.railway.app'
      try {
        if (servidor.toUpperCase() === 'WAREZ') {
          const buscar = await fetch(`${BACKEND}/painel/buscar-linha/${encodeURIComponent(usuario)}`).then(r => r.json())
          console.log('[WEBHOOK] Warez buscar-linha resultado:', JSON.stringify(buscar))
          if (buscar.ok) {
            const ren = await fetch(`${BACKEND}/painel/renovar/${buscar.id}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credits: plano.creditos, nome: cliente?.nome, telefone, usuario, senha })
            }).then(r => r.json())
            const expRaw = ren.exp_date ?? ren.expiry_date
            if (expRaw) {
              const d = new Date(expRaw)
              if (!isNaN(d.getTime())) vencimento = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            }
            console.log('[WEBHOOK] Warez vencimento:', vencimento)
          }
        } else if (servidor.toUpperCase() === 'ELITE') {
          console.log('[WEBHOOK] Elite buscar-linha:', usuario)
          const buscar = await fetch(`${BACKEND}/elite/buscar-linha/${encodeURIComponent(usuario)}`).then(r => r.json())
          console.log('[WEBHOOK] Elite buscar-linha resultado:', JSON.stringify(buscar))
          if (buscar.ok) {
            console.log(`[WEBHOOK] Elite renovando id=${buscar.id} tipo=${buscar.tipo} meses=${plano.meses}`)
            const ren = await fetch(`${BACKEND}/elite/renovar`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: buscar.id, tipo: buscar.tipo, meses: plano.meses, nome: cliente?.nome, telefone, usuario, senha })
            }).then(r => r.json())
            console.log('[WEBHOOK] Elite renovar resultado:', JSON.stringify(ren))
            vencimento = ren.vencimento ?? null
            console.log('[WEBHOOK] Elite vencimento:', vencimento)
          } else {
            console.error('[WEBHOOK] Elite buscar-linha falhou:', buscar.error)
          }
        } else if (servidor.toUpperCase() === 'CENTRAL') {
          const buscar = await fetch(`${BACKEND}/central/buscar-linha/${encodeURIComponent(usuario)}`).then(r => r.json())
          if (buscar.ok) {
            const ren = await fetch(`${BACKEND}/central/renovar`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: buscar.id, meses: plano.meses, nome: cliente?.nome, telefone, usuario, senha })
            }).then(r => r.json())
            vencimento = ren.exp_date ?? ren.vencimento ?? null
            console.log('[WEBHOOK] Central vencimento:', vencimento)
          } else { console.error('[WEBHOOK] Central buscar-linha falhou:', buscar.error) }
        }
      } catch (e) { console.error('[WEBHOOK] renovar erro:', e.message) }

      // Atualiza vencimento do cliente no Firestore
      if (vencimento && clienteId && clienteSnap.exists) {
        try {
          await db.collection('clientes').doc(clienteId).update({ vencimento, status: 'ativo' })
          console.log(`[WEBHOOK] Cliente ${clienteId} atualizado no Firestore: vencimento=${vencimento}`)
        } catch (e) { console.error('[WEBHOOK] Erro ao atualizar cliente:', e.message) }
      }

      // Atualiza pagamento no Firestore
      const pagSnap = await db.collection('pagamentos')
        .where('mpPreferenceId', '==', mp.metadata?.preference_id ?? '___')
        .limit(1).get()

      if (!pagSnap.empty) {
        await pagSnap.docs[0].ref.update({
          mpPaymentId, valor: valorPago,
          status: 'aprovado',
          renovadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
      } else {
        await db.collection('pagamentos').add({
          clienteId, clienteNome: cliente?.nome ?? usuario,
          telefone, servidor, usuario, senha,
          mpPaymentId, mpPreferenceId: '',
          valor: valorPago, plano: plano.label, status: 'aprovado',
          link: null,
          renovadoEm: admin.firestore.FieldValue.serverTimestamp(),
          criadoEm:   admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      if (telefone && enviarMensagemRenovacao) {
        await enviarMensagemRenovacao(telefone, {
          nome: cliente?.nome ?? usuario, usuario,
          senha: senha || cliente?.senha || '',
          vencimento: vencimento ?? 'Atualizado',
        })
      }

      res.sendStatus(200)
    } catch (err) {
      console.error('[WEBHOOK] erro:', err.message)
      res.sendStatus(500)
    }
  })

  router.get('/pagamento/historico', async (req, res) => {
    try {
      const snap = await db.collection('pagamentos').orderBy('criadoEm', 'desc').limit(200).get()
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
