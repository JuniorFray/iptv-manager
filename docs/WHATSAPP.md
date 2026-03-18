# 📱 WhatsApp — Integração Baileys

Biblioteca: @whiskeysockets/baileys ^6.7.0

## Sessão
- Credenciais salvas em auth_info/ (Railway)
- Reconecta automaticamente após restart se auth_info/ existir

## Gatilhos Automáticos

| Chave  | Condição   | Descrição                  |
|--------|------------|----------------------------|
| dias7  | diff === 7 | 7 dias antes do vencimento |
| dias4  | diff === 4 | 4 dias antes               |
| dia0   | diff === 0 | No dia do vencimento       |
| pos1   | diff === -1| 1 dia após vencer          |
| pos3   | diff === -3| 3 dias após vencer         |

## Backoff Exponencial (retry)

| Tentativa | Espera    |
|-----------|-----------|
| 1ª        | 1 minuto  |
| 2ª        | 2 minutos |
| 3ª final  | 4 minutos → status=erro |

## Crons

| Cron            | Frequência    | Função                     |
|-----------------|---------------|----------------------------|
| */30 * * * * *  | Cada 30s      | processarFila()            |
| HH MM * * *     | Diário        | executarEnvioAutomatico()  |

## Variáveis de Mensagem
NOME · VENCIMENTO · SERVIDOR · VALOR
