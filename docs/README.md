# 📺 Sistema TV — Documentação Técnica

Sistema de gerenciamento de clientes IPTV com painel web, notificações automáticas via WhatsApp e controle financeiro.

## Stack

| Camada     | Tecnologia                          |
|------------|-------------------------------------|
| Frontend   | React 18 + TypeScript + Vite        |
| Backend    | Node.js 20 + Express + Baileys      |
| Banco      | Firebase Firestore                  |
| Deploy BE  | Railway (Node 20, porta 3001)       |
| WhatsApp   | @whiskeysockets/baileys ^6.7.0      |

## Documentos

- [ARCHITECTURE.md](ARCHITECTURE.md) — Estrutura de pastas e fluxo geral
- [BACKEND.md](BACKEND.md) — Rotas da API REST
- [FRONTEND.md](FRONTEND.md) — Páginas, componentes e contextos
- [DATABASE.md](DATABASE.md) — Coleções Firestore e schemas
- [WHATSAPP.md](WHATSAPP.md) — Integração Baileys, fila e crons
- [DEPLOY.md](DEPLOY.md) — Guia de deploy Railway + Netlify
