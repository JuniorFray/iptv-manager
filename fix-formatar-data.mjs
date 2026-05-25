import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Clientes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Remove a função formatarData que não é mais usada
s = s.replace(
  `  const formatarData = (ts: any): string => {
    if (!ts) return '—'
    if (typeof ts === 'string') return ts
    if (ts?.toDate) return ts.toDate().toLocaleDateString('pt-BR')
    return '—'
  }

  `,
  `  `
)

writeFileSync('src/pages/Clientes/index.tsx', s, 'utf8')
console.log('✅ formatarData removida!')
