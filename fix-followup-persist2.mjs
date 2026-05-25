import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Followup/index.tsx', 'utf8').replace(/\r\n/g, '\n')

// 1. Persiste mensagens no localStorage
s = s.replace(
  `  const [msgs,         setMsgs]         = useState(['', '', ''])`,
  `  const [msgs,         setMsgs]         = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('followup_msgs') || '["","",""]') } catch { return ['','',''] }
  })`
)

// 2. Salva msgs quando mudam
s = s.replace(
  `  useEffect(() => {
    if (contatos.length > 0) localStorage.setItem('followup_contatos', JSON.stringify(contatos))
  }, [contatos])`,
  `  useEffect(() => {
    if (contatos.length > 0) localStorage.setItem('followup_contatos', JSON.stringify(contatos))
  }, [contatos])

  useEffect(() => {
    localStorage.setItem('followup_msgs', JSON.stringify(msgs))
  }, [msgs])`
)

// 3. Garante que carregarEnviados roda na montagem (move para depois da definição)
s = s.replace(
  `  useEffect(() => {
    if (totalBuscado !== null) localStorage.setItem('followup_total', String(totalBuscado))
    carregarEnviados()
  }, [])

  const carregarEnviados = async () => {`,
  `  const carregarEnviados = async () => {`
)

// Adiciona o useEffect DEPOIS de carregarEnviados
s = s.replace(
  `  const buscarContatos = async () => {`,
  `  useEffect(() => { carregarEnviados() }, [])

  const buscarContatos = async () => {`
)

writeFileSync('src/pages/Followup/index.tsx', s, 'utf8')
console.log('✅ Mensagens persistidas + enviados carregados ao abrir!')
