import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8')

const BUSCA = `          status: 'pendente',
          tentativas: 0,
          proximaTentativa: admin.firestore.Timestamp.now(),
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),`

const NOVO = `          status: 'pendente',
          tentativas: 0,
          maxTentativas: 3,
          proximaTentativa: admin.firestore.Timestamp.now(),
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),`

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado'); process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('✅ maxTentativas: 3 adicionado!')
