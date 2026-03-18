# 🚀 Deploy

## Backend — Railway
- Builder: Nixpacks (Node 20)
- Start: node server.js
- Porta: 3001
- Restart: On failure, máx 10 tentativas

### Variável obrigatória
SERVICE_ACCOUNT_KEY = JSON da service account Firebase

### Índice Firestore obrigatório
Coleção: filaEnvios
Campos: status (ASC) + proximaTentativa (ASC)

## Frontend — Netlify
- Build: npm run build
- Publish: dist/
- Redirects: public/_redirects → /* /index.html 200

## Primeiro Acesso
1. Deploy backend no Railway
2. Adicionar SERVICE_ACCOUNT_KEY nas variáveis
3. Aguardar "Servidor rodando na porta 3001" nos logs
4. Abrir frontend → Aba WhatsApp → Conectar WhatsApp
5. Escanear QR Code → sessão salva em auth_info/
6. Configurar regras de envio automático e salvar
