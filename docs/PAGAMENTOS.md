# 💳 Pagamentos — Proposta de Implementação

## Visão Geral
Automação completa do ciclo de renovação via Mercado Pago. O cliente recebe
um link de pagamento nas mensagens de vencimento, escolhe o plano, paga, e o
sistema renova automaticamente e notifica via WhatsApp.

---

## Fluxo Completo

```
Cron dispara msg de vencimento (7d, 4d, 0d)
    ↓
Mensagem inclui {LINK_PAGAMENTO} gerado dinamicamente
    ↓
Cliente abre o link → escolhe o plano:
    • 1 mês   — R$ 35,00
    • 2 meses — R$ 70,00
    • 6 meses — R$ 170,00
    ↓
Paga (Pix, cartão, boleto)
    ↓
Webhook MP → backend identifica cliente via external_reference
    ↓
Renova no servidor correto (Warez / Elite / Central)
    ↓
WhatsApp envia confirmação com novos dados de acesso
```

---

## Planos

| Plano    | Valor     | Créditos Warez | Meses Elite/Central |
|----------|-----------|----------------|---------------------|
| 1 mês    | R$ 35,00  | 1              | 1                   |
| 2 meses  | R$ 70,00  | 2              | 2                   |
| 6 meses  | R$ 170,00 | A confirmar*   | 6                   |

*Warez e Central têm desconto especial para 6 meses — endpoint a ser mapeado.

---

## Identificação do Cliente

O campo `external_reference` da preferência MP carrega os dados necessários:

```
clienteId:abc123|servidor:WAREZ|usuario:8587655
```

Quando o webhook chega, o sistema lê esse campo, busca o cliente no Firestore
e executa a renovação automaticamente no servidor correto.

---

## Backend — Novas Rotas

| Método | Rota                    | Descrição                                      |
|--------|-------------------------|------------------------------------------------|
| POST   | /pagamento/criar        | Gera preferência MP com os 3 planos            |
| POST   | /pagamento/webhook      | Recebe notificação MP, valida, renova, notifica |
| GET    | /pagamento/historico    | Lista pagamentos do Firestore                  |

### POST /pagamento/criar — Body
```json
{
  "clienteId": "abc123",
  "clienteNome": "João Silva",
  "telefone": "5519999999",
  "servidor": "WAREZ",
  "usuario": "8587655",
  "senha": "123456"
}
```

### POST /pagamento/webhook — Fluxo interno
1. Valida assinatura do MP
2. Busca pagamento na API do MP
3. Verifica `status === "approved"`
4. Lê `external_reference` para identificar cliente e servidor
5. Determina créditos/meses pelo valor pago
6. Renova no servidor correto
7. Salva em `pagamentos` no Firestore
8. Envia mensagem de confirmação via WhatsApp

---

## Variável de Ambiente

| Variável          | Descrição                        |
|-------------------|----------------------------------|
| MP_ACCESS_TOKEN   | Token de produção Mercado Pago   |

---

## Firestore — Coleção `pagamentos`

```json
{
  "clienteId":      "abc123",
  "clienteNome":    "João Silva",
  "telefone":       "5519999999",
  "servidor":       "WAREZ",
  "usuario":        "8587655",
  "mpPaymentId":    "123456789",
  "mpPreferenceId": "...",
  "valor":          35.00,
  "plano":          "1 mês",
  "status":         "aprovado",
  "renovadoEm":     "Timestamp",
  "criadoEm":       "Timestamp"
}
```

Status possíveis: `pendente` | `aprovado` | `falhou` | `estornado`

---

## Frontend — Aba Pagamentos

Nova aba **💳 Pagamentos** no menu lateral com:
- Cards de resumo: total recebido, pagamentos do mês, pendentes
- Tabela com histórico: cliente, plano, valor, data, status, servidor renovado
- Filtro por status e período

---

## Frontend — Botão na Tela de Clientes

Cada linha da tabela de clientes terá um botão **💳 Gerar Link** nos botões
de ação. Ao clicar:
1. Chama `POST /pagamento/criar` com os dados do cliente
2. Recebe o link do MP
3. Copia automaticamente para a área de transferência
4. Exibe confirmação visual na linha

Útil para envio manual via WhatsApp, e-mail ou qualquer outro canal.

---

## Template de Mensagem

Nova variável disponível nos templates de vencimento:

```
{LINK_PAGAMENTO}
```

Exemplo de uso:
```
Olá {NOME}, seu plano vence em {VENCIMENTO}.
Renove agora: {LINK_PAGAMENTO}
```

---

## Sequência de Implementação

1. Configurar `MP_ACCESS_TOKEN` no Railway
2. Backend: rota `/pagamento/criar` + `/pagamento/webhook`
3. Backend: adicionar `{LINK_PAGAMENTO}` ao sistema de variáveis dos templates
4. Frontend: botão 💳 na tabela de clientes
5. Frontend: aba Pagamentos no menu lateral
6. Testes com ambiente sandbox do MP antes de produção

---

## Pendências Antes de Implementar

- [ ] Confirmar `MP_ACCESS_TOKEN` de produção disponível
- [ ] Mapear endpoint correto para renovação de 6 meses no Warez e Central
- [ ] Definir URL pública do webhook (Railway já fornece ✅)
