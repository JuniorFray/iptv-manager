# 📱 WhatsApp — Integração Baileys

Biblioteca: @whiskeysockets/baileys ^6.7.0

## Sessão
- Credenciais salvas no Firestore (`whatsapp_auth`)
- Reconecta automaticamente após restart
- Browser: `['SistemaTV', 'Desktop', '1.0.0']`
- `getMessage: async () => undefined` — evita retry receipts e Bad MAC
- `fireInitQueries: false` — reduz conflitos de sessão

## Configurações de Estabilidade
```js
makeWASocket({
  syncFullHistory: false,
  shouldSyncHistoryMessage: () => false,
  getMessage: async () => undefined,
  fireInitQueries: false,
  markOnlineOnConnect: false,
  keepAliveIntervalMs: 25000,
})
```

## Reconexão 440 (sessão substituída)
- Backoff exponencial: 15s, 30s, 45s... máx 120s
- `processandoFila = false` ao desconectar (reset do lock)
- `reconexoes440` reseta após 60s conectado

## Gatilhos Automáticos

| Chave  | Condição        | Descrição                        |
|--------|-----------------|----------------------------------|
| dias7  | 7 dias antes    | Vencimento se aproximando        |
| dias4  | 4 dias antes    | Lembrete urgente                 |
| dia0   | No dia          | Vence hoje                       |
| pos1   | 1 dia após      | Vencido ontem                    |
| pos3   | 3 dias após     | Vencido há 3 dias                |

## Configuração por Regra
Cada regra suporta:
- `ativo` — toggle on/off
- `mensagem` — template com variáveis NOME, VENCIMENTO, SERVIDOR, VALOR
- `horario` — override do horário global (opcional)
- `midiaUrl` — URL da mídia no Firebase Storage (opcional)
- `midiaTipo` — imagem | audio | video | documento
- `modoEnvio` — junto (legenda) | separado (texto depois mídia)

## Crons
- Um cron por horário único (agrupa regras com mesmo horário)
- Cron de fila: a cada 10 segundos

## Fila de Envios (`filaEnvios`)
| Campo            | Tipo      | Descrição                        |
|------------------|-----------|----------------------------------|
| clienteNome      | string    | Nome do cliente                  |
| telefone         | string    | Número do WhatsApp               |
| mensagem         | string    | Texto da mensagem                |
| gatilho          | string    | dias7, dias4, dia0, renovacao... |
| midiaUrl         | string?   | URL da mídia (opcional)          |
| midiaTipo        | string?   | imagem/audio/video/documento     |
| modoEnvio        | string    | junto | separado                   |
| status           | string    | pendente/enviando/enviado/erro   |
| tentativas       | number    | Tentativas feitas                |
| maxTentativas    | number    | Máximo (padrão: 3)               |
| proximaTentativa | Timestamp | Quando tentar novamente          |

## Template de Renovação
Salvo em `config_whatsapp/template_renovacao`:
- `mensagem` — template com {usuario}, {senha}, {vencimento}
- `midiaUrl`, `midiaTipo`, `midiaNome` — mídia opcional
- `modoEnvio` — junto | separado

## Rotas WhatsApp
| Método | Rota                 | Descrição                        |
|--------|----------------------|----------------------------------|
| GET    | /status              | Status da conexão + QR           |
| POST   | /send                | Enviar texto                     |
| POST   | /send-midia          | Enviar mídia (imagem/audio/video) |
| POST   | /send-automatico     | Disparar envio automático        |
| GET    | /config              | Ler configurações                |
| POST   | /config              | Salvar configurações             |
| GET    | /logs                | Histórico de envios              |
| DELETE | /logs                | Limpar histórico                 |
| GET    | /fila                | Itens da fila                   |
| POST   | /fila/:id/retry      | Retentar item                    |
| POST   | /fila/:id/cancelar   | Cancelar item                    |
| POST   | /fila/limpar         | Limpar concluídos                |
| POST   | /logout              | Desconectar WhatsApp             |

## Envio de Mídia — /send-midia
```json
{
  "phone": "5519999999999",
  "mediaUrl": "https://firebasestorage...",
  "mediaTipo": "imagem",
  "mediaNome": "banner.jpg",
  "caption": "Texto da legenda"
}
```
- imagem → `{ image: { url }, caption }`
- audio → `{ audio: { url }, mimetype: 'audio/ogg; codecs=opus', ptt: true }`
- video → `{ video: { url }, caption }`
- documento → `{ document: { url }, fileName }`
