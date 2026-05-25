import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = 'return { router, inicializar, enviarMensagemRenovacao, getSock, isReady'
if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado'); process.exit(1)
}

const ROTAS = `
  // ── Follow-up: contatos WA não cadastrados ─────────────────────────────────
  router.get('/followup/contatos', async (req, res) => {
    try {
      const data     = await evoFetch(\`/contacts/findContacts/\${INSTANCE}\`)
      const contatos = Array.isArray(data) ? data : (data?.contacts ?? [])
      const snap     = await db.collection('clientes').get()
      const cadastrados = new Set(snap.docs.map(d => normalizarTelefone(d.data().telefone || '')))
      const resultado = contatos
        .filter(c => {
          const tel = normalizarTelefone(c.id || c.remoteJid || '')
          return tel && tel.length >= 10 && !cadastrados.has(tel) && !tel.includes('@g.us')
        })
        .map(c => ({ nome: c.pushName || c.name || 'Sem nome', telefone: normalizarTelefone(c.id || c.remoteJid || '') }))
        .sort((a, b) => a.nome.localeCompare(b.nome))
      res.json({ ok: true, total: resultado.length, contatos: resultado })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  router.post('/followup/enviar', async (req, res) => {
    try {
      const { contatos, mensagem } = req.body
      if (!contatos?.length || !mensagem?.trim()) return res.status(400).json({ error: 'campos obrigatorios' })
      let enfileirados = 0
      for (const c of contatos) {
        const phone = normalizarTelefone(c.telefone)
        if (!phone) continue
        await db.collection('filaEnvios').add({
          clienteNome: c.nome || 'Contato', telefone: phone,
          mensagem: mensagem.replace(/\\{NOME\\}/gi, c.nome || ''),
          midiaUrl: null, midiaTipo: null, gatilho: 'followup',
          status: 'pendente', criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
        enfileirados++
      }
      res.json({ ok: true, enfileirados })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  `

const resultado = s.replace(BUSCA, ROTAS + BUSCA)
writeFileSync('backend/routes/whatsapp.js', resultado, 'utf8')
console.log('✅ Rotas follow-up adicionadas!')
