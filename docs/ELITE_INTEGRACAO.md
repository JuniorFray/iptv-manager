# Elite — Integração Técnica (IPTV)

Data início: 23/03/2026
Última atualização: 24/03/2026
Status: ✅ IPTV funcional | 🔜 P2P pendente

---

## 1. Contexto

Integração com o painel Elite (adminx.offo.dad) para permitir:
- Sincronizar clientes IPTV do painel com o Firestore (preencher usuario + senha)
- Renovar assinatura de clientes IPTV diretamente pelo sistema, com seleção de período

---

## 2. Autenticação

O painel Elite usa autenticação por sessão Laravel (não JWT).
O fluxo exige duas requisições antes de qualquer chamada autenticada:

### Etapa 1 — Obter cookies iniciais
GET https://adminx.offo.dad/login
→ Extrai do header set-cookie: XSRF-TOKEN e office_session (raw, ainda URL-encoded)

### Etapa 2 — Login com POST
POST https://adminx.offo.dad/login
Content-Type: application/x-www-form-urlencoded
Cookie: XSRF-TOKEN=<raw>; office_session=<raw>
Body: _token=<xsrf_decodificado>&email=<ELITE_USER>&password=<ELITE_PASS>
redirect: manual

→ Resposta 302 = login OK
→ Novos cookies set-cookie: XSRF-TOKEN e office_session (renovados pós-login)
→ eliteToken = XSRF decodificado (decodeURIComponent) dos novos cookies
→ eliteCookies = string "XSRF-TOKEN=<raw>; office_session=<raw>" dos novos cookies

### Etapa 3 — Requisições autenticadas (eliteFetch)
Headers obrigatórios em toda requisição:
  Cookie: <eliteCookies>
  X-CSRF-TOKEN: <eliteToken>
  Accept: */*
  Content-Type: application/json
  Origin: https://adminx.offo.dad
  Referer: https://adminx.offo.dad/dashboard/iptv
  User-Agent: Mozilla/5.0

Tratamento de expiração:
  Se status 401 ou 419 → chama eliteLogin() novamente → retenta a requisição (1x)

---

## 3. Endpoints Confirmados (IPTV)

| Método | Endpoint                                  | Descrição                          |
|--------|-------------------------------------------|------------------------------------|
| GET    | dashboard/iptv/data?per_page=1000         | Lista todos os clientes IPTV       |
| POST   | api/iptv/renewone/{id}                    | Renova 1 mês                       |
| POST   | api/iptv/renewmulti/{id}                  | Renova N meses (body: {months, user_id}) |

Campos relevantes retornados por dashboard/iptv/data:
  id, username, password, name (nome do cliente no painel), exp_date, expiry_date

Campos retornados por renewone / renewmulti:
  exp_date ou expiry_date (nova data de vencimento após renovação)

---

## 4. Backend — server.js

### Variáveis de ambiente necessárias (Railway)
  ELITE_USER = email de login do painel Elite
  ELITE_PASS = senha do painel Elite

### Funções internas implementadas

eliteLogin()
  → Realiza o fluxo de autenticação em 2 etapas descrito acima
  → Popula eliteToken e eliteCookies em memória

eliteFetch(path, method, body, contentType)
  → Wrapper autenticado para todas as chamadas ao painel Elite
  → Se eliteToken vazio, chama eliteLogin() antes
  → Trata 401/419 com re-login automático

### Rotas expostas

GET /elite/debug
  → Força novo login e retorna raw da rota dashboard/iptv/data?per_page=5
  → Usado para diagnóstico: retorna status HTTP, content-type, preview do JSON

GET /elite/sincronizar
  → Chama dashboard/iptv/data?per_page=1000 e dashboard/p2p/data?per_page=1000 em paralelo
  → Normaliza campos: { id, username, password, name, tipo, exp_date }
  → Retorna { total, linhas[] }
  → Obs: P2P retornado mas ainda não usado no frontend

POST /elite/renovar
  Body esperado: { id, tipo, meses }
  → tipo "p2p" → usa endpoint api/p2p/renewone ou renewmulti (preparado, não ativo no frontend)
  → tipo qualquer outro → usa api/iptv/renewone ou renewmulti
  → meses <= 1 → POST api/iptv/renewone/{id}  (sem body adicional)
  → meses > 1  → POST api/iptv/renewmulti/{id} com body { user_id: id, months: meses }
  → Loga no console: id, tipo, meses e resposta completa do painel
  → Retorna a resposta do painel diretamente ao frontend

---

## 5. Frontend — src/pages/Clientes/index.tsx

### Detecção de servidor
  isElite(servidor) → true se campo servidor contém "ELITE" (case-insensitive)

### Estados adicionados
  sincronizandoElite       → controla loading do botão Sincronizar Elite
  syncEliteResult          → exibe resultado da sincronização (ok/erro)
  modalRenovar             → controla abertura do modal de seleção de período
  clienteParaRenovar       → cliente selecionado para renovar
  periodoRenovar           → período escolhido (1/2/3/6 para Elite, 30/60/90/180 para Warez)

### Funções adicionadas

sincronizarElite()
  → GET /elite/sincronizar → obtém linhas do painel
  → Para cada cliente Elite sem usuario preenchido no Firestore:
     - Divide o nome em palavras com mais de 2 caracteres
     - Busca linha cujo campo name/notes contenha 2 ou mais dessas palavras
     - Se match: atualiza usuario e senha no Firestore via updateDoc
  → Exibe resultado: atualizados / pulados / não encontrados

renovarClienteElite(cliente, meses)
  → GET /elite/sincronizar → encontra o id da linha pelo username
  → POST /elite/renovar com { id, tipo, meses }
  → Recebe exp_date/expiry_date da resposta
  → Converte para DD/MM/YYYY e atualiza vencimento no Firestore
  → Exibe mensagem de sucesso ou erro via mostrarMsgPainel

abrirModalRenovar(cliente)
  → Define clienteParaRenovar
  → Define periodoRenovar padrão: 1 (Elite) ou 30 (Warez)
  → Abre o modal

confirmarRenovar()
  → Fecha o modal
  → Chama renovarClienteElite(cliente, periodoRenovar) se Elite
  → Chama renovarClienteWarez(cliente, periodoRenovar / 30) se Warez

### Modal de seleção de período
  Opções Elite:  1 mês | 2 meses | 3 meses | 6 meses
  Opções Warez:  30 dias | 60 dias | 90 dias | 180 dias
  Cards com highlight colorido: roxo para Elite, azul para Warez
  Botão Confirmar dispara confirmarRenovar()
  Clique fora do modal fecha sem renovar

### Botão Renovar na tabela
  Aparece somente para clientes cujo servidor contenha "ELITE"
  Cor roxa (rgba 168,85,247) — diferencia visualmente do Warez (azul)
  Ícone 🔄 | Durante renovação: ⏳ + disabled
  onClick → abrirModalRenovar(cliente)

---

## 6. Fluxo completo de renovação Elite (IPTV)

1. Usuário clica 🔄 na linha do cliente
2. Modal abre com opções: 1 / 2 / 3 / 6 meses
3. Usuário seleciona e clica Confirmar
4. Frontend chama GET /elite/sincronizar para obter o id da linha pelo username
5. Frontend chama POST /elite/renovar com { id, tipo: "IPTV", meses }
6. Backend verifica meses: <= 1 → renewone | > 1 → renewmulti
7. Backend chama o painel Elite com os cookies/token em memória
8. Painel retorna nova exp_date
9. Backend retorna ao frontend
10. Frontend converte data e atualiza Firestore via updateDoc
11. Mensagem de sucesso exibida com nome, meses e nova data

---

## 7. Pendências

- [ ] Validar renovação P2P (endpoint api/p2p/renewone e renewmulti já preparados no backend)
- [ ] Adicionar opções de período P2P no modal (aguardando confirmação se usa mesmo padrão de meses)
- [ ] Confirmar campos exp_date vs expiry_date na resposta real do renewmulti Elite

---

## 8. Observações de produção

- eliteToken e eliteCookies ficam em memória no processo Node.js (Railway)
  → Reiniciar o servidor limpa a sessão → primeiro request refaz o login automaticamente
- O painel Elite usa Cloudflare: em caso de bloqueio de IP do Railway, o login retorna HTML em vez de JSON
  → Diagnóstico via GET /elite/debug
- Não há rate limit conhecido até o momento
