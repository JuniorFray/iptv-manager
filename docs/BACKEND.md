# ⚙️ Backend — API REST

Base URL: https://iptv-manager-production.up.railway.app
Porta: 3001 | Runtime: Node.js 20 (ESM)

## Variáveis de Ambiente

| Variável              | Descrição                             |
|-----------------------|---------------------------------------|
| SERVICE_ACCOUNT_KEY   | JSON da service account Firebase      |

## Endpoints

### WhatsApp
| Método | Rota     | Descrição                           |
|--------|----------|-------------------------------------|
| GET    | /status  | Retorna { ready, qr, numero }       |
| POST   | /send    | Envia mensagem { phone, message }   |
| POST   | /logout  | Desconecta sessão WhatsApp          |

### Envio Automático
| Método | Rota              | Descrição                          |
|--------|-------------------|------------------------------------|
| POST   | /send-automatico  | Dispara varredura e popula a fila  |

### Configuração
| Método | Rota     | Descrição                                  |
|--------|----------|--------------------------------------------|
| GET    | /config  | Retorna configuração atual                 |
| POST   | /config  | Salva configuração e reinicia o cron       |

### Fila de Envios
| Método | Rota                 | Descrição                          |
|--------|----------------------|------------------------------------|
| GET    | /fila                | Lista 200 itens mais recentes      |
| POST   | /fila/:id/retry      | Recoloca item como pendente        |
| POST   | /fila/:id/cancelar   | Marca item como cancelado          |
| POST   | /fila/limpar         | Remove enviados e cancelados       |

### Histórico
| Método | Rota   | Descrição                        |
|--------|--------|----------------------------------|
| GET    | /logs  | Retorna 100 últimos logs         |
