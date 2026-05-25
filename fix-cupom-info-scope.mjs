import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

// Fix 1: declarar cupomData no escopo correto ao aplicar desconto
s = s.replace(
  `      // Aplica desconto do cupom se informado
      if (cupomCodigo) {
        try {
          const cSnap = await db.collection('cupons').doc(cupomCodigo.toUpperCase()).get()
          if (cSnap.exists) {
            const c = cSnap.data()`,
  `      // Aplica desconto do cupom se informado
      let cupomData = null
      if (cupomCodigo) {
        try {
          const cSnap = await db.collection('cupons').doc(cupomCodigo.toUpperCase()).get()
          if (cSnap.exists) {
            const c = cSnap.data()`
)

// Salva cupomData quando desconto é aplicado
s = s.replace(
  `            if (c.ativo && validadeOk && (!c.maxUsos || c.usos < c.maxUsos)) {
              const desc = (val) => c.tipo === '%' ? Math.max(0, val - val * c.valor / 100) : Math.max(0, val - c.valor)
              v1 = Math.round(desc(v1) * 100) / 100
              v3 = Math.round(desc(v3) * 100) / 100
              v6 = Math.round(desc(v6) * 100) / 100
            }`,
  `            if (c.ativo && validadeOk && (!c.maxUsos || c.usos < c.maxUsos)) {
              const desc = (val) => c.tipo === '%' ? Math.max(0, val - val * c.valor / 100) : Math.max(0, val - c.valor)
              v1 = Math.round(desc(v1) * 100) / 100
              v3 = Math.round(desc(v3) * 100) / 100
              v6 = Math.round(desc(v6) * 100) / 100
              cupomData = c
            }`
)

// Fix 2: usa cupomData em vez de cupomInfo na expiração
s = s.replace(
  `            if (cupomInfo?.validade) {
                const [d, m, a] = cupomInfo.validade.split('/').map(Number)`,
  `            if (cupomData?.validade) {
                const [d, m, a] = cupomData.validade.split('/').map(Number)`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ cupomData declarado no escopo — cupomInfo is not defined resolvido!')
