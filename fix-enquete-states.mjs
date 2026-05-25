import { readFileSync, writeFileSync } from 'fs'

const s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

const BUSCA = `  const [modoEnvioMidia, setModoEnvioMidia] = useState<'junto' | 'separado'>('junto')`

const NOVO = `  const [modoEnvioMidia, setModoEnvioMidia] = useState<'junto' | 'separado'>('junto')
  const [modoEnquete,   setModoEnquete]     = useState(false)
  const [enqueteTitulo, setEnqueteTitulo]   = useState('')
  const [enqueteOpcoes, setEnqueteOpcoes]   = useState<string[]>(['', '', ''])`

if (!s.includes(BUSCA)) { console.error('Padrao nao encontrado'); process.exit(1) }

writeFileSync('src/pages/Notificacoes/index.tsx', s.replace(BUSCA, NOVO), 'utf8')
console.log('Estados de enquete adicionados!')
