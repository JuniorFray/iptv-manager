import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Corrige {DESCONTO} para sempre mostrar valor em reais
s = s.replace(
  `.replace(/\{DESCONTO\}/gi, ci.tipo === '%' ? ci.valor + '%' : 'R$ ' + desc.toFixed(2).replace('.',','))`,
  `.replace(/\{DESCONTO\}/gi, 'R$ ' + desc.toFixed(2).replace('.',','))`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ {DESCONTO} agora mostra valor em reais!')
