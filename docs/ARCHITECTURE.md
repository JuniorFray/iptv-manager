# 🏗️ Arquitetura

## Estrutura de Pastas

Sistema_TV/
├── backend/
│ ├── server.js # Servidor Express + WhatsApp
│ ├── package.json
│ ├── nixpacks.json # Config build Railway
│ └── railway.json # Config deploy Railway
├── src/
│ ├── pages/
│ │ ├── Login/
│ │ ├── Dashboard/
│ │ ├── DashboardFinanceiro/
│ │ ├── Clientes/
│ │ ├── Servidores/
│ │ └── Notificacoes/ # WhatsApp (manual, auto, fila, histórico)
│ ├── components/
│ │ └── MenuLateral.tsx
│ ├── contexts/
│ │ └── AuthContext.tsx
│ ├── firebase.ts
│ ├── App.tsx
│ └── main.tsx
└── docs/ # Esta documentação

text

## Fluxo de Dados

[Browser] → React (Vite)
├── Firebase Firestore (clientes, logs, fila)
└── Backend Railway API (WhatsApp, config)
└── Baileys → WhatsApp

text
