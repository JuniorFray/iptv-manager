import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `.replace(/\{USUARIO\}/gi, c.usuario ?? '')
      .replace(/\{SENHA\}/gi, c.senha ?? '').replace(/\{VALOR\}/gi, valor)`,
  `.replace(/\{VALOR\}/gi, valor)`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ Removido usuario/senha que não existem no tipo Cliente!')
