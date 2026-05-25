import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Clientes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// 1. Adiciona estado editandoInline
s = s.replace(
  `  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null)`,
  `  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null)
  const [editandoInline, setEditandoInline] = useState<{ id: string; field: string; valor: string } | null>(null)`
)

// 2. Adiciona função salvarInline
s = s.replace(
  `  const mostrarMsgPainel = (tipo: 'ok' | 'erro', msg: string) => {`,
  `  const salvarInline = async (id: string, field: string, valor: string) => {
    setEditandoInline(null)
    try {
      await updateDoc(doc(db, 'clientes', id), { [field]: valor })
    } catch (err: any) {
      mostrarMsgPainel('erro', 'Erro ao salvar: ' + err.message)
    }
  }

  const mostrarMsgPainel = (tipo: 'ok' | 'erro', msg: string) => {`
)

// 3. Helper para renderizar célula inline editável
s = s.replace(
  `  const abrirModal = (cliente?: Cliente) => {`,
  `  const CelulaEditavel = ({ c, field, valor, style }: { c: Cliente; field: string; valor: string; style: React.CSSProperties }) => {
    const ativo = editandoInline?.id === c.id && editandoInline?.field === field
    if (ativo) {
      return (
        <input
          autoFocus
          defaultValue={editandoInline!.valor}
          onBlur={e => salvarInline(c.id, field, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditandoInline(null)
          }}
          style={{
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.6)',
            borderRadius: '4px', color: 'white', fontSize: '11px', padding: '2px 6px',
            outline: 'none', width: '100%', fontFamily: 'inherit',
          }}
        />
      )
    }
    return (
      <span
        style={{ ...style, cursor: 'text', display: 'block' }}
        onDoubleClick={e => { e.stopPropagation(); setEditandoInline({ id: c.id, field, valor }) }}
        title="Duplo clique para editar"
      >
        {valor || '—'}
      </span>
    )
  }

  const abrirModal = (cliente?: Cliente) => {`
)

// 4. Substitui as células editáveis na tabela
s = s.replace(
  `                <td style={{ padding: '8px 10px', color: 'white', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.55)', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.telefone || '—'}</td>`,
  `                <td style={{ padding: '8px 10px', maxWidth: '160px' }}>
                  <CelulaEditavel c={c} field="nome" valor={c.nome} style={{ color: 'white', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                </td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="telefone" valor={c.telefone} style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }} />
                </td>`
)

s = s.replace(
  `                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.7)', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.servidor || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.usuario || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.senha || '—'}</td>`,
  `                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="servidor" valor={c.servidor} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }} />
                </td>
                <td style={{ padding: '8px 10px', maxWidth: '110px' }}>
                  <CelulaEditavel c={c} field="usuario" valor={c.usuario} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                </td>
                <td style={{ padding: '8px 10px', maxWidth: '100px' }}>
                  <CelulaEditavel c={c} field="senha" valor={c.senha} style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                </td>`
)

s = s.replace(
  `                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: corVencimento(c.vencimento), fontWeight: '600', fontSize: '11px' }}>
                    {formatarData(c.vencimento)}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', color: '#4ade80', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  {c.valor ? \`R$ \${parseFloat(c.valor).toFixed(2).replace('.', ',')}\` : '—'}
                </td>`,
  `                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="vencimento" valor={c.vencimento} style={{ color: corVencimento(c.vencimento), fontWeight: '600', fontSize: '11px' }} />
                </td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <CelulaEditavel c={c} field="valor" valor={c.valor} style={{ color: '#4ade80', fontWeight: '600', fontSize: '11px' }} />
                </td>`
)

s = s.replace(
  `                <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.4)', fontSize: '11px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.obs || '—'}
                </td>`,
  `                <td style={{ padding: '8px 10px', maxWidth: '100px' }}>
                  <CelulaEditavel c={c} field="obs" valor={c.obs ?? ''} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
                </td>`
)

writeFileSync('src/pages/Clientes/index.tsx', s, 'utf8')
console.log('✅ Edição inline por duplo clique aplicada!')
