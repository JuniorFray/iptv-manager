# 🎯 Estudo Técnico — Integração Elite (Renovar Clientes)
Data: 23/03/2026
Status: BLOQUEADO — Cloudflare ASN Ban (aguardando liberação de IP)

---

## 1. Objetivo

Botão "Renovar" e "Sincronizar" na tela de Clientes para clientes do servidor ELITE,
acionando automaticamente a renovação da linha no painel Elite (adminx.offo.dad).

Fluxo esperado:
Usuário clica Renovar → Frontend → Backend (Railway) → API Elite → Renova linha → Atualiza Firestore

---

## 2. Dados do Painel Elite

| Campo       | Valor                          |
|-------------|--------------------------------|
| URL Admin   | https://adminx.offo.dad        |
| Tipo auth   | Session cookie + CSRF token    |
| Cloudflare  | SIM — proteção ativa           |
| Tipos       | IPTV e P2P (endpoints separados) |

### Variáveis de Ambiente (Railway)
ELITE_USER = email de login do painel Elite
ELITE_PASS = senha do painel Elite

---

## 3. Autenticação — Fluxo Descoberto

A API do Elite usa autenticação por sessão Laravel (não JWT), exigindo:

### Etapa 1 — Obter CSRF
GET https://adminx.offo.dad/login
→ Retorna cookies: XSRF-TOKEN + office_session
→ Extrair XSRF-TOKEN (decodificar URI)

### Etapa 2 — Login
POST https://adminx.offo.dad/login
Content-Type: application/x-www-form-urlencoded
Cookie: XSRF-TOKEN=...; office_session=...
Body: _token=<xsrf>&email=<user>&password=<pass>
Resposta esperada: 302 redirect para /dashboard (login OK)
Resposta de falha: 200 (volta pra página de login)

### Etapa 3 — Requisições autenticadas
GET/POST https://adminx.offo.dad/<endpoint>
Headers:
  Cookie: XSRF-TOKEN=...; office_session=...
  X-CSRF-TOKEN: <xsrf_decodificado>
  Accept: application/json, */*
  Referer: https://adminx.offo.dad/dashboard/iptv
  User-Agent: Mozilla/5.0

---

## 4. Endpoints Descobertos (a confirmar após liberação)

| Método | Endpoint                              | Descrição              |
|--------|---------------------------------------|------------------------|
| GET    | dashboard/iptv/data?per_page=1000     | Lista clientes IPTV    |
| GET    | dashboard/p2p/data?per_page=1000      | Lista clientes P2P     |
| POST   | dashboard/iptv/renew/:id              | Renova cliente IPTV    |
| POST   | dashboard/p2p/renew/:id               | Renova cliente P2P     |

AVISO: Endpoints ainda não confirmados — bloqueados pelo Cloudflare.
Confirmar via /elite/debug após liberação do IP.

Campos esperados na resposta (inferidos):
{
  "id": 123,
  "username": "andrefelipe",
  "password": "senha123",
  "name": "Andre Felipe 35",
  "expiry_date": "2026-04-23",
  "tipo": "P2P"
}
AVISO: Nomes dos campos podem variar: name/member_name/notes, exp_date/expiry_date
Verificar no JSON real do /elite/debug.

---

## 5. Rotas Backend Implementadas (server.js)

GET  /elite/debug        → Diagnóstico raw da API Elite
GET  /elite/sincronizar  → Lista todos IPTV + P2P do painel
POST /elite/renovar      → Renova cliente { id, tipo }
GET  /meu-ip             → Retorna IP de saída do Railway (temporária)

---

## 6. Frontend Implementado (Clientes/index.tsx)

### Novos states
- sincronizandoElite / setSincronizandoElite
- syncEliteResult / setSyncEliteResult

### Funções adicionadas
- isElite(servidor)       — detecta clientes Elite pelo campo servidor
- sincronizarElite()      — busca painel Elite, cruza por nome, preenche usuario+senha no Firestore
- renovarClienteElite()   — usa usuario salvo, busca ID no painel, renova, atualiza vencimento

### Lógica de cruzamento (sync)
Para cada cliente Elite sem usuario preenchido:
  → Divide o nome em palavras (mais de 2 chars)
  → Busca no painel por linha cujo name/notes contenha 2 ou mais palavras
  → Se encontrar: salva usuario + senha no Firestore

### Identificação dos tipos no cadastro
- Campo servidor = "ELITE" → isElite() retorna true
- Campo tipo = "IPTV" ou "P2P" → define qual endpoint de renovação usar

---

## 7. Bloqueio Atual — Cloudflare ASN Ban

### Diagnóstico recebido
{
  "status": 403,
  "error_code": 1005,
  "error_name": "asn_banned",
  "detail": "The site owner has blocked the autonomous system number (ASN) associated with your IP address.",
  "retryable": false,
  "owner_action_required": true
}

Causa: O Railway usa IPs da AWS (data center). O Cloudflare do Elite bloqueia
todos os IPs de data center por padrão via regra ASN.

IP atual do Railway:
→ Descobrir via: https://iptv-manager-production.up.railway.app/meu-ip

### Opções de solução

| Opção                | Descrição                                        | Custo        | Complexidade |
|----------------------|--------------------------------------------------|--------------|--------------|
| Whitelist IP         | Pedir ao suporte Elite para liberar o IP         | Grátis       | Baixa        |
| VPS residencial      | Migrar backend para Hostinger ou Hetzner         | ~R$20/mes    | Média        |
| Proxy residencial    | Adicionar proxy (BrightData) nas chamadas Elite  | ~$10-15/mes  | Média        |

AVISO: Railway pode trocar de IP a cada redeploy.
Railway Pro oferece IP fixo — confirmar nas configurações se necessário.

---

## 8. Próximos Passos

- [ ] Descobrir IP via /meu-ip
- [ ] Contatar suporte Elite para liberar IP (ou migrar para VPS)
- [ ] Após liberação: acessar /elite/debug e confirmar campos do JSON
- [ ] Ajustar nomes de campos em sincronizarElite() e renovarClienteElite() se necessário
- [ ] Testar sincronização com cliente "Andre Felipe 35"
- [ ] Testar renovação e verificar se vencimento atualiza no Firestore
- [ ] Remover rota temporária /meu-ip após resolver

---

## 9. Arquivos Modificados

| Arquivo                            | O que mudou                                              |
|------------------------------------|----------------------------------------------------------|
| backend/server.js                  | + eliteLogin(), eliteFetch(), rotas /elite/*, /meu-ip    |
| src/pages/Clientes/index.tsx       | + sincronizarElite(), renovarClienteElite(), botoes UI   |
