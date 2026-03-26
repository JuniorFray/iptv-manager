# WhatsApp — Sessão Persistida no Firestore

**Data:** Março 2026

## Problema

O Railway tem **filesystem efêmero** — a pasta `authinfo/` onde o Baileys salvava a sessão era apagada a cada deploy. Resultado: a cada deploy o WhatsApp desconectava e era necessário escanear o QR novamente.

## Solução

Substituição de `useMultiFileAuthState('authinfo')` por uma implementação customizada `useFirestoreAuthState()` que persiste tudo na coleção `whatsapp_auth` do Firestore.

### Implementação

```js
const useFirestoreAuthState = async () => {
  const col = db.collection('whatsapp_auth')

  const writeData = async (id, data) => {
    await col.doc(id).set({ data: JSON.stringify(data, BufferJSON.replacer) })
  }
  const readData = async (id) => {
    const snap = await col.doc(id).get()
    if (!snap.exists) return null
    return JSON.parse(snap.data().data, BufferJSON.reviver)
  }
  const removeData = async (id) => { await col.doc(id).delete() }

  const creds = (await readData('creds')) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => { /* lê do Firestore */ },
        set: async (data) => { /* salva no Firestore */ }
      }
    },
    saveCreds: () => writeData('creds', creds)
  }
}
```

### Coleção no Firestore

| Documento | Conteúdo |
|-----------|----------|
| `creds` | Credenciais principais da sessão |
| `pre-key-{n}` | Pre-keys criptográficas |
| `session-{id}` | Sessões individuais |
| `app-state-sync-*` | Estado de sincronização |

## Tratamento de Desconexões

| Código | Causa | Ação |
|--------|-------|------|
| 440 | Outra sessão conectou | Limpa Firestore + reconecta (novo QR) |
| 401 | Sessão inválida | Limpa Firestore + reconecta (novo QR) |
| 428 | Conexão substituída | Aguarda 15s + reconecta |
| 408 | Timeout | Aguarda 5s + reconecta |
| outros | Erro genérico | Aguarda 10s + reconecta |

## Rota `/logout`

Limpa a coleção `whatsapp_auth` completa via batch delete e reconecta para gerar novo QR.
