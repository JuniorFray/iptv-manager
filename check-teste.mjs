import { readFileSync } from 'fs'
const s = readFileSync('src/pages/Clientes/index.tsx', 'utf8')
console.log(s.includes('value="teste"') ? 'TEM TESTE' : 'NAO TEM TESTE')
