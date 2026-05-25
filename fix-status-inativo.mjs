import { readFileSync, writeFileSync } from 'fs'

// ── whatsapp.js: pular clientes inativos no envio automático ─────────────────
let ws = readFileSync('backend/routes/whatsapp.js', 'utf8').replace(/\r\n/g, '\n')

ws = ws.replace(
  `    for (const cliente of clientes) {
      if (!cliente.telefone) continue
      if (cliente.responsavel?.trim()) continue`,
  `    for (const cliente of clientes) {
      if (!cliente.telefone) continue
      if (cliente.status === 'inativo') continue   // não envia para inativos
      if (cliente.responsavel?.trim()) continue`
)

writeFileSync('backend/routes/whatsapp.js', ws, 'utf8')
console.log('✅ whatsapp.js — inativos ignorados no envio automático!')

// ── Notificacoes/index.tsx: excluir inativos por padrão, adicionar filtro ────
let ts = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// 1. clientesFiltrados — exclui inativos por padrão
ts = ts.replace(
  `    let lista = clientes.filter(c => c.telefone)`,
  `    // Inativos só aparecem se o filtro 'inativos' estiver selecionado
    let lista = filtro === 'inativos'
      ? clientes.filter(c => c.telefone && c.status === 'inativo')
      : clientes.filter(c => c.telefone && c.status !== 'inativo')`
)

// 2. adiciona filtro "Inativos" na array filtros
ts = ts.replace(
  `  { id: 'venc7plus',   label: 'Vencidos +7 dias',`,
  `  { id: 'inativos',    label: 'Inativos',             cor: '94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)'  },
  { id: 'venc7plus',   label: 'Vencidos +7 dias',`
)

// 3. count inline do filtro inativos no sidebar
ts = ts.replace(
  `                        : f.id === 'venc7plus'
                        ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) < -7 : false }).length`,
  `                        : f.id === 'inativos'
                        ? clientes.filter(c => c.telefone && c.status === 'inativo').length
                        : f.id === 'venc7plus'
                        ? clientes.filter(c => { const d = parseData(c.vencimento); return c.status !== 'inativo' && (d ? diferencaDias(d) < -7 : false) }).length`
)

writeFileSync('src/pages/Notificacoes/index.tsx', ts, 'utf8')
console.log('✅ Notificacoes — filtro Inativos adicionado e excluídos por padrão!')
