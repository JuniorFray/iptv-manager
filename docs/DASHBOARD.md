# 📊 Dashboard

## Cards de Métricas
- Total de Clientes
- Clientes Ativos
- Clientes Inativos
- Vencendo em até 7 dias

## Alertas de Vencimento
- Vencendo Hoje
- Vencendo em 4 dias
- Vencendo em 7 dias

## Distribuição por Servidor
Gráfico de barras agrupando clientes por servidor.

## Créditos dos Servidores
Exibe saldo de créditos de cada servidor em tempo real.

| Servidor       | Endpoint                        | Campo     |
|----------------|---------------------------------|-----------|
| WWPanel/Warez  | GET /users/logged               | credits   |
| Elite          | GET /dashboard (HTML scraping)  | #navbarCredits |
| Central        | GET /profile                    | credits   |

Rotas backend:
- `GET /painel/saldo` → Warez
- `GET /elite/saldo` → Elite
- `GET /central/saldo` → Central

Botão 🔄 Atualizar força nova consulta.

## Criar Teste — WWPanel
Permite criar um teste de 1 a 4 horas diretamente pelo Dashboard.

**Endpoint:** `POST /painel/criar-teste`

**Body:**
```json
{ "horas": 4 }
```

**Payload enviado à API:**
```json
{
  "notes": "TESTE SISTEMA",
  "package_p2p": "5da17892133a1d61888029aa",
  "package_iptv": "95",
  "testDuration": 4,
  "krator_package": "1"
}
```

**Resposta exibida em popup:**
- 👤 Usuário (com botão copiar)
- 🔑 Senha (com botão copiar)
- ⏱️ Data/hora de expiração (com botão copiar)
- 📋 Botão "Copiar tudo" — copia todos os dados de uma vez
