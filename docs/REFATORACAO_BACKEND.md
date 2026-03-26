# Refatoração do Backend — Modularização

**Data:** Março 2026  
**Autor:** JuniorFray

## Contexto

O arquivo `backend/server.js` original tinha ~840 linhas contendo toda a lógica de WhatsApp, Warez (WWPanel), Elite e configuração do servidor Express em um único arquivo. Isso dificultava manutenção, leitura e adição de novas funcionalidades.

## O que foi feito

O `server.js` foi dividido em 4 módulos independentes dentro de `backend/routes/`:

```
backend/
├── server.js                ← ponto de entrada (~45 linhas)
└── routes/
    ├── whatsapp.js          ← Baileys, fila, cron, rotas WhatsApp
    ├── warez.js             ← WWPanel / mcapi.knewcms.com
    ├── elite.js             ← adminx.offo.dad
    └── central.js           ← placeholder (em breve)
```

## Padrão adotado

Cada módulo exporta uma **factory function** que recebe dependências já inicializadas:

```js
// Exemplo: routes/whatsapp.js
export default function createWhatsAppRouter(db, admin) {
  const router = express.Router()
  // ... lógica
  return { router, inicializar }
}
```

O `server.js` apenas inicializa Firebase/Express e monta os routers:

```js
import createWhatsAppRouter from './routes/whatsapp.js'
import createWarezRouter    from './routes/warez.js'
import createEliteRouter    from './routes/elite.js'
import createCentralRouter  from './routes/central.js'

const { router: whatsappRouter, inicializar } = createWhatsAppRouter(db, admin)
app.use('/', whatsappRouter)
inicializar() // dispara conexão WA + cron
```

## Benefícios

- Cada servidor tem seu arquivo isolado
- Fácil adicionar Central quando chegar
- Logs identificados por módulo (`[Elite]`, `[Warez]`)
- Sem duplicação do Firebase
