import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/status.js', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `    // Publica via Evolution API
    let resultado
    if (data.midiaUrl && data.midiaTipo === 'imagem') {
      resultado = await evoFetch(\`/message/sendStatus/\${INSTANCE}\`, 'POST', {
        type: 'image',
        content: data.midiaUrl,
        caption: data.legenda || '',
        statusJidList: contatos,
        allContacts: contatos.length === 0,
      }, 20000)
    } else if (data.midiaUrl && data.midiaTipo === 'video') {
      resultado = await evoFetch(\`/message/sendStatus/\${INSTANCE}\`, 'POST', {
        type: 'video',
        content: data.midiaUrl,
        caption: data.legenda || '',
        statusJidList: contatos,
        allContacts: contatos.length === 0,
      }, 20000)
    } else {
      resultado = await evoFetch(\`/message/sendStatus/\${INSTANCE}\`, 'POST', {
        type: 'text',
        content: data.legenda || '',
        statusJidList: contatos,
        allContacts: contatos.length === 0,
      }, 20000)
    }`,
  `    // Publica via Evolution API — payload com wrapper statusMessage (formato correto v2)
    let resultado
    if (data.midiaUrl && data.midiaTipo === 'imagem') {
      resultado = await evoFetch(\`/message/sendStatus/\${INSTANCE}\`, 'POST', {
        statusMessage: {
          type: 'image',
          content: data.midiaUrl,
          caption: data.legenda || '',
          statusJidList: contatos,
          allContacts: contatos.length === 0,
        }
      }, 20000)
    } else if (data.midiaUrl && data.midiaTipo === 'video') {
      resultado = await evoFetch(\`/message/sendStatus/\${INSTANCE}\`, 'POST', {
        statusMessage: {
          type: 'video',
          content: data.midiaUrl,
          caption: data.legenda || '',
          statusJidList: contatos,
          allContacts: contatos.length === 0,
        }
      }, 20000)
    } else {
      resultado = await evoFetch(\`/message/sendStatus/\${INSTANCE}\`, 'POST', {
        statusMessage: {
          type: 'text',
          content: data.legenda || '',
          backgroundColor: '#06CF9C',
          font: 1,
          statusJidList: contatos,
          allContacts: contatos.length === 0,
        }
      }, 20000)
    }`
)

writeFileSync('backend/routes/status.js', s, 'utf8')
console.log('✅ status.js — payload corrigido para formato statusMessage!')
