import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const menus = [
  { path: "/dashboard",  icon: <LayoutDashboard size={20} />, label: "Dashboard" },
  { path: "/clientes",   icon: <Users size={20} />,           label: "Clientes" },
  { path: "/servidores", icon: <Server size={20} />,          label: "Servidores" },
  { path: "/financeiro", icon: <TrendingUp size={20} />,      label: "Financeiro" },
  { path: "/notificacoes", icon: <MessageSquare size={20} />, label: "WhatsApp" },
];

export default function MenuLateral() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="glass" style={{
      width: "240px", minHeight: "100vh", padding: "24px 16px",
      display: "flex", flexDirection: "column", gap: "8px",
      borderRadius: "0", borderTop: "none", borderBottom: "none", borderLeft: "none"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", marginBottom: "24px" }}>
        <div style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", padding: "8px", borderRadius: "12px" }}>
          <Tv size={22} color="white" />
        </div>
        <span style={{ color: "white", fontWeight: "bold", fontSize: "18px" }}>Sistema TV</span>
      </div>

      {menus.map((menu) => (
        <NavLink key={menu.path} to={menu.path} style={({ isActive }) => ({
          display: "flex", alignItems: "center", gap: "12px",
          padding: "12px 16px", borderRadius: "12px", textDecoration: "none",
          color: isActive ? "white" : "rgba(255,255,255,0.5)",
          background: isActive ? "rgba(99,102,241,0.3)" : "transparent",
          border: isActive ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent",
          transition: "all 0.2s ease", fontWeight: isActive ? "600" : "400"
        })}>
          {menu.icon}
          <span style={{ fontSize: "14px" }}>{menu.label}</span>
        </NavLink>
      ))}

      <div style={{ marginTop: "auto" }}>
        <button onClick={handleLogout} style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "12px 16px", borderRadius: "12px", width: "100%",
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#f87171", cursor: "pointer", fontSize: "14px", transition: "all 0.2s ease"
        }}>
          <LogOut size={20} />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}
