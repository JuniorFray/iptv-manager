import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `      if (!pronto) return
      const agora`,
  `      if (!pronto) return

      // Reset de itens presos em "enviando" há mais de 5 minutos
      const cincoMinAtras = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000))
      const presosSnap = await db.collection('filaEnvios')
        .where('status', '==', 'enviando')
        .where('proximaTentativa', '<', cincoMinAtras)
        .limit(20).get()
      if (!presosSnap.empty) {
        const batch = db.batch()
        presosSnap.docs.forEach(d => batch.update(d.ref, {
          status: 'pendente',
          proximaTentativa: admin.firestore.Timestamp.now(),
        }))
        await batch.commit()
        console.log(\`[FILA] ♻️ \${presosSnap.size} itens presos em "enviando" resetados para "pendente"\`)
      }

      const agora`
)

if (!s.includes('cincoMinAtras')) {
  console.error('❌ Padrão não encontrado')
  process.exit(1)
}

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ Reset automático aplicado!')
