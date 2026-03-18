import { Outlet, useLocation } from 'react-router-dom'
import { Tv } from 'lucide-react'
import MenuLateral from '../components/MenuLateral'

const titulos: Record<string, string> = {
  dashboard:    'Dashboard',
  clientes:     'Clientes',
  servidores:   'Servidores',
  financeiro:   'Financeiro',
  notificacoes: 'WhatsApp',
}

export default function Layout() {
  const location = useLocation()
  const pagina = location.pathname.replace('/', '')
  const titulo = titulos[pagina] ?? 'Sistema TV'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <MenuLateral />

      {/* Header fixo mobile */}
      <header
        className="mobile-header"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 150,
          background: 'rgba(10, 8, 30, 0.98)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 16px',
          gap: '10px',
          height: '56px',
        }}
      >
        <div style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', padding: '6px', borderRadius: '8px' }}>
          <Tv size={16} color="white" />
        </div>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{titulo}</span>
      </header>

      {/* Conteúdo principal */}
      <main className="main-content" style={{ flex: 1, overflowX: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  )
}
