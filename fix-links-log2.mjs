import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

// Adiciona log no final do formatarMensagem antes do return
s = s.replace(
  `      .replace(/\{LINK_1MES\}/gi,    links?.['1mes']    || '')
      .replace(/\{LINK_3MESES\}/gi,   links?.['3meses']   || '')
      .replace(/\{LINK_6MESES\}/gi,   links?.['6meses']   || '')`,
  `      .replace(/\{LINK_1MES\}/gi,    links?.['1mes']    || '')
      .replace(/\{LINK_3MESES\}/gi,   links?.['3meses']   || '')
      .replace(/\{LINK_6MESES\}/gi,   links?.['6meses']   || '')
    console.log('[FORMAT] link 1mes:', links?.['1mes']?.substring(0, 60))
    console.log('[FORMAT] msg final:', msg.substring(0, 200))`
)

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ log adicionado em formatarMensagem!')
