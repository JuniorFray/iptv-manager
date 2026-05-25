import { readFileSync, writeFileSync } from 'fs'

// 1. server.js
let server = readFileSync('backend/server.js', 'utf8').replace(/\r\n/g, '\n')
server = server.replace(
  `import createStatusRouter    from './routes/status.js'`,
  `import createStatusRouter    from './routes/status.js'\nimport createAfiliadoRouter  from './routes/afiliado.js'`
)
server = server.replace(
  `const { router: statusRouter } = createStatusRouter(db, admin, getSock, isReady)\napp.use('/', statusRouter)`,
  `const { router: statusRouter }  = createStatusRouter(db, admin, getSock, isReady)\napp.use('/', statusRouter)\nconst { router: afiliadoRouter } = createAfiliadoRouter(db, admin)\napp.use('/', afiliadoRouter)`
)
writeFileSync('backend/server.js', server, 'utf8')
console.log('server.js OK')

// 2. App.tsx
let app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n')
app = app.replace(
  `import Followup from "./pages/Followup";`,
  `import Followup from "./pages/Followup";\nimport Afiliados from "./pages/Afiliados";\nimport AfiliadoPortal from "./pages/AfiliadoPortal";`
)
app = app.replace(
  `          <Route path="followup" element={<Followup />} />`,
  `          <Route path="followup" element={<Followup />} />\n            <Route path="afiliados" element={<Afiliados />} />`
)
app = app.replace(
  `          <Route path="*" element={<Navigate to="/login" />} />`,
  `          <Route path="afiliado" element={<AfiliadoPortal />} />\n          <Route path="afiliado/*" element={<AfiliadoPortal />} />\n          <Route path="*" element={<Navigate to="/login" />} />`
)
writeFileSync('src/App.tsx', app, 'utf8')
console.log('App.tsx OK')

// 3. MenuLateral.tsx
let menu = readFileSync('src/components/MenuLateral.tsx', 'utf8').replace(/\r\n/g, '\n')
menu = menu.replace(
  `import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp, CreditCard, MapPin, PhoneCall } from 'lucide-react'`,
  `import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp, CreditCard, MapPin, PhoneCall, Handshake } from 'lucide-react'`
)
menu = menu.replace(
  `  { path: 'followup',       icon: <PhoneCall size={18} />,        label: 'Follow-up' },`,
  `  { path: 'followup',       icon: <PhoneCall size={18} />,        label: 'Follow-up' },\n  { path: 'afiliados',      icon: <Handshake size={18} />,        label: 'Afiliados' },`
)
writeFileSync('src/components/MenuLateral.tsx', menu, 'utf8')
console.log('MenuLateral.tsx OK')

// 4. pagamento.js - adiciona afiliadoId no external_reference e webhook
let pag = readFileSync('backend/routes/pagamento.js', 'utf8').replace(/\r\n/g, '\n')
pag = pag.replace(
  `      const { clienteId, clienteNome, telefone, servidor, usuario, senha, valor, valor3meses, valor6meses, cupomCodigo } = req.body`,
  `      const { clienteId, clienteNome, telefone, servidor, usuario, senha, valor, valor3meses, valor6meses, cupomCodigo, afiliadoId } = req.body`
)
pag = pag.replace(
  `        const externalRef = \`\${clienteId}|\${servidor}|\${usuario}|\${telefone ?? ''}|\${senha ?? ''}|\${plano.id}\``,
  `        const externalRef = \`\${clienteId}|\${servidor}|\${usuario}|\${telefone ?? ''}|\${senha ?? ''}|\${plano.id}|\${afiliadoId ?? ''}\``
)
// Adiciona registro de comissão no webhook após atualizar o pagamento
pag = pag.replace(
  `      if (telefone && enviarMensagemRenovacao && vencimento) {`,
  `      // Registra comissão do afiliado se houver
      const afiliadoIdRef = parts[6] ?? ''
      if (afiliadoIdRef) {
        try {
          const afDoc = await db.collection('afiliados').doc(afiliadoIdRef).get()
          if (afDoc.exists && afDoc.data().ativo) {
            const af = afDoc.data()
            const comissao = af.comissaoTipo === 'percent'
              ? Math.round(valorPago * af.comissaoValor / 100 * 100) / 100
              : af.comissaoValor
            await db.collection('afiliadoVendas').add({
              afiliadoId: afiliadoIdRef,
              afiliadoNome: af.nome,
              clienteNome: cliente?.nome ?? usuario,
              clienteTelefone: telefone ?? '',
              servidor, usuario, plano: plano.label,
              valor: valorPago, comissao,
              mpPaymentId,
              status: 'pendente',
              criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            })
            console.log('[WEBHOOK] Comissao registrada — afiliado:', af.nome, 'valor:', comissao)
          }
        } catch (e) { console.error('[WEBHOOK] Erro comissao afiliado:', e.message) }
      }

      if (telefone && enviarMensagemRenovacao && vencimento) {`
)
writeFileSync('backend/routes/pagamento.js', pag, 'utf8')
console.log('pagamento.js OK')
