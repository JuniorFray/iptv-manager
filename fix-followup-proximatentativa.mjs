import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = `        await db.collection('filaEnvios').add({
          clienteNome: c.nome || 'Contato', telefone: phone,
          mensagem: msg.replace(/\\{NOME\\}/gi, c.nome || ''),
          midiaUrl: null, midiaTipo: null, gatilho: 'followup',
          status: 'pendente', criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })`

const NOVO = `        await db.collection('filaEnvios').add({
          clienteNome: c.nome || 'Contato', telefone: phone,
          mensagem: msg.replace(/\\{NOME\\}/gi, c.nome || ''),
          midiaUrl: null, midiaTipo: null, gatilho: 'followup',
          status: 'pendente',
          tentativas: 0,
          proximaTentativa: admin.firestore.Timestamp.now(),
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        })`

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado'); process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('✅ proximaTentativa e tentativas adicionados ao followup!')
