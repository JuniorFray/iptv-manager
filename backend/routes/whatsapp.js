  1: import express from 'express'
  2: import makeWASocket, {
  3:   initAuthCreds,
  4:   BufferJSON,
  5:   fetchLatestBaileysVersion
  6: } from '@whiskeysockets/baileys'
  7: import qrcode from 'qrcode'
  8: import cron   from 'node-cron'
  9: 
 10: /**
 11:  * Módulo WhatsApp
 12:  * Responsável por: conexão Baileys, fila de envios, envio automático, crons e rotas /status /send /config /logs /fila /logout
 13:  * @param {FirebaseFirestore.Firestore} db
 14:  * @param {admin} admin  firebase-admin já inicializado
 15:  */
 16: export default function createWhatsAppRouter(db, admin) {
 17:   const router = express.Router()
 18: 
 19:   // ---- Estado da conexão ----
 20: 
 21:   let sock          = null
 22:   let qrCodeBase64  = null
 23:   let clientReady   = false
 24: 
 25:   // ---- Auth State no Firestore (persiste entre deploys) ----
 26: 
 27:   const useFirestoreAuthState = async () => {
 28:     const col = db.collection('whatsapp_auth')
 29: 
 30:     const writeData = async (id, data) => {
 31:       await col.doc(id).set({ data: JSON.stringify(data, BufferJSON.replacer) })
 32:     }
 33: 
 34:     const readData = async (id) => {
 35:       const snap = await col.doc(id).get()
 36:       if (!snap.exists) return null
 37:       return JSON.parse(snap.data().data, BufferJSON.reviver)
 38:     }
 39: 
 40:     const removeData = async (id) => {
 41:       await col.doc(id).delete()
 42:     }
 43: 
 44:     const creds = (await readData('creds')) || initAuthCreds()
 45: 
 46:     return {
 47:       state: {
 48:         creds,
 49:         keys: {
 50:           get: async (type, ids) => {
 51:             const data = {}
 52:             await Promise.all(ids.map(async (id) => {
 53:               const val = await readData(`${type}-${id}`)
 54:               data[id]  = val
 55:             }))
 56:             return data
 57:           },
 58:           set: async (data) => {
 59:             const tasks = []
 60:             for (const [type, ids] of Object.entries(data)) {
 61:               for (const [id, val] of Object.entries(ids)) {
 62:                 tasks.push(val ? writeData(`${type}-${id}`, val) : removeData(`${type}-${id}`))
 63:               }
 64:             }
 65:             await Promise.all(tasks)
 66:           }
 67:         }
 68:       },
 69:       saveCreds: () => writeData('creds', creds)
 70:     }
 71:   }
 72: 
 73:   // ---- Conexão Baileys ----
 74: 
 75:   const conectarWhatsApp = async () => {
 76:     try {
 77:       const { state, saveCreds } = await useFirestoreAuthState()
 78:       const { version }          = await fetchLatestBaileysVersion()
 79: 
 80:       sock = makeWASocket({
 81:         version,
 82:         auth: state,
 83:         printQRInTerminal: false,
 84:         generateHighQualityLinkPreview: true,
 85:         browser: ['Sistema TV', 'Chrome', '1.0'],
 86:         keepAliveIntervalMs: 30000,
 87:         connectTimeoutMs:    60000,
 88:         retryRequestDelayMs: 2000,
 89:         qrTimeout:           60000,
 90:       })
 91: 
 92:       sock.ev.on('creds.update', saveCreds)
 93: 
 94:       sock.ev.on('connection.update', async (update) => {
 95:         const { connection, lastDisconnect, qr } = update
 96: 
 97:         if (qr) {
 98:           try {
 99:             qrCodeBase64 = await qrcode.toDataURL(qr)
100:           } catch {
101:             qrCodeBase64 = null
102:           }
103:           clientReady = false
104:         }
105: 
106:         if (connection === 'close') {
107:           clientReady = false
108:           const statusCode = lastDisconnect?.error?.output?.statusCode
109:           console.log('Desconectado', statusCode)
110: 
111:           if (statusCode === 440 || statusCode === 401) {
112:             // 440 = outra sessão conectou | 401 = sessão inválida → limpar auth e pedir novo QR
113:             console.log('Sessão invalidada — limpando auth do Firestore...')
114:             try {
115:               const snap  = await db.collection('whatsapp_auth').get()
116:               const batch = db.batch()
117:               snap.docs.forEach(d => batch.delete(d.ref))
118:               await batch.commit()
119:               console.log('Auth limpo. Aguardando novo QR...')
120:             } catch (e) {
121:               console.error('Erro ao limpar auth:', e.message)
122:             }
123:             setTimeout(conectarWhatsApp, 3000)
124:           } else {
125:             const delay = statusCode === 408 ? 5000 : 10000
126:             console.log(`Reconectando em ${delay / 1000}s...`)
127:             setTimeout(conectarWhatsApp, delay)
128:           }
129:         } else if (connection === 'open') {
130:           clientReady  = true
131:           qrCodeBase64 = null
132:           console.log('WhatsApp conectado!')
133:         }
134:       })
135:     } catch (err) {
136:       console.error('Erro ao conectar WhatsApp:', err)
137:       setTimeout(conectarWhatsApp, 10000)
138:     }
139:   }
140: 
141:   // ---- Helpers ----
142: 
143:   const sleep = ms => new Promise(r => setTimeout(r, ms))
144: 
145:   const parseDate = str => {
146:     if (!str) return null
147:     const [d, m, y] = str.split('/').map(Number)
148:     if (!d || !m || !y) return null
149:     return new Date(y, m - 1, d)
150:   }
151: 
152:   const diffDias = dataStr => {
153:     const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
154:     const data = parseDate(dataStr)
155:     if (!data) return null
156:     return Math.round((data.getTime() - hoje.getTime()) / 86400000)
157:   }
158: 
159:   const formatarMensagem = (template, cliente) => {
160:     return template
161:       .replace(/NOME/gi,       cliente.nome       || '')
162:       .replace(/VENCIMENTO/gi, cliente.vencimento  || '')
163:       .replace(/SERVIDOR/gi,   cliente.servidor    || '')
164:       .replace(
165:         /VALOR/gi,
166:         cliente.valor
167:           ? `R$ ${parseFloat(cliente.valor).toFixed(2).replace('.', ',')}`
168:           : ''
169:       )
170:   }
171: 
172:   const normalizarTelefone = tel => {
173:     let num = String(tel).replace(/\D/g, '')
174:     if (num.startsWith('5555')) num = num.substring(2)
175:     else if (!num.startsWith('55')) num = '55' + num
176:     return num + '@s.whatsapp.net'
177:   }
178: 
179:   const salvarLog = async (clienteNome, telefone, gatilho, mensagem, status) => {
180:     await db.collection('logswhatsapp').add({
181:       clienteNome, telefone, gatilho, mensagem, status,
182:       enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
183:       data: new Date().toLocaleDateString('pt-BR'),
184:       hora: new Date().toLocaleTimeString('pt-BR'),
185:     })
186:   }
187: 
188:   // ---- Configuração ----
189: 
190:   const configPadrao = {
191:     horario: '09:00',
192:     ativo: true,
193:     intervaloMs: 5000,
194:     regras: {
195:       dias7: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 7 dias, no dia VENCIMENTO. Entre em contato com antecedência!' },
196:       dias4: { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence em 4 dias, no dia VENCIMENTO. Não deixe para a última hora!' },
197:       dia0:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR vence HOJE! Entre em contato agora. Valor VALOR' },
198:       pos1:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR venceu ontem VENCIMENTO. Entre em contato para reativar!' },
199:       pos3:  { ativo: true, mensagem: 'Olá NOME! Sua assinatura do servidor SERVIDOR está vencida há 3 dias VENCIMENTO. Regularize o quanto antes!' },
200:     }
201:   }
202: 
203:   const getConfig = async () => {
204:     const snap = await db.collection('configwhatsapp').doc('principal').get()
205:     if (!snap.exists) {
206:       await db.collection('configwhatsapp').doc('principal').set(configPadrao)
207:       return configPadrao
208:     }
209:     return snap.data()
210:   }
211: 
212:   // ---- Fila de Envios ----
213: 
214:   const MAX_TENTATIVAS  = 3
215:   const BACKOFF_BASE_MS = 60000
216: 
217:   const jaEnviouHoje = async (clienteId, gatilho) => {
218:     const hoje  = new Date().toISOString().split('T')[0]
219:     const snap  = await db.collection('notificacoesEnviadas')
220:       .where('clienteId', '==', clienteId)
221:       .where('gatilho',   '==', gatilho)
222:       .where('data',      '==', hoje)
223:       .limit(1).get()
224:     return !snap.empty
225:   }
226: 
227:   const adicionarNaFila = async (cliente, gatilho, mensagem) => {
228:     if (await jaEnviouHoje(cliente.id, gatilho)) {
229:       console.log(`Duplicata ignorada: ${cliente.nome} ${gatilho}`)
230:       return false
231:     }
232:     await db.collection('filaEnvios').add({
233:       clienteId:       cliente.id,
234:       clienteNome:     cliente.nome,
235:       telefone:        cliente.telefone,
236:       mensagem, gatilho,
237:       status:          'pendente',
238:       tentativas:      0,
239:       maxTentativas:   MAX_TENTATIVAS,
240:       criadoEm:        admin.firestore.FieldValue.serverTimestamp(),
241:       proximaTentativa: admin.firestore.Timestamp.now(),
242:       enviadoEm:       null,
243:       erro:            null,
244:     })
245:     console.log(`Adicionado na fila: ${cliente.nome} ${gatilho}`)
246:     return true
247:   }
248: 
249:   let processandoFila = false
250: 
251:   const processarFila = async () => {
252:     if (!clientReady || processandoFila) return
253:     processandoFila = true
254:     try {
255:       const agora    = admin.firestore.Timestamp.now()
256:       const config   = await getConfig()
257:       const intervalo = config.intervaloMs ?? 5000
258:       const snap     = await db.collection('filaEnvios')
259:         .where('status',            '==', 'pendente')
260:         .where('proximaTentativa',  '<',  agora)
261:         .orderBy('proximaTentativa')
262:         .limit(10).get()
263:       if (snap.empty) return
264:       console.log(`Processando ${snap.size} itens da fila...`)
265:       for (const docSnap of snap.docs) {
266:         if (!clientReady) { console.log('WhatsApp desconectou, pausando fila.'); break }
267:         const item = docSnap.data()
268:         const ref  = docSnap.ref
269:         await ref.update({ status: 'enviando' })
270:         try {
271:           const numero = normalizarTelefone(item.telefone)
272:           await sock.sendMessage(numero, { text: item.mensagem })
273:           await ref.update({
274:             status:    'enviado',
275:             enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
276:             erro:      null
277:           })
278:           await db.collection('notificacoesEnviadas').add({
279:             clienteId:   item.clienteId,
280:             clienteNome: item.clienteNome,
281:             gatilho:     item.gatilho,
282:             data:        new Date().toISOString().split('T')[0],
283:             enviadoEm:   admin.firestore.FieldValue.serverTimestamp(),
284:           })
285:           await salvarLog(item.clienteNome, item.telefone, item.gatilho, item.mensagem, 'enviado')
286:           console.log(`Enviado: ${item.clienteNome} ${item.gatilho}`)
287:         } catch (err) {
288:           console.error('Erro ao enviar mensagem WhatsApp:', err)
289:           const novasTentativas = (item.tentativas || 0) + 1
290:           const backoffMs       = BACKOFF_BASE_MS * Math.pow(2, novasTentativas - 1)
291:           const proximaTentativa = admin.firestore.Timestamp.fromMillis(Date.now() + backoffMs)
292:           if (novasTentativas >= MAX_TENTATIVAS) {
293:             await ref.update({ status: 'erro', tentativas: novasTentativas, erro: err.message, proximaTentativa })
294:             await salvarLog(item.clienteNome, item.telefone, item.gatilho, item.mensagem, 'erro')
295:           } else {
296:             await ref.update({ status: 'pendente', tentativas: novasTentativas, erro: err.message, proximaTentativa })
297:           }
298:         }
299:         await sleep(intervalo)
300:       }
301:     } finally {
302:       processandoFila = false
303:     }
304:   }
305: 
306:   // ---- Envio Automático ----
307: 
308:   const executarEnvioAutomatico = async () => {
309:     console.log('Iniciando envio automático...')
310:     if (!clientReady)  { console.log('WhatsApp não conectado.'); return }
311:     const config = await getConfig()
312:     if (!config.ativo) { console.log('Envio automático desativado.'); return }
313:     const snapshot = await db.collection('clientes').get()
314:     const clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
315:     const regrasMap = [
316:       { key: 'dias7', diff:  7 },
317:       { key: 'dias4', diff:  4 },
318:       { key: 'dia0',  diff:  0 },
319:       { key: 'pos1',  diff: -1 },
320:       { key: 'pos3',  diff: -3 },
321:     ]
322:     let adicionados = 0
323:     for (const cliente of clientes) {
324:       if (!cliente.telefone) continue
325:       const diff = diffDias(cliente.vencimento)
326:       if (diff === null) continue
327:       for (const { key, diff: diffAlvo } of regrasMap) {
328:         if (diff !== diffAlvo) continue
329:         const regra = config.regras?.[key]
330:         if (!regra?.ativo) continue
331:         const mensagem = formatarMensagem(regra.mensagem, cliente)
332:         const adicionou = await adicionarNaFila(cliente, key, mensagem)
333:         if (adicionou) adicionados++
334:       }
335:     }
336:     console.log(`${adicionados} mensagens adicionadas na fila.`)
337:     processarFila()
338:   }
339: 
340:   // ---- Crons ----
341: 
342:   cron.schedule('*/30 * * * * *', processarFila, { timezone: 'America/Sao_Paulo' })
343: 
344:   let cronJob = null
345:   const iniciarCron = async () => {
346:     const config = await getConfig()
347:     const [hora, minuto] = (config.horario || '09:00').split(':').map(Number)
348:     if (cronJob) cronJob.stop()
349:     cronJob = cron.schedule(
350:       `${minuto} ${hora} * * *`,
351:       executarEnvioAutomatico,
352:       { timezone: 'America/Sao_Paulo' }
353:     )
354:     console.log(`Cron agendado para ${config.horario}`)
355:   }
356: 
357:   // ---- Rotas WhatsApp ----
358: 
359:   router.get('/status', (req, res) => {
360:     try {
361:       const numero = sock?.user?.id || 'Não detectado'
362:       res.json({ qr: qrCodeBase64, ready: clientReady, numero })
363:     } catch {
364:       res.json({ qr: null, ready: false, numero: 'Erro' })
365:     }
366:   })
367: 
368:   router.post('/send', async (req, res) => {
369:     const { phone, message } = req.body
370:     if (!clientReady || !sock) return res.status(503).json({ error: 'WhatsApp não conectado' })
371:     try {
372:       await sock.sendMessage(normalizarTelefone(phone), { text: message })
373:       res.json({ success: true })
374:     } catch (err) { res.status(500).json({ error: err.message }) }
375:   })
376: 
377:   router.post('/send-automatico', async (req, res) => {
378:     await executarEnvioAutomatico()
379:     res.json({ success: true })
380:   })
381: 
382:   router.get('/config', async (req, res) => res.json(await getConfig()))
383: 
384:   router.post('/config', async (req, res) => {
385:     await db.collection('configwhatsapp').doc('principal').set(req.body, { merge: true })
386:     await iniciarCron()
387:     res.json({ success: true })
388:   })
389: 
390:   router.get('/logs', async (req, res) => {
391:     const snap = await db.collection('logswhatsapp')
392:       .orderBy('enviadoEm', 'desc').limit(100).get()
393:     res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
394:   })
395: 
396:   // ---- Rotas da Fila ----
397: 
398:   router.get('/fila', async (req, res) => {
399:     const snap = await db.collection('filaEnvios')
400:       .orderBy('criadoEm', 'desc').limit(200).get()
401:     res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
402:   })
403: 
404:   router.post('/fila/:id/retry', async (req, res) => {
405:     try {
406:       await db.collection('filaEnvios').doc(req.params.id).update({
407:         status: 'pendente', tentativas: 0, erro: null,
408:         proximaTentativa: admin.firestore.Timestamp.now(),
409:       })
410:       processarFila()
411:       res.json({ success: true })
412:     } catch (err) { res.status(500).json({ error: err.message }) }
413:   })
414: 
415:   router.post('/fila/:id/cancelar', async (req, res) => {
416:     try {
417:       await db.collection('filaEnvios').doc(req.params.id).update({ status: 'cancelado' })
418:       res.json({ success: true })
419:     } catch (err) { res.status(500).json({ error: err.message }) }
420:   })
421: 
422:   router.post('/fila/limpar', async (req, res) => {
423:     try {
424:       const snap = await db.collection('filaEnvios')
425:         .where('status', 'in', ['enviado', 'cancelado']).get()
426:       const batch = db.batch()
427:       snap.docs.forEach(d => batch.delete(d.ref))
428:       await batch.commit()
429:       res.json({ success: true, removidos: snap.size })
430:     } catch (err) { res.status(500).json({ error: err.message }) }
431:   })
432: 
433:   router.post('/logout', async (req, res) => {
434:     try {
435:       if (sock) {
436:         await sock.logout()
437:         sock = null
438:       }
439:       clientReady  = false
440:       qrCodeBase64 = null
441: 
442:       // Apagar sessão do Firestore
443:       const snap  = await db.collection('whatsapp_auth').get()
444:       const batch = db.batch()
445:       snap.docs.forEach(d => batch.delete(d.ref))
446:       await batch.commit()
447: 
448:       setTimeout(conectarWhatsApp, 2000)
449:       res.json({ success: true, msg: 'Sessão limpa. Novo QR sendo gerado...' })
450:     } catch (err) {
451:       clientReady  = false
452:       qrCodeBase64 = null
453:       setTimeout(conectarWhatsApp, 2000)
454:       res.json({ success: true, msg: 'Sessão resetada.' })
455:     }
456:   })
457: 
458:   // ---- Enviar mensagem de renovação ----

  const enviarMensagemRenovacao = async (telefone, dados) => {
    if (!telefone) {
      console.warn('[WA] enviarMensagemRenovacao: telefone vazio, ignorando')
      return
    }

    try {
      // Busca template no Firestore
      const snap = await db.collection('config_whatsapp').doc('template_renovacao').get()
      let template = snap.exists
        ? snap.data().mensagem
        : `✅ *Renovação realizada!*

Olá, *{nome}*! 🎉

Seu serviço foi renovado com sucesso.

📋 *Seus dados de acesso:*
👤 Usuário: *{usuario}*
🔑 Senha: *{senha}*
📅 Válido até: *{vencimento}*

Em caso de dúvidas, fale comigo! 😊`

      // Substitui variáveis
      const mensagem = template
        .replace(/{nome}/g,       dados.nome       ?? '')
        .replace(/{usuario}/g,    dados.usuario    ?? '')
        .replace(/{senha}/g,      dados.senha      ?? '')
        .replace(/{vencimento}/g, dados.vencimento ?? '')

      if (clientReady && sock) {
        // Envia imediatamente
        const numero = normalizarTelefone(telefone)
        await sock.sendMessage(numero, { text: mensagem })
        console.log(`[WA] ✅ Mensagem de renovação enviada para ${telefone}`)
      } else {
        // Salva na fila
        await db.collection('filaEnvios').add({
          nome:      dados.nome ?? '',
          telefone,
          mensagem,
          status:    'pendente',
          gatilho:   'renovacao',
          tentativas: 0,
          criadoEm:  new Date(),
        })
        console.log(`[WA] 📋 Renovação na fila (WA desconectado): ${dados.nome} ${telefone}`)
      }
    } catch (err) {
      console.error('[WA] Erro ao enviar mensagem de renovação:', err.message)
    }
  }

    // ---- Inicializador (chamado pelo server.js) ----
459: 
460:   const inicializar = () => {
461:     conectarWhatsApp()
462:     iniciarCron()
463:   }
464: 
465:   return { router, inicializar, enviarMensagemRenovacao }
466: }