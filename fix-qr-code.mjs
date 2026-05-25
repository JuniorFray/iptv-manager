import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `  router.get('/status', async (req, res) => {
    try {
      const data = await evoFetch(\`/instance/fetchInstances\`)
      const inst = Array.isArray(data) ? data.find(i => i.name === INSTANCE) : data
      const ready = inst?.connectionStatus === 'open'
      res.json({ ready, numero: inst?.ownerJid || 'Não detectado', qr: null })
    } catch {
      res.json({ ready: false, numero: 'Erro', qr: null })
    }
  })`,
  `  router.get('/status', async (req, res) => {
    try {
      const data = await evoFetch(\`/instance/fetchInstances\`)
      const inst = Array.isArray(data) ? data.find(i => i.name === INSTANCE) : data
      const ready = inst?.connectionStatus === 'open'

      // Busca QR quando desconectado
      let qr = null
      if (!ready) {
        try {
          const conn = await evoFetch(\`/instance/connect/\${INSTANCE}\`)
          // Evolution API retorna base64 direto ou dentro de .base64
          const raw = conn?.base64 ?? conn?.qrcode?.base64 ?? conn?.code ?? null
          if (raw) qr = raw.startsWith('data:') ? raw : \`data:image/png;base64,\${raw}\`
        } catch { /* ignora erro de QR */ }
      }

      res.json({ ready, numero: inst?.ownerJid || 'Não detectado', qr })
    } catch {
      res.json({ ready: false, numero: 'Erro', qr: null })
    }
  })`
)

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ /status agora retorna QR code real da Evolution API!')
