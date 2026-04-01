import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react'

const API = 'https://iptv-manager-production.up.railway.app'

interface Pagamento {
  id: string
  clienteNome: string
  telefone: string
  servidor: string
  usuario: string
  valor: number | null
  plano: string | null
  status: string
  link: string | null
  criadoEm: string | null
  renovadoEm: string | null
  mpPaymentId: string | null
}

export default function Pagamentos() {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')

  useEffect(() => {
    const fetchHistorico = async () => {
      setLoading(true)
      try {
        const res  = await fetch(`${API}/pagamento/historico`)
        const data = await res.json()
        if (data.ok) setPagamentos(data.pagamentos)
      } catch {}
      setLoading(false)
    }
    fetchHistorico()
  }, [])

  const totalRecebido = pagamentos
    .filter(p => p.status === 'aprovado' && p.valor)
    .reduce((acc, p) => acc + (p.valor ?? 0), 0)

  const aprovados = pagamentos.filter(p => p.status === 'aprovado').length
  const pendentes = pagamentos.filter(p => p.status === 'pendente').length
  const falhos    = pagamentos.filter(p => p.status === 'falhou' || p.status === 'estornado').length

  const filtrados = filtroStatus === 'todos' ? pagamentos : pagamentos.filter(p => p.status === filtroStatus)

  const statusBadge = (status: string) => {
    const map: Record<string, { cor: string; bg: string; label: string }> = {
      aprovado:  { cor: '#4ade80', bg: 'rgba(34,197,94,0.15)',  label: '✅ Aprovado'  },
      pendente:  { cor: '#fbbf24', bg: 'rgba(245,158,11,0.15)', label: '⏳ Pendente'  },
      falhou:    { cor: '#f87171', bg: 'rgba(239,68,68,0.15)',  label: '❌ Falhou'    },
      estornado: { cor: '#a78bfa', bg: 'rgba(139,92,246,0.15)', label: '↩️ Estornado' },
    }
    const s = map[status] ?? { cor: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.08)', label: status }
    return (
      <span style={{ background: s.bg, color: s.cor, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>
        {s.label}
      </span>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>💳 Pagamentos</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>Histórico de pagamentos via Mercado Pago</p>
        </div>
        <button onClick={() => {
          setLoading(true)
          fetch(`${API}/pagamento/historico`).then(r => r.json()).then(d => { if (d.ok) setPagamentos(d.pagamentos); setLoading(false) })
        }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px' }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Recebido',  value: `R$ ${totalRecebido.toFixed(2).replace('.', ',')}`, icon: <CreditCard size={22} color="white" />, grad: 'linear-gradient(135deg,#22c55e,#16a34a)', shadow: 'rgba(34,197,94,0.3)' },
          { label: 'Aprovados',       value: aprovados,  icon: <CheckCircle size={22} color="white" />, grad: 'linear-gradient(135deg,#3b82f6,#6366f1)', shadow: 'rgba(99,102,241,0.3)' },
          { label: 'Pendentes',       value: pendentes,  icon: <Clock size={22} color="white" />,       grad: 'linear-gradient(135deg,#f59e0b,#d97706)', shadow: 'rgba(245,158,11,0.3)' },
          { label: 'Falhos/Estornos', value: falhos,     icon: <XCircle size={22} color="white" />,     grad: 'linear-gradient(135deg,#ef4444,#dc2626)', shadow: 'rgba(239,68,68,0.3)' },
        ].map(c => (
          <div key={c.label} className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: '0 0 6px' }}>{c.label}</p>
                <h2 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{c.value}</h2>
              </div>
              <div style={{ background: c.grad, padding: '10px', borderRadius: '12px', boxShadow: `0 4px 12px ${c.shadow}` }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtro status */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { id: 'todos',    label: 'Todos' },
            { id: 'aprovado', label: '✅ Aprovados' },
            { id: 'pendente', label: '⏳ Pendentes' },
            { id: 'falhou',   label: '❌ Falhos' },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltroStatus(f.id)} style={{
              padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              background: filtroStatus === f.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
              border:     filtroStatus === f.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
              color:      filtroStatus === f.id ? '#818cf8' : 'rgba(255,255,255,0.4)',
            }}>{f.label}</button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px 0' }}>Nenhum pagamento encontrado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Cliente', 'Servidor', 'Plano', 'Valor', 'Status', 'Data', 'Renovado'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px', color: 'white', fontSize: '13px' }}>
                      <div style={{ fontWeight: '600' }}>{p.clienteNome}</div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{p.telefone}</div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                        {p.servidor}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{p.plano ?? '—'}</td>
                    <td style={{ padding: '12px', color: '#4ade80', fontSize: '14px', fontWeight: '700' }}>
                      {p.valor != null ? `R$ ${p.valor.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                    <td style={{ padding: '12px' }}>{statusBadge(p.status)}</td>
                    <td style={{ padding: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                      {p.criadoEm ? new Date(p.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                    </td>
                    <td style={{ padding: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                      {p.renovadoEm ? new Date(p.renovadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}