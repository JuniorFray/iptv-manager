# 🖥️ Frontend — Páginas e Componentes

Framework: React 18 + TypeScript | Build: Vite

## Páginas
- /login              — Autenticação Firebase (login, cadastro, recuperação)
- /dashboard          — Resumo operacional (clientes, vencimentos, receita)
- /financeiro         — Receita total, mensal, por servidor
- /clientes           — CRUD completo de clientes
- /servidores         — Gerenciamento de servidores IPTV
- /notificacoes       — WhatsApp (manual, automático, fila, histórico)

## Filtros WhatsApp

| ID        | Condição           |
|-----------|--------------------|
| todos     | Todos com telefone |
| venchoje  | diff === 0         |
| venc4     | diff === 4         |
| venc7     | diff === 7         |
| vencidos  | diff < 0           |
| manual    | Todos com telefone |

## Componentes
- MenuLateral.tsx — Sidebar desktop + bottom bar mobile
- AuthContext.tsx  — useAuth() com login/logout/cadastrar
