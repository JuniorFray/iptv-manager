import { readFileSync, writeFileSync } from 'fs'

let s = readFileSync('src/pages/Notificacoes/index.tsx', 'utf8').replace(/\r\n/g, '\n')

s = s.replace(
  `  const salvarModelo = async () => {
    if (!novoTitulo.trim() || !novoTexto.trim()) return
    await addDoc(collection(db, 'modelosMensagens'), { titulo: novoTitulo, texto: novoTexto })
    setNovoTitulo(''); setNovoTexto(''); setModalModelo(false)
  }`,
  `  const salvarModelo = async () => {
    if (!novoTitulo.trim() || !novoTexto.trim()) return
    try {
      await addDoc(collection(db, 'modelosMensagens'), { titulo: novoTitulo.trim(), texto: novoTexto.trim(), criadoEm: new Date().toISOString() })
      setNovoTitulo(''); setNovoTexto(''); setModalModelo(false)
    } catch (e: any) {
      alert('Erro ao salvar modelo: ' + (e?.message ?? 'Verifique o console'))
      console.error('[MODELO] Erro:', e)
    }
  }`
)

writeFileSync('src/pages/Notificacoes/index.tsx', s, 'utf8')
console.log('✅ salvarModelo com tratamento de erro!')
