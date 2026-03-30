# Changelog

## [2026-03] — Refatoração e Integrações

### Backend

#### Refatoração — Modularização do server.js
- `server.js` dividido em 4 módulos: `whatsapp.js`, `warez.js`, `elite.js`, `central.js`
- Cada módulo usa factory function com injeção do `db` e `admin`
- Ver `docs/REFATORACAO_BACKEND.md`

#### WhatsApp — Sessão no Firestore
- Substituído `useMultiFileAuthState` (filesystem) por `useFirestoreAuthState` (Firestore)
- Sessão persiste entre deploys — sem necessidade de escanear QR a cada deploy
- Tratamento correto de erros 440, 401, 428
- Ver `docs/WHATSAPP_SESSAO_FIRESTORE.md`

#### Elite — Integração corrigida e funcional
- Descoberto que a API requer os parâmetros completos do DataTables
- Corrigido o CSRF token: usar `<meta name="csrf-token">` (curto), não o cookie `XSRF-TOKEN`
- Endpoints corretos descobertos via inspeção do Network
- Adicionado lock de login para evitar logins simultâneos
- Tratamento de manutenção do servidor
- Ver `docs/ELITE_INTEGRACAO_V2.md`

#### Central — Integração com CapSolver
- Login automático via Cloudflare Turnstile resolvido pelo CapSolver
- Sitekey correto: `0x4AAAAAACFhU7XJduqvbHH2` (domínio `controle.vip`)
- Token JWT salvo no Firestore, renovado automaticamente a cada 55min
- Paginação automática para buscar todos os clientes
- Conversão de `exp_date` (unix timestamp) para `DD/MM/YYYY`
- Ver `docs/CENTRAL_INTEGRACAO.md`

### Frontend

#### Página Clientes — Melhorias
- Sincronizar Elite agora também atualiza vencimento
- Botão **Importar Elite** por linha (força importação mesmo com usuário preenchido)
- Renovação Elite: corrigido parsing de data
- Matching Elite/Central: busca por username primeiro, nome como fallback
- Ações em dropdown ⋮ (menu compacto por linha)
- Tabela compacta com todas as colunas visíveis
- Layout com `marginLeft: 176px` para o menu lateral

#### Central no Frontend
- Botão **Sincronizar Central** (amarelo) no cabeçalho
- **Importar Central** no dropdown ⋮ de cada cliente Central
- **Renovar** funcionando para clientes Central
- Cores amarelas para identificar visualmente clientes Central

#### Menu Lateral
- Largura reduzida de 240px para 176px
- Ícones e fontes levemente menores para ganhar espaço

## [2026-03-30] — Mídias, Testes e Dashboard

### Frontend — Mídias (WhatsApp → aba Mídias)
- Nova aba "Mídias" com upload via clique ou drag & drop
- Suporte a imagem (JPG/PNG), áudio (.ogg/.opus), vídeo (.mp4)
- Barra de progresso em tempo real (Firebase Storage)
- Grid com preview: thumbnail imagem, player áudio, preview vídeo hover
- Exclusão com aviso se mídia estiver em uso em alguma regra
- Firebase Storage integrado direto do frontend

### Frontend — Envio Manual com Mídia
- Seleção de mídia via biblioteca ou upload na hora
- Modo de envio: junto (texto como legenda) ou separado (dois envios)
- Preview da mídia selecionada antes de enviar
- Suporte em envio individual e envio em massa

### Frontend — Envio Automático com Mídia
- Cada regra (7d, 4d, 0d, -1d, -3d) tem mídia própria opcional
- Modal de seleção da biblioteca por regra
- Modo junto/separado por regra
- Horário global + override por regra

### Frontend — Template de Renovação com Mídia
- Campo de texto editável para mensagem de renovação
- Mídia opcional com modo junto/separado
- Configurado na aba Envio Automático, salvo no Firestore

### Backend — /send-midia
- Nova rota POST para envio de mídia via Baileys
- Suporte: imagem, áudio (ptt), vídeo, documento

### Backend — Estabilidade WhatsApp
- `getMessage: async () => undefined` — elimina Bad MAC/retry receipts
- `fireInitQueries: false`
- `processandoFila = false` ao desconectar (reset de lock)
- Fila processa em 500ms após reconectar

### Backend — Créditos dos Servidores
- `GET /painel/saldo` — Warez via `/users/logged`
- `GET /elite/saldo` — Elite via scraping HTML do dashboard
- `GET /central/saldo` — Central via `/profile`

### Frontend — Dashboard: Créditos
- Cards com créditos de cada servidor (Warez, Elite, Central)
- Botão Atualizar para forçar nova consulta
- Número formatado com 2 casas decimais

### Frontend — Dashboard: Criar Teste Warez
- Botão "🧪 Criar Teste" no card WWPanel
- Modal com seleção de duração (1h, 2h, 3h, 4h)
- Popup com usuário, senha, expiração + botão "📋 Copiar tudo"

