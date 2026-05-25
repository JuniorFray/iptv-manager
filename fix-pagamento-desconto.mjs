import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `      const parseValor = (v) => v ? parseFloat(String(v).replace(',', '.')) : null
      const v1 = parseValor(valor)
      const v3 = parseValor(valor3meses)
      const v6 = parseValor(valor6meses)
      const planosCliente = [
        { id: '1mes',   label: '1 Mes',   valor: v1 && v1 > 0 ? v1 : PLANOS[0].valor, meses: 1, creditos: 1 },
        { id: '3meses', label: '3 Meses', valor: v3 && v3 > 0 ? v3 : PLANOS[1].valor, meses: 3, creditos: 3 },`,
  `      const parseValor = (v) => v ? parseFloat(String(v).replace(',', '.')) : null
      let v1 = parseValor(valor) || PLANOS[0].valor
      let v3 = parseValor(valor3meses) || PLANOS[1].valor
      let v6 = parseValor(valor6meses) || PLANOS[2].valor

      // Aplica desconto do cupom se informado
      if (cupomCodigo) {
        try {
          const cSnap = await db.collection('cupons').doc(cupomCodigo.toUpperCase()).get()
          if (cSnap.exists) {
            const c = cSnap.data()
            if (c.ativo && (!c.maxUsos || c.usos < c.maxUsos)) {
              const desc = (val) => c.tipo === '%' ? Math.max(0, val - val * c.valor / 100) : Math.max(0, val - c.valor)
              v1 = Math.round(desc(v1) * 100) / 100
              v3 = Math.round(desc(v3) * 100) / 100
              v6 = Math.round(desc(v6) * 100) / 100
            }
          }
        } catch (e) { console.error('[PAGAMENTO] Erro cupom:', e.message) }
      }

      const planosCliente = [
        { id: '1mes',   label: '1 Mes',   valor: v1, meses: 1, creditos: 1 },
        { id: '3meses', label: '3 Meses', valor: v3, meses: 3, creditos: 3 },`
)

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ desconto do cupom aplicado corretamente nos valores dos planos!')
