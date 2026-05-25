import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Clientes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `  const [gerandoLinkId, setGerandoLinkId] = useState<string | null>(null)`,
  `  const [gerandoLinkId, setGerandoLinkId] = useState<string | null>(null)
  const [cupomLink, setCupomLink]           = useState('')
  const [cupomModal, setCupomModal]         = useState<any>(null)`
)

if (!s.includes('cupomLink, setCupomLink')) {
  console.error('❌ Padrão não encontrado')
  process.exit(1)
}

writeFileSync('src/pages/Clientes/index.tsx', s, 'utf8')
console.log('✅ Estados cupomModal e cupomLink adicionados!')
