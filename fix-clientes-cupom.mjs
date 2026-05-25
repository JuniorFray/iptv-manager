import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Clientes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// Verifica se estados já foram adicionados
if (s.includes('cupomModal')) {
  console.log('Estados já existem, apenas verificando...')
} else {
  // Adiciona estados após gerandoLinkId
  s = s.replace(
    `  const [gerandoLinkId, setGerandoLinkId]   = useState<string | null>(null)`,
    `  const [gerandoLinkId, setGerandoLinkId]   = useState<string | null>(null)
  const [cupomLink, setCupomLink]             = useState('')
  const [cupomModal, setCupomModal]           = useState<any>(null)`
  )
  console.log('✅ Estados adicionados!')
}

writeFileSync('src/pages/Clientes/index.tsx', s, 'utf8')
console.log('✅ Clientes/index.tsx corrigido!')
