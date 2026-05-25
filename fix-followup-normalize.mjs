import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

// Substitui o bloco do filtro de cadastrados no followup/contatos
// Para gerar ambas as variantes (com e sem o 9 extra)
const BUSCA = `      // Clientes já cadastrados
      const snap = await db.collection('clientes').get()
      const cadastrados = new Set(snap.docs.map(d => normalizarTelefone(d.data().telefone || '')))`

const NOVO = `      // Clientes já cadastrados — gera variantes com e sem o 9 extra (reforma BR)
      const snap = await db.collection('clientes').get()
      const cadastrados = new Set()
      snap.docs.forEach(d => {
        const tel = normalizarTelefone(d.data().telefone || '')
        cadastrados.add(tel)
        // variante sem o 9 extra (13 → 12 digitos): 55 + DDD(2) + 9 + XXXXXXXX → 55 + DDD + XXXXXXXX
        if (tel.length === 13 && tel.startsWith('55')) {
          const semNove = tel.substring(0, 4) + tel.substring(5) // remove o 5º dígito (o 9)
          cadastrados.add(semNove)
        }
        // variante com o 9 extra (12 → 13 digitos)
        if (tel.length === 12 && tel.startsWith('55')) {
          const comNove = tel.substring(0, 4) + '9' + tel.substring(4)
          cadastrados.add(comNove)
        }
      })`

if (!s.includes(BUSCA)) {
  console.error('❌ Padrão não encontrado'); process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s.replace(BUSCA, NOVO), 'utf8')
console.log('✅ Filtro corrigido — verifica variantes com e sem 9 extra!')
