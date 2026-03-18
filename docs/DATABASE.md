# 🔥 Firestore — Coleções e Schemas

Projeto: sistema-tv-f237e | Banco: (default)

## clientes
| Campo      | Tipo   | Descrição                        |
|------------|--------|----------------------------------|
| nome       | string | Nome do cliente                  |
| telefone   | string | Telefone com DDD                 |
| servidor   | string | Servidor vinculado               |
| status     | string | ativo / inativo / suspenso       |
| vencimento | string | DD/MM/YYYY                       |
| valor      | string | Ex: "35.00"                      |

## filaEnvios
| Campo            | Tipo      | Descrição                              |
|------------------|-----------|----------------------------------------|
| clienteId        | string    | ID do doc em clientes                  |
| clienteNome      | string    | Nome do cliente                        |
| telefone         | string    | Telefone                               |
| mensagem         | string    | Texto final com variáveis substituídas |
| gatilho          | string    | dias7/dias4/dia0/pos1/pos3             |
| status           | string    | pendente/enviando/enviado/erro/cancelado|
| tentativas       | number    | Tentativas realizadas                  |
| maxTentativas    | number    | Limite (padrão 3)                      |
| criadoEm         | Timestamp | Criação                                |
| proximaTentativa | Timestamp | Backoff para retry                     |
| enviadoEm        | Timestamp | Data de envio                          |
| erro             | string    | Mensagem de erro                       |

> ÍNDICE OBRIGATÓRIO: status (ASC) + proximaTentativa (ASC) — Escopo: Coleção

## notificacoesEnviadas
Usada para anti-duplicata diária (mesmo gatilho não reenviar no mesmo dia).

| Campo       | Tipo      |
|-------------|-----------|
| clienteId   | string    |
| gatilho     | string    |
| data        | string YYYY-MM-DD |
| enviadoEm   | Timestamp |

## logswhatsapp
| Campo       | Tipo      |
|-------------|-----------|
| clienteNome | string    |
| telefone    | string    |
| gatilho     | string    |
| mensagem    | string    |
| status      | enviado/erro |
| enviadoEm   | Timestamp |
| data        | string    |
| hora        | string    |

## configwhatsapp (doc: principal)
| Campo       | Tipo    | Descrição                      |
|-------------|---------|--------------------------------|
| horario     | string  | Ex: "09:00"                    |
| ativo       | boolean | Liga/desliga envio automático  |
| intervaloMs | number  | Intervalo entre envios (ms)    |
| regras      | object  | dias7/dias4/dia0/pos1/pos3     |
