# Central — Integração Técnica

**Data:** Março 2026  
**Painel:** https://painel.fun / https://controle.vip  
**API base:** https://api.controle.fit/api

## Desafios da Integração

O login exige **Cloudflare Turnstile** — captcha que não pode ser resolvido manualmente no backend. A solução foi usar o serviço **CapSolver** para resolver automaticamente.

### Investigação do captcha

Durante a investigação foi encontrado um reCAPTCHA v2 invisible (`6LeJTpIe...`) no domínio `painel.fun`, mas o campo de login usa `cf-turnstile-response`. O sitekey correto do Turnstile foi encontrado inspecionando a requisição para `challenges.cloudflare.com`:

```
Sitekey: 0x4AAAAAACFhU7XJduqvbHH2
Domínio registrado: https://controle.vip:443
Tipo: AntiTurnstileTaskProxyLess
```

> ⚠️ O sitekey está registrado para `controle.vip`, não para `painel.fun`. Usar o domínio errado causa erro "Invalid domain for site key" no CapSolver.

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `CAPSOLVER_KEY` | API key do CapSolver (capsolver.com) |
| `CENTRAL_USER` | Usuário do painel Central |
| `CENTRAL_PASS` | Senha do painel Central |
| `CENTRAL_USERNAME` | Username do revendedor (ex: `junior1510`) |
| `CENTRAL_PACKAGE_ID` | Package ID para renovação 1 mês (padrão: `17`) |

## Fluxo de Autenticação

1. CapSolver recebe o sitekey e domínio
2. CapSolver resolve o Turnstile (~5-15s)
3. Token do Turnstile é enviado no body do login
4. API retorna JWT Bearer token
5. Token salvo no Firestore (`config_central/central_token`)
6. Token renovado automaticamente a cada 55 minutos (expira em 1h)

```js
// Criar tarefa no CapSolver
{
  clientKey: CAPSOLVER_KEY,
  task: {
    type:       'AntiTurnstileTaskProxyLess',
    websiteURL: 'https://controle.vip',
    websiteKey: '0x4AAAAAACFhU7XJduqvbHH2',
  }
}

// Resposta com token
result.solution.token  // usar como cf-turnstile-response
```

## Autenticação no Login

```
POST https://api.controle.fit/api/auth/sign-in
{
  "username": "...",
  "password": "...",
  "cf-turnstile-response": "<token do CapSolver>"
}
```

Resposta: `{ token: "eyJ...", user: { id, username, credits, ... } }`

## Endpoints

### Listagem de Clientes
```
GET /api/users?page=1&per=100&reseller={username}
Authorization: Bearer {token}
```
Resposta: `{ data: [...], meta: { page, per, pages, total } }`

Campos relevantes por cliente:
| Campo | Descrição |
|-------|-----------|
| `id` | ID interno (usar para renovar) |
| `username` | Login do cliente |
| `password` | Senha do cliente |
| `full_name` | Nome completo |
| `reseller_notes` | Observações do revendedor |
| `exp_date` | Vencimento (unix timestamp) |
| `enabled` | Status (1=ativo) |

### Renovar Cliente
```
POST /api/users/{id}/renew
Authorization: Bearer {token}
{ "package_id": 17 }
```
Resposta: objeto do cliente com `exp_date` atualizado (unix timestamp)

## Rotas do Backend

| Rota | Método | Descrição |
|------|--------|-----------|
| `/central/debug` | GET | Testa o token atual e exibe expiração |
| `/central/set-token` | POST | Salva token JWT manualmente no Firestore |
| `/central/sincronizar` | GET | Lista todos os clientes do revendedor |
| `/central/renovar` | POST | Renova `{ id, meses }` |

## Firestore

| Documento | Conteúdo |
|-----------|----------|
| `config_central/central_token` | `{ token, exp, atualizadoEm }` |

## Lock de Login

Para evitar múltiplos logins simultâneos:

```js
let loginPromise = null

const centralLogin = async () => {
  if (loginPromise) return loginPromise
  loginPromise = _doLogin().finally(() => { loginPromise = null })
  return loginPromise
}
```

## Recuperação de Token

Ao receber 401, o sistema refaz login automaticamente:

```js
if (res.status === 401 && retry) {
  centralToken = null; centralTokenExp = 0
  return centralFetch(path, method, body, false)
}
```
