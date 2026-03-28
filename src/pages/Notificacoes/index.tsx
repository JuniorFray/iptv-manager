 1: import { useEffect, useState, useRef } from 'react'
 2: import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore'
 3: import { db } from '../../firebase'
 4: import { Send, Users, CheckCircle, Plus, Trash2, X, BookOpen, Wifi, WifiOff, QrCode, Settings, Clock, CheckCircle2, XCircle, Play, Save, RefreshCw } from 'lucide-react'
 5: import axios from 'axios'
 6: 
 7: const API = 'https://iptv-manager-production.up.railway.app'
 8: 
 9: interface Cliente { id: string; nome: string; telefone: string; servidor: string; tipo: string; status: string; vencimento: string; valor: string }
10: interface ModeloMensagem { id: string; titulo: string; texto: string }
11: interface LogEntry { id: string; clienteNome: string; telefone: string; gatilho: string; mensagem: string; status: string; data: string; hora: string }
12: interface Regra { ativo: boolean; mensagem: string }
13: interface Config {
14:   horario: string
15:   ativo: boolean
16:   intervaloMs: number
17:   regras: { dias7: Regra; dias4: Regra; dia0: Regra; pos1: Regra; pos3: Regra }
18: }
19: interface FilaItem {
20:   id: string
21:   clienteNome: string
22:   telefone: string
23:   gatilho: string
24:   mensagem: string
25:   status: 'pendente' | 'enviando' | 'enviado' | 'erro' | 'cancelado'
26:   tentativas: number
27:   maxTentativas: number
28:   erro: string | null
29: }
30: 
31: function parseData(v: string): Date | null {
32:   if (!v) return null
33:   const p = v.split('/')
34:   if (p.length !== 3) return null
35:   return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]))
36: }
37: 
38: function diferencaDias(d: Date): number {
39:   const h = new Date(); h.setHours(0, 0, 0, 0)
40:   const a = new Date(d); a.setHours(0, 0, 0, 0)
41:   return Math.round((a.getTime() - h.getTime()) / 86400000)
42: }
43: 
44: const filtros = [
45:   { id: 'todos',    label: 'Todos os Clientes',    cor: '34d399', bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.3)'  },
46:   { id: 'venchoje', label: 'Vencendo Hoje',        cor: 'f87171', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)'   },
47:   { id: 'venc4',    label: 'Vencendo em 4 dias',   cor: 'fbbf24', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)'  },
48:   { id: 'venc7',    label: 'Vencendo em 7 dias',   cor: '818cf8', bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.3)'  },
49:   { id: 'vencidos', label: 'Vencidos',             cor: 'ef4444', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)'   },
50:   { id: 'manual',   label: 'Mensagem Manual',      cor: '60a5fa', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.3)'  },
51: ]
52: 
53: const intervalos = [
54:   { label: '1 segundo',   valor: 1000  },
55:   { label: '2 segundos',  valor: 2000  },
56:   { label: '3 segundos',  valor: 3000  },
57:   { label: '5 segundos',  valor: 5000  },
58:   { label: '10 segundos', valor: 10000 },
59:   { label: '30 segundos', valor: 30000 },
60: ]
61: 
62: const REGRAS_INFO = [
63:   { key: 'dias7', label: '7 dias antes',         cor: '59,130,246' },
64:   { key: 'dias4', label: '4 dias antes',         cor: '251,191,36' },
65:   { key: 'dia0',  label: 'No dia do vencimento', cor: '239,68,68'  },
66:   { key: 'pos1',  label: '1 dia após vencer',    cor: '168,85,247' },
67:   { key: 'pos3',  label: '3 dias após vencer',   cor: '239,68,68'  },
68: ]
69: 
70: const VARIAVEIS = ['NOME', 'VENCIMENTO', 'SERVIDOR', 'VALOR']
71: 
72: export default function Notificacoes() {
73:   const [clientes, setClientes]           = useState<Cliente[]>([])
74:   const [modelos, setModelos]             = useState<ModeloMensagem[]>([])
75:   const [filtro, setFiltro]               = useState('todos')
76:   const [clienteSel, setClienteSel]       = useState<Cliente | null>(null)
77:   const [mensagem, setMensagem]           = useState('')
78:   const [template, setTemplate]           = useState('')
79:   const [busca, setBusca]                 = useState('')
80:   const [intervalo, setIntervalo]         = useState(2000)
81:   const [modalModelo, setModalModelo]     = useState(false)
82:   const [novoTitulo, setNovoTitulo]       = useState('')
83:   const [novoTexto, setNovoTexto]         = useState('')
84:   const [enviando, setEnviando]           = useState(false)
85:   const [progresso, setProgresso]         = useState(0)
86:   const [whatsReady, setWhatsReady]       = useState(false)
87:   const [qrCode, setQrCode]               = useState<string | null>(null)
88:   const [mostrarQR, setMostrarQR]         = useState(false)
89:   const [resultado, setResultado]         = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
90:   const [aba, setAba]                     = useState<'manual' | 'auto' | 'fila' | 'log'>('manual')
91:   const [logs, setLogs]                   = useState<LogEntry[]>([])
92:   const [salvando, setSalvando]           = useState(false)
93:   const [saved, setSaved]                 = useState(false)
94:   const [disparando, setDisparando]       = useState(false)
95:   const [desconectando, setDesconectando] = useState(false)
96:   const [fila, setFila]                   = useState<FilaItem[]>([])
97:   const [carregandoFila, setCarregandoFila] = useState(false)
98:   const [numero, setNumero] = useState('Detectando...')
99: 
100:   const [config, setConfig] = useState<Config>({
101:     horario: '09:00',
102:     ativo: true,
103:     intervaloMs: 5000,
104:     regras: {
105:       dias7: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 7 dias, no dia VENCIMENTO. Entre em contato com antecedência para não perder o acesso! 🙏' },
106:       dias4: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 4 dias, no dia VENCIMENTO. Não deixe para a última hora, entre em contato para renovar!' },
107:       dia0:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence HOJE! Entre em contato agora para não perder o acesso. Valor: VALOR' },
108:       pos1:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR venceu ontem (VENCIMENTO). Entre em contato para regularizar e reativar seu acesso!' },
109:       pos3:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR está vencida há 3 dias (VENCIMENTO). Regularize seu acesso o quanto antes!' },
110:     },
111:   })
112: 
113:   const intervalRef = useRef<any>(null)
114:   const prevReady   = useRef(false)
115:   const prevQr      = useRef('')
116: 
117:   const inputStyle = {
118:     width: '100%', padding: '10px 14px', borderRadius: '10px',
119:     border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
120:     color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const,
121:   }
122: 
123:   useEffect(() => {
124:     const u1 = onSnapshot(collection(db, 'clientes'), s => setClientes(s.docs.map(d => ({ id: d.id, ...d.data() } as Cliente))))
125:     const u2 = onSnapshot(collection(db, 'modelosMensagens'), s => setModelos(s.docs.map(d => ({ id: d.id, ...d.data() } as ModeloMensagem))))
126:     return () => { u1(); u2() }
127:   }, [])
128: 
129:   useEffect(() => {
130:     const verificar = async () => {
131:       try {
132:         const res = await fetch(`${API}/status`)
133:         const data = await res.json()
134:         if (data.ready !== prevReady.current) { prevReady.current = data.ready; setWhatsReady(data.ready) }
135:         if (data.numero !== undefined) { setNumero(data.numero) }
136:         const qr = data.qr
137:         if (!data.ready && qr && qr !== prevQr.current) { prevQr.current = qr; setQrCode(qr) }
138:       } catch {
139:         if (prevReady.current) { prevReady.current = false; setWhatsReady(false) }
140:       }
141:     }
142:     verificar()
143:     intervalRef.current = setInterval(verificar, 5000)
144:     return () => clearInterval(intervalRef.current)
145:   }, [])
146: 
147:   useEffect(() => {
148:     axios.get(`${API}/config`).then(res => setConfig(res.data)).catch(() => {})
149:   }, [])
150: 
151:   const carregarLogs = async () => {
152:     try { const res = await axios.get(`${API}/logs`); setLogs(res.data) } catch {}
153:   }
154: 
155:   const carregarFila = async () => {
156:     setCarregandoFila(true)
157:     try { const res = await axios.get(`${API}/fila`); setFila(res.data) }
158:     finally { setCarregandoFila(false) }
159:   }
160: 
161:   const retryItem = async (id: string) => {
162:     await axios.post(`${API}/fila/${id}/retry`)
163:     carregarFila()
164:   }
165: 
166:   const cancelarItem = async (id: string) => {
167:     await axios.post(`${API}/fila/${id}/cancelar`)
168:     carregarFila()
169:   }
170: 
171:   const limparHistorico = async () => {
    if (!window.confirm('Limpar todo o histórico de mensagens enviadas?')) return
    try {
      await axios.delete(`${API}/logs`)
      setLogs([])
    } catch (err: any) {
      alert('Erro ao limpar histórico: ' + (err.message ?? ''))
    }
  }

  const limparFila = async () => {
172:     await axios.post(`${API}/fila/limpar`)
173:     carregarFila()
174:   }
175: 
176:   const filtroAtual = filtros.find(f => f.id === filtro)!
177: 
178:   const clientesFiltrados = (() => {
179:     let lista = clientes.filter(c => c.telefone)
180: 
181:     if (filtro === 'venchoje') {
182:       lista = lista.filter(c => {
183:         const d = parseData(c.vencimento)
184:         return d ? diferencaDias(d) === 0 : false
185:       })
186:     } else if (filtro === 'venc4') {
187:       lista = lista.filter(c => {
188:         const d = parseData(c.vencimento)
189:         return d ? diferencaDias(d) === 4 : false
190:       })
191:     } else if (filtro === 'venc7') {
192:       lista = lista.filter(c => {
193:         const d = parseData(c.vencimento)
194:         return d ? diferencaDias(d) === 7 : false
195:       })
196:     } else if (filtro === 'vencidos') {
197:       lista = lista.filter(c => {
198:         const d = parseData(c.vencimento)
199:         return d ? diferencaDias(d) < 0 : false
200:       })
201:     }
202: 
203:     if (busca) {
204:       lista = lista.filter(
205:         c =>
206:           c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
207:           c.telefone?.includes(busca),
208:       )
209:     }
210: 
211:     return lista
212:   })()
213: 
214:   const substituir = (texto: string, c: Cliente) => {
215:     const valor = c.valor ? `R$ ${parseFloat(c.valor).toFixed(2).replace('.', ',')}` : ''
216:     return texto
217:       .replace(/NOME/gi, c.nome).replace(/VENCIMENTO/gi, c.vencimento)
218:       .replace(/SERVIDOR/gi, c.servidor).replace(/VALOR/gi, valor)
219:   }
220: 
221:   const formatarTelefone = (tel: string) => {
222:     let num = tel.replace(/\D/g, '')
223:     if (num.startsWith('5555')) num = num.substring(2)
224:     else if (!num.startsWith('55')) num = '55' + num
225:     return num
226:   }
227: 
228:   const salvarModelo = async () => {
229:     if (!novoTitulo.trim() || !novoTexto.trim()) return
230:     await addDoc(collection(db, 'modelosMensagens'), { titulo: novoTitulo, texto: novoTexto })
231:     setNovoTitulo(''); setNovoTexto(''); setModalModelo(false)
232:   }
233: 
234:   const excluirModelo = async (id: string) => {
235:     if (confirm('Excluir este modelo?')) await deleteDoc(doc(db, 'modelosMensagens', id))
236:   }
237: 
238:   const aplicarModelo = (m: ModeloMensagem) => {
239:     setTemplate(m.texto)
240:     setMensagem(clienteSel ? substituir(m.texto, clienteSel) : m.texto)
241:   }
242: 
243:   const enviarUm = async () => {
244:     if (!clienteSel || !mensagem.trim()) return
245:     try {
246:       const res = await fetch(`${API}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: formatarTelefone(clienteSel.telefone), message: substituir(mensagem, clienteSel) }) })
247:       const data = await res.json()
248:       if (data.success) setResultado({ tipo: 'ok', msg: `Mensagem enviada para ${clienteSel.nome}!` })
249:       else setResultado({ tipo: 'erro', msg: data.error || 'Erro ao enviar.' })
250:     } catch { setResultado({ tipo: 'erro', msg: 'Backend offline.' }) }
251:     setTimeout(() => setResultado(null), 4000)
252:   }
253: 
254:   const enviarTodos = async () => {
255:     if (enviando || clientesFiltrados.length === 0 || !mensagem.trim()) return
256:     setEnviando(true); setProgresso(0)
257:     const base = template || mensagem
258:     for (let i = 0; i < clientesFiltrados.length; i++) {
259:       const c = clientesFiltrados[i]
260:       try { await fetch(`${API}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: formatarTelefone(c.telefone), message: substituir(base, c) }) }) } catch {}
261:       setProgresso(i + 1)
262:       await new Promise(r => setTimeout(r, intervalo))
263:     }
264:     setEnviando(false)
265:     setResultado({ tipo: 'ok', msg: 'Envio concluído!' })
266:     setTimeout(() => setResultado(null), 4000)
267:   }
268: 
269:   const salvarConfig = async () => {
270:     if (!config) return
271:     setSalvando(true)
272:     try { await axios.post(`${API}/config`, config); setSaved(true); setTimeout(() => setSaved(false), 3000) }
273:     finally { setSalvando(false) }
274:   }
275: 
276:   const dispararAgora = async () => {
277:     setDisparando(true)
278:     try {
279:       await axios.post(`${API}/send-automatico`)
280:       await carregarLogs()
281:       setResultado({ tipo: 'ok', msg: 'Disparo automático executado! Mensagens adicionadas na fila.' })
282:       setTimeout(() => setResultado(null), 4000)
283:     } finally { setDisparando(false) }
284:   }
285: 
286:   const updateRegra = (key: string, field: string, value: any) => {
287:     if (!config) return
288:     setConfig({ ...config, regras: { ...config.regras, [key]: { ...config.regras[key as keyof typeof config.regras], [field]: value } } })
289:   }
290: 
291:   const desconectarWhatsApp = async () => {
292:     setDesconectando(true)
293:     try { await axios.post(`${API}/logout`) } catch {}
294:     setDesconectando(false); setMostrarQR(false)
295:   }
296: 
297:   const gatilhoLabel = (key: string) => REGRAS_INFO.find(r => r.key === key)?.label || key
298:   const gatilhoCor   = (key: string) => REGRAS_INFO.find(r => r.key === key)?.cor || '255,255,255'
299: 
300:   const statusFilaConfig: Record<string, { cor: string; label: string }> = {
301:     pendente:  { cor: '251,191,36',  label: '⏳ Pendente'   },
302:     enviando:  { cor: '59,130,246',  label: '📤 Enviando'   },
303:     enviado:   { cor: '34,197,94',   label: '✅ Enviado'    },
304:     erro:      { cor: '239,68,68',   label: '❌ Erro'       },
305:     cancelado: { cor: '156,163,175', label: '🚫 Cancelado'  },
306:   }
307: 
308:   return (
309:     <div>
310:       {/* Header */}
311:       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
312:         <div>
313:           <h1 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>WhatsApp</h1>
314:           <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontSize: '14px' }}>Envie notificações para seus clientes</p>
315:         </div>
316:         <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
317:           <div onClick={() => setMostrarQR(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', background: whatsReady ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: whatsReady ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)' }}>
318:             {whatsReady ? (
319:               <>
320:                 <Wifi size={16} color="#4ade80" />
321:                 <span style={{ color: '#4ade80', fontSize: '13px', fontWeight: 600 }}>
322:                   Conectado: <strong>{numero || 'Detectando...'}</strong>
323:                 </span>
324:               </>
325:             ) : (
326:               <>
327:                 <WifiOff size={16} color="#f87171" />
328:                 <span style={{ color: '#f87171', fontSize: '13px', fontWeight: '600' }}>Desconectado</span>
329:                 <QrCode size={14} color="#f87171" />
330:               </>
331:             )}
332:           </div>
333:           <button onClick={() => setModalModelo(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 18px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
334:             <Plus size={16} /> Novo Modelo
335:           </button>
336:         </div>
337:       </div>
338: 
339:       {/* Resultado */}
340:       {resultado && (
341:         <div style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '12px', background: resultado.tipo === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: resultado.tipo === 'ok' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: resultado.tipo === 'ok' ? '#4ade80' : '#f87171', fontWeight: '600', fontSize: '14px' }}>
342:           {resultado.msg}
343:         </div>
344:       )}
345: 
346:       {/* Abas */}
347:       <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
348:         {[
349:           { key: 'manual', label: 'Envio Manual',     icon: <Send size={15} />     },
350:           { key: 'auto',   label: 'Envio Automático', icon: <Settings size={15} /> },
351:           { key: 'fila',   label: 'Fila',             icon: <RefreshCw size={15} /> },
352:           { key: 'log',    label: 'Histórico',        icon: <Clock size={15} />    },
353:         ].map(a => (
354:           <button key={a.key} onClick={() => { setAba(a.key as any); if (a.key === 'log') carregarLogs(); if (a.key === 'fila') carregarFila() }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', background: aba === a.key ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)', border: aba === a.key ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)', color: aba === a.key ? 'white' : 'rgba(255,255,255,0.5)' }}>
355:             {a.icon}{a.label}
356:           </button>
357:         ))}
358:       </div>
359: 
360:       {/* ── ABA MANUAL ── */}
361:       {aba === 'manual' && (
362:         <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
363:           <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
364:             <div className="glass-card" style={{ padding: '20px' }}>
365:               <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Filtrar Clientes</h3>
366:               <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
367:                 {filtros.map(f => (
368:                   <button key={f.id} onClick={() => { setFiltro(f.id); setClienteSel(null); setBusca('') }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', background: filtro === f.id ? f.bg : 'rgba(255,255,255,0.03)', border: filtro === f.id ? `1px solid ${f.border}` : '1px solid rgba(255,255,255,0.06)', color: filtro === f.id ? `#${f.cor}` : 'rgba(255,255,255,0.5)', fontWeight: filtro === f.id ? '600' : '400', fontSize: '14px' }}>
369:                     {f.label}
370:                     <span style={{ marginLeft: 'auto', color: filtro === f.id ? `#${f.cor}` : 'rgba(255,255,255,0.3)', fontSize: '12px', fontWeight: '700' }}>
371:                       {f.id === 'venchoje'
372:                         ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false }).length
373:                         : f.id === 'venc4'
374:                         ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false }).length
375:                         : f.id === 'venc7'
376:                         ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false }).length
377:                         : f.id === 'vencidos'
378:                         ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) < 0 : false }).length
379:                         : clientes.filter(c => c.telefone).length}
380:                     </span>
381:                   </button>
382:                 ))}
383:               </div>
384:             </div>
385: 
386:             <div className="glass-card" style={{ padding: '20px' }}>
387:               <h3 style={{ color: 'white', margin: '0 0 12px', fontSize: '15px' }}>Selecionar Cliente</h3>
388:               <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." style={{ ...inputStyle, marginBottom: '10px' }} />
389:               <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
390:                 {clientesFiltrados.length === 0
391:                   ? <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', padding: '16px 0', margin: 0 }}>Nenhum cliente</p>
392:                   : clientesFiltrados.map(c => (
393:                     <button key={c.id} onClick={() => { setClienteSel(c); if (template) setMensagem(substituir(template, c)) }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', background: clienteSel?.id === c.id ? filtroAtual.bg : 'rgba(255,255,255,0.03)', border: clienteSel?.id === c.id ? `1px solid ${filtroAtual.border}` : '1px solid rgba(255,255,255,0.06)', color: 'white', textAlign: 'left' }}>
394:                       <div>
395:                         <span style={{ fontSize: '14px', fontWeight: '500' }}>{c.nome}</span>
396:                         <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{c.telefone}</span>
397:                       </div>
398:                       {clienteSel?.id === c.id && <CheckCircle size={14} color={`#${filtroAtual.cor}`} />}
399:                     </button>
400:                   ))}
401:               </div>
402:             </div>
403:           </div>
404: 
405:           <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
406:             <div className="glass-card" style={{ padding: '20px' }}>
407:               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
408:                 <BookOpen size={18} color="#818cf8" />
409:                 <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>Modelos Salvos</h3>
410:               </div>
411:               {modelos.length === 0
412:                 ? <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', margin: 0 }}>Nenhum modelo salvo ainda.</p>
413:                 : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
414:                   {modelos.map(m => (
415:                     <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '6px 12px' }}>
416:                       <button onClick={() => aplicarModelo(m)} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: 0 }}>{m.titulo}</button>
417:                       <button onClick={() => excluirModelo(m.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', padding: 0, display: 'flex' }}><Trash2 size={12} /></button>
418:                     </div>
419:                   ))}
420:                 </div>}
421:             </div>
422: 
423:             <div className="glass-card" style={{ padding: '20px' }}>
424:               <h3 style={{ color: 'white', margin: '0 0 14px', fontSize: '15px' }}>Editar Mensagem</h3>
425:               <textarea value={mensagem} onChange={e => { setMensagem(e.target.value); setTemplate(e.target.value) }} placeholder="Selecione um modelo ou escreva sua mensagem. Use NOME, VENCIMENTO, SERVIDOR, VALOR." rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }} />
426:               <button onClick={enviarUm} disabled={!clienteSel || !mensagem.trim() || !whatsReady} style={{ width: '100%', marginTop: '12px', padding: '13px', borderRadius: '12px', border: 'none', cursor: !clienteSel || !mensagem.trim() || !whatsReady ? 'not-allowed' : 'pointer', background: !clienteSel || !mensagem.trim() || !whatsReady ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#25d366,#128c7e)', color: !clienteSel || !mensagem.trim() || !whatsReady ? 'rgba(255,255,255,0.3)' : 'white', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
427:                 <Send size={18} /> {!whatsReady ? 'WhatsApp desconectado' : `Enviar para ${clienteSel ? clienteSel.nome : '...'}`}
428:               </button>
429:             </div>
430: 
431:             <div className="glass-card" style={{ padding: '20px' }}>
432:               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
433:                 <Users size={18} color={`#${filtroAtual.cor}`} />
434:                 <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>Envio em Massa</h3>
435:               </div>
436:               <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '14px' }}>
437:                 <div style={{ flex: 1 }}>
438:                   <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Intervalo entre envios</label>
439:                   <select value={intervalo} onChange={e => setIntervalo(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer' }}>
440:                     {intervalos.map(i => <option key={i.valor} value={i.valor} style={{ background: '#1e1e2e' }}>{i.label}</option>)}
441:                   </select>
442:                 </div>
443:                 <div style={{ background: filtroAtual.bg, border: `1px solid ${filtroAtual.border}`, borderRadius: '10px', padding: '10px 16px', textAlign: 'center' }}>
444:                   <span style={{ color: `#${filtroAtual.cor}`, fontWeight: 'bold', fontSize: '18px' }}>{clientesFiltrados.length}</span>
445:                   <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', display: 'block' }}>clientes</span>
446:                 </div>
447:               </div>
448:               {enviando && (
449:                 <div style={{ marginBottom: '14px' }}>
450:                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
451:                     <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Enviando...</span>
452:                     <span style={{ color: `#${filtroAtual.cor}`, fontSize: '13px', fontWeight: '600' }}>{progresso}/{clientesFiltrados.length}</span>
453:                   </div>
454:                   <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '99px', height: '6px' }}>
455:                     <div style={{ width: `${(progresso / clientesFiltrados.length) * 100}%`, height: '100%', background: `#${filtroAtual.cor}`, borderRadius: '99px' }} />
456:                   </div>
457:                 </div>
458:               )}
459:               <button onClick={enviarTodos} disabled={enviando || clientesFiltrados.length === 0 || !mensagem.trim() || !whatsReady} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: `1px solid ${filtroAtual.border}`, background: enviando || !whatsReady ? 'rgba(255,255,255,0.05)' : filtroAtual.bg, color: enviando || !whatsReady ? 'rgba(255,255,255,0.3)' : `#${filtroAtual.cor}`, cursor: enviando || !whatsReady ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
460:                 <Send size={16} /> {enviando ? 'Enviando...' : `Enviar para todos (${clientesFiltrados.length})`}
461:               </button>
462:             </div>
463:           </div>
464:         </div>
465:       )}
466: 
467:       {/* ── ABA AUTOMÁTICO ── */}
468:       {aba === 'auto' && (
469:         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
470:           <div className="glass-card" style={{ padding: '24px' }}>
471:             <h3 style={{ color: 'white', margin: '0 0 20px', fontSize: '16px', fontWeight: '600' }}>Configurações Gerais</h3>
472:             <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
473:               <div>
474:                 <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Horário de envio diário</label>
475:                 <input type="time" value={config.horario} onChange={e => setConfig({ ...config, horario: e.target.value })} style={{ ...inputStyle, width: '140px' }} />
476:               </div>
477:               <div>
478:                 <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>⏱️ Intervalo entre mensagens</label>
479:                 <select value={config.intervaloMs ?? 5000} onChange={e => setConfig({ ...config, intervaloMs: Number(e.target.value) })} style={{ ...inputStyle, width: '200px', cursor: 'pointer' }}>
480:                   <option value={3000}  style={{ background: '#1e1e2e' }}>3 segundos (rápido)</option>
481:                   <option value={5000}  style={{ background: '#1e1e2e' }}>5 segundos (padrão)</option>
482:                   <option value={10000} style={{ background: '#1e1e2e' }}>10 segundos (seguro)</option>
483:                   <option value={15000} style={{ background: '#1e1e2e' }}>15 segundos</option>
484:                   <option value={30000} style={{ background: '#1e1e2e' }}>30 segundos (lento)</option>
485:                   <option value={60000} style={{ background: '#1e1e2e' }}>1 minuto (muito lento)</option>
486:                 </select>
487:                 <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '4px 0 0 2px' }}>Evita bloqueio por spam no WhatsApp</p>
488:               </div>
489:               <div>
490:                 <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Envio automático</label>
491:                 <div style={{ display: 'flex', gap: '8px' }}>
492:                   {[{ v: true, l: 'Ativado' }, { v: false, l: 'Desativado' }].map(({ v, l }) => (
493:                     <button key={String(v)} onClick={() => setConfig({ ...config, ativo: v })} style={{ padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', background: config.ativo === v ? (v ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.05)', border: config.ativo === v ? (v ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(239,68,68,0.6)') : '1px solid rgba(255,255,255,0.1)', color: config.ativo === v ? (v ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.4)' }}>{l}</button>
494:                   ))}
495:                 </div>
496:               </div>
497:               <div>
498:                 <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Disparar agora</label>
499:                 <button onClick={dispararAgora} disabled={disparando || !whatsReady} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', cursor: disparando || !whatsReady ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '13px', background: disparando || !whatsReady ? 'rgba(255,255,255,0.05)' : 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.4)', color: disparando || !whatsReady ? 'rgba(255,255,255,0.3)' : '#a5b4fc' }}>
500:                   <Play size={14} /> {disparando ? 'Disparando...' : 'Executar agora'}
501:                 </button>
502:               </div>
503:               <div style={{ marginLeft: 'auto' }}>
504:                 <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '4px' }}>Variáveis disponíveis:</p>
505:                 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
506:                   {VARIAVEIS.map(v => (
507:                     <span key={v} style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}>{v}</span>
508:                   ))}
509:                 </div>
510:               </div>
511:             </div>
512:           </div>
513: 
514:           {REGRAS_INFO.map(({ key, label, cor }) => {
515:             const regra = config.regras[key as keyof typeof config.regras]
516:             return (
517:               <div key={key} className="glass-card" style={{ padding: '24px', borderLeft: `3px solid rgba(${cor},0.6)` }}>
518:                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
519:                   <span style={{ background: `rgba(${cor},0.15)`, border: `1px solid rgba(${cor},0.3)`, color: `rgb(${cor})`, padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>{label}</span>
520:                   <div style={{ display: 'flex', gap: '8px' }}>
521:                     {[{ v: true, l: 'Ativo' }, { v: false, l: 'Inativo' }].map(({ v, l }) => (
522:                       <button key={String(v)} onClick={() => updateRegra(key, 'ativo', v)} style={{ padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', background: regra.ativo === v ? (v ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.05)', border: regra.ativo === v ? (v ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(239,68,68,0.6)') : '1px solid rgba(255,255,255,0.1)', color: regra.ativo === v ? (v ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.4)' }}>{l}</button>
523:                     ))}
524:                   </div>
525:                 </div>
526:                 <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Mensagem</label>
527:                 <textarea value={regra.mensagem} onChange={e => updateRegra(key, 'mensagem', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
528:               </div>
529:             )
530:           })}
531: 
532:           <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
533:             <button onClick={salvarConfig} disabled={salvando} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: saved ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#3b82f6,#6366f1)', border: saved ? '1px solid rgba(34,197,94,0.5)' : 'none', color: 'white', borderRadius: '12px', padding: '12px 28px', cursor: salvando ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', opacity: salvando ? 0.6 : 1 }}>
534:               <Save size={16} /> {saved ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar Configurações'}
535:             </button>
536:           </div>
537:         </div>
538:       )}
539: 
540:       {/* ── ABA FILA ── */}
541:       {aba === 'fila' && (
542:         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
543: 
544:           {/* Cards resumo */}
545:           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
546:             {[
547:               { label: 'Pendente', status: 'pendente', cor: '251,191,36', emoji: '⏳' },
548:               { label: 'Enviando', status: 'enviando', cor: '59,130,246', emoji: '📤' },
549:               { label: 'Enviado',  status: 'enviado',  cor: '34,197,94',  emoji: '✅' },
550:               { label: 'Erro',     status: 'erro',     cor: '239,68,68',  emoji: '❌' },
551:             ].map(({ label, status, cor, emoji }) => (
552:               <div key={status} className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
553:                 <div style={{ fontSize: '28px', marginBottom: '6px' }}>{emoji}</div>
554:                 <div style={{ color: `rgb(${cor})`, fontWeight: 'bold', fontSize: '28px' }}>
555:                   {fila.filter(f => f.status === status).length}
556:                 </div>
557:                 <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginTop: '2px' }}>{label}</div>
558:               </div>
559:             ))}
560:           </div>
561: 
562:           {/* Tabela da fila */}
563:           <div className="glass-card" style={{ overflow: 'hidden' }}>
564:             <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
565:               <h3 style={{ color: 'white', margin: 0, fontSize: '16px', fontWeight: '600' }}>
566:                 Fila de Envios <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '400' }}>({fila.length})</span>
567:               </h3>
568:               <div style={{ display: 'flex', gap: '8px' }}>
569:                 <button onClick={carregarFila} disabled={carregandoFila} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
570:                   <RefreshCw size={13} /> {carregandoFila ? 'Carregando...' : 'Atualizar'}
571:                 </button>
572:                 <button onClick={limparFila} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
573:                   Limpar concluídos
574:                 </button>
575:               </div>
576:             </div>
577:             <div style={{ overflowX: 'auto' }}>
578:               <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
579:                 <thead>
580:                   <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
581:                     {['Cliente', 'Gatilho', 'Tentativas', 'Status', 'Erro', 'Ações'].map(h => (
582:                       <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
583:                     ))}
584:                   </tr>
585:                 </thead>
586:                 <tbody>
587:                   {fila.length === 0
588:                     ? <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Fila vazia. Dispare o envio automático para popular.</td></tr>
589:                     : fila.map(item => {
590:                       const sc = statusFilaConfig[item.status] ?? statusFilaConfig.pendente
591:                       return (
592:                         <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
593:                           <td style={{ padding: '12px 16px', color: 'white', fontWeight: '500' }}>
594:                             {item.clienteNome}
595:                             <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{item.telefone}</span>
596:                           </td>
597:                           <td style={{ padding: '12px 16px' }}>
598:                             <span style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>
599:                               {gatilhoLabel(item.gatilho)}
600:                             </span>
601:                           </td>
602:                           <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)', fontSize: '13px', textAlign: 'center' }}>
603:                             {item.tentativas}/{item.maxTentativas}
604:                           </td>
605:                           <td style={{ padding: '12px 16px' }}>
606:                             <span style={{ background: `rgba(${sc.cor},0.15)`, border: `1px solid rgba(${sc.cor},0.3)`, color: `rgb(${sc.cor})`, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
607:                               {sc.label}
608:                             </span>
609:                           </td>
610:                           <td style={{ padding: '12px 16px', color: '#f87171', fontSize: '12px', maxWidth: '160px' }}>
611:                             <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.erro || ''}>
612:                               {item.erro || '—'}
613:                             </span>
614:                           </td>
615:                           <td style={{ padding: '12px 16px' }}>
616:                             <div style={{ display: 'flex', gap: '6px' }}>
617:                               {item.status === 'erro' && (
618:                                 <button onClick={() => retryItem(item.id)} style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
619:                                   Retry
620:                                 </button>
621:                               )}
622:                               {item.status === 'pendente' && (
623:                                 <button onClick={() => cancelarItem(item.id)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
624:                                   Cancelar
625:                                 </button>
626:                               )}
627:                             </div>
628:                           </td>
629:                         </tr>
630:                       )
631:                     })}
632:                 </tbody>
633:               </table>
634:             </div>
635:           </div>
636:         </div>
637:       )}
638: 
639:       {/* ── ABA LOG ── */}
640:       {aba === 'log' && (
641:         <div className="glass-card" style={{ overflow: 'hidden' }}>
642:           <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
643:             <h3 style={{ color: 'white', margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>Histórico de Envios</h3>
644:             <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={carregarLogs} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>Atualizar</button>
              <button onClick={limparHistorico} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>Limpar histórico</button>
            </div>
645:           </div>
646:           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
647:             <thead>
648:               <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
649:                 {['Data/Hora', 'Cliente', 'Telefone', 'Gatilho', 'Status'].map(h => (
650:                   <th key={h} style={{ padding: '10px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
651:                 ))}
652:               </tr>
653:             </thead>
654:             <tbody>
655:               {logs.length === 0
656:                 ? <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Nenhum envio registrado.</td></tr>
657:                 : logs.map(log => {
658:                   const cor = gatilhoCor(log.gatilho)
659:                   return (
660:                     <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
661:                       <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{log.data} {log.hora}</td>
662:                       <td style={{ padding: '12px 20px', color: 'white', fontWeight: '500' }}>{log.clienteNome}</td>
663:                       <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{log.telefone}</td>
664:                       <td style={{ padding: '12px 20px' }}>
665:                         <span style={{ background: `rgba(${cor},0.15)`, border: `1px solid rgba(${cor},0.3)`, color: `rgb(${cor})`, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>{gatilhoLabel(log.gatilho)}</span>
666:                       </td>
667:                       <td style={{ padding: '12px 20px' }}>
668:                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: log.status === 'enviado' ? '#4ade80' : '#f87171' }}>
669:                           {log.status === 'enviado' ? <CheckCircle size={14} /> : <XCircle size={14} />}
670:                           {log.status === 'enviado' ? 'Enviado' : 'Erro'}
671:                         </span>
672:                       </td>
673:                     </tr>
674:                   )
675:                 })}
676:             </tbody>
677:           </table>
678:         </div>
679:       )}
680: 
681:       {/* Modal QR */}
682:       {mostrarQR && (
683:         <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
684:           <div className="glass-card" style={{ padding: '32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
685:             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
686:               <h2 style={{ color: 'white', margin: 0, fontSize: '20px' }}>Conectar WhatsApp</h2>
687:               <button onClick={() => setMostrarQR(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}><X size={20} /></button>
688:             </div>
689:             {whatsReady ? (
690:               <div style={{ padding: '24px' }}>
691:                 <CheckCircle2 size={48} color="#4ade80" style={{ marginBottom: '12px' }} />
692:                 <p style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '16px', marginBottom: '20px' }}>WhatsApp Conectado!</p>
693:                 <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
694:                   <button onClick={() => setMostrarQR(false)} style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#25d366,#128c7e)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Fechar</button>
695:                   <button onClick={desconectarWhatsApp} disabled={desconectando} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: '#f87171', cursor: desconectando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: desconectando ? 0.6 : 1 }}>
696:                     <WifiOff size={14} /> {desconectando ? 'Desconectando...' : 'Desconectar'}
697:                   </button>
698:                 </div>
699:               </div>
700:             ) : qrCode ? (
701:               <div>
702:                 <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '20px' }}>Abra o WhatsApp, vá em Aparelhos conectados e escaneie</p>
703:                 <img src={qrCode} alt="QR Code" style={{ width: '260px', height: '260px', borderRadius: '16px', background: 'white', padding: '8px' }} />
704:               </div>
705:             ) : (
706:               <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', padding: '24px' }}>Aguardando backend...</p>
707:             )}
708:           </div>
709:         </div>
710:       )}
711: 
712:       {/* Modal Novo Modelo */}
713:       {modalModelo && (
714:         <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
715:           <div className="glass-card" style={{ padding: '32px', width: '100%', maxWidth: '480px' }}>
716:             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
717:               <h2 style={{ color: 'white', margin: 0, fontSize: '20px' }}>Novo Modelo</h2>
718:               <button onClick={() => setModalModelo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}><X size={20} /></button>
719:             </div>
720:             <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
721:               <div>
722:                 <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Nome</label>
723:                 <input value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} className="input-glass" placeholder="Ex: Aviso de Vencimento" />
724:               </div>
725:               <div>
726:                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
727:                   <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>Texto</label>
728:                   <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
729:                     {VARIAVEIS.map(v => (
730:                       <span key={v} onClick={() => setNovoTexto(t => t + v)} style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer' }} title="Clique para inserir">{v}</span>
731:                     ))}
732:                   </div>
733:                 </div>
734:                 <textarea value={novoTexto} onChange={e => setNovoTexto(e.target.value)} placeholder="Ex: Olá NOME! Seu plano vence em VENCIMENTO." rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }} />
735:               </div>
736:               <div style={{ display: 'flex', gap: '12px' }}>
737:                 <button onClick={() => setModalModelo(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Cancelar</button>
738:                 <button onClick={salvarModelo} disabled={!novoTitulo.trim() || !novoTexto.trim()} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white', cursor: 'pointer', fontWeight: 'bold', opacity: !novoTitulo.trim() || !novoTexto.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
739:                   <Plus size={16} /> Salvar
740:                 </button>
741:               </div>
742:             </div>
743:           </div>
744:         </div>
745:       )}
746:     </div>
747:   )
748: }