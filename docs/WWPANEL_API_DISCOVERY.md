# Procedimento de Descoberta da API WWPanel (Warez)
Data: 16-21/03/2026 - Engenharia reversa via Chrome DevTools

## BASE URL
https://mcapi.knewcms.com:2087

## AUTENTICACAO
POST /auth/login
Body: { "username": "<admin>", "password": "<senha>" }
Retorna: { "token": "eyJ..." }
Usar em todas as requests: Authorization: Bearer <token>
                           Origin: https://wwpanel.link

## BUSCAR LINHA
GET /lines?search=<termo>&limit=50
GET /lines?username=<username_exato>

## RENOVAR LINHA
POST /lines/renew/<id_numerico>

## LISTAR PACOTES
GET /packages

## CRIAR TESTE
POST /lines/trial
Body: { "username":"x", "password":"x", "package_id":5, "trial_duration":4 }

## VARIAVEIS DE AMBIENTE (Railway)
WPAINEL_URL  = https://mcapi.knewcms.com:2087
WPAINEL_USER = <usuario_admin_wwpanel>
WPAINEL_PASS = <senha_admin_wwpanel>

## PENDENCIAS
- Estrutura exata da resposta /lines nao confirmada
- Confirmar via: /painel/debug/6dr2240
- Testar se ?search busca no campo notes/observacao
