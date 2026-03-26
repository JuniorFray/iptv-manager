import { Outlet } from 'react-router-dom'
import MenuLateral from '../components/MenuLateral'

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'transparent' }}>
      <MenuLateral />
      <main
        className="main-content"
        style={{
          flex: 1,
          marginLeft: '176px',
          padding: '28px 24px',
          minHeight: '100vh',
          overflowX: 'hidden',
          maxWidth: 'calc(100vw - 176px)',
          boxSizing: 'border-box',
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
