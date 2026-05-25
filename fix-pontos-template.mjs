import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

// Adiciona função helper para strip das linhas de preço+link do template no multi-ponto
const helperFn = `
  // Remove linhas de preço e link do template para multi-ponto
  const stripLinksDoTemplate = (template) => {
    const linhas = template.split('\\n')
    const remover = new Set()
    for (let i = 0; i < linhas.length; i++) {
      if (/\\{LINK_(1MES|3MESES|6MESES)\\}/i.test(linhas[i])) {
        remover.add(i)           // remove linha {LINK_*}
        if (i > 0) remover.add(i - 1) // remove linha de preço acima
      }
    }
    return linhas.filter((_, i) => !remover.has(i)).join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim()
  }
`

// Insere a função antes de executarEnvioAutomatico
s = s.replace(
  `  const executarEnvioAutomatico = async () => {`,
  helperFn + `  const executarEnvioAutomatico = async () => {`
)

// Corrige executarEnvioAutomatico: usa stripLinksDoTemplate para msgBase
s = s.replace(
  `        const msgBase = mensagem
          .replace(/\\{LINK_1MES\\}/gi, '').replace(/\\{LINK_3MESES\\}/gi, '').replace(/\\{LINK_6MESES\\}/gi, '')
        mensagemFinal = msgBase + '\\n' + pontosTexto`,
  `        const msgBase = stripLinksDoTemplate(mensagem)
        mensagemFinal = msgBase + '\\n\\n' + pontosTexto`
)

// Corrige fila/adicionar: mesmo comportamento
s = s.replace(
  `        const msgBase = cliente
          ? mensagem
            .replace(/\\{LINK_1MES\\}/gi, '').replace(/\\{LINK_3MESES\\}/gi, '').replace(/\\{LINK_6MESES\\}/gi, '')
          : mensagem
        mensagemFinal = msgBase + '\\n' + pontosTexto`,
  `        const msgBase = cliente ? stripLinksDoTemplate(mensagem) : mensagem
        mensagemFinal = msgBase + '\\n\\n' + pontosTexto`
)

writeFileSync('backend/routes/whatsapp.js', s, 'utf8')
console.log('✅ multi-ponto: linhas de preço/link removidas do template!')
