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
- Descoberto que a API requer os parâmetros completos do DataTables (sem eles retorna 500)
- Corrigido o CSRF token: usar `<meta name="csrf-token">` (curto), não o cookie `XSRF-TOKEN` (longo)
- Endpoints corretos descobertos via inspeção do Network do browser:
  - Listagem: `GET /dashboard/iptv?draw=1&columns[...]`
  - Renovar: `POST /api/iptv/renewone/{id}` e `POST /api/p2p/renewone/{id}`
- Adicionado lock de login para evitar logins simultâneos
- Tratamento de manutenção do servidor
- Ver `docs/ELITE_INTEGRACAO_V2.md`

### Frontend

#### Página Clientes — Melhorias
- Sincronizar Elite agora também atualiza vencimento
- Botão **Importar Elite** por linha (força importação mesmo com usuário preenchido)
- Renovação Elite: corrigido parsing de data (`new_exp_date` e `new_end_time`)
- Matching Elite: busca por username primeiro, nome como fallback
- Ações em dropdown ⋮ (menu compacto por linha)
- Tabela compacta com todas as colunas visíveis
- Layout com `marginLeft: 176px` para o menu lateral

#### Menu Lateral
- Largura reduzida de 240px para 176px
- Ícones e fontes levemente menores para ganhar espaço
