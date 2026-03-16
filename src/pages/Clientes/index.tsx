import { useEffect, useState, useRef } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Pencil, Trash2, X, Check, Search, Upload } from "lucide-react";
import * as XLSX from "xlsx";

interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  tipo: string;
  servidor: string;
  usuario: string;
  senha: string;
  vencimento: string;
  status: string;
  valor: string;
}

interface Servidor {
  id: string;
  nome: string;
}

export default function Clientes() {
  const [clientes, setClientes]     = useState<Cliente[]>([]);
  const [servidores, setServidores] = useState<Servidor[]>([]);
  const [busca, setBusca]           = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]     = useState<Cliente | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    nome: "", telefone: "", tipo: "IPTV", servidor: "",
    usuario: "", senha: "", vencimento: "", status: "ativo", valor: ""
  });

  useEffect(() => {
    const unsubClientes = onSnapshot(collection(db, "clientes"), (snapshot) => {
      const dados = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Cliente[];
      setClientes(dados);
    });
    const unsubServidores = onSnapshot(collection(db, "servidores"), (snapshot) => {
      const dados = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Servidor[];
      setServidores(dados);
    });
    return () => { unsubClientes(); unsubServidores(); };
  }, []);

  const parseExcelDate = (val: any): string => {
    if (!val) return "";
    if (typeof val === "number") {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
    }
    const s = val.toString();
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (us) {
      const year = us[3].length === 2 ? `20${us[3]}` : us[3];
      return `${String(us[2]).padStart(2, "0")}/${String(us[1]).padStart(2, "0")}/${year}`;
    }
    return "";
  };

  const importarExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    setImportResult(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const abas = ["ELITE", "WAREZ", "CENTRAL"];
      let total = 0;
      let ignorados = 0;
      for (const aba of abas) {
        const sheet = workbook.Sheets[aba];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        let headerIdx = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].includes("NOME")) { headerIdx = i; break; }
        }
        if (headerIdx === -1) continue;
        const headers = rows[headerIdx];
        const nomeIdx      = headers.indexOf("NOME");
        const servidorIdx  = headers.indexOf("SERVIDOR");
        const telefoneIdx  = headers.indexOf("TELEFONE");
        const validadeIdx  = headers.indexOf("VALIDADE");
        const pagamentoIdx = headers.indexOf("PAGAMENTO");
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const nome = row[nomeIdx]?.toString().trim();
          if (!nome) continue;
          const telefone = row[telefoneIdx]?.toString().replace(/\D/g, "");
          if (!telefone || telefone.length < 8) { ignorados++; continue; }
          const servidorVal = row[servidorIdx]?.toString().trim() || "";
          const tipo = servidorVal.toUpperCase().includes("IPTV") ? "IPTV" : "P2P";
          const vencimento = parseExcelDate(row[validadeIdx]);
          const valorRaw = pagamentoIdx !== -1 ? row[pagamentoIdx] : "";
          const valor = valorRaw !== "" && valorRaw !== undefined
            ? parseFloat(valorRaw.toString().replace(",", ".")).toFixed(2)
            : "";
          await addDoc(collection(db, "clientes"), {
            nome, telefone, tipo,
            servidor: aba,
            usuario: "", senha: "",
            vencimento, valor,
            status: "ativo",
          });
          total++;
        }
      }
      setImportResult({ tipo: "ok", msg: `${total} clientes importados!${ignorados > 0 ? ` (${ignorados} ignorados)` : ""}` });
    } catch {
      setImportResult({ tipo: "erro", msg: "Erro ao ler o arquivo Excel." });
    } finally {
      setImportando(false);
      e.target.value = "";
      setTimeout(() => setImportResult(null), 6000);
    }
  };

  const clientesFiltrados = clientes.filter((c) =>
    c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    c.telefone?.includes(busca) ||
    c.servidor?.toLowerCase().includes(busca.toLowerCase())
  );

  const abrirModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditando(cliente);
      setForm({
        nome: cliente.nome, telefone: cliente.telefone, tipo: cliente.tipo || "IPTV",
        servidor: cliente.servidor, usuario: cliente.usuario, senha: cliente.senha,
        vencimento: cliente.vencimento, status: cliente.status, valor: cliente.valor || ""
      });
    } else {
      setEditando(null);
      setForm({ nome: "", telefone: "", tipo: "IPTV", servidor: "", usuario: "", senha: "", vencimento: "", status: "ativo", valor: "" });
    }
    setModalAberto(true);
  };

  const fecharModal = () => { setModalAberto(false); setEditando(null); };

  const salvar = async () => {
    if (!form.nome.trim()) return;
    setCarregando(true);
    try {
      if (editando) {
        await updateDoc(doc(db, "clientes", editando.id), form);
      } else {
        await addDoc(collection(db, "clientes"), form);
      }
      fecharModal();
    } finally {
      setCarregando(false);
    }
  };

  const excluir = async (id: string) => {
    if (confirm("Deseja excluir este cliente?")) await deleteDoc(doc(db, "clientes", id));
  };

  const statusColor = (status: string) => {
    if (status === "ativo") return { bg: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", text: "#4ade80" };
    return { bg: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", text: "#f87171" };
  };

  const tipoColor = (tipo: string) => {
    if (tipo === "IPTV") return { bg: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", text: "#60a5fa" };
    return { bg: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", text: "#c084fc" };
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)",
    color: "white", fontSize: "14px", outline: "none", boxSizing: "border-box" as const
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ color: "white", fontSize: "28px", fontWeight: "bold", margin: 0 }}>Clientes</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "4px", fontSize: "14px" }}>{clientes.length} clientes cadastrados</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={importarExcel} style={{ display: "none" }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={importando} style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: importando ? "rgba(255,255,255,0.08)" : "rgba(34,197,94,0.15)",
            color: importando ? "rgba(255,255,255,0.3)" : "#4ade80",
            border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", padding: "12px 20px",
            cursor: importando ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "14px"
          }}>
            <Upload size={18} /> {importando ? "Importando..." : "Importar Excel"}
          </button>
          <button onClick={() => abrirModal()} style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white",
            border: "none", borderRadius: "12px", padding: "12px 20px",
            cursor: "pointer", fontWeight: "bold", fontSize: "14px",
            boxShadow: "0 4px 15px rgba(99,102,241,0.4)"
          }}>
            <Plus size={18} /> Novo Cliente
          </button>
        </div>
      </div>

      {importResult && (
        <div style={{
          marginBottom: "16px", padding: "14px 18px", borderRadius: "12px",
          background: importResult.tipo === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          border: importResult.tipo === "ok" ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)",
          color: importResult.tipo === "ok" ? "#4ade80" : "#f87171",
          fontWeight: "600", fontSize: "14px"
        }}>
          {importResult.msg}
        </div>
      )}

      <div className="glass-card" style={{ padding: "16px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <Search size={18} color="rgba(255,255,255,0.4)" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone ou servidor..."
          style={{ ...inputStyle, border: "none", background: "transparent", padding: "0" }} />
      </div>

      <div className="glass-card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Nome", "Telefone", "Tipo", "Servidor", "Usuário", "Vencimento", "Valor", "Status", "Ações"].map((h) => (
                <th key={h} style={{ padding: "14px 16px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientesFiltrados.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Nenhum cliente encontrado.</td></tr>
            ) : clientesFiltrados.map((cliente) => {
              const sc = statusColor(cliente.status);
              const tc = tipoColor(cliente.tipo || "IPTV");
              return (
                <tr key={cliente.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "14px 16px", color: "white", fontWeight: "500" }}>{cliente.nome}</td>
                  <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>{cliente.telefone}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: tc.bg, border: tc.border, color: tc.text, padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>
                      {cliente.tipo || "IPTV"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>{cliente.servidor}</td>
                  <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>{cliente.usuario}</td>
                  <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>{cliente.vencimento}</td>
                  <td style={{ padding: "14px 16px", color: "#4ade80", fontWeight: "600", fontSize: "14px" }}>
                    {cliente.valor ? `R$ ${parseFloat(cliente.valor).toFixed(2).replace(".", ",")}` : "—"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ background: sc.bg, border: sc.border, color: sc.text, padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>
                      {cliente.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => abrirModal(cliente)} style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "8px", padding: "7px", cursor: "pointer", color: "#818cf8" }}><Pencil size={14} /></button>
                      <button onClick={() => excluir(cliente.id)} style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "7px", cursor: "pointer", color: "#f87171" }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="glass-card" style={{ padding: "32px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ color: "white", margin: 0, fontSize: "20px" }}>{editando ? "Editar Cliente" : "Novo Cliente"}</h2>
              <button onClick={fecharModal} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                { label: "Nome *",     key: "nome",       placeholder: "Nome completo" },
                { label: "Telefone",   key: "telefone",   placeholder: "Ex: 13999999999" },
                { label: "Usuário",    key: "usuario",    placeholder: "Usuário IPTV" },
                { label: "Senha",      key: "senha",      placeholder: "Senha IPTV" },
                { label: "Vencimento", key: "vencimento", placeholder: "DD/MM/AAAA" },
                { label: "Valor (R$)", key: "valor",      placeholder: "Ex: 35.00" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>{label}</label>
                  <input
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="input-glass"
                    placeholder={placeholder}
                    type={key === "valor" ? "number" : "text"}
                    step={key === "valor" ? "0.01" : undefined}
                    min={key === "valor" ? "0" : undefined}
                  />
                </div>
              ))}
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Tipo</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  {["IPTV", "P2P"].map((tipo) => (
                    <button key={tipo} onClick={() => setForm({ ...form, tipo })} style={{
                      flex: 1, padding: "10px", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "14px",
                      background: form.tipo === tipo ? (tipo === "IPTV" ? "rgba(59,130,246,0.3)" : "rgba(168,85,247,0.3)") : "rgba(255,255,255,0.05)",
                      border: form.tipo === tipo ? (tipo === "IPTV" ? "1px solid rgba(59,130,246,0.6)" : "1px solid rgba(168,85,247,0.6)") : "1px solid rgba(255,255,255,0.1)",
                      color: form.tipo === tipo ? (tipo === "IPTV" ? "#60a5fa" : "#c084fc") : "rgba(255,255,255,0.4)"
                    }}>{tipo}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Servidor</label>
                <select value={form.servidor} onChange={(e) => setForm({ ...form, servidor: e.target.value })}
                  style={{ inputStyle, cursor: "pointer" } as any}>
                  <option value="" style={{ background: "#1e1e2e" }}>Selecione um servidor</option>
                  {servidores.map((s) => (
                    <option key={s.id} value={s.nome} style={{ background: "#1e1e2e" }}>{s.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="ativo" style={{ background: "#1e1e2e" }}>Ativo</option>
                  <option value="inativo" style={{ background: "#1e1e2e" }}>Inativo</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button onClick={fecharModal} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Cancelar</button>
                <button onClick={salvar} disabled={carregando || !form.nome.trim()} style={{
                  flex: 1, padding: "12px", borderRadius: "12px", border: "none",
                  background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white",
                  cursor: "pointer", fontWeight: "bold", opacity: carregando || !form.nome.trim() ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                }}>
                  <Check size={16} /> {carregando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
