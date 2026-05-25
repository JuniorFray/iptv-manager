import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// 1. Adiciona estado
s = s.replace(
  `  const [enqueteOpcoes, setEnqueteOpcoes]   = useState<string[]>(['', '', ''])`,
  `  const [enqueteOpcoes, setEnqueteOpcoes]   = useState<string[]>(['', '', ''])
  const [enqueteMultipla, setEnqueteMultipla] = useState(false)`
)

// 2. Passa selectableCount nas funções de envio
s = s.replace(
  `        body: JSON.stringify({ phone, titulo: enqueteTitulo.trim(), opcoes })
      })
    } catch {}
  }`,
  `        body: JSON.stringify({ phone, titulo: enqueteTitulo.trim(), opcoes, selectableCount: enqueteMultipla ? opcoes.length : 1 })
      })
    } catch {}
  }`
)

s = s.replace(
  `          body: JSON.stringify({ phone: formatarTelefone(c.telefone), titulo: enqueteTitulo.trim(), opcoes })`,
  `          body: JSON.stringify({ phone: formatarTelefone(c.telefone), titulo: enqueteTitulo.trim(), opcoes, selectableCount: enqueteMultipla ? opcoes.length : 1 })`
)

// 3. Adiciona toggle na UI — após o parágrafo "Mínimo 2 opções"
s = s.replace(
  `                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: 0 }}>Mínimo 2 opções • Máximo 12 opções</p>`,
  `                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: 0 }}>Mínimo 2 opções • Máximo 12 opções</p>
                  <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px', alignSelf: 'flex-start', marginTop: '4px' }}>
                    <button onClick={() => setEnqueteMultipla(false)} style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: !enqueteMultipla ? 'rgba(99,102,241,0.4)' : 'transparent', color: !enqueteMultipla ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>☑️ Escolha única</button>
                    <button onClick={() => setEnqueteMultipla(true)}  style={{ padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background:  enqueteMultipla ? 'rgba(99,102,241,0.4)' : 'transparent', color:  enqueteMultipla ? '#a5b4fc' : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '600' }}>☑️ Múltipla escolha</button>
                  </div>`
)

// 4. Passa selectableCount no backend
const sb = readFileSync('backend/routes/whatsapp.js', 'utf8')
const sbNew = sb.replace(
  `      const { phone, titulo, opcoes } = req.body
      if (!phone || !titulo || !opcoes?.length) return res.status(400).json({ error: 'phone, titulo e opcoes sao obrigatorios' })
      const num = normalizarTelefone(phone)
      const result = await evoFetch('/message/sendPoll/' + INSTANCE, 'POST', {
        number: num,
        name: titulo,
        values: opcoes,
        selectableCount: 1,
      })`,
  `      const { phone, titulo, opcoes, selectableCount } = req.body
      if (!phone || !titulo || !opcoes?.length) return res.status(400).json({ error: 'phone, titulo e opcoes sao obrigatorios' })
      const num = normalizarTelefone(phone)
      const result = await evoFetch('/message/sendPoll/' + INSTANCE, 'POST', {
        number: num,
        name: titulo,
        values: opcoes,
        selectableCount: selectableCount ?? 1,
      })`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
writeFileSync('backend/routes/whatsapp.js', sbNew, 'utf8')
console.log('Toggle multipla escolha adicionado!')
