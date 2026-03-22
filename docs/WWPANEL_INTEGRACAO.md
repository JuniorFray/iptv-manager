# Estudo Tecnico — Integracao WWPanel (Renovar Clientes)
Data: 21/03/2026
Status: EM INVESTIGACAO — funcionalidade ainda nao operacional

## 1. Objetivo
Botao "Renovar" na tela de Clientes acionar automaticamente a renovacao
da linha no painel WWPanel (Warez).

Fluxo esperado:
Usuario clica Renovar → Frontend → Backend (Railway) → API WWPanel → Renova linha

## 2. Historico de Erros

### Erro 1 — Busca pelo nome
Mensagem: Usuario "Rosemeire Nascimento" nao encontrado no painel Warez.
Causa: Frontend enviava cliente.nome, WWPanel nao busca por Observacao.
Correcao: Prioridade usuario > observacao > nome no termoBusca.
Commit: ad1410e

### Erro 2 — Busca pelo username (6dr2240) tambem falha
Mensagem: Usuario "6dr2240" nao encontrado no painel Warez.
Causa: JSON de resposta da API WWPanel tem estrutura desconhecida.
Status: NAO RESOLVIDO

## 3. Dados do Cliente de Teste
Nome:       Rosemeire Nascimento
Username:   6dr2240
Senha:      u33m765
ID WWPanel: 103240796
Servidor:   WAREZ
Vencimento: 18/03/26 (ja vencido)

## 4. Proximo Passo — DEBUG
Adicionar rota no backend/server.js:

  app.get('/painel/debug/:termo', async (req, res) => {
    const termo = decodeURIComponent(req.params.termo)
    const token = await getWpToken()
    const r1 = await fetch(`https://mcapi.knewcms.com:2087/lines?search=${encodeURIComponent(termo)}&limit=5`, {
      headers: { Authorization: `Bearer ${token}`, Origin: 'https://wwpanel.link' }
    })
    const d1 = await r1.json()
    const r2 = await fetch(`https://mcapi.knewcms.com:2087/lines?username=${encodeURIComponent(termo)}`, {
      headers: { Authorization: `Bearer ${token}`, Origin: 'https://wwpanel.link' }
    })
    const d2 = await r2.json()
    res.json({ search_result: d1, username_result: d2 })
  })

Apos deploy, acessar:
https://iptv-manager-production.up.railway.app/painel/debug/6dr2240

## 5. Proximos Passos
[ ] 1. Adicionar rota /painel/debug no backend/server.js
[ ] 2. Deploy Railway e acessar URL de debug
[ ] 3. Analisar JSON e identificar estrutura correta da resposta
[ ] 4. Corrigir parsing no frontend ou rota no backend
[ ] 5. Testar renovacao da Rosemeire com sucesso
[ ] 6. Generalizar para todos os clientes WAREZ

## 6. Arquivos Modificados
src/pages/Clientes/index.tsx  → funcao renovarCliente (parsing e busca)
backend/server.js             → rotas /painel/buscar, /painel/renovar
