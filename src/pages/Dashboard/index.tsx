import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { Users, CheckCircle, XCircle, Server, AlertTriangle, TrendingUp, Clock } from 'lucide-react'

interface Cliente {
  id: string
  nome: string
  servidor: string
  tipo: string
  status: string
  vencimento: string
}

function parseData(vencimento: string): Date | null {
  if (!vencimento) return null
  const partes = vencimento.split('/')
  if (partes.length !== 3) return null
  return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]))
}

function diferencaDias(data: Date): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(data)
  alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Dashboard() {
  const [clientes, setClientes] = useState<Cliente[]>([])

  const [creditos, setCreditos] = useState<Record<string, any>>({})
  const [loadingCreditos, setLoadingCreditos] = useState(true)
  const [modalTeste, setModalTeste]             = useState(false)
  const [horasTeste, setHorasTeste]             = useState(4)
  const [nomeCliente, setNomeCliente]           = useState('')
  const [telefoneCliente, setTelefoneCliente]   = useState('')
  const [criandoTeste, setCriandoTeste]         = useState(false)
  const [resultadoTeste, setResultadoTeste]     = useState<any>(null)
  const [cadastrandoTeste, setCadastrandoTeste] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientes'), snapshot => {
      setClientes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cliente)))
    })
    return unsub
  }, [])

  const criarTesteWarez = async () => {
    if (!nomeCliente.trim()) { alert('Informe o nome do cliente.'); return }
    setCriandoTeste(true)
    try {
      const API = 'https://iptv-manager-production.up.railway.app'
      const res = await fetch(`${API}/painel/criar-teste`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horas: horasTeste }),
      })
      const data = await res.json()
      if (data.ok) setResultadoTeste({ ...data, nomeCliente: nomeCliente.trim(), telefoneCliente: telefoneCliente.trim() })
      else alert('Erro: ' + (data.error || 'Falha ao criar teste'))
    } catch { alert('Backend offline.') }
    setCriandoTeste(false)
  }

  const cadastrarEEnviarTeste = async () => {
    if (!resultadoTeste) return
    setCadastrandoTeste(true)
    try {
      const API = 'https://iptv-manager-production.up.railway.app'
      const { addDoc, collection: fsCol } = await import('firebase/firestore')
      const novoCliente = {
        nome:       resultadoTeste.nomeCliente,
        telefone:   resultadoTeste.telefoneCliente,
        usuario:    resultadoTeste.usuario,
        senha:      resultadoTeste.senha,
        servidor:   'WAREZ',
        tipo:       'P2P',
        status:     'inativo',
        vencimento: resultadoTeste.expira ? new Date(resultadoTeste.expira).toLocaleDateString('pt-BR') : '',
        valor:      '35,00',
        obs:        'USUÁRIO TESTE',
      }
      const docRef = await addDoc(fsCol(db, 'clientes'), novoCliente)
      if (resultadoTeste.telefoneCliente) {
        const linkRes = await fetch(`${API}/pagamento/criar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId: docRef.id, clienteNome: novoCliente.nome,
            telefone: novoCliente.telefone, servidor: 'WAREZ',
            usuario: novoCliente.usuario, senha: novoCliente.senha,
          })
        }).then(r => r.json())
        if (linkRes.ok) {
          const linksTexto = linkRes.links.map((l: any) => `${l.plano} - R$ ${l.valor.toFixed(2).replace('.', ',')}\n${l.link}`).join('\n\n')
          const msg = `Olá *${novoCliente.nome}*! 🎉\n\nSeu teste foi criado!\n\n👤 Usuário: *${novoCliente.usuario}*\n🔑 Senha: *${novoCliente.senha}*\n⏱️ Expira: *${novoCliente.vencimento}*\n\n💳 *Para ativar seu plano:*\n\n${linksTexto}`
          await fetch(`${API}/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: novoCliente.telefone, message: msg })
          })
        }
      }
      alert(`✅ Cliente cadastrado${resultadoTeste.telefoneCliente ? ' e mensagem enviada!' : '!'}`)
      setModalTeste(false); setResultadoTeste(null); setNomeCliente(''); setTelefoneCliente('')
    } catch (e: any) { alert('Erro: ' + e.message) }
    setCadastrandoTeste(false)
  }

  useEffect(() => {
    const fetchCreditos = async () => {
      setLoadingCreditos(true)
      const API = 'https://iptv-manager-production.up.railway.app'
      const results: Record<string, any> = {}
      await Promise.allSettled([
        fetch(`${API}/painel/saldo`).then(r => r.json()).then(d => { results.warez   = d }).catch(() => { results.warez   = null }),
        fetch(`${API}/elite/saldo`).then(r => r.json()).then(d => { results.elite   = d }).catch(() => { results.elite   = null }),
        fetch(`${API}/central/saldo`).then(r => r.json()).then(d => { results.central = d }).catch(() => { results.central = null }),
      ])
      setCreditos(results)
      setLoadingCreditos(false)
    }
    fetchCreditos()
  }, [])

  const total = clientes.length
  const ativos = clientes.filter(c => c.status === 'ativo').length
  const inativos = clientes.filter(c => c.status === 'inativo').length
  const iptv = clientes.filter(c => c.tipo === 'IPTV' || c.tipo === 'IPTV').length
  const p2p = clientes.filter(c => c.tipo === 'P2P').length

  const vencendoHoje   = clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 0 : false })
  const vencendo4dias  = clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 4 : false })
  const vencendo7dias  = clientes.filter(c => { const d = parseData(c.vencimento); return d ? diferencaDias(d) === 7 : false })

  const porServidor: Record<string, number> = {}
  clientes.forEach(c => { if (c.servidor) porServidor[c.servidor] = (porServidor[c.servidor] || 0) + 1 })

  const cards = [
    { label: 'Total de Clientes',    value: total,    icon: <Users size={24} color="white" />,        gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', shadow: 'rgba(99,102,241,0.4)'  },
    { label: 'Clientes Ativos',      value: ativos,   icon: <CheckCircle size={24} color="white" />,  gradient: 'linear-gradient(135deg,#22c55e,#16a34a)', shadow: 'rgba(34,197,94,0.4)'   },
    { label: 'Clientes Inativos',    value: inativos, icon: <XCircle size={24} color="white" />,      gradient: 'linear-gradient(135deg,#ef4444,#dc2626)', shadow: 'rgba(239,68,68,0.4)'   },
    { label: 'Vencendo em 7 dias',   value: vencendoHoje.length + vencendo4dias.length + vencendo7dias.length, icon: <AlertTriangle size={24} color="white" />, gradient: 'linear-gradient(135deg,#f59e0b,#d97706)', shadow: 'rgba(245,158,11,0.4)' },
  ]

  const alertas = [
    { titulo: 'Vencendo Hoje',      clientes: vencendoHoje,  cor: '#f87171', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   badgeBg: 'rgba(239,68,68,0.2)',   badgeBorder: 'rgba(239,68,68,0.4)',   badgeText: '#f87171' },
    { titulo: 'Vencendo em 4 dias', clientes: vencendo4dias, cor: '#fbbf24', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  badgeBg: 'rgba(245,158,11,0.2)',  badgeBorder: 'rgba(245,158,11,0.4)',  badgeText: '#fbbf24' },
    { titulo: 'Vencendo em 7 dias', clientes: vencendo7dias, cor: '#818cf8', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', badgeBg: 'rgba(99,102,241,0.2)', badgeBorder: 'rgba(99,102,241,0.4)', badgeText: '#818cf8' },
  ]

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="page-title" style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>Dashboard</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', fontSize: '14px' }}>Visão geral do sistema</p>
      </div>

      {/* Cards de métricas */}
      <div className="dashboard-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {cards.map(card => (
          <div key={card.label} className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '0 0 8px' }}>{card.label}</p>
                <h2 style={{ color: 'white', fontSize: '36px', fontWeight: 'bold', margin: 0 }}>{card.value}</h2>
              </div>
              <div style={{ background: card.gradient, padding: '12px', borderRadius: '14px', boxShadow: `0 4px 15px ${card.shadow}` }}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Gráficos de tipo e servidor — colapsam em mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <TrendingUp size={20} color="#818cf8" />
            <h3 style={{ color: 'white', margin: 0, fontSize: '16px' }}>Tipo de Serviço</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: 'IPTV', value: iptv, color: '#60a5fa', bg: 'rgba(59,130,246,0.3)' },
              { label: 'P2P',  value: p2p,  color: '#c084fc', bg: 'rgba(168,85,247,0.3)' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>{item.label}</span>
                  <span style={{ color: item.color, fontWeight: 'bold', fontSize: '14px' }}>{item.value}</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ width: total > 0 ? `${item.value / total * 100}%` : '0%', height: '100%', background: item.bg, borderRadius: '99px', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Server size={20} color="#818cf8" />
            <h3 style={{ color: 'white', margin: 0, fontSize: '16px' }}>Clientes por Servidor</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {Object.keys(porServidor).length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', margin: 0 }}>Nenhum dado disponível.</p>
            ) : Object.entries(porServidor).map(([servidor, qtd]) => (
              <div key={servidor}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>{servidor}</span>
                  <span style={{ color: '#818cf8', fontWeight: 'bold', fontSize: '14px' }}>{qtd}</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ width: total > 0 ? `${qtd / total * 100}%` : '0%', height: '100%', background: 'rgba(99,102,241,0.5)', borderRadius: '99px', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas de vencimento */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={20} color="#fbbf24" />
          <h3 style={{ color: 'white', margin: 0, fontSize: '16px' }}>Alertas de Vencimento</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {alertas.map(alerta => (
            <div key={alerta.titulo} className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} color={alerta.cor} />
                  <h4 style={{ color: alerta.cor, margin: 0, fontSize: '14px', fontWeight: '600' }}>{alerta.titulo}</h4>
                </div>
                <span style={{ background: alerta.badgeBg, border: `1px solid ${alerta.badgeBorder}`, color: alerta.badgeText, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                  {alerta.clientes.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {alerta.clientes.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', margin: 0, textAlign: 'center', padding: '12px 0' }}>Nenhum cliente</p>
                ) : alerta.clientes.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: alerta.bg, border: `1px solid ${alerta.border}`, borderRadius: '10px' }}>
                    <span style={{ color: 'white', fontWeight: '500', fontSize: '14px' }}>{c.nome}</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{c.servidor}</span>
                      <span style={{ background: alerta.badgeBg, border: `1px solid ${alerta.badgeBorder}`, color: alerta.badgeText, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>{c.vencimento}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Créditos dos Servidores */}
      <div className="glass-card" style={{ padding: '24px', marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={20} color="#818cf8" />
            <h3 style={{ color: 'white', margin: 0, fontSize: '16px' }}>Créditos dos Servidores</h3>
          </div>
          <button onClick={() => {
            setLoadingCreditos(true)
            const API = 'https://iptv-manager-production.up.railway.app'
            const results: Record<string, any> = {}
            Promise.allSettled([
              fetch(`${API}/painel/saldo`).then(r => r.json()).then(d => { results.warez   = d }).catch(() => { results.warez   = null }),
              fetch(`${API}/elite/saldo`).then(r => r.json()).then(d => { results.elite   = d }).catch(() => { results.elite   = null }),
              fetch(`${API}/central/saldo`).then(r => r.json()).then(d => { results.central = d }).catch(() => { results.central = null }),
            ]).then(() => { setCreditos(results); setLoadingCreditos(false) })
          }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
            🔄 Atualizar
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
          {[
            { key: 'warez',   nome: 'WWPanel / Warez',  cor: '59,130,246',  emoji: '📡', teste: true },
            { key: 'elite',   nome: 'Elite',            cor: '168,85,247',  emoji: '⚡', teste: false },
            { key: 'central', nome: 'Central',          cor: '34,197,94',   emoji: '🌐', teste: false },
          ].map(({ key, nome, cor, emoji, teste }) => {
            const info = creditos[key]
            const credits = info?.creditos
            return (
              <div key={key} style={{ background: `rgba(${cor},0.08)`, border: `1px solid rgba(${cor},0.2)`, borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: '0 0 4px' }}>{emoji} {nome}</p>
                    {loadingCreditos ? (
                      <div style={{ height: '32px', width: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px' }} />
                    ) : (credits !== null && credits !== undefined) ? (
                      <h2 style={{ color: `rgb(${cor})`, fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{typeof credits === 'number' ? credits.toFixed(2) : credits}</h2>
                    ) : (
                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', margin: 0 }}>
                        {info?.error ? `⚠️ ${String(info.error).substring(0,40)}` : '—'}
                      </p>
                    )}
                  </div>
                  <span style={{ background: `rgba(${cor},0.15)`, border: `1px solid rgba(${cor},0.3)`, color: `rgb(${cor})`, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                    créditos
                  </span>
                </div>
                {info?.ok === false && (
                  <p style={{ color: 'rgba(255,100,100,0.7)', fontSize: '11px', margin: 0 }}>⚠️ {info.error?.substring(0, 60)}</p>
                )}
                {teste && (
                  <button onClick={() => { setResultadoTeste(null); setModalTeste(true) }} style={{ marginTop: '12px', width: '100%', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa' }}>
                    🧪 Criar Teste
                  </button>
                )}
              </div>
            )
          })}

          {/* Modal Criar Teste Warez */}
          {modalTeste && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px' }}>
                {!resultadoTeste ? (
                  <>
                    <h3 style={{ color: 'white', margin: '0 0 20px', fontSize: '18px' }}>🧪 Criar Teste — WWPanel</h3>
                    <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Nome do cliente *</label>
                    <input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Ex: João Silva" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '14px', marginBottom: '14px', boxSizing: 'border-box' }} />
                    <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>Telefone (WhatsApp)</label>
                    <input value={telefoneCliente} onChange={e => setTelefoneCliente(e.target.value)} placeholder="Ex: 5519999999999" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '14px', marginBottom: '14px', boxSizing: 'border-box' }} />
                    <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', display: 'block', marginBottom: '8px' }}>Duração do teste</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                      {[1, 2, 3, 4].map(h => (
                        <button key={h} onClick={() => setHorasTeste(h)} style={{ flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
                          background: horasTeste === h ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)',
                          border:     horasTeste === h ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                          color:      horasTeste === h ? '#60a5fa' : 'rgba(255,255,255,0.5)' }}>
                          {h}h
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setModalTeste(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
                        Cancelar
                      </button>
                      <button onClick={criarTesteWarez} disabled={criandoTeste} style={{ flex: 2, padding: '12px', borderRadius: '10px', cursor: criandoTeste ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '14px', opacity: criandoTeste ? 0.6 : 1 }}>
                        {criandoTeste ? 'Criando...' : '✅ Criar Teste'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 style={{ color: '#4ade80', margin: '0 0 20px', fontSize: '18px' }}>✅ Teste criado!</h3>
                    {[
                      { label: '👤 Usuário', value: resultadoTeste.usuario },
                      { label: '🔑 Senha',   value: resultadoTeste.senha },
                      { label: '⏱️ Expira',  value: resultadoTeste.expira ? new Date(resultadoTeste.expira).toLocaleString('pt-BR') : '' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ marginBottom: '12px' }}>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: '0 0 4px' }}>{label}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <code style={{ flex: 1, background: 'rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: '8px', color: 'white', fontSize: '15px', fontWeight: '700', letterSpacing: '1px' }}>{value}</code>
                          <button onClick={() => navigator.clipboard.writeText(value)} style={{ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '12px' }}>📋</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => {
                        const txt = `Usuário: ${resultadoTeste.usuario}\nSenha: ${resultadoTeste.senha}\nExpira: ${resultadoTeste.expira ? new Date(resultadoTeste.expira).toLocaleString('pt-BR') : ''}`
                        navigator.clipboard.writeText(txt)
                      }} style={{ width: '100%', marginTop: '12px', padding: '12px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontWeight: '700' }}>
                      📋 Copiar tudo
                    </button>
                    <button onClick={cadastrarEEnviarTeste} disabled={cadastrandoTeste} style={{ width: '100%', marginTop: '12px', padding: '12px', borderRadius: '10px', cursor: cadastrandoTeste ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: 'white', fontWeight: '700', fontSize: '14px', opacity: cadastrandoTeste ? 0.6 : 1 }}>
                      {cadastrandoTeste ? 'Cadastrando...' : resultadoTeste?.telefoneCliente ? '✅ Cadastrar + Enviar Link WA' : '✅ Cadastrar Cliente'}
                    </button>
                    <button onClick={() => { setModalTeste(false); setResultadoTeste(null); setNomeCliente(''); setTelefoneCliente('') }} style={{ width: '100%', marginTop: '8px', padding: '12px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
                      Fechar sem cadastrar
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}