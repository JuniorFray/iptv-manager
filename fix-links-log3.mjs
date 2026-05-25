import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `      .replace(/\\{LINK_1MES\\}/gi,    links?.['1mes']    || '')
      .replace(/\\{LINK_3MESES\\}/gi,  links?.['3meses']  || '')
      .replace(/\\{LINK_6MESES\\}/gi,  links?.['6meses']  || '')
    // Fallback sem chaves`,
  `      .replace(/\\{LINK_1MES\\}/gi,    links?.['1mes']    || '')
      .replace(/\\{LINK_3MESES\\}/gi,  links?.['3meses']  || '')
      .replace(/\\{LINK_6MESES\\}/gi,  links?.['6meses']  || '')
    console.log('[FORMAT] link1mes:', (links?.['1mes'] || 'VAZIO').substring(0,80))
    console.log('[FORMAT] msg:', msg.substring(0,300))
    // Fallback sem chaves`
)

if (!s.includes('[FORMAT]')) { console.error('❌ padrão não encontrou'); process.exit(1) }

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ log inserido!')
