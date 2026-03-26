# Warez — Integração WWPanel

**Data:** Março 2026  
**API:** https://mcapi.knewcms.com:2087  
**Painel:** https://wwpanel.link

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `WPAINEL_USER` | Usuário do WWPanel |
| `WPAINEL_PASS` | Senha do WWPanel |

## Autenticação

API REST com JWT. Token expira em 1.5h.

```
POST /auth/login
{ username, password }
→ { token: "eyJ..." }
```

Token renovado automaticamente antes de expirar via `getWpToken()`.

## Headers

```js
{
  'Authorization': `Bearer ${token}`,
  'Content-Type':  'application/json',
  'Origin':        'https://wwpanel.link',
  'Referer':       'https://wwpanel.link/',
}
```

## Endpoints principais

| Rota | Método | Descrição |
|------|--------|-----------|
| `/lines?search=termo` | GET | Busca por nome/usuário |
| `/lines/{id}` | GET | Detalhes de uma linha |
| `/lines?limit=100&page=N` | GET | Paginação completa |
| `/lines/extend/{id}` | PATCH | Renova `{ credits: N }` — 1 crédito = 30 dias |
| `/products` | GET | Lista planos disponíveis |
| `/lines/trial` | POST | Cria conta teste |

## Rotas do Backend

| Rota | Método | Descrição |
|------|--------|-----------|
| `/painel/sincronizar` | GET | Lista todas as linhas |
| `/painel/buscar/:termo` | GET | Busca por username ou search |
| `/painel/buscar-username/:username` | GET | Busca exata por username (varre todas as páginas) |
| `/painel/renovar/:lineId` | POST | Renova `{ credits }` |
| `/painel/linha/:lineId` | GET | Detalhes de linha |
| `/painel/planos` | GET | Lista planos |
| `/painel/teste` | POST | Cria teste |
