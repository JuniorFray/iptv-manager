import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('src/pages/Followup/index.tsx', 'utf8')
  .replace('/whatsapp/followup/contatos', '/followup/contatos')
  .replace('/whatsapp/followup/enviar', '/followup/enviar')

writeFileSync('src/pages/Followup/index.tsx', s, 'utf8')
console.log('✅ URLs corrigidas!')
