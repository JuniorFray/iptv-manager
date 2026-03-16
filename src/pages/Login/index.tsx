import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Tv, Mail, Lock, Eye, EyeOff } from "lucide-react";

type Tela = "login" | "cadastro" | "esqueci";

export default function Login() {
  const { login, cadastro, esqueceuSenha } = useAuth();
  const navigate = useNavigate();
  const [tela, setTela] = useState<Tela>("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      await login(email, senha);
      navigate("/dashboard");
    } catch {
      setErro("E-mail ou senha incorretos. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (senha !== confirmarSenha) { setErro("As senhas não coincidem."); return; }
    if (senha.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres."); return; }
    setCarregando(true);
    try {
      await cadastro(email, senha);
      navigate("/dashboard");
    } catch (error: any) {
      setErro(error.message);
    } finally {
      setCarregando(false);
    }
  };

  const handleEsqueci = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(""); setSucesso("");
    setCarregando(true);
    try {
      await esqueceuSenha(email);
      setSucesso("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch {
      setErro("E-mail não encontrado.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background: "linear-gradient(135deg, #0f0c29, #1a1a4e, #24243e)"}}>
      
      <div style={{position:"absolute",width:"400px",height:"400px",borderRadius:"50%",background:"rgba(99,102,241,0.15)",filter:"blur(80px)",top:"10%",left:"20%"}}/>
      <div style={{position:"absolute",width:"300px",height:"300px",borderRadius:"50%",background:"rgba(59,130,246,0.1)",filter:"blur(60px)",bottom:"10%",right:"20%"}}/>

      <div className="glass-card p-8 w-full max-w-md" style={{position:"relative",zIndex:1}}>
        
        <div className="flex flex-col items-center mb-8">
          <div style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",padding:"16px",borderRadius:"20px",marginBottom:"16px",boxShadow:"0 8px 32px rgba(99,102,241,0.4)"}}>
            <Tv size={36} color="white" />
          </div>
          <h1 style={{color:"white",fontSize:"28px",fontWeight:"bold",margin:0}}>Sistema TV</h1>
          <p style={{color:"rgba(255,255,255,0.5)",fontSize:"14px",marginTop:"4px"}}>
            {tela === "login" && "Faça login para continuar"}
            {tela === "cadastro" && "Criar nova conta"}
            {tela === "esqueci" && "Recuperar senha"}
          </p>
        </div>

        {tela === "login" && (
          <form onSubmit={handleLogin} style={{display:"flex",flexDirection:"column",gap:"16px"}}>
            <div>
              <label style={{color:"rgba(255,255,255,0.7)",fontSize:"13px",display:"block",marginBottom:"6px"}}>E-mail</label>
              <div style={{position:"relative"}}>
                <Mail size={16} color="rgba(255,255,255,0.4)" style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)"}} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input-glass" style={{paddingLeft:"40px"}} placeholder="seu@email.com" required />
              </div>
            </div>
            <div>
              <label style={{color:"rgba(255,255,255,0.7)",fontSize:"13px",display:"block",marginBottom:"6px"}}>Senha</label>
              <div style={{position:"relative"}}>
                <Lock size={16} color="rgba(255,255,255,0.4)" style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)"}} />
                <input type={mostrarSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)}
                  className="input-glass" style={{paddingLeft:"40px",paddingRight:"40px"}} placeholder="••••••••" required />
                <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)}
                  style={{position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer"}}>
                  {mostrarSenha ? <EyeOff size={16} color="rgba(255,255,255,0.4)" /> : <Eye size={16} color="rgba(255,255,255,0.4)" />}
                </button>
              </div>
            </div>
            {erro && <p style={{color:"#f87171",fontSize:"13px",textAlign:"center",margin:0}}>{erro}</p>}
            <button type="submit" disabled={carregando} className="btn-primary" style={{marginTop:"8px",opacity:carregando?0.6:1}}>
              {carregando ? "Entrando..." : "Entrar"}
            </button>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:"8px"}}>
              <button type="button" onClick={() => { setTela("cadastro"); setErro(""); }}
                style={{background:"none",border:"none",color:"#60a5fa",fontSize:"13px",cursor:"pointer"}}>Cadastre-se</button>
              <button type="button" onClick={() => { setTela("esqueci"); setErro(""); }}
                style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:"13px",cursor:"pointer"}}>Esqueci a senha</button>
            </div>
          </form>
        )}

        {tela === "cadastro" && (
          <form onSubmit={handleCadastro} style={{display:"flex",flexDirection:"column",gap:"16px"}}>
            <div>
              <label style={{color:"rgba(255,255,255,0.7)",fontSize:"13px",display:"block",marginBottom:"6px"}}>E-mail</label>
              <div style={{position:"relative"}}>
                <Mail size={16} color="rgba(255,255,255,0.4)" style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)"}} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input-glass" style={{paddingLeft:"40px"}} placeholder="seu@email.com" required />
              </div>
            </div>
            <div>
              <label style={{color:"rgba(255,255,255,0.7)",fontSize:"13px",display:"block",marginBottom:"6px"}}>Senha</label>
              <div style={{position:"relative"}}>
                <Lock size={16} color="rgba(255,255,255,0.4)" style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)"}} />
                <input type={mostrarSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)}
                  className="input-glass" style={{paddingLeft:"40px"}} placeholder="••••••••" required />
              </div>
            </div>
            <div>
              <label style={{color:"rgba(255,255,255,0.7)",fontSize:"13px",display:"block",marginBottom:"6px"}}>Confirmar Senha</label>
              <div style={{position:"relative"}}>
                <Lock size={16} color="rgba(255,255,255,0.4)" style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)"}} />
                <input type={mostrarSenha ? "text" : "password"} value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)}
                  className="input-glass" style={{paddingLeft:"40px"}} placeholder="••••••••" required />
              </div>
            </div>
            {erro && <p style={{color:"#f87171",fontSize:"13px",textAlign:"center",margin:0}}>{erro}</p>}
            <button type="submit" disabled={carregando} className="btn-primary" style={{marginTop:"8px",opacity:carregando?0.6:1}}>
              {carregando ? "Cadastrando..." : "Cadastrar"}
            </button>
            <button type="button" onClick={() => { setTela("login"); setErro(""); }}
              style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:"13px",cursor:"pointer",textAlign:"center"}}>
              Voltar para o login
            </button>
          </form>
        )}

        {tela === "esqueci" && (
          <form onSubmit={handleEsqueci} style={{display:"flex",flexDirection:"column",gap:"16px"}}>
            <div>
              <label style={{color:"rgba(255,255,255,0.7)",fontSize:"13px",display:"block",marginBottom:"6px"}}>E-mail</label>
              <div style={{position:"relative"}}>
                <Mail size={16} color="rgba(255,255,255,0.4)" style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)"}} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input-glass" style={{paddingLeft:"40px"}} placeholder="seu@email.com" required />
              </div>
            </div>
            {erro && <p style={{color:"#f87171",fontSize:"13px",textAlign:"center",margin:0}}>{erro}</p>}
            {sucesso && <p style={{color:"#4ade80",fontSize:"13px",textAlign:"center",margin:0}}>{sucesso}</p>}
            <button type="submit" disabled={carregando} className="btn-primary" style={{marginTop:"8px",opacity:carregando?0.6:1}}>
              {carregando ? "Enviando..." : "Enviar e-mail de recuperação"}
            </button>
            <button type="button" onClick={() => { setTela("login"); setErro(""); setSucesso(""); }}
              style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:"13px",cursor:"pointer",textAlign:"center"}}>
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
