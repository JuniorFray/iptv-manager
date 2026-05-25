import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = `      const data     = await evoFetch(\`/contacts/findContacts/\${INSTANCE}\`)
      const contatos = Array.isArray(data) ? data : (data?.contacts ?? [])
      const snap     = await db.collection('clientes').get()
      const cadastrados = new Set(snap.docs.map(d => normalizarTelefone(d.data().telefone || '')))
      const resultado = contatos
        .filter(c => {
          const tel = normalizarTelefone(c.id || c.remoteJid || '')
          return tel && tel.length >= 10 && !cadastrados.has(tel) && !tel.includes('@g.us')
        })
        .map(c => ({ nome: c.pushName || c.name || 'Sem nome', telefone: normalizarTelefone(c.id || c.remoteJid || '') }))
        .sort((a, b) => a.nome.localeCompare(b.nome))`

const NOVO = `      // POST /chat/findContacts retorna array com campo remoteJid
      const data     = await evoFetch(\`/chat/findContacts/\${INSTANCE}\`, 'POST', {})
      const contatos = Array.isArray(data) ? data : []
      const snap     = await db.collection('clientes').get()
      const cadastrados = new Set(snap.docs.map(d => normalizarTelefone(d.data().telefone || '')))
      const resultado = contatos
        .filter(c => {
          const jid = c.remoteJid || ''
          // Só números reais (s.whatsapp.net), sem grupos ou lids
          if (!jid.includes('@s.whatsapp.net')) return false
          const tel = normalizarTelefone(jid.replace('@s.whatsapp.net', ''))
          return tel && tel.length >= 10 && !cadastrados.has(tel)
        })
        .map(c => ({
          nome:     c.pushName || 'Sem nome',
          telefone: normalizarTelefone(c.remoteJid.replace('@s.whatsapp.net', ''))
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome))`

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado'); process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('✅ Backend followup corrigido para formato correto da Evolution API!')
