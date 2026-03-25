import express from 'express'

/**
 * Módulo Central — Em breve
 * Estrutura preparada para receber as rotas do servidor Central.
 * Adicione aqui: autenticação, funções auxiliares e rotas /central/*
 *
 * Padrão a seguir (igual aos outros módulos):
 *   export default function createCentralRouter(db, admin) {
 *     const router = express.Router()
 *     // ... lógica Central
 *     return { router }
 *   }
 */
export default function createCentralRouter(/* db, admin */) {
  const router = express.Router()

  // TODO: implementar autenticação Central
  // const centralLogin = async () => { ... }
  // const centralFetch = async (path, method, body) => { ... }

  // ---- Rotas Central (placeholder) ----

  router.get('/central/status', (req, res) => {
    res.json({ status: 'Em breve', mensagem: 'Módulo Central ainda não implementado.' })
  })

  // TODO: adicionar rotas /central/sincronizar, /central/renovar, etc.

  return { router }
}
