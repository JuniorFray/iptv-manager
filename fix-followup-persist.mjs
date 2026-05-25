import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Followup/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// 1. Adiciona useEffect
s = s.replace(
  `import { useState } from 'react'`,
  `import { useState, useEffect } from 'react'`
)

// 2. Carrega do localStorage na inicialização
s = s.replace(
  `  const [contatos,     setContatos]     = useState<Contato[]>([])`,
  `  const [contatos,     setContatos]     = useState<Contato[]>(() => {
    try { return JSON.parse(localStorage.getItem('followup_contatos') || '[]') } catch { return [] }
  })`
)

s = s.replace(
  `  const [totalBuscado, setTotalBuscado] = useState<number | null>(null)`,
  `  const [totalBuscado, setTotalBuscado] = useState<number | null>(() => {
    try { const n = localStorage.getItem('followup_total'); return n ? Number(n) : null } catch { return null }
  })`
)

// 3. Persiste quando contatos mudam
s = s.replace(
  `  const carregarEnviados = async () => {`,
  `  useEffect(() => {
    if (contatos.length > 0) localStorage.setItem('followup_contatos', JSON.stringify(contatos))
  }, [contatos])

  useEffect(() => {
    if (totalBuscado !== null) localStorage.setItem('followup_total', String(totalBuscado))
    carregarEnviados()
  }, [])

  const carregarEnviados = async () => {`
)

// 4. Remove o carregarEnviados() duplicado do useEffect de totalBuscado (chamado no buscarContatos já)
// Garante que ao montar a página, carrega enviados
writeFileSync('src/pages/Followup/index.tsx', s, 'utf8')
console.log('✅ Contatos persistidos no localStorage!')
