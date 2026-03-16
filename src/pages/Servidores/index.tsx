import { useEffect, useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { Server, Plus, Pencil, Trash2, X, Check } from "lucide-react";

interface Servidor {
  id: string;
  nome: string;
  descricao: string;
}

export default function Servidores() {
  const [servidores, setServidores] = useState<Servidor[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Servidor | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "servidores"), (snapshot) => {
      const dados = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Servidor[];
      setServidores(dados);
    });
    return unsubscribe;
  }, []);

  const abrirModal = (servidor?: Servidor) => {
    if (servidor) {
      setEditando(servidor);
      setNome(servidor.nome);
      setDescricao(servidor.descricao);
    } else {
      setEditando(null);
      setNome("");
      setDescricao("");
    }
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setEditando(null);
    setNome("");
    setDescricao("");
  };

  const salvar = async () => {
    if (!nome.trim()) return;
    setCarregando(true);
    try {
      if (editando) {
        await updateDoc(doc(db, "servidores", editando.id), { nome, descricao });
      } else {
        await addDoc(collection(db, "servidores"), { nome, descricao });
      }
      fecharModal();
    } finally {
      setCarregando(false);
    }
  };

  const excluir = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este servidor?")) {
      await deleteDoc(doc(db, "servidores", id));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ color: "white", fontSize: "28px", fontWeight: "bold", margin: 0 }}>Servidores</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "4px", fontSize: "14px" }}>Gerencie os servidores disponíveis</p>
        </div>
        <button onClick={() => abrirModal()} style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white",
          border: "none", borderRadius: "12px", padding: "12px 20px",
          cursor: "pointer", fontWeight: "bold", fontSize: "14px",
          boxShadow: "0 4px 15px rgba(99,102,241,0.4)"
        }}>
          <Plus size={18} /> Novo Servidor
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
        {servidores.length === 0 && (
          <div className="glass-card" style={{ padding: "40px", textAlign: "center", gridColumn: "1/-1" }}>
            <Server size={48} color="rgba(255,255,255,0.2)" style={{ margin: "0 auto 16px" }} />
            <p style={{ color: "rgba(255,255,255,0.4)", margin: 0 }}>Nenhum servidor cadastrado ainda.</p>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px", marginTop: "8px" }}>Clique em "Novo Servidor" para começar.</p>
          </div>
        )}
        {servidores.map((servidor) => (
          <div key={servidor.id} className="glass-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", padding: "10px", borderRadius: "12px" }}>
                  <Server size={20} color="white" />
                </div>
                <div>
                  <h3 style={{ color: "white", margin: 0, fontSize: "16px", fontWeight: "bold" }}>{servidor.nome}</h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", margin: "4px 0 0", fontSize: "13px" }}>{servidor.descricao || "Sem descrição"}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => abrirModal(servidor)} style={{
                  background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)",
                  borderRadius: "8px", padding: "8px", cursor: "pointer", color: "#818cf8"
                }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => excluir(servidor.id)} style={{
                  background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "8px", padding: "8px", cursor: "pointer", color: "#f87171"
                }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50
        }}>
          <div className="glass-card" style={{ padding: "32px", width: "100%", maxWidth: "440px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ color: "white", margin: 0, fontSize: "20px" }}>{editando ? "Editar Servidor" : "Novo Servidor"}</h2>
              <button onClick={fecharModal} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Nome do Servidor *</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)}
                  className="input-glass" placeholder="Ex: ELITE, WAREZ, CENTRAL" />
              </div>
              <div>
                <label style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", display: "block", marginBottom: "6px" }}>Descrição</label>
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)}
                  className="input-glass" placeholder="Ex: Servidor principal IPTV" />
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button onClick={fecharModal} style={{
                  flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer"
                }}>Cancelar</button>
                <button onClick={salvar} disabled={carregando || !nome.trim()} style={{
                  flex: 1, padding: "12px", borderRadius: "12px", border: "none",
                  background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white",
                  cursor: "pointer", fontWeight: "bold", opacity: carregando || !nome.trim() ? 0.6 : 1,
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
