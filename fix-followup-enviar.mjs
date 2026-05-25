import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = `  router.post('/followup/enviar', async (req, res) => {
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
  })`

const NOVO = `  router.post('/followup/enviar', async (req, res) => {
    try {
      const { contatos, mensagens } = req.body
      if (!contatos?.length || !mensagens?.length) return res.status(400).json({ error: 'campos obrigatorios' })
      const msgs = mensagens.filter(m => m?.trim())
      if (!msgs.length) return res.status(400).json({ error: 'ao menos uma mensagem' })
      let enfileirados = 0
      const agora = new Date().toISOString()
      for (const c of contatos) {
        const phone = normalizarTelefone(c.telefone)
        if (!phone) continue
        const msg = msgs[Math.floor(Math.random() * msgs.length)]
        await db.collection('filaEnvios').add({
          clienteNome: c.nome || 'Contato', telefone: phone,
          mensagem: msg.replace(/\\{NOME\\}/gi, c.nome || ''),
          midiaUrl: null, midiaTipo: null, gatilho: 'followup',
          status: 'pendente', criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })
        await db.collection('followupEnviados').doc(phone).set({
          telefone: phone, nome: c.nome || 'Contato', enviadoEm: agora
        })
        enfileirados++
      }
      res.json({ ok: true, enfileirados })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })`

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado'); process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('✅ /followup/enviar corrigido para mensagens plural + aleatório + histórico!')
