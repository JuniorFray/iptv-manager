# Elite — Integração Técnica (v2)

**Data:** Março 2026  
**Servidor:** https://adminx.offo.dad  
**Proteção:** Cloudflare (requer proxy residencial)

## Variáveis de Ambiente necessárias

| Variável | Descrição |
|----------|-----------|
| `ELITEUSER` | Login do painel Elite |
| `ELITEPASS` | Senha do painel Elite |
| `PROXY_URL` | URL do proxy residencial (ex: `http://user:pass@host:porta`) |

## Fluxo de Autenticação (3 etapas)

O Elite usa Laravel + Cloudflare. Não há API JWT — é necessário scraping de sessão.

### Etapa 1 — GET /login
```
GET https://adminx.offo.dad/login
```
Extrai do HTML:
- `_token` do formulário (`<input name="_token" value="...">`)
- Cookies iniciais: `XSRF-TOKEN` e `office_session`

### Etapa 2 — POST /login
```
POST https://adminx.offo.dad/login
Content-Type: application/x-www-form-urlencoded

_token=...&timezone=America/Sao_Paulo&email=...&password=...&remember=on
```
Retorna status 302 com novos cookies de sessão autenticada.

### Etapa 3 — GET /dashboard
```
GET https://adminx.offo.dad/dashboard
```
Extrai `<meta name="csrf-token" content="...">` — este é o token **curto** que deve ser enviado no header `X-CSRF-TOKEN` em todas as requisições AJAX.

> ⚠️ **Erro comum:** usar o valor do cookie `XSRF-TOKEN` (longo/criptografado) em vez do meta tag (curto). O servidor retorna 419 nesse caso.

## Headers obrigatórios nas requisições

```js
{
  'Accept':           'application/json, text/javascript, */*; q=0.01',
  'Cookie':           cookieJar,
  'X-CSRF-TOKEN':     csrfToken,        // do <meta name="csrf-token">
  'X-Requested-With': 'XMLHttpRequest',
  'Origin':           'https://adminx.offo.dad',
  'Referer':          'https://adminx.offo.dad/dashboard',
}
```

## Endpoints de Dados

### Listar clientes IPTV
```
GET /dashboard/iptv?draw=1&columns[1][data]=id&...&order[0][column]=1&order[0][dir]=desc&start=0&length=1000
```
Retorna `{ data: [...], recordsTotal: N }`

Campos importantes por registro:
- `id` — ID interno (usar para renovar)
- `username`, `password`
- `exp_date_formatted` — formato `YYYY-MM-DD`
- `reseller_notes` — nome/observações do cliente

### Listar clientes P2P
```
GET /dashboard/p2p?draw=1&columns[1][data]=id&...
```
Campos importantes:
- `id`, `id_p2p`
- `email` — username de login
- `name` — nome do cliente
- `exp_date_formatted` — formato `YYYY-MM-DD`

### Renovar 1 mês
```
POST /api/iptv/renewone/{id}   (IPTV)
POST /api/p2p/renewone/{id}    (P2P)
```
Resposta IPTV: `{ success: true, new_exp_date: "25/05/2026 23:59" }`  
Resposta P2P:  `{ success: true, new_end_time: "2026-07-25 23:30:00" }`

### Renovar N meses
```
POST /api/iptv/renewmulti/{id}
POST /api/p2p/renewmulti/{id}
Body: { user_id: id, months: N }
```

## Lock de Login Simultâneo

Para evitar múltiplos logins paralelos (que derrubam o servidor):

```js
let loginPromise = null

const eliteLogin = async () => {
  if (loginPromise) return loginPromise
  loginPromise = _doLogin().finally(() => { loginPromise = null })
  return loginPromise
}
```

## Tratamento de Manutenção

O servidor retorna `MANUTENCAO RETORNAMOS AS 20:00` durante janelas de manutenção com status 404. O código detecta isso e lança erro descritivo sem entrar em loop.

## Rotas do Backend

| Rota | Método | Descrição |
|------|--------|-----------|
| `/elite/debug` | GET | Testa login e retorna csrf-token + cookies |
| `/elite/sincronizar` | GET | Retorna todos os clientes IPTV + P2P |
| `/elite/renovar` | POST | Renova cliente `{ id, tipo, meses }` |
