/**
 * fix-msg-renovacao.mjs
 * Só envia mensagem de renovação se a renovação foi confirmada (vencimento != null)
 * Corrige: webhook e retry da filaRenovacoes
 */
import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')

// Fix 1: webhook — só envia se vencimento confirmado
s = s.replace(
  `      if (telefone && enviarMensagemRenovacao) {
        await enviarMensagemRenovacao(telefone, {
          nome: cliente?.nome ?? usuario, usuario,
          senha: senha || cliente?.senha || '',
          vencimento: vencimento ?? 'Atualizado',
        })
      }`,
  `      if (telefone && enviarMensagemRenovacao && vencimento) {
        await enviarMensagemRenovacao(telefone, {
          nome: cliente?.nome ?? usuario, usuario,
          senha: senha || cliente?.senha || '',
          vencimento,
        })
      } else if (!vencimento) {
        console.log('[WEBHOOK] Mensagem de renovacao NAO enviada — renovacao nao confirmada')
      }`
)

// Fix 2: retry filaRenovacoes — só envia se vencimento confirmado
s = s.replace(
  `          // Envia mensagem WA
          if (telefone && enviarMensagemRenovacao) {
            try {
              const cSnap = await db.collection('clientes').doc(clienteId).get()
              const cli   = cSnap.exists ? cSnap.data() : {}
              await enviarMensagemRenovacao(telefone, {
                nome: cli.nome ?? usuario, usuario,
                senha: senha || cli.senha || '',
                vencimento: vencimento ?? 'Atualizado',
              })
            } catch (e) { console.error('[RETRY] Erro WA:', e.message) }
          }`,
  `          // Envia mensagem WA — apenas se renovacao confirmada
          if (telefone && enviarMensagemRenovacao && vencimento) {
            try {
              const cSnap = await db.collection('clientes').doc(clienteId).get()
              const cli   = cSnap.exists ? cSnap.data() : {}
              await enviarMensagemRenovacao(telefone, {
                nome: cli.nome ?? usuario, usuario,
                senha: senha || cli.senha || '',
                vencimento,
              })
            } catch (e) { console.error('[RETRY] Erro WA:', e.message) }
          } else if (!vencimento) {
            console.log(\`[RETRY] Mensagem NAO enviada — renovacao nao confirmada: \${usuario}\`)
          }`
)

if (!s.includes('renovacao nao confirmada')) {
  console.error('❌ Padrão não encontrado')
  process.exit(1)
}

writeFileSync('backend/routes/pagamento.js', s, 'utf8')
console.log('✅ pagamento.js — mensagem só enviada após renovação confirmada!')
