# Frontend — Página de Clientes

**Arquivo:** `src/pages/Clientes/index.tsx`

## Funcionalidades

### Sincronizar Warez
Busca todas as linhas do WWPanel e cruza com clientes do Firestore **sem usuário**. O matching é feito por palavras do nome (mínimo 2 palavras com mais de 2 letras em comum com o campo `notes` da linha).

### Sincronizar Elite
Busca todos os clientes do Elite (IPTV + P2P) e cruza com clientes **sem usuário** do servidor Elite. Além de `usuario` e `senha`, também atualiza o `vencimento`.

### Importar Elite (botão por linha)
Botão individual no dropdown ⋮ de cada cliente Elite. Força a importação mesmo que o cliente já tenha usuário. Usa cache das linhas para evitar requisições repetidas na mesma sessão.

**Lógica de matching:**
1. Se o cliente já tem `usuario` → busca por username exato no Elite
2. Se não tem → fallback por nome (palavras em comum)

### Renovar
Modal com seleção de período:
- **Warez:** 30, 60, 90, 180 dias (convertido para créditos: 1 crédito = 30 dias)
- **Elite:** 1, 2, 3, 6 meses

Após renovação, atualiza o campo `vencimento` no Firestore automaticamente.

**Conversão de datas:**
- Elite IPTV retorna `new_exp_date: "25/05/2026 23:59"` → extrai `"25/05/2026"`
- Elite P2P retorna `new_end_time: "2026-07-25 23:30:00"` → converte ISO para `"25/07/2026"`

### Dropdown de Ações (⋮)
Cada linha tem um botão de três pontinhos que abre um menu com:
- **Importar Elite** (verde, só aparece em clientes ELITE)
- **Renovar** (azul/roxo, aparece em WAREZ e ELITE)
- **Editar**
- **Excluir**

O menu fecha ao clicar fora via `document.addEventListener('click', handler)` com `stopPropagation` no botão e no próprio menu.

## Cores de Vencimento

| Dias restantes | Cor |
|----------------|-----|
| Vencido (< 0) | Vermelho `#f87171` |
| 0–4 dias | Laranja `#fb923c` |
| 5–7 dias | Amarelo `#fbbf24` |
| 8+ dias | Verde `#4ade80` |

## Estrutura do Cliente no Firestore

```ts
interface Cliente {
  id: string        // doc ID
  nome: string
  telefone: string
  tipo: string      // 'IPTV' | 'P2P'
  servidor: string  // 'WAREZ' | 'ELITE' | ...
  usuario: string
  senha: string
  vencimento: string  // formato DD/MM/YYYY
  valor: string
  status: string    // 'ativo' | 'suspenso' | 'inativo'
  obs: string
}
```
