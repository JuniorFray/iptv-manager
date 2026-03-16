import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { AlertCircle, Clock, Users, DollarSign } from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  tipo: string;
  servidor: string;
  vencimento: string;
  status: string;
  valor: string;
}

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
};

const fmt = (val: number) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PERIODOS = [
  { label: "7 dias",  dias: 7  },
  { label: "15 dias", dias: 15 },
  { label: "30 dias", dias: 30 },
];

export default function DashboardFinanceiro() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [periodo, setPeriodo]   = useState(30);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clientes"), (snapshot) => {
      setClientes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Cliente[]);
    });
    return () => unsub();
  }, []);

  const hoje   = new Date(); hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje); limite.setDate(hoje.getDate() + periodo);

  const ativos   = clientes.filter((c) => c.status === "ativo");
  const inativos = clientes.filter((c) => c.status !== "ativo");

  const fatTotal = ativos.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0);

  const vencidos = clientes.filter((c) => {
    const d = parseDate(c.vencimento);
    return d && d < hoje;
  });
  const fatVencido = vencidos.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0);

  const proxVencer = ativos.filter((c) => {
    const d = parseDate(c.vencimento);
    return d && d >= hoje && d <= limite;
  });
  const fatEsperado = proxVencer.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0);

  const porServidor = clientes.reduce((acc, c) => {
    const key = c.servidor || "Sem servidor";
    if (!acc[key]) acc[key] = { total: 0, fat: 0 };
    acc[key].total++;
    acc[key].fat += parseFloat(c.valor) || 0;
    return acc;
  }, {} as Record<string, { total: number; fat: number }>);

  const cardStyle = (color: string) => ({
    padding: "24px",
    borderRadius: "16px",
    background: `rgba(${color},0.08)`,
    border: `1px solid rgba(${color},0.2)`,
    flex: 1,
    minWidth: "200px",
  });

  const labelStyle = {
    color: "rgba(255,255,255,0.5)",
    fontSize: "13px",
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "10px",
  };
  const valueStyle = (color: string) => ({
    color: `rgb(${color})`,
    fontSize: "28px",
    fontWeight: "bold",
    margin: "0 0 4px 0",
  });
  const subStyle = { color: "rgba(255,255,255,0.35)", fontSize: "12px" };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ color: "white", fontSize: "28px", fontWeight: "bold", margin: 0 }}>
          Dashboard Financeiro
        </h1>
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "4px", fontSize: "14px" }}>
          Visao geral de receita e vencimentos
        </p>
      </div>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>

        <div style={cardStyle("74,222,128")}>
          <p style={labelStyle}>Faturamento Total</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <DollarSign size={22} color="rgb(74,222,128)" />
            <h2 style={valueStyle("74,222,128")}>{fmt(fatTotal)}</h2>
          </div>
          <p style={subStyle}>{ativos.length} clientes ativos</p>
        </div>

        <div style={cardStyle("239,68,68")}>
          <p style={labelStyle}>Valor Vencidos</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertCircle size={22} color="rgb(239,68,68)" />
            <h2 style={valueStyle("239,68,68")}>{fmt(fatVencido)}</h2>
          </div>
          <p style={subStyle}>{vencidos.length} clientes com vencimento passado</p>
        </div>

        <div style={cardStyle("99,102,241")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <p style={{ ...labelStyle, marginBottom: 0 }}>Faturamento Esperado</p>
            <div style={{ display: "flex", gap: "6px" }}>
              {PERIODOS.map((p) => (
                <button key={p.dias} onClick={() => setPeriodo(p.dias)} style={{
                  padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "bold", cursor: "pointer",
                  background: periodo === p.dias ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.06)",
                  border: periodo === p.dias ? "1px solid rgba(99,102,241,0.8)" : "1px solid rgba(255,255,255,0.1)",
                  color: periodo === p.dias ? "#a5b4fc" : "rgba(255,255,255,0.4)"
                }}>{p.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Clock size={22} color="rgb(99,102,241)" />
            <h2 style={valueStyle("165,180,252")}>{fmt(fatEsperado)}</h2>
          </div>
          <p style={subStyle}>{proxVencer.length} clientes vencem nos proximos {periodo} dias</p>
        </div>

        <div style={cardStyle("251,191,36")}>
          <p style={labelStyle}>Total Clientes</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Users size={22} color="rgb(251,191,36)" />
            <h2 style={valueStyle("251,191,36")}>{clientes.length}</h2>
          </div>
          <p style={subStyle}>{inativos.length} inativos</p>
        </div>

      </div>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>

        <div className="glass-card" style={{ flex: 2, minWidth: "280px", overflow: "hidden" }}>
          <div style={{ padding: "20px 20px 0" }}>
            <h3 style={{ color: "white", margin: "0 0 16px", fontSize: "16px", fontWeight: "600" }}>
              Receita por Servidor
            </h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Servidor", "Clientes", "Faturamento"].map((h) => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: "11px", fontWeight: "600", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(porServidor)
                .sort((a, b) => b[1].fat - a[1].fat)
                .map(([nome, dados]) => (
                  <tr key={nome} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "12px 20px", color: "white", fontWeight: "500" }}>{nome}</td>
                    <td style={{ padding: "12px 20px", color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>{dados.total}</td>
                    <td style={{ padding: "12px 20px", color: "#4ade80", fontWeight: "600", fontSize: "14px" }}>{fmt(dados.fat)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="glass-card" style={{ flex: 3, minWidth: "320px", overflow: "hidden" }}>
          <div style={{ padding: "20px 20px 0" }}>
            <h3 style={{ color: "white", margin: "0 0 16px", fontSize: "16px", fontWeight: "600" }}>
              Vencendo nos proximos {periodo} dias
              <span style={{ marginLeft: "10px", background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", padding: "2px 10px", borderRadius: "20px", fontSize: "12px" }}>
                {proxVencer.length}
              </span>
            </h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Nome", "Telefone", "Servidor", "Vencimento", "Valor"].map((h) => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: "11px", fontWeight: "600", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proxVencer.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
                    Nenhum cliente vencendo nesse periodo.
                  </td>
                </tr>
              ) : proxVencer
                .sort((a, b) => (parseDate(a.vencimento)?.getTime() ?? 0) - (parseDate(b.vencimento)?.getTime() ?? 0))
                .map((c) => {
                  const d = parseDate(c.vencimento);
                  const diasRestantes = d ? Math.ceil((d.getTime() - hoje.getTime()) / 86400000) : null;
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "12px 20px", color: "white", fontWeight: "500" }}>{c.nome}</td>
                      <td style={{ padding: "12px 20px", color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>{c.telefone}</td>
                      <td style={{ padding: "12px 20px", color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>{c.servidor}</td>
                      <td style={{ padding: "12px 20px" }}>
                        <span style={{
                          fontSize: "13px", fontWeight: "600", padding: "3px 8px", borderRadius: "8px",
                          background: (diasRestantes ?? 99) <= 3 ? "rgba(239,68,68,0.15)" : (diasRestantes ?? 99) <= 7 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.06)",
                          color:      (diasRestantes ?? 99) <= 3 ? "#f87171"            : (diasRestantes ?? 99) <= 7 ? "#fbbf24"            : "rgba(255,255,255,0.6)",
                          border:     (diasRestantes ?? 99) <= 3 ? "1px solid rgba(239,68,68,0.3)" : (diasRestantes ?? 99) <= 7 ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(255,255,255,0.1)",
                        }}>
                          {c.vencimento} {diasRestantes !== null ? `(${diasRestantes}d)` : ""}
                        </span>
                      </td>
                      <td style={{ padding: "12px 20px", color: "#4ade80", fontWeight: "600", fontSize: "14px" }}>
                        {c.valor ? fmt(parseFloat(c.valor)) : "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
