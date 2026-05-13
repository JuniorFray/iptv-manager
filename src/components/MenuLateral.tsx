import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp, CreditCard, MapPin } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const menus = [
  { path: 'dashboard',    icon: <LayoutDashboard size={18} />, label: 'Dashboard'  },
  { path: 'clientes',     icon: <Users size={18} />,           label: 'Clientes'   },
  { path: 'servidores',   icon: <Server size={18} />,          label: 'Servidores' },
  { path: 'financeiro',   icon: <TrendingUp size={18} />,      label: 'Financeiro' },
  { path: 'notificacoes', icon: <MessageSquare size={18} />,   label: 'WhatsApp'   },
  { path: 'pagamentos',   icon: <CreditCard size={18} />,      label: 'Pagamentos' },
  { path: 'posicionamento', icon: <MapPin size={18} />,          label: 'Posicionamento' },
]

export default function MenuLateral() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('login')
  }

  return (
    <>
      {/* ── SIDEBAR DESKTOP ── */}
      <div
        className="glass sidebar-desktop"
        style={{
          width: '176px',
          minHeight: '100vh',
          padding: '20px 12px',
          flexDirection: 'column',
          gap: '4px',
          position: 'fixed',
          left: 0, top: 0, bottom: 0,
          zIndex: 100,
          borderRadius: '0',
          borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', marginBottom: '20px' }}>
          <div style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', padding: '7px', borderRadius: '10px', flexShrink: 0 }}>
            <Tv size={18} color="white" />
          </div>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: '15px' }}>Sistema TV</span>
        </div>

        {/* Itens do menu */}
        {menus.map(menu => (
          <NavLink
            key={menu.path}
            to={menu.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '10px',
              textDecoration: 'none',
              color: isActive ? 'white' : 'rgba(255,255,255,0.5)',
              background: isActive ? 'rgba(99,102,241,0.3)' : 'transparent',
              border: isActive ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent',
              transition: 'all 0.2s ease',
              fontWeight: isActive ? '600' : '400',
            })}
          >
            {menu.icon}
            <span style={{ fontSize: '13px' }}>{menu.label}</span>
          </NavLink>
        ))}

        {/* Logout */}
        <div style={{ marginTop: 'auto' }}>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '10px', width: '100%',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s ease',
            }}
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* ── BOTTOM NAV MOBILE ── */}
      <nav
        className="bottom-nav-mobile"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
          background: 'rgba(10, 8, 30, 0.98)', backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.1)', alignItems: 'stretch',
        }}
      >
        {menus.map(menu => (
          <NavLink
            key={menu.path}
            to={menu.path}
            style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column' as const,
              alignItems: 'center', justifyContent: 'center',
              padding: '10px 2px 8px', textDecoration: 'none',
              color: isActive ? '#818cf8' : 'rgba(255,255,255,0.35)',
              borderTop: isActive ? '2px solid #6366f1' : '2px solid transparent',
              transition: 'all 0.2s', fontSize: '10px', gap: '3px',
            })}
          >
            {menu.icon}
            <span style={{ fontSize: '10px', fontWeight: '500' }}>{menu.label}</span>
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '10px 2px 8px',
            background: 'none', border: 'none', borderTop: '2px solid transparent',
            color: 'rgba(239,68,68,0.6)', cursor: 'pointer', gap: '3px',
          }}
        >
          <LogOut size={18} />
          <span style={{ fontSize: '10px' }}>Sair</span>
        </button>
      </nav>
    </>
  )
}