import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `      const mensagem = template
        .replace(/\\{nome\\}/g, dados.nome ?? '')
        .replace(/\\{usuario\\}/g, dados.usuario ?? '')
        .replace(/\\{senha\\}/g, dados.senha ?? '')
        .replace(/\\{vencimento\\}/g, dados.vencimento ?? '')`,
  `      const mensagem = template
        .replace(/\\{nome\\}/gi, dados.nome ?? '')
        .replace(/\\{usuario\\}/gi, dados.usuario ?? '')
        .replace(/\\{senha\\}/gi, dados.senha ?? '')
        .replace(/\\{vencimento\\}/gi, dados.vencimento ?? '')`
)

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ Replace {NOME} case-insensitive aplicado!')
