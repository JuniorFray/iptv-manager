import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import { Send, Users, CheckCircle, Plus, Trash2, X, BookOpen, Wifi, WifiOff, QrCode, Settings, Clock, CheckCircle2, XCircle, Play, Save } from "lucide-react";
import axios from "axios";

const API = "https://iptv-manager-production.up.railway.app";

interface Cliente { id: string; nome: string; telefone: string; servidor: string; tipo: string; status: string; vencimento: string; }
interface ModeloMensagem { id: string; titulo: string; texto: string; }
interface LogEntry { id: string; clienteNome: string; telefone: string; gatilho: string; mensagem: string; status: string; data: string; hora: string; }
interface Regra { ativo: boolean; mensagem: string; }
interface Config { horario: string; ativo: boolean; regras: { dias7: Regra; dias4: Regra; dia0: Regra; pos1: Regra; pos3: Regra; }; }

function parseData(v: string): Date | null {
  if (!v) return null;
  const p = v.split("/");
  if (p.length !== 3) return null;
  return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
}
function diferencaDias(d: Date): number {
  const h = new Date(); h.setHours(0,0,0,0);
  const a = new Date(d); a.setHours(0,0,0,0);
  return Math.round((a.getTime() - h.getTime()) / 86400000);
}

const filtros = [
  { id: "todos",     label: "Todos os Clientes", cor: "#34d399", bg: "rgba(52,211,153,0.15)",  border: "rgba(52,211,153,0.3)"  },
  { id: "venc_hoje", label: "Vencendo Hoje",      cor: "#f87171", bg: "rgba(239,68,68,0.15)",   border: "rgba(239,68,68,0.3)"   },
  { id: "venc_4",    label: "Vencendo em 4 dias", cor: "#fbbf24", bg: "rgba(245,158,11,0.15)",  border: "rgba(245,158,11,0.3)"  },
  { id: "venc_7",    label: "Vencendo em 7 dias", cor: "#818cf8", bg: "rgba(99,102,241,0.15)",  border: "rgba(99,102,241,0.3)"  },
  { id: "manual",    label: "Mensagem Manual",    cor: "#60a5fa", bg: "rgba(59,130,246,0.15)",  border: "rgba(59,130,246,0.3)"  },
];
const intervalos = [
  { label: "1 segundo",   valor: 1000  },
  { label: "2 segundos",  valor: 2000  },
  { label: "3 segundos",  valor: 3000  },
  { label: "5 segundos",  valor: 5000  },
  { label: "10 segundos", valor: 10000 },
  { label: "30 segundos", valor: 30000 },
];
const REGRAS_INFO = [
  { key: "dias7", label: "7 dias antes",        cor: "59,130,246"  },
  { key: "dias4", label: "4 dias antes",         cor: "251,191,36"  },
  { key: "dia0",  label: "No dia do vencimento", cor: "239,68,68"   },
  { key: "pos1",  label: "1 dia apos vencer",    cor: "168,85,247"  },
  { key: "pos3",  label: "3 dias apos vencer",   cor: "239,68,68"   },
];
const VARIAVEIS = ["[NOME]", "[VENCIMENTO]", "[SERVIDOR]", "[VALOR]"];

export default function Notificacoes() {
  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [modelos, setModelos]         = useState<ModeloMensagem[]>([]);
  const [filtro, setFiltro]           = useState("todos");
  const [clienteSel, setClienteSel]   = useState<Cliente | null>(null);
  const [mensagem, setMensagem]       = useState("");
  const [busca, setBusca]             = useState("");
  const [intervalo, setIntervalo]     = useState(2000);
  const [modalModelo, setModalModelo] = useState(false);
  const [novoTitulo, setNovoTitulo]   = useState("");
  const [novoTexto, setNovoTexto]     = useState("");
  const [enviando, setEnviando]       = useState(false);
  const [progresso, setProgresso]     = useState(0);
  const [whatsReady, setWhatsReady]   = useState(false);
  const [qrCode, setQrCode]           = useState<string | null>(null);
  const [mostrarQR, setMostrarQR]     = useState(false);
  const [resultado, setResultado]     = useState<{tipo:"ok"|"erro", msg:string} | null>(null);
  const [aba, setAba]                 = useState<"manual"|"auto"|"log">("manual");
  const [config, setConfig] = useState<Config>({
    horario: "09:00",
    ativo: true,
    regras: {
      dias7: { ativo: true, mensagem: "Ola [NOME]! Sua assinatura do servidor [SERVIDOR] vence em 7 dias, no dia *[VENCIMENTO]*.\n\nRenove com antecedencia para nao perder o acesso!" },
      dias4: { ativo: true, mensagem: "Ola [NOME]! Sua assinatura do servidor [SERVIDOR] vence em 4 dias, no dia *[VENCIMENTO]*.\n\nNao deixe para a ultima hora, entre em contato para renovar!" },
      dia0:  { ativo: true, mensagem: "Ola [NOME]! Sua assinatura do servidor [SERVIDOR] vence *HOJE*!\n\nRenove agora para nao perder o acesso. Valor: *[VALOR]*" },
      pos1:  { ativo: true, mensagem: "Ola [NOME]! Sua assinatura do servidor [SERVIDOR] venceu ontem (*[VENCIMENTO]*).\n\nEntre em contato para regularizar e reativar seu acesso!" },
      pos3:  { ativo: true, mensagem: "Ola [NOME]! Sua assinatura do servidor [SERVIDOR] esta vencida ha 3 dias (*[VENCIMENTO]*).\n\nRegularize seu acesso o quanto antes!" },
    }
  });
  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [salvando, setSalvando]       = useState(false);
  const [saved, setSaved]             = useState(false);
  const [disparando, setDisparando]   = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const intervalRef                   = useRef<any>(null);
  const prevReady                     = useRef(false);
  const prevQr                        = useRef("");

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "14px", outline: "none", boxSizing: "border-box" as const };

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "clientes"), (s) =>
      setClientes(s.docs.map((d) => ({ id: d.id, ...d.data() })) as Cliente[]));
    const u2 = onSnapshot(collection(db, "modelosMensagens"), (s) =>
      setModelos(s.docs.map((d) => ({ id: d.id, ...d.data() })) as ModeloMensagem[]));
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    const verificar = async () => {
      try {
        const res = await fetch(API + "/status");
        const data = await res.json();
        if (data.ready !== prevReady.current) { prevReady.current = data.ready; setWhatsReady(data.ready); }
        const qr = data.qr || "";
        if (!data.ready && qr !== prevQr.current) { prevQr.current = qr; setQrCode(qr || null); }
      } catch {
        if (prevReady.current) { prevReady.current = false; setWhatsReady(false); }
      }
    };
    verificar();
    intervalRef.current = setInterval(verificar, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    axios.get(`${API}/config`).then(res => setConfig(res.data)).catch(() => {});
  }, []);

  const carregarLogs = async () => {
    try { const res = await axios.get(`${API}/logs`); setLogs(res.data); } catch {}
  };

  const filtroAtual = filtros.find((f) => f.id === filtro)!;

  const clientesFiltrados = (() => {
    let lista = clientes.filter((c) => c.telefone);
    if (filtro === "venc_hoje") lista = lista.filter((c) => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false; });
    else if (filtro === "venc_4") lista = lista.filter((c) => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false; });
    else if (filtro === "venc_7") lista = lista.filter((c) => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false; });
    if (busca) lista = lista.filter((c) => c.nome?.toLowerCase().includes(busca.toLowerCase()) || c.telefone?.includes(busca));
    return lista;
  })();

  const substituir = (texto: string, c: Cliente) =>
    texto.replace("{nome}", c.nome).replace("{vencimento}", c.vencimento)
         .replace("{tipo}", c.tipo || "IPTV").replace("{servidor}", c.servidor || "");

  const salvarModelo = async () => {
    if (!novoTitulo.trim() || !novoTexto.trim()) return;
    await addDoc(collection(db, "modelosMensagens"), { titulo: novoTitulo, texto: novoTexto });
    setNovoTitulo(""); setNovoTexto(""); setModalModelo(false);
  };

  const excluirModelo = async (id: string) => {
    if (confirm("Excluir este modelo?")) await deleteDoc(doc(db, "modelosMensagens", id));
  };

  const aplicarModelo = (m: ModeloMensagem) => {
    setMensagem(clienteSel ? substituir(m.texto, clienteSel) : m.texto);
  };

  const enviarUm = async () => {
    if (!clienteSel || !mensagem.trim()) return;
    try {
      const res = await fetch(API + "/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: clienteSel.telefone, mensagem })
      });
      const data = await res.json();
      if (data.sucesso) setResultado({ tipo: "ok", msg: "Mensagem enviada para " + clienteSel.nome + "!" });
      else setResultado({ tipo: "erro", msg: data.erro || "Erro ao enviar." });
    } catch { setResultado({ tipo: "erro", msg: "Backend offline." }); }
    setTimeout(() => setResultado(null), 4000);
  };

  const enviarTodos = async () => {
    if (enviando || clientesFiltrados.length === 0 || !mensagem.trim()) return;
    setEnviando(true); setProgresso(0);
    for (let i = 0; i < clientesFiltrados.length; i++) {
      const c = clientesFiltrados[i];
      try {
        await fetch(API + "/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telefone: c.telefone, mensagem: substituir(mensagem, c) })
        });
      } catch {}
      setProgresso(i + 1);
      await new Promise((r) => setTimeout(r, intervalo));
    }
    setEnviando(false);
    setResultado({ tipo: "ok", msg: "Envio concluido!" });
    setTimeout(() => setResultado(null), 4000);
  };

  const salvarConfig = async () => {
    if (!config) return;
    setSalvando(true);
    try {
      await axios.post(`${API}/config`, config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSalvando(false); }
  };

  const dispararAgora = async () => {
    setDisparando(true);
    try {
      await axios.post(`${API}/send-automatico`);
      await carregarLogs();
      setResultado({ tipo: "ok", msg: "Disparo automatico executado com sucesso!" });
      setTimeout(() => setResultado(null), 4000);
    } finally { setDisparando(false); }
  };

  const updateRegra = (key: string, field: string, value: any) => {
    if (!config) return;
    setConfig({ ...config, regras: { ...config.regras, [key]: { ...config.regras[key as keyof typeof config.regras], [field]: value } } });
  };

  const desconectarWhatsApp = async () => {
    setDesconectando(true);
    try { await axios.post(`${API}/logout`); } catch {}
    setDesconectando(false);
    setMostrarQR(false);
  };

  const gatilhoLabel = (key: string) => REGRAS_INFO.find(r => r.key === key)?.label || key;
  const gatilhoCor   = (key: string) => REGRAS_INFO.find(r => r.key === key)?.cor || "255,255,255";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ color: "white", fontSize: "28px", fontWeight: "bold", margin: 0 }}>WhatsApp</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "4px", fontSize: "14px" }}>Envie notificacoes para seus clientes</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div onClick={() => setMostrarQR(true)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "12px", cursor: "pointer", background: whatsReady ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", border: whatsReady ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)" }}>
            {whatsReady ? <Wifi size={16} color="#4ade80" /> : <WifiOff size={16} color="#f87171" />}
            <span style={{ color: whatsReady ? "#4ade80" : "#f87171", fontSize: "13px", fontWeight: "600" }}>{whatsReady ? "Conectado" : "Desconectado"}</span>
            {!whatsReady && <QrCode size={14} color="#f87171" />}
          </div>
          <button onClick={() => setModalModelo(true)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white", border: "none", borderRadius: "12px", padding: "10px 18px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>
            <Plus size={16} /> Novo Modelo
          </button>
        </div>
      </div>

      {resultado && (
        <div style={{ marginBottom: "16px", padding: "14px 18px", borderRadius: "12px", background: resultado.tipo === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", border: resultado.tipo === "ok" ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)", color: resultado.tipo === "ok" ? "#4ade80" : "#f87171", fontWeight: "600", fontSize: "14px" }}>
          {resultado.msg}
        </div>
      )}

      {/* Abas */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {[
          { key: "manual", label: "Envio Manual",      icon: <Send size={15} /> },
          { key: "auto",   label: "Envio Automatico",  icon: <Settings size={15} /> },
          { key: "log",    label: "Historico",         icon: <Clock size={15} /> },
        ].map((a) => (
          <button key={a.key} onClick={() => { setAba(a.key as any); if (a.key === "log") carregarLogs(); }} style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 20px", borderRadius: "12px", cursor: "pointer", fontWeight: "bold", fontSize: "14px",
            background: aba === a.key ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.05)",
            border: aba === a.key ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.1)",
            color: aba === a.key ? "white" : "rgba(255,255,255,0.5)"
          }}>{a.icon}{a.label}</button>
        ))}
      </div>

      {/* ABA MANUAL */}
      {aba === "manual" && (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ color: "white", margin: "0 0 14px", fontSize: "15px" }}>Filtrar Clientes</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {filtros.map((f) => (
                  <button key={f.id} onClick={() => { setFiltro(f.id); setClienteSel(null); setBusca(""); }} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "10px", cursor: "pointer", textAlign: "left", background: filtro === f.id ? f.bg : "rgba(255,255,255,0.03)", border: filtro === f.id ? "1px solid " + f.border : "1px solid rgba(255,255,255,0.06)", color: filtro === f.id ? f.cor : "rgba(255,255,255,0.5)", fontWeight: filtro === f.id ? "600" : "400", fontSize: "14px" }}>
                    {f.label}
                    <span style={{ marginLeft: "auto", color: filtro === f.id ? f.cor : "rgba(255,255,255,0.3)", fontSize: "12px", fontWeight: "700" }}>
                      {f.id === "venc_hoje" ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false; }).length
                      : f.id === "venc_4" ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false; }).length
                      : f.id === "venc_7" ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false; }).length
                      : clientes.filter(c => c.telefone).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ color: "white", margin: "0 0 12px", fontSize: "15px" }}>Selecionar Cliente</h3>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." style={{ ...inputStyle, marginBottom: "10px" }} />
              <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                {clientesFiltrados.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px", textAlign: "center", padding: "16px 0", margin: 0 }}>Nenhum cliente</p>
                ) : clientesFiltrados.map((c) => (
                  <button key={c.id} onClick={() => { setClienteSel(c); if (mensagem) setMensagem(substituir(mensagem, c)); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", background: clienteSel?.id === c.id ? filtroAtual.bg : "rgba(255,255,255,0.03)", border: clienteSel?.id === c.id ? "1px solid " + filtroAtual.border : "1px solid rgba(255,255,255,0.06)", color: "white", textAlign: "left" }}>
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: "500" }}>{c.nome}</span>
                      <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{c.telefone}</span>
                    </div>
                    {clienteSel?.id === c.id && <CheckCircle size={14} color={filtroAtual.cor} />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <BookOpen size={18} color="#818cf8" />
                <h3 style={{ color: "white", margin: 0, fontSize: "15px" }}>Modelos Salvos</h3>
              </div>
              {modelos.length === 0 ? (
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px", margin: 0 }}>Nenhum modelo salvo ainda.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {modelos.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "8px", padding: "6px 12px" }}>
                      <button onClick={() => aplicarModelo(m)} style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", fontSize: "13px", fontWeight: "600", padding: 0 }}>{m.titulo}</button>
                      <button onClick={() => excluirModelo(m.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer", padding: 0, display: "flex" }}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ color: "white", margin: "0 0 14px", fontSize: "15px" }}>Editar Mensagem</h3>
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Selecione um modelo ou escreva sua mensagem..." rows={5} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: "1.6" }} />
              <button onClick={enviarUm} disabled={!clienteSel || !mensagem.trim() || !whatsReady} style={{ width: "100%", marginTop: "12px", padding: "13px", borderRadius: "12px", border: "none", cursor: "pointer", background: !clienteSel || !mensagem.trim() || !whatsReady ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#25d366,#128c7e)", color: !clienteSel || !mensagem.trim() || !whatsReady ? "rgba(255,255,255,0.3)" : "white", fontWeight: "bold", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <Send size={18} /> {!whatsReady ? "WhatsApp desconectado" : "Enviar para " + (clienteSel ? clienteSel.nome : "...")}
              </button>
            </div>
            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <Users size={18} color={filtroAtual.cor} />
                <h3 style={{ color: "white", margin: 0, fontSize: "15px" }}>Envio em Massa</h3>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "14px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Intervalo entre envios</label>
                  <select value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer" }}>
                    {intervalos.map((i) => (<option key={i.valor} value={i.valor} style={{ background: "#1e1e2e" }}>{i.label}</option>))}
                  </select>
                </div>
                <div style={{ background: filtroAtual.bg, border: "1px solid " + filtroAtual.border, borderRadius: "10px", padding: "10px 16px", textAlign: "center" }}>
                  <span style={{ color: filtroAtual.cor, fontWeight: "bold", fontSize: "18px" }}>{clientesFiltrados.length}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", display: "block" }}>clientes</span>
                </div>
              </div>
              {enviando && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>Enviando...</span>
                    <span style={{ color: filtroAtual.cor, fontSize: "13px", fontWeight: "600" }}>{progresso}/{clientesFiltrados.length}</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "99px", height: "6px" }}>
                    <div style={{ width: (progresso / clientesFiltrados.length * 100) + "%", height: "100%", background: filtroAtual.cor, borderRadius: "99px" }} />
                  </div>
                </div>
              )}
              <button onClick={enviarTodos} disabled={enviando || clientesFiltrados.length === 0 || !mensagem.trim() || !whatsReady} style={{ width: "100%", padding: "13px", borderRadius: "12px", border: "1px solid " + filtroAtual.border, background: enviando || !whatsReady ? "rgba(255,255,255,0.05)" : filtroAtual.bg, color: enviando || !whatsReady ? "rgba(255,255,255,0.3)" : filtroAtual.cor, cursor: enviando || !whatsReady ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <Send size={16} /> {enviando ? "Enviando..." : "Enviar para todos (" + clientesFiltrados.length + ")"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA AUTOMATICO */}
      {aba === "auto" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="glass-card" style={{ padding: "24px" }}>
            <h3 style={{ color: "white", margin: "0 0 20px", fontSize: "16px", fontWeight: "600" }}>Configuracoes Gerais</h3>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Horario de envio diario</label>
                <input type="time" value={config.horario} onChange={(e) => setConfig({ ...config, horario: e.target.value })} style={{ ...inputStyle, width: "140px" }} />
              </div>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Envio automatico</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[{ v: true, l: "Ativado" }, { v: false, l: "Desativado" }].map(({ v, l }) => (
                    <button key={String(v)} onClick={() => setConfig({ ...config, ativo: v })} style={{ padding: "8px 16px", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "13px", background: config.ativo === v ? (v ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)") : "rgba(255,255,255,0.05)", border: config.ativo === v ? (v ? "1px solid rgba(34,197,94,0.6)" : "1px solid rgba(239,68,68,0.6)") : "1px solid rgba(255,255,255,0.1)", color: config.ativo === v ? (v ? "#4ade80" : "#f87171") : "rgba(255,255,255,0.4)" }}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Disparar agora</label>
                <button onClick={dispararAgora} disabled={disparando || !whatsReady} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "10px", cursor: disparando || !whatsReady ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "13px", background: disparando || !whatsReady ? "rgba(255,255,255,0.05)" : "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.4)", color: disparando || !whatsReady ? "rgba(255,255,255,0.3)" : "#a5b4fc" }}>
                  <Play size={14} /> {disparando ? "Disparando..." : "Executar agora"}
                </button>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", marginBottom: "4px" }}>Variaveis disponiveis:</p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {VARIAVEIS.map(v => (
                    <span key={v} style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", padding: "2px 8px", borderRadius: "6px", fontSize: "12px", fontFamily: "monospace" }}>{v}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {REGRAS_INFO.map(({ key, label, cor }) => {
            const regra = config.regras[key as keyof typeof config.regras];
            return (
              <div key={key} className="glass-card" style={{ padding: "24px", borderLeft: `3px solid rgba(${cor},0.6)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <span style={{ background: `rgba(${cor},0.15)`, border: `1px solid rgba(${cor},0.3)`, color: `rgb(${cor})`, padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: "600" }}>{label}</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {[{ v: true, l: "Ativo" }, { v: false, l: "Inativo" }].map(({ v, l }) => (
                      <button key={String(v)} onClick={() => updateRegra(key, "ativo", v)} style={{ padding: "6px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "12px", background: regra.ativo === v ? (v ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)") : "rgba(255,255,255,0.05)", border: regra.ativo === v ? (v ? "1px solid rgba(34,197,94,0.6)" : "1px solid rgba(239,68,68,0.6)") : "1px solid rgba(255,255,255,0.1)", color: regra.ativo === v ? (v ? "#4ade80" : "#f87171") : "rgba(255,255,255,0.4)" }}>{l}</button>
                    ))}
                  </div>
                </div>
                <label style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Mensagem</label>
                <textarea value={regra.mensagem} onChange={(e) => updateRegra(key, "mensagem", e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: "1.5" }} />
              </div>
            );
          })}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={salvarConfig} disabled={salvando} style={{ display: "flex", alignItems: "center", gap: "8px", background: saved ? "rgba(34,197,94,0.3)" : "linear-gradient(135deg,#3b82f6,#6366f1)", border: saved ? "1px solid rgba(34,197,94,0.5)" : "none", color: "white", borderRadius: "12px", padding: "12px 28px", cursor: salvando ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "14px", opacity: salvando ? 0.6 : 1 }}>
              <Save size={16} /> {saved ? "Salvo!" : salvando ? "Salvando..." : "Salvar Configuracoes"}
            </button>
          </div>
        </div>
      )}

      {/* ABA LOG */}
      {aba === "log" && (
        <div className="glass-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ color: "white", margin: "0 0 16px", fontSize: "16px", fontWeight: "600" }}>Historico de Envios</h3>
            <button onClick={carregarLogs} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontSize: "13px", marginBottom: "16px" }}>Atualizar</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Data/Hora", "Cliente", "Telefone", "Gatilho", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: "11px", fontWeight: "600", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Nenhum envio registrado.</td></tr>
              ) : logs.map((log) => {
                const cor = gatilhoCor(log.gatilho);
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "12px 20px", color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>{log.data} {log.hora}</td>
                    <td style={{ padding: "12px 20px", color: "white", fontWeight: "500" }}>{log.clienteNome}</td>
                    <td style={{ padding: "12px 20px", color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>{log.telefone}</td>
                    <td style={{ padding: "12px 20px" }}>
                      <span style={{ background: `rgba(${cor},0.15)`, border: `1px solid rgba(${cor},0.3)`, color: `rgb(${cor})`, padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>
                        {gatilhoLabel(log.gatilho)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", color: log.status === "enviado" ? "#4ade80" : "#f87171" }}>
                        {log.status === "enviado" ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {log.status === "enviado" ? "Enviado" : "Erro"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal QR */}
      {mostrarQR && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="glass-card" style={{ padding: "32px", maxWidth: "400px", width: "100%", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ color: "white", margin: 0, fontSize: "20px" }}>Conectar WhatsApp</h2>
              <button onClick={() => setMostrarQR(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}><X size={20} /></button>
            </div>
            {whatsReady ? (
              <div style={{ padding: "24px" }}>
                <CheckCircle2 size={48} color="#4ade80" style={{ marginBottom: "12px" }} />
                <p style={{ color: "#4ade80", fontWeight: "bold", fontSize: "16px", marginBottom: "20px" }}>WhatsApp Conectado!</p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                  <button onClick={() => setMostrarQR(false)} style={{ padding: "10px 24px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,#25d366,#128c7e)", color: "white", cursor: "pointer", fontWeight: "bold" }}>Fechar</button>
                  <button onClick={desconectarWhatsApp} disabled={desconectando} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.15)", color: "#f87171", cursor: desconectando ? "not-allowed" : "pointer", fontWeight: "bold", opacity: desconectando ? 0.6 : 1 }}>
                    <WifiOff size={14} /> {desconectando ? "Desconectando..." : "Desconectar"}
                  </button>
                </div>
              </div>
            ) : qrCode ? (
              <div>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", marginBottom: "20px" }}>Abra o WhatsApp, va em Aparelhos conectados e escaneie</p>
                <img src={qrCode} alt="QR Code" style={{ width: "260px", height: "260px", borderRadius: "16px", background: "white", padding: "8px" }} />
              </div>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", padding: "24px" }}>Aguardando backend...</p>
            )}
          </div>
        </div>
      )}

      {/* Modal Novo Modelo */}
      {modalModelo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="glass-card" style={{ padding: "32px", width: "100%", maxWidth: "480px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ color: "white", margin: 0, fontSize: "20px" }}>Novo Modelo</h2>
              <button onClick={() => setModalModelo(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Nome *</label>
                <input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} className="input-glass" placeholder="Ex: Aviso de Vencimento" />
              </div>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Texto *</label>
                <textarea value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} placeholder="Ola {nome}! Seu plano {tipo} vence em {vencimento}." rows={5} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: "1.6" }} />
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setModalModelo(false)} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Cancelar</button>
                <button onClick={salvarModelo} disabled={!novoTitulo.trim() || !novoTexto.trim()} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white", cursor: "pointer", fontWeight: "bold", opacity: !novoTitulo.trim() || !novoTexto.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <Plus size={16} /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
