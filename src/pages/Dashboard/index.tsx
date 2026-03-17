import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { Users, CheckCircle, XCircle, Server, AlertTriangle, TrendingUp, Clock } from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  servidor: string;
  tipo: string;
  status: string;
  vencimento: string;
}

function parseData(vencimento: string): Date | null {
  if (!vencimento) return null;
  const partes = vencimento.split("/");
  if (partes.length !== 3) return null;
  return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
}

function diferencaDias(data: Date): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(data);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clientes"), (snapshot) => {
      setClientes(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Cliente[]);
    });
    return unsub;
  }, []);

  const total = clientes.length;
  const ativos = clientes.filter((c) => c.status === "ativo").length;
  const inativos = clientes.filter((c) => c.status === "inativo").length;
  const iptv = clientes.filter((c) => (c.tipo || "IPTV") === "IPTV").length;
  const p2p = clientes.filter((c) => c.tipo === "P2P").length;

  const vencendoHoje    = clientes.filter((c) => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false; });
  const vencendo4dias   = clientes.filter((c) => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false; });
  const vencendo7dias   = clientes.filter((c) => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false; });

  const porServidor: Record<string, number> = {};
  clientes.forEach((c) => { if (c.servidor) porServidor[c.servidor] = (porServidor[c.servidor] || 0) + 1; });

  const cards = [
    { label: "Total de Clientes",  value: total,   icon: <Users size={24} color="white" />,       gradient: "linear-gradient(135deg,#3b82f6,#6366f1)", shadow: "rgba(99,102,241,0.4)"  },
    { label: "Clientes Ativos",    value: ativos,  icon: <CheckCircle size={24} color="white" />, gradient: "linear-gradient(135deg,#22c55e,#16a34a)", shadow: "rgba(34,197,94,0.4)"   },
    { label: "Clientes Inativos",  value: inativos,icon: <XCircle size={24} color="white" />,     gradient: "linear-gradient(135deg,#ef4444,#dc2626)", shadow: "rgba(239,68,68,0.4)"   },
    { label: "Vencendo em 7 dias", value: vencendoHoje.length + vencendo4dias.length + vencendo7dias.length, icon: <AlertTriangle size={24} color="white" />, gradient: "linear-gradient(135deg,#f59e0b,#d97706)", shadow: "rgba(245,158,11,0.4)" },
  ];

  const alertas = [
    {
      titulo: "Vencendo Hoje",
      clientes: vencendoHoje,
      cor: "#f87171",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.25)",
      badgeBg: "rgba(239,68,68,0.2)", badgeBorder: "rgba(239,68,68,0.4)", badgeText: "#f87171",
    },
    {
      titulo: "Vencendo em 4 dias",
      clientes: vencendo4dias,
      cor: "#fbbf24",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.25)",
      badgeBg: "rgba(245,158,11,0.2)", badgeBorder: "rgba(245,158,11,0.4)", badgeText: "#fbbf24",
    },
    {
      titulo: "Vencendo em 7 dias",
      clientes: vencendo7dias,
      cor: "#818cf8",
      bg: "rgba(99,102,241,0.08)",
      border: "rgba(99,102,241,0.25)",
      badgeBg: "rgba(99,102,241,0.2)", badgeBorder: "rgba(99,102,241,0.4)", badgeText: "#818cf8",
    },
  ];

  //const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "14px", outline: "none", boxSizing: "border-box" as const };

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ color: "white", fontSize: "28px", fontWeight: "bold", margin: 0 }}>Dashboard</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "4px", fontSize: "14px" }}>Visão geral do sistema</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        {cards.map((card) => (
          <div key={card.label} className="glass-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", margin: "0 0 8px" }}>{card.label}</p>
                <h2 style={{ color: "white", fontSize: "36px", fontWeight: "bold", margin: 0 }}>{card.value}</h2>
              </div>
              <div style={{ background: card.gradient, padding: "12px", borderRadius: "14px", boxShadow: "0 4px 15px " + card.shadow }}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <TrendingUp size={20} color="#818cf8" />
            <h3 style={{ color: "white", margin: 0, fontSize: "16px" }}>Tipo de Serviço</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {[
              { label: "IPTV", value: iptv, color: "#60a5fa", bg: "rgba(59,130,246,0.3)" },
              { label: "P2P",  value: p2p,  color: "#c084fc", bg: "rgba(168,85,247,0.3)" },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>{item.label}</span>
                  <span style={{ color: item.color, fontWeight: "bold", fontSize: "14px" }}>{item.value}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "99px", height: "8px", overflow: "hidden" }}>
                  <div style={{ width: total > 0 ? (item.value / total * 100) + "%" : "0%", height: "100%", background: item.bg, borderRadius: "99px", transition: "width 0.5s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <Server size={20} color="#818cf8" />
            <h3 style={{ color: "white", margin: 0, fontSize: "16px" }}>Clientes por Servidor</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {Object.keys(porServidor).length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px", margin: 0 }}>Nenhum dado disponível.</p>
            ) : Object.entries(porServidor).map(([servidor, qtd]) => (
              <div key={servidor}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>{servidor}</span>
                  <span style={{ color: "#818cf8", fontWeight: "bold", fontSize: "14px" }}>{qtd}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "99px", height: "8px", overflow: "hidden" }}>
                  <div style={{ width: total > 0 ? (qtd / total * 100) + "%" : "0%", height: "100%", background: "rgba(99,102,241,0.5)", borderRadius: "99px", transition: "width 0.5s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Clock size={20} color="#fbbf24" />
          <h3 style={{ color: "white", margin: 0, fontSize: "16px" }}>Alertas de Vencimento</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {alertas.map((alerta) => (
            <div key={alerta.titulo} className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertTriangle size={16} color={alerta.cor} />
                  <h4 style={{ color: alerta.cor, margin: 0, fontSize: "14px", fontWeight: "600" }}>{alerta.titulo}</h4>
                </div>
                <span style={{ background: alerta.badgeBg, border: "1px solid " + alerta.badgeBorder, color: alerta.badgeText, padding: "2px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "700" }}>
                  {alerta.clientes.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {alerta.clientes.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "13px", margin: 0, textAlign: "center", padding: "12px 0" }}>Nenhum cliente</p>
                ) : alerta.clientes.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: alerta.bg, border: "1px solid " + alerta.border, borderRadius: "10px" }}>
                    <span style={{ color: "white", fontWeight: "500", fontSize: "14px" }}>{c.nome}</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>{c.servidor}</span>
                      <span style={{ background: alerta.badgeBg, border: "1px solid " + alerta.badgeBorder, color: alerta.badgeText, padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: "600" }}>{c.vencimento}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
