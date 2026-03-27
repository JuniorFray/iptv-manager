  1: import { useEffect, useState } from 'react'
  2: import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore'
  3: import { db } from '../../firebase'
  4: import { Plus, Search, Pencil, Trash2, RefreshCw, Check, X, Download } from 'lucide-react'
  5: 
  6: const BACKEND_URL = 'https://iptv-manager-production.up.railway.app'
  7: 
  8: interface Cliente {
  9:   id: string
 10:   nome: string
 11:   telefone: string
 12:   tipo: string
 13:   servidor: string
 14:   usuario: string
 15:   senha: string
 16:   vencimento: string
 17:   valor: string
 18:   status: string
 19:   obs: string
 20: }
 21: 
 22: const clienteVazio: Omit<Cliente, 'id'> = {
 23:   nome: '', telefone: '', tipo: 'IPTV', servidor: '', usuario: '',
 24:   senha: '', vencimento: '', valor: '', status: 'ativo', obs: '',
 25: }
 26: 
 27: // Converte "YYYY-MM-DD" ou "YYYY-MM-DD HH:mm:ss" → "DD/MM/YYYY"
 28: const isoParaBR = (str: string): string => {
 29:   if (!str) return ''
 30:   const parte = str.split(' ')[0]          // descarta hora se houver
 31:   const [y, m, d] = parte.split('-')
 32:   if (!y || !m || !d) return ''
 33:   return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`
 34: }
 35: 
 36: // Converte "DD/MM/YYYY HH:mm" (resposta IPTV) → "DD/MM/YYYY"
 37: const dtBRParaBR = (str: string): string => {
 38:   if (!str) return ''
 39:   return str.split(' ')[0]
 40: }
 41: 
 42: export default function Clientes() {
 43:   const [clientes, setClientes] = useState<Cliente[]>([])
 44:   const [busca, setBusca] = useState('')
 45:   const [modalAberto, setModalAberto] = useState(false)
 46:   const [clienteEditando, setClienteEditando] = useState<Omit<Cliente, 'id'> & { id?: string }>(clienteVazio)
 47:   const [carregando, setCarregando] = useState(false)
 48:   const [renovandoId, setRenovandoId] = useState<string | null>(null)
 49:   const [importandoId, setImportandoId] = useState<string | null>(null)
 50:   const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null)
 51:   const [msgPainel, setMsgPainel] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
 52: 
 53:   // Warez
 54:   const [sincronizandoWarez, setSincronizandoWarez] = useState(false)
 55:   const [syncResult, setSyncResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
 56: 
 57:   // Elite
 58:   const [sincronizandoElite, setSincronizandoElite] = useState(false)
 59:   const [syncEliteResult, setSyncEliteResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
 60:   const [linhasEliteCache, setLinhasEliteCache] = useState<any[]>([])
 61: 
 62:   // Central
 63:   const [sincronizandoCentral, setSincronizandoCentral] = useState(false)
 64:   const [_syncCentralResult, setSyncCentralResult] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
 65:   const [linhasCentralCache, setLinhasCentralCache] = useState<any[]>([])
 66: 
 67:   // Modal de período de renovação
 68:   const [modalRenovar, setModalRenovar] = useState(false)
 69:   const [clienteParaRenovar, setClienteParaRenovar] = useState<Cliente | null>(null)
 70:   const [periodoRenovar, setPeriodoRenovar] = useState<number>(1)
 71: 
 72:   useEffect(() => {
 73:     const unsub = onSnapshot(collection(db, 'clientes'), snap => {
 74:       setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)))
 75:     })
 76:     return unsub
 77:   }, [])
 78: 
 79:   // Fechar menu ao clicar fora
 80:   useEffect(() => {
 81:     if (!menuAbertoId) return
 82:     const handler = () => setMenuAbertoId(null)
 83:     document.addEventListener('click', handler)
 84:     return () => document.removeEventListener('click', handler)
 85:   }, [menuAbertoId])
 86: 
 87:   const clientesFiltrados = clientes.filter(c => {
 88:     const t = busca.toLowerCase()
 89:     return (
 90:       c.nome?.toLowerCase().includes(t) ||
 91:       c.telefone?.includes(t) ||
 92:       c.servidor?.toLowerCase().includes(t) ||
 93:       c.usuario?.toLowerCase().includes(t) ||
 94:       c.obs?.toLowerCase().includes(t)
 95:     )
 96:   })
 97: 
 98:   const mostrarMsgPainel = (tipo: 'ok' | 'erro', msg: string) => {
 99:     setMsgPainel({ tipo, msg })
100:     setTimeout(() => setMsgPainel(null), 6000)
101:   }
102: 
103:   const abrirModal = (cliente?: Cliente) => {
104:     setClienteEditando(cliente ? { ...cliente } : { ...clienteVazio })
105:     setModalAberto(true)
106:   }
107: 
108:   const fecharModal = () => { setModalAberto(false); setClienteEditando(clienteVazio) }
109: 
110:   const salvarCliente = async () => {
111:     setCarregando(true)
112:     try {
113:       const { id, ...dados } = clienteEditando as Cliente
114:       if (id) {
115:         await updateDoc(doc(db, 'clientes', id), dados as any)
116:       } else {
117:         await addDoc(collection(db, 'clientes'), dados)
118:       }
119:       fecharModal()
120:     } finally {
121:       setCarregando(false)
122:     }
123:   }
124: 
125:   const excluirCliente = async (id: string) => {
126:     if (!confirm('Excluir este cliente?')) return
127:     await deleteDoc(doc(db, 'clientes', id))
128:   }
129: 
130:   const formatarData = (ts: any): string => {
131:     if (!ts) return '—'
132:     if (typeof ts === 'string') return ts
133:     if (ts?.toDate) return ts.toDate().toLocaleDateString('pt-BR')
134:     return '—'
135:   }
136: 
137:   const diffDias = (venc: string): number | null => {
138:     if (!venc) return null
139:     const [d, m, y] = venc.split('/').map(Number)
140:     if (!d || !m || !y) return null
141:     const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
142:     const data = new Date(y, m - 1, d)
143:     return Math.round((data.getTime() - hoje.getTime()) / 86400000)
144:   }
145: 
146:   const corVencimento = (venc: string) => {
147:     const diff = diffDias(venc)
148:     if (diff === null) return 'rgba(255,255,255,0.5)'
149:     if (diff < 0) return '#f87171'
150:     if (diff <= 4) return '#fb923c'
151:     if (diff <= 7) return '#fbbf24'
152:     return '#4ade80'
153:   }
154: 
155:   // ---- Helpers de servidor ----
156:   const isWarez   = (servidor: string) => servidor?.toUpperCase().includes('WAREZ')
157:   const isElite   = (servidor: string) => servidor?.toUpperCase().includes('ELITE')
158:   const isCentral = (servidor: string) => servidor?.toUpperCase().includes('CENTRAL')
159: 
160:   // ---- Buscar linhas Elite (com cache) ----
161:   const buscarLinhasElite = async (): Promise<any[]> => {
162:     if (linhasEliteCache.length > 0) return linhasEliteCache
163:     const res = await fetch(`${BACKEND_URL}/elite/sincronizar`)
164:     const data = await res.json()
165:     if (data.error) throw new Error(data.error)
166:     const linhas = data.linhas ?? []
167:     setLinhasEliteCache(linhas)
168:     return linhas
169:   }
170: 
171:   const matchElite = (cliente: Cliente, linhas: any[]): any | null => {
172:     // 1. Busca por username (mais preciso)
173:     const usuario = cliente.usuario?.trim().toLowerCase()
174:     if (usuario) {
175:       const byUser = linhas.find((l: any) => l.username?.toLowerCase() === usuario)
176:       if (byUser) return byUser
177:     }
178:     // 2. Fallback: busca por nome (para clientes sem usuário ainda)
179:     const nomeLower = cliente.nome?.toLowerCase() ?? ''
180:     const palavras = nomeLower.split(' ').filter((p: string) => p.length > 2)
181:     if (palavras.length === 0) return null
182:     return linhas.find((l: any) => {
183:       const name = (l.name ?? l.notes ?? '').toLowerCase()
184:       if (!name) return false
185:       return palavras.filter((p: string) => name.includes(p)).length >= 2
186:     }) ?? null
187:   }
188: 
189:   const matchCentral = (cliente: Cliente, linhas: any[]): any | null => {
190:     // 1. Busca por username exato
191:     const usuario = cliente.usuario?.trim().toLowerCase()
192:     if (usuario) {
193:       const byUser = linhas.find((l: any) => l.username?.toLowerCase() === usuario)
194:       if (byUser) return byUser
195:     }
196:     // 2. Fallback por nome
197:     const nomeLower = cliente.nome?.toLowerCase() ?? ''
198:     const palavras = nomeLower.split(' ').filter((p: string) => p.length > 2)
199:     if (palavras.length === 0) return null
200:     return linhas.find((l: any) => {
201:       const name = (l.name ?? '').toLowerCase()
202:       if (!name) return false
203:       return palavras.filter((p: string) => name.includes(p)).length >= 2
204:     }) ?? null
205:   }
206: 
207:   // ---- Sincronizar Warez ----
208:   const sincronizarWWPanel = async () => {
209:     setSincronizandoWarez(true)
210:     setSyncResult(null)
211:     try {
212:       const res = await fetch(`${BACKEND_URL}/painel/sincronizar`)
213:       const data = await res.json()
214:       if (data.error) throw new Error(data.error)
215:       const linhasWarez: any[] = data.linhas ?? []
216:       let atualizados = 0, pulados = 0, naoEncontrados = 0
217: 
218:       for (const cliente of clientes) {
219:         if (cliente.usuario?.trim()) { pulados++; continue }
220:         if (!isWarez(cliente.servidor)) continue
221: 
222:         const nomeLower = cliente.nome?.toLowerCase() ?? ''
223:         const palavras = nomeLower.split(' ').filter((p: string) => p.length > 2)
224:         const match = linhasWarez.find((l: any) => {
225:           const notes = (l.notes ?? '').toLowerCase()
226:           if (!notes) return false
227:           return palavras.filter((p: string) => notes.includes(p)).length >= 2
228:         })
229: 
230:         if (match) {
231:           await updateDoc(doc(db, 'clientes', cliente.id), {
232:             usuario: match.username,
233:             senha: match.password,
234:           })
235:           atualizados++
236:         } else {
237:           naoEncontrados++
238:         }
239:       }
240:       setSyncResult({
241:         tipo: 'ok',
242:         msg: `✅ Warez sincronizado!\n✔ ${atualizados} atualizados  ⏭ ${pulados} pulados  ❌ ${naoEncontrados} não encontrados`,
243:       })
244:     } catch (err: any) {
245:       setSyncResult({ tipo: 'erro', msg: `❌ Erro Warez: ${err.message}` })
246:     } finally {
247:       setSincronizandoWarez(false)
248:     }
249:   }
250: 
251:   // ---- Renovar Warez ----
252:   const renovarClienteWarez = async (cliente: Cliente, credits: number = 1) => {
253:     setRenovandoId(cliente.id)
254:     try {
255:       const username = cliente.usuario?.trim()
256:       if (!username) throw new Error('Cliente sem usuário. Sincronize o Warez primeiro.')
257: 
258:       const syncRes = await fetch(`${BACKEND_URL}/painel/sincronizar`)
259:       const syncData = await syncRes.json()
260:       const linhas: any[] = syncData.linhas ?? []
261:       const linha = linhas.find((l: any) => l.username === username)
262:       if (!linha) throw new Error(`Usuário "${username}" não encontrado no painel Warez.`)
263: 
264:       const renovarRes = await fetch(`${BACKEND_URL}/painel/renovar/${linha.id}`, {
265:         method: 'POST',
266:         headers: { 'Content-Type': 'application/json' },
267:         body: JSON.stringify({
          credits,
          nome:     cliente.nome,
          telefone: cliente.telefone,
          usuario:  cliente.usuario,
          senha:    cliente.senha,
        }),
268:       })
269:       const renovarData = await renovarRes.json()
270:       if (!renovarRes.ok) throw new Error(renovarData?.error ?? 'Falha ao renovar no Warez.')
271: 
272:       const expDate = renovarData?.exp_date ?? renovarData?.expiry_date
273:       if (!expDate) throw new Error('Renovação feita mas data não retornada pelo painel.')
274: 
275:       const d = new Date(expDate)
276:       const novaDataStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
277:       await updateDoc(doc(db, 'clientes', cliente.id), { vencimento: novaDataStr })
278:       mostrarMsgPainel('ok', `✅ ${cliente.nome} renovado! (${credits * 30} dias)\n👤 ${username} | 📅 ${novaDataStr}`)
279:     } catch (err: any) {
280:       mostrarMsgPainel('erro', `❌ Erro ao renovar ${cliente.nome}:\n${err.message}`)
281:     } finally {
282:       setRenovandoId(null)
283:     }
284:   }
285: 
286:   // ---- Sincronizar Elite (atualiza usuario, senha E vencimento) ----
287:   const sincronizarElite = async () => {
288:     setSincronizandoElite(true)
289:     setSyncEliteResult(null)
290:     setLinhasEliteCache([])
291:     try {
292:       const res = await fetch(`${BACKEND_URL}/elite/sincronizar`)
293:       const data = await res.json()
294:       if (data.error) throw new Error(data.error)
295:       const linhasElite: any[] = data.linhas ?? []
296:       setLinhasEliteCache(linhasElite)
297:       let atualizados = 0, pulados = 0, naoEncontrados = 0
298: 
299:       for (const cliente of clientes) {
300:         if (cliente.usuario?.trim()) { pulados++; continue }
301:         if (!isElite(cliente.servidor)) continue
302: 
303:         const match = matchElite(cliente, linhasElite)
304:         if (match) {
305:           const updates: any = {
306:             usuario: match.username ?? '',
307:             senha:   match.password ?? '',
308:           }
309:           // Atualizar vencimento se disponível
310:           if (match.exp_date) {
311:             updates.vencimento = isoParaBR(match.exp_date)
312:           }
313:           await updateDoc(doc(db, 'clientes', cliente.id), updates)
314:           atualizados++
315:         } else {
316:           naoEncontrados++
317:         }
318:       }
319:       setSyncEliteResult({
320:         tipo: 'ok',
321:         msg: `✅ Elite sincronizado!\n✔ ${atualizados} atualizados  ⏭ ${pulados} pulados  ❌ ${naoEncontrados} não encontrados`,
322:       })
323:     } catch (err: any) {
324:       setSyncEliteResult({ tipo: 'erro', msg: `❌ Erro Elite: ${err.message}` })
325:     } finally {
326:       setSincronizandoElite(false)
327:     }
328:   }
329: 
330:   // ---- Importar usuario/senha/vencimento Elite para um cliente específico ----
331:   const importarElite = async (cliente: Cliente) => {
332:     setImportandoId(cliente.id)
333:     try {
334:       const linhas = await buscarLinhasElite()
335:       const match = matchElite(cliente, linhas)
336:       if (!match) throw new Error(`Nenhuma linha Elite encontrada para "${cliente.nome}". Verifique se o nome bate com o cadastro no Elite.`)
337: 
338:       const updates: any = {
339:         usuario: match.username ?? '',
340:         senha:   match.password ?? '',
341:       }
342:       if (match.exp_date) {
343:         updates.vencimento = isoParaBR(match.exp_date)
344:       }
345:       await updateDoc(doc(db, 'clientes', cliente.id), updates)
346:       mostrarMsgPainel('ok', `✅ ${cliente.nome} importado!\n👤 ${match.username}${match.exp_date ? ' | 📅 ' + isoParaBR(match.exp_date) : ''}`)
347:     } catch (err: any) {
348:       mostrarMsgPainel('erro', `❌ Erro ao importar ${cliente.nome}:\n${err.message}`)
349:     } finally {
350:       setImportandoId(null)
351:     }
352:   }
353: 
354:   // ---- Renovar Elite ----
355:   const renovarClienteElite = async (cliente: Cliente, meses: number = 1) => {
356:     setRenovandoId(cliente.id)
357:     try {
358:       const username = cliente.usuario?.trim()
359:       if (!username) throw new Error('Cliente sem usuário. Use o botão Importar primeiro.')
360: 
361:       const linhas = await buscarLinhasElite()
362:       const linha = linhas.find((l: any) => l.username === username)
363:       if (!linha) throw new Error(`Usuário "${username}" não encontrado no painel Elite.`)
364: 
365:       const renovarRes = await fetch(`${BACKEND_URL}/elite/renovar`, {
366:         method: 'POST',
367:         headers: { 'Content-Type': 'application/json' },
368:         body: JSON.stringify({
          id:   linha.id,
          tipo: linha.tipo ?? cliente.tipo ?? 'IPTV',
          meses,
          nome:     cliente.nome,
          telefone: cliente.telefone,
          usuario:  cliente.usuario,
          senha:    cliente.senha,
        }),
369:       })
370:       const renovarData = await renovarRes.json()
371:       if (!renovarRes.ok) throw new Error(renovarData?.error ?? 'Falha ao renovar no Elite.')
372: 
373:       // Elite IPTV retorna new_exp_date: "25/05/2026 23:59"
374:       // Elite P2P  retorna new_end_time: "2026-07-25 23:30:00"
375:       const rawDate = renovarData?.new_exp_date ?? renovarData?.new_end_time
376:       if (!rawDate) throw new Error('Renovação feita mas data não retornada pelo painel.')
377: 
378:       // Detecta formato pela presença de '-' no início (ISO) ou '/' (BR)
379:       const novaDataStr = rawDate.includes('-')
380:         ? isoParaBR(rawDate)       // "2026-07-25 23:30:00" → "25/07/2026"
381:         : dtBRParaBR(rawDate)      // "25/05/2026 23:59"    → "25/05/2026"
382: 
383:       await updateDoc(doc(db, 'clientes', cliente.id), { vencimento: novaDataStr })
384:       // Limpa cache para próxima renovação buscar datas atualizadas
385:       setLinhasEliteCache([])
386:       mostrarMsgPainel('ok', `✅ ${cliente.nome} renovado! (${meses} ${meses === 1 ? 'mês' : 'meses'})\n👤 ${username} | 📅 ${novaDataStr}`)
387:     } catch (err: any) {
388:       mostrarMsgPainel('erro', `❌ Erro ao renovar ${cliente.nome}:\n${err.message}`)
389:     } finally {
390:       setRenovandoId(null)
391:     }
392:   }
393: 
394:   // ---- Sincronizar Central ----
395:   const sincronizarCentral = async () => {
396:     setSincronizandoCentral(true)
397:     setSyncCentralResult(null)
398:     try {
399:       const res = await fetch(`${BACKEND_URL}/central/sincronizar`)
400:       if (!res.ok) throw new Error(`HTTP ${res.status}`)
401:       const data = await res.json()
402:       const linhas: any[] = data.linhas ?? []
403:       setLinhasCentralCache(linhas)
404: 
405:       let atualizados = 0
406:       for (const cliente of clientes) {
407:         if (!isCentral(cliente.servidor)) continue
408:         const linha = matchCentral(cliente, linhas)
409:         if (!linha) continue
410:         const updates: any = {}
411:         if (linha.username && linha.username !== cliente.usuario) updates.usuario = linha.username
412:         if (linha.password && linha.password !== cliente.senha) updates.senha = linha.password
413:         if (linha.exp_date && linha.exp_date !== cliente.vencimento) updates.vencimento = linha.exp_date
414:         if (Object.keys(updates).length > 0) {
415:           await updateDoc(doc(db, 'clientes', cliente.id), updates)
416:           atualizados++
417:         }
418:       }
419:       setSyncCentralResult({ tipo: 'ok', msg: `Central sincronizado: ${atualizados} cliente(s) atualizado(s)` })
420:     } catch (e: any) {
421:       setSyncCentralResult({ tipo: 'erro', msg: `Erro Central: ${e.message}` })
422:     } finally {
423:       setSincronizandoCentral(false)
424:     }
425:   }
426: 
427:   const importarCentral = async (cliente: Cliente) => {
428:     setImportandoId(cliente.id)
429:     try {
430:       let linhas = linhasCentralCache
431:       if (linhas.length === 0) {
432:         const res = await fetch(`${BACKEND_URL}/central/sincronizar`)
433:         const data = await res.json()
434:         linhas = data.linhas ?? []
435:         setLinhasCentralCache(linhas)
436:       }
437:       const linha = matchCentral(cliente, linhas)
438:       if (!linha) throw new Error('Cliente não encontrado no Central')
439:       await updateDoc(doc(db, 'clientes', cliente.id), {
440:         usuario:    linha.username ?? cliente.usuario,
441:         senha:      linha.password ?? cliente.senha,
442:         vencimento: linha.exp_date ?? cliente.vencimento,
443:       })
444:       mostrarMsgPainel('ok', `Central: ${cliente.nome} importado com sucesso!`)
445:     } catch (e: any) {
446:       mostrarMsgPainel('erro', `Erro ao importar ${cliente.nome}: ${e.message}`)
447:     } finally {
448:       setImportandoId(null)
449:     }
450:   }
451: 
452:     // ---- Modal de período ----
453:   const abrirModalRenovar = (cliente: Cliente) => {
454:     setClienteParaRenovar(cliente)
455:     setPeriodoRenovar((isElite(cliente.servidor) || isCentral(cliente.servidor)) ? 1 : 30)
456:     setModalRenovar(true)
457:   }
458: 
459:   const confirmarRenovar = async () => {
460:     if (!clienteParaRenovar) return
461:     setModalRenovar(false)
462:     if (isCentral(clienteParaRenovar.servidor)) {
463:       const res = await fetch(`${BACKEND_URL}/central/renovar`, {
464:         method: 'POST',
465:         headers: { 'Content-Type': 'application/json' },
466:         body: JSON.stringify({
          id:       clienteParaRenovar.usuario,
          meses:    periodoRenovar,
          nome:     clienteParaRenovar.nome,
          telefone: clienteParaRenovar.telefone,
          usuario:  clienteParaRenovar.usuario,
          senha:    clienteParaRenovar.senha,
        }),
467:       })
468:       const data = await res.json()
469:       if (!res.ok || !data.success) throw new Error(data.error ?? 'Falha ao renovar no Central')
470:       const novaData = data.exp_date
471:       if (novaData) await updateDoc(doc(db, 'clientes', clienteParaRenovar.id), { vencimento: novaData })
472:       mostrarMsgPainel('ok', `Central: ${clienteParaRenovar.nome} renovado até ${novaData ?? ''}`)
473:     } else if (isElite(clienteParaRenovar.servidor)) {
474:       await renovarClienteElite(clienteParaRenovar, periodoRenovar)
475:     } else {
476:       await renovarClienteWarez(clienteParaRenovar, periodoRenovar / 30)
477:     }
478:   }
479: 
480:   // ---- JSX ----
481:   return (
482:     <div>
483:       {/* Header */}
484:       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
485:         <div>
486:           <h1 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>Clientes</h1>
487:           <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontSize: '14px' }}>{clientes.length} clientes cadastrados</p>
488:         </div>
489:         <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
490: 
491:           {/* Sincronizar Warez */}
492:           <button onClick={sincronizarWWPanel} disabled={sincronizandoWarez} style={{
493:             display: 'flex', alignItems: 'center', gap: '8px',
494:             background: sincronizandoWarez ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.15)',
495:             color: sincronizandoWarez ? 'rgba(255,255,255,0.3)' : '#60a5fa',
496:             border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px',
497:             padding: '12px 20px', cursor: sincronizandoWarez ? 'not-allowed' : 'pointer',
498:             fontWeight: 'bold', fontSize: '14px',
499:           }}>
500:             <RefreshCw size={18} style={{ animation: sincronizandoWarez ? 'spin 1s linear infinite' : 'none' }} />
501:             {sincronizandoWarez ? 'Sincronizando...' : 'Sincronizar Warez'}
502:           </button>
503: 
504:           {/* Sincronizar Central */}
505:           <button
506:             onClick={sincronizarCentral}
507:             disabled={sincronizandoCentral}
508:             style={{
509:               display: 'flex', alignItems: 'center', gap: '8px',
510:               padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(234,179,8,0.4)',
511:               background: sincronizandoCentral ? 'rgba(255,255,255,0.05)' : 'rgba(234,179,8,0.15)',
512:               color: sincronizandoCentral ? 'rgba(255,255,255,0.3)' : '#facc15',
513:               cursor: sincronizandoCentral ? 'not-allowed' : 'pointer',
514:               fontWeight: '600', fontSize: '14px',
515:             }}
516:           >
517:             <RefreshCw size={16} className={sincronizandoCentral ? 'spin' : ''} />
518:             {sincronizandoCentral ? 'Sincronizando...' : 'Sincronizar Central'}
519:           </button>
520: 
521:           {/* Sincronizar Elite */}
522:           <button onClick={sincronizarElite} disabled={sincronizandoElite} style={{
523:             display: 'flex', alignItems: 'center', gap: '8px',
524:             background: sincronizandoElite ? 'rgba(255,255,255,0.05)' : 'rgba(168,85,247,0.15)',
525:             color: sincronizandoElite ? 'rgba(255,255,255,0.3)' : '#c084fc',
526:             border: '1px solid rgba(168,85,247,0.3)', borderRadius: '12px',
527:             padding: '12px 20px', cursor: sincronizandoElite ? 'not-allowed' : 'pointer',
528:             fontWeight: 'bold', fontSize: '14px',
529:           }}>
530:             <RefreshCw size={18} style={{ animation: sincronizandoElite ? 'spin 1s linear infinite' : 'none' }} />
531:             {sincronizandoElite ? 'Sincronizando...' : 'Sincronizar Elite'}
532:           </button>
533: 
534:           {/* Novo Cliente */}
535:           <button onClick={() => abrirModal()} style={{
536:             display: 'flex', alignItems: 'center', gap: '8px',
537:             background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white',
538:             border: 'none', borderRadius: '12px', padding: '12px 20px',
539:             cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
540:           }}>
541:             <Plus size={18} /> Novo Cliente
542:           </button>
543:         </div>
544:       </div>
545: 
546:       {/* Mensagem painel */}
547:       {msgPainel && (
548:         <div style={{
549:           marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
550:           background: msgPainel.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
551:           border: msgPainel.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
552:           color: msgPainel.tipo === 'ok' ? '#4ade80' : '#f87171',
553:           fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
554:         }}>
555:           {msgPainel.msg}
556:         </div>
557:       )}
558: 
559:       {/* Resultado sync Warez */}
560:       {syncResult && (
561:         <div style={{
562:           marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
563:           background: syncResult.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
564:           border: syncResult.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
565:           color: syncResult.tipo === 'ok' ? '#4ade80' : '#f87171',
566:           fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
567:         }}>
568:           {syncResult.msg}
569:         </div>
570:       )}
571: 
572:       {/* Resultado sync Elite */}
573:       {syncEliteResult && (
574:         <div style={{
575:           marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
576:           background: syncEliteResult.tipo === 'ok' ? 'rgba(168,85,247,0.15)' : 'rgba(239,68,68,0.15)',
577:           border: syncEliteResult.tipo === 'ok' ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(239,68,68,0.3)',
578:           color: syncEliteResult.tipo === 'ok' ? '#c084fc' : '#f87171',
579:           fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
580:         }}>
581:           {syncEliteResult.msg}
582:         </div>
583:       )}
584: 
585:       {_syncCentralResult && (
586:         <div style={{
587:           marginBottom: '16px', padding: '14px 18px', borderRadius: '12px',
588:           background: _syncCentralResult.tipo === 'ok' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
589:           border: _syncCentralResult.tipo === 'ok' ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(239,68,68,0.3)',
590:           color: _syncCentralResult.tipo === 'ok' ? '#facc15' : '#f87171',
591:           fontWeight: '600', fontSize: '13px', whiteSpace: 'pre-wrap',
592:         }}>
593:           {_syncCentralResult.msg}
594:         </div>
595:       )}
596: 
597:       {/* Busca */}
598:       <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
599:         <Search size={18} color="rgba(255,255,255,0.4)" />
600:         <input
601:           value={busca}
602:           onChange={e => setBusca(e.target.value)}
603:           placeholder="Buscar por nome, telefone, servidor, usuário..."
604:           style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '15px', flex: 1 }}
605:         />
606:         {busca && (
607:           <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
608:             <X size={16} />
609:           </button>
610:         )}
611:       </div>
612: 
613:       {/* Tabela */}
614:       <div className="glass-card" style={{ overflowX: 'auto' }}>
615:         <table style={{ width: '100%', borderCollapse: 'collapse' }}>
616:           <thead>
617:             <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
618:               {['NOME','TELEFONE','TIPO','SERVIDOR','USUÁRIO','SENHA','VENCIMENTO','VALOR','STATUS','OBS',''].map(col => (
619:                 <th key={col} style={{
620:                   padding: '8px 10px', textAlign: 'left',
621:                   color: 'rgba(255,255,255,0.4)', fontSize: '10px',
622:                   fontWeight: '700', letterSpacing: '0.06em', whiteSpace: 'nowrap',
623:                 }}>{col}</th>
624:               ))}
625:             </tr>
626:           </thead>
627:           <tbody>
628:             {clientesFiltrados.length === 0 ? (
629:               <tr>
630:                 <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
631:                   {busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
632:                 </td>
633:               </tr>
634:             ) : clientesFiltrados.map(c => (
635:               <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
636:                 onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
637:                 onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
638:               >
639:                 <td style={{ padding: '8px 10px', color: 'white', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome || '—'}</td>
640:                 <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.55)', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.telefone || '—'}</td>
641:                 <td style={{ padding: '8px 10px' }}>
642:                   {c.tipo ? (
643:                     <span style={{
644:                       padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
645:                       background: c.tipo === 'P2P' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)',
646:                       color: c.tipo === 'P2P' ? '#c084fc' : '#60a5fa',
647:                       border: c.tipo === 'P2P' ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(59,130,246,0.4)',
648:                     }}>{c.tipo}</span>
649:                   ) : '—'}
650:                 </td>
651:                 <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.7)', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.servidor || '—'}</td>
652:                 <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.usuario || '—'}</td>
653:                 <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.senha || '—'}</td>
654:                 <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
655:                   <span style={{ color: corVencimento(c.vencimento), fontWeight: '600', fontSize: '11px' }}>
656:                     {formatarData(c.vencimento)}
657:                   </span>
658:                 </td>
659:                 <td style={{ padding: '8px 10px', color: '#4ade80', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>
660:                   {c.valor ? `R$ ${parseFloat(c.valor).toFixed(2).replace('.', ',')}` : '—'}
661:                 </td>
662:                 <td style={{ padding: '8px 10px' }}>
663:                   <span style={{
664:                     padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '600',
665:                     background: c.status === 'ativo' ? 'rgba(34,197,94,0.15)' : c.status === 'suspenso' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
666:                     color: c.status === 'ativo' ? '#4ade80' : c.status === 'suspenso' ? '#fbbf24' : '#f87171',
667:                     border: c.status === 'ativo' ? '1px solid rgba(34,197,94,0.3)' : c.status === 'suspenso' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(239,68,68,0.3)',
668:                   }}>
669:                     {c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : '—'}
670:                   </span>
671:                 </td>
672:                 <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.4)', fontSize: '11px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
673:                   {c.obs || '—'}
674:                 </td>
675: 
676:                 {/* Ações — dropdown */}
677:                 <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
678:                   <div style={{ position: 'relative', display: 'inline-block' }}>
679:                     {/* Botão ⋮ */}
680:                     <button
681:                       onClick={(e) => { e.stopPropagation(); setMenuAbertoId(menuAbertoId === c.id ? null : c.id) }}
682:                       style={{
683:                         width: '32px', height: '32px', borderRadius: '8px', border: 'none',
684:                         cursor: 'pointer', background: 'rgba(255,255,255,0.08)',
685:                         color: 'rgba(255,255,255,0.7)', fontSize: '18px', fontWeight: 'bold',
686:                         display: 'flex', alignItems: 'center', justifyContent: 'center',
687:                         lineHeight: 1,
688:                       }}
689:                     >⋮</button>
690: 
691:                     {/* Menu dropdown */}
692:                     {menuAbertoId === c.id && (
693:                       <div
694:                         onClick={(e) => e.stopPropagation()}
695:                         style={{
696:                           position: 'absolute', right: 0, top: '38px', zIndex: 500,
697:                           background: '#1e1e30', border: '1px solid rgba(255,255,255,0.12)',
698:                           borderRadius: '10px', padding: '6px', minWidth: '160px',
699:                           boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
700:                         }}
701:                       >
702:                         {/* Importar Central */}
703:                         {isCentral(c.servidor) && (
704:                           <button
705:                             onClick={() => { setMenuAbertoId(null); importarCentral(c) }}
706:                             disabled={importandoId === c.id}
707:                             style={{
708:                               width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
709:                               cursor: 'pointer', background: 'transparent', textAlign: 'left',
710:                               color: '#facc15', fontSize: '13px', fontWeight: '600',
711:                               display: 'flex', alignItems: 'center', gap: '8px',
712:                             }}
713:                             onMouseEnter={e => (e.currentTarget.style.background = 'rgba(234,179,8,0.1)')}
714:                             onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
715:                           >
716:                             <Download size={13} /> {importandoId === c.id ? 'Importando...' : 'Importar Central'}
717:                           </button>
718:                         )}
719: 
720:                         {/* Importar Elite */}
721:                         {isElite(c.servidor) && (
722:                           <button
723:                             onClick={() => { setMenuAbertoId(null); importarElite(c) }}
724:                             disabled={importandoId === c.id}
725:                             style={{
726:                               width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
727:                               cursor: 'pointer', background: 'transparent', textAlign: 'left',
728:                               color: '#4ade80', fontSize: '13px', fontWeight: '600',
729:                               display: 'flex', alignItems: 'center', gap: '8px',
730:                             }}
731:                             onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.1)')}
732:                             onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
733:                           >
734:                             <Download size={13} /> {importandoId === c.id ? 'Importando...' : 'Importar Elite'}
735:                           </button>
736:                         )}
737: 
738:                         {/* Renovar */}
739:                         {(isWarez(c.servidor) || isElite(c.servidor) || isCentral(c.servidor)) && (
740:                           <button
741:                             onClick={() => { setMenuAbertoId(null); abrirModalRenovar(c) }}
742:                             disabled={renovandoId === c.id}
743:                             style={{
744:                               width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
745:                               cursor: 'pointer', background: 'transparent', textAlign: 'left',
746:                               color: isCentral(c.servidor) ? '#facc15' : isElite(c.servidor) ? '#c084fc' : '#60a5fa',
747:                               fontSize: '13px', fontWeight: '600',
748:                               display: 'flex', alignItems: 'center', gap: '8px',
749:                             }}
750:                             onMouseEnter={e => (e.currentTarget.style.background = isCentral(c.servidor) ? 'rgba(234,179,8,0.1)' : isElite(c.servidor) ? 'rgba(168,85,247,0.1)' : 'rgba(59,130,246,0.1)')}
751:                             onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
752:                           >
753:                             <RefreshCw size={13} /> {renovandoId === c.id ? 'Renovando...' : 'Renovar'}
754:                           </button>
755:                         )}
756: 
757:                         {/* Separador */}
758:                         <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
759: 
760:                         {/* Editar */}
761:                         <button
762:                           onClick={() => { setMenuAbertoId(null); abrirModal(c) }}
763:                           style={{
764:                             width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
765:                             cursor: 'pointer', background: 'transparent', textAlign: 'left',
766:                             color: '#818cf8', fontSize: '13px', fontWeight: '600',
767:                             display: 'flex', alignItems: 'center', gap: '8px',
768:                           }}
769:                           onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
770:                           onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
771:                         >
772:                           <Pencil size={13} /> Editar
773:                         </button>
774: 
775:                         {/* Excluir */}
776:                         <button
777:                           onClick={() => { setMenuAbertoId(null); excluirCliente(c.id) }}
778:                           style={{
779:                             width: '100%', padding: '9px 12px', borderRadius: '7px', border: 'none',
780:                             cursor: 'pointer', background: 'transparent', textAlign: 'left',
781:                             color: '#f87171', fontSize: '13px', fontWeight: '600',
782:                             display: 'flex', alignItems: 'center', gap: '8px',
783:                           }}
784:                           onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
785:                           onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
786:                         >
787:                           <Trash2 size={13} /> Excluir
788:                         </button>
789:                       </div>
790:                     )}
791:                   </div>
792:                 </td>
793:               </tr>
794:             ))}
795:           </tbody>
796:         </table>
797:       </div>
798: 
799:       {/* ===== MODAL PERÍODO DE RENOVAÇÃO ===== */}
800:       {modalRenovar && clienteParaRenovar && (
801:         <div
802:           style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
803:           onClick={e => { if (e.target === e.currentTarget) setModalRenovar(false) }}
804:         >
805:           <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
806:             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
807:               <h2 style={{ color: 'white', fontWeight: 'bold', fontSize: '18px', margin: 0 }}>Renovar Assinatura</h2>
808:               <button onClick={() => setModalRenovar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
809:                 <X size={20} />
810:               </button>
811:             </div>
812:             <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '20px', marginTop: '4px' }}>
813:               Cliente: <strong style={{ color: 'white' }}>{clienteParaRenovar.nome}</strong>
814:             </p>
815:             <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
816:               Selecione o período
817:             </p>
818:             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '28px' }}>
819:               {(isElite(clienteParaRenovar.servidor)
820:                 ? [{ label: '1 mês', value: 1 }, { label: '2 meses', value: 2 }, { label: '3 meses', value: 3 }, { label: '6 meses', value: 6 }]
821:                 : [{ label: '30 dias', value: 30 }, { label: '60 dias', value: 60 }, { label: '90 dias', value: 90 }, { label: '180 dias', value: 180 }]
822:               ).map(opt => {
823:                 const eliteClient = isElite(clienteParaRenovar.servidor)
824:                 const selected = periodoRenovar === opt.value
825:                 return (
826:                   <button key={opt.value} onClick={() => setPeriodoRenovar(opt.value)} style={{
827:                     padding: '14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'all 0.15s',
828:                     background: selected ? (eliteClient ? 'rgba(168,85,247,0.35)' : 'rgba(59,130,246,0.35)') : 'rgba(255,255,255,0.06)',
829:                     border: selected ? (eliteClient ? '1px solid rgba(168,85,247,0.7)' : '1px solid rgba(59,130,246,0.7)') : '1px solid rgba(255,255,255,0.1)',
830:                     color: selected ? (eliteClient ? '#c084fc' : '#60a5fa') : 'rgba(255,255,255,0.55)',
831:                   }}>
832:                     {opt.label}
833:                   </button>
834:                 )
835:               })}
836:             </div>
837:             <div style={{ display: 'flex', gap: '12px' }}>
838:               <button onClick={() => setModalRenovar(false)} style={{
839:                 flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)',
840:                 background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
841:               }}>Cancelar</button>
842:               <button onClick={confirmarRenovar} style={{
843:                 flex: 1, padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'white',
844:                 background: isCentral(clienteParaRenovar.servidor) ? 'linear-gradient(135deg,#eab308,#ca8a04)' : isElite(clienteParaRenovar.servidor) ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
845:                 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
846:               }}>
847:                 <Check size={16} /> Confirmar
848:               </button>
849:             </div>
850:           </div>
851:         </div>
852:       )}
853: 
854:       {/* ===== MODAL CADASTRO/EDIÇÃO ===== */}
855:       {modalAberto && (
856:         <div
857:           style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
858:           onClick={e => { if (e.target === e.currentTarget) fecharModal() }}
859:         >
860:           <div className="glass-card" style={{ width: '100%', maxWidth: '560px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
861:             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
862:               <h2 style={{ color: 'white', fontWeight: 'bold', fontSize: '20px', margin: 0 }}>
863:                 {(clienteEditando as any).id ? 'Editar Cliente' : 'Novo Cliente'}
864:               </h2>
865:               <button onClick={fecharModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
866:                 <X size={20} />
867:               </button>
868:             </div>
869:             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
870:               {([
871:                 { label: 'Nome', field: 'nome', type: 'text' },
872:                 { label: 'Telefone', field: 'telefone', type: 'text' },
873:                 { label: 'Servidor', field: 'servidor', type: 'text' },
874:                 { label: 'Vencimento (DD/MM/AAAA)', field: 'vencimento', type: 'text' },
875:                 { label: 'Usuário', field: 'usuario', type: 'text' },
876:                 { label: 'Senha', field: 'senha', type: 'text' },
877:                 { label: 'Valor (R$)', field: 'valor', type: 'number' },
878:                 { label: 'Obs.', field: 'obs', type: 'text' },
879:               ] as { label: string; field: keyof Omit<Cliente, 'id'>; type: string }[]).map(({ label, field, type }) => (
880:                 <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
881:                   <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
882:                   <input
883:                     type={type}
884:                     value={(clienteEditando as any)[field] || ''}
885:                     onChange={e => setClienteEditando(prev => ({ ...prev, [field]: e.target.value }))}
886:                     style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' }}
887:                   />
888:                 </div>
889:               ))}
890:               <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
891:                 <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</label>
892:                 <select value={clienteEditando.tipo} onChange={e => setClienteEditando(prev => ({ ...prev, tipo: e.target.value }))}
893:                   style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' }}>
894:                   <option value="IPTV" style={{ background: '#1a1a2e' }}>IPTV</option>
895:                   <option value="P2P" style={{ background: '#1a1a2e' }}>P2P</option>
896:                 </select>
897:               </div>
898:               <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
899:                 <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
900:                 <select value={clienteEditando.status} onChange={e => setClienteEditando(prev => ({ ...prev, status: e.target.value }))}
901:                   style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' }}>
902:                   <option value="ativo" style={{ background: '#1a1a2e' }}>Ativo</option>
903:                   <option value="suspenso" style={{ background: '#1a1a2e' }}>Suspenso</option>
904:                   <option value="inativo" style={{ background: '#1a1a2e' }}>Inativo</option>
905:                 </select>
906:               </div>
907:             </div>
908:             <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
909:               <button onClick={fecharModal} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Cancelar</button>
910:               <button onClick={salvarCliente} disabled={carregando} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', cursor: carregando ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'white', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
911:                 <Check size={16} /> {carregando ? 'Salvando...' : 'Salvar'}
912:               </button>
913:             </div>
914:           </div>
915:         </div>
916:       )}
917:     </div>
918:   )
919: }