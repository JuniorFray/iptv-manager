import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = `      // POST /chat/findContacts retorna array com campo remoteJid
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

const NOVO = `      // Busca chats (conversas reais) e contatos (nomes)
      const [dataChats, dataContatos] = await Promise.all([
        evoFetch(\`/chat/findChats/\${INSTANCE}\`, 'POST', {}),
        evoFetch(\`/chat/findContacts/\${INSTANCE}\`, 'POST', {}),
      ])
      const chats    = Array.isArray(dataChats)    ? dataChats    : []
      const contatos = Array.isArray(dataContatos) ? dataContatos : []

      // Mapa de telefone → nome dos contatos
      const nomeMap = new Map()
      for (const c of contatos) {
        const jid = c.remoteJid || ''
        if (!jid.includes('@s.whatsapp.net')) continue
        const tel = normalizarTelefone(jid.replace('@s.whatsapp.net', ''))
        if (tel && c.pushName) nomeMap.set(tel, c.pushName)
      }

      // Clientes já cadastrados
      const snap = await db.collection('clientes').get()
      const cadastrados = new Set(snap.docs.map(d => normalizarTelefone(d.data().telefone || '')))

      // Filtra chats individuais não cadastrados
      const vistos = new Set()
      const resultado = chats
        .filter(c => {
          const jid = c.remoteJid || ''
          if (!jid.includes('@s.whatsapp.net')) return false
          const tel = normalizarTelefone(jid.replace('@s.whatsapp.net', ''))
          if (!tel || tel.length < 10 || cadastrados.has(tel) || vistos.has(tel)) return false
          vistos.add(tel)
          return true
        })
        .map(c => {
          const tel = normalizarTelefone(c.remoteJid.replace('@s.whatsapp.net', ''))
          return { nome: nomeMap.get(tel) || c.name || 'Sem nome', telefone: tel }
        })
        .sort((a, b) => a.nome.localeCompare(b.nome))`

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado'); process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('✅ Follow-up usa chats reais + nomes dos contatos!')
