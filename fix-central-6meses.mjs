import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/central.js', 'utf8').replace(/\r\n/g, '\n')

// Fix: renovar — usa package_id correto por número de meses
s = s.replace(
  `      let payload, data
      if (system === 3) {
        // Usuário híbrido (system:3) — API usa campo "mounth" (typo intencional da API)
        payload = { mounth: n }
        console.log(\`[Central] renovar system:3 id=\${id} mounth=\${n}\`)
      } else {
        // Usuário IPTV/P2P normal — usa package_id
        const packageId = Number(process.env.CENTRAL_PACKAGE_ID ?? 17)
        payload = { package_id: packageId }
        console.log(\`[Central] renovar normal id=\${id} package_id=\${packageId}\`)
      }`,
  `      // Mapa de meses → package_id (CENTRAL_PACKAGE_ID = 1 mês)
      const packageMap = {
        1: Number(process.env.CENTRAL_PACKAGE_ID ?? 17),
        6: 55,
      }
      const packageId = packageMap[n] ?? Number(process.env.CENTRAL_PACKAGE_ID ?? 17)

      let payload, data
      if (system === 3) {
        // Usuário híbrido (system:3) — API usa campo "mounth" (typo intencional da API)
        payload = { mounth: n }
        console.log(\`[Central] renovar system:3 id=\${id} mounth=\${n}\`)
      } else {
        // Usuário IPTV/P2P normal — usa package_id por período
        payload = { package_id: packageId }
        console.log(\`[Central] renovar normal id=\${id} meses=\${n} package_id=\${packageId}\`)
      }`
)

writeFileSync('backend/routes/central.js', s, 'utf8')
console.log('✅ central.js — package_id 55 para 6 meses aplicado!')
