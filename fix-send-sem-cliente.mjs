import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Remove cliente do payload do /send (evita formatarMensagem no backend)
s = s.replace(
  `body: JSON.stringify({ phone, message: mensagemEnvio, cliente: clienteSel })`,
  `body: JSON.stringify({ phone, message: msgFinal })`
)

// Remove cliente do payload do /send-midia com legenda
s = s.replace(
  `body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: mensagem, cliente: clienteSel })`,
  `body: JSON.stringify({ phone, mediaUrl: midiaManual.url, mediaTipo: midiaManual.tipo, mediaNome: midiaManual.nome, caption: msgFinal })`
)

if (!s.includes('message: msgFinal')) {
  console.error('❌ Padrão não encontrado')
  process.exit(1)
}

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ cliente removido do /send — backend não chamará formatarMensagem!')
