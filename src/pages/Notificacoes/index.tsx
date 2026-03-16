import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import { Send, Users, CheckCircle, Plus, Trash2, X, BookOpen, Wifi, WifiOff, QrCode } from "lucide-react";

const API = "http://localhost:3001";

interface Cliente {
  id: string; nome: string; telefone: string;
  servidor: string; tipo: string; status: string; vencimento: string;
}
interface ModeloMensagem { id: string; titulo: string; texto: string; }

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
  const intervalRef                   = useRef<any>(null);
  const prevReady                     = useRef(false);
  const prevQr                        = useRef("");

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
        if (data.ready !== prevReady.current) {
          prevReady.current = data.ready;
          setWhatsReady(data.ready);
        }
        const qr = data.qr || "";
        if (!data.ready && qr !== prevQr.current) {
          prevQr.current = qr;
          setQrCode(qr || null);
        }
      } catch {
        if (prevReady.current) {
          prevReady.current = false;
          setWhatsReady(false);
        }
      }
    };
    verificar();
    intervalRef.current = setInterval(verificar, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

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
      const res = await fetch(API + "/enviar", {
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
        await fetch(API + "/enviar", {
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

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "14px", outline: "none", boxSizing: "border-box" as const };

  return (
    <div>
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

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="glass-card" style={{ padding: "20px" }}>
            <h3 style={{ color: "white", margin: "0 0 14px", fontSize: "15px" }}>Filtrar Clientes</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filtros.map((f) => (
                <button key={f.id} onClick={() => { setFiltro(f.id); setClienteSel(null); setBusca(""); }} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "10px", cursor: "pointer", textAlign: "left", background: filtro === f.id ? f.bg : "rgba(255,255,255,0.03)", border: filtro === f.id ? "1px solid " + f.border : "1px solid rgba(255,255,255,0.06)", color: filtro === f.id ? f.cor : "rgba(255,255,255,0.5)", fontWeight: filtro === f.id ? "600" : "400", fontSize: "14px" }}>
                  {f.label}
                  <span style={{ marginLeft: "auto", color: filtro === f.id ? f.cor : "rgba(255,255,255,0.3)", fontSize: "12px", fontWeight: "700" }}>
                    {f.id === "venc_hoje" ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false; }).length : f.id === "venc_4" ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false; }).length : f.id === "venc_7" ? clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false; }).length : clientes.filter(c => c.telefone).length}
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
                <button key={c.id} onClick={() => { setClienteSel(c); if (mensagem) setMensagem(substituir(mensagem, c)); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", background: clienteSel && clienteSel.id === c.id ? filtroAtual.bg : "rgba(255,255,255,0.03)", border: clienteSel && clienteSel.id === c.id ? "1px solid " + filtroAtual.border : "1px solid rgba(255,255,255,0.06)", color: "white", textAlign: "left" }}>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: "500" }}>{c.nome}</span>
                    <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{c.telefone}</span>
                  </div>
                  {clienteSel && clienteSel.id === c.id && <CheckCircle size={14} color={filtroAtual.cor} />}
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

      {mostrarQR && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="glass-card" style={{ padding: "32px", maxWidth: "400px", width: "100%", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ color: "white", margin: 0, fontSize: "20px" }}>Conectar WhatsApp</h2>
              <button onClick={() => setMostrarQR(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}><X size={20} /></button>
            </div>
            {whatsReady ? (
              <div style={{ padding: "24px" }}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>OK</div>
                <p style={{ color: "#4ade80", fontWeight: "bold", fontSize: "16px", margin: 0 }}>WhatsApp Conectado!</p>
                <button onClick={() => setMostrarQR(false)} style={{ marginTop: "16px", padding: "10px 24px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,#25d366,#128c7e)", color: "white", cursor: "pointer", fontWeight: "bold" }}>Fechar</button>
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
                <textarea value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} placeholder="Ola {nome}! Seu plano {tipo} vence em {vencimento}." rows={5} style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "14px", outline: "none", boxSizing: "border-box" as const, resize: "vertical", fontFamily: "inherit", lineHeight: "1.6" }} />
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