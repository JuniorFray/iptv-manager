import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'
import { MapPin, Users, Server, DollarSign, Activity } from 'lucide-react'

const DDD_ESTADO: Record<string, string> = {
  '11':'SP Capital','12':'SP Interior','13':'SP Santos','14':'SP Bauru','15':'SP Sorocaba',
  '16':'SP Ribeirão Preto','17':'SP Rio Preto','18':'SP Pres. Prudente','19':'SP Campinas',
  '21':'RJ Capital','22':'RJ Interior','24':'RJ Volta Redonda',
  '27':'ES','28':'ES Sul',
  '31':'MG BH','32':'MG Juiz de Fora','33':'MG Norte','34':'MG Uberlândia','35':'MG Sul','37':'MG Oeste','38':'MG Montes Claros',
  '41':'PR Curitiba','42':'PR Ponta Grossa','43':'PR Londrina','44':'PR Maringá','45':'PR Cascavel','46':'PR Pato Branco',
  '47':'SC Joinville','48':'SC Florianópolis','49':'SC Chapecó',
  '51':'RS Porto Alegre','53':'RS Pelotas','54':'RS Caxias do Sul','55':'RS Santa Maria',
  '61':'DF Brasília','62':'GO Goiânia','63':'TO','64':'GO Interior','65':'MT Cuiabá','66':'MT Interior',
  '67':'MS Campo Grande','68':'AC','69':'RO',
  '71':'BA Salvador','73':'BA Sul','74':'BA Norte','75':'BA Feira','77':'BA Barreiras','79':'SE',
  '81':'PE Recife','82':'AL','83':'PB','84':'RN','85':'CE Fortaleza','86':'PI Teresina',
  '87':'PE Interior','88':'CE Interior','89':'PI Interior',
  '91':'PA Belém','92':'AM Manaus','93':'PA Santarém','94':'PA Marabá','95':'RR','96':'AP',
  '97':'AM Interior','98':'MA São Luís','99':'MA Interior',
}

const NOMES_F = new Set(['ana','maria','joana','julia','juliana','patricia','beatriz','fernanda','amanda',
  'carolina','camila','larissa','leticia','mariana','aline','bruna','jessica','thais','vanessa','priscila',
  'rafaela','roseli','rosa','lucia','luciana','luisa','luiza','eliane','elisa','elisete','glaucia','nadia',
  'natalia','renata','roberta','sandra','simone','tatiane','viviane','sueli','sonia','cristiane','claudia',
  'celia','carla','cassia','denise','daniela','debora','fatima','flavia','gisele','gislaine','heloise',
  'helena','isabela','isabella','josiane','jaqueline','karina','katia','lais','leila','livia','luana',
  'marta','miriam','monica','nilza','odete','paula','rebeca','rejane','rosana','rosangela','silvia',
  'silvana','tereza','vera','veronica','vitoria','yasmim','zeni','adelia','adriana','alice','alessandra',
  'agatha','alicia','gleice','irene','ines','iara'])

const NOMES_M = new Set(['joao','jose','antonio','paulo','pedro','carlos','marcos','luis','luiz','rodrigo',
  'daniel','marcelo','mateus','matheus','gustavo','thiago','rafael','fabio','fabricio','felipe','gabriel',
  'guilherme','henrique','igor','junior','leandro','leonardo','lucas','mario','mauricio','mauro','michel',
  'miguel','murilo','nelson','oscar','otavio','renan','renato','ricardo','roberto','rogerio','ronaldo',
  'rubens','sergio','sandro','tiago','vinicius','wagner','wellington','wesley','william','wilson','claudio',
  'danilo','davi','david','diego','edson','eduardo','everton','francisco','gilberto','hamilton','helio',
  'higor','ademar','adilson','adriano','afonso','ailton','airton','alan','alex','alexandre','alfredo',
  'alisson','allan','almir','anderson','andre','arnaldo','augusto','ayrton','carlos','cleber','cleiton'])

function extrairDDD(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) return d.substring(2, 4)
  if (d.length >= 10) return d.substring(0, 2)
  return ''
}

function estimarGenero(nome: string): 'M' | 'F' | '?' {
  const primeiro = (nome || '').split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (NOMES_F.has(primeiro)) return 'F'
  if (NOMES_M.has(primeiro)) return 'M'
  return '?'
}

interface Bar { label: string; count: number; pct: number; cor: string }

function BarraHorizontal({ label, count, pct, cor }: Bar) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{count} ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '99px', height: '8px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: '99px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

export default function Posicionamento() {
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocs(collection(db, 'clientes')).then(snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)' }}>Carregando dados...</p>
    </div>
  )

  const total = clientes.length

  // DDD
  const dddMap: Record<string, number> = {}
  clientes.forEach(c => {
    const ddd = extrairDDD(c.telefone || '')
    if (ddd) dddMap[ddd] = (dddMap[ddd] || 0) + 1
  })
  const topDDD = Object.entries(dddMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([ddd, count]) => ({ label: `${ddd} — ${DDD_ESTADO[ddd] || 'Desconhecido'}`, count, pct: (count / total) * 100, cor: 'linear-gradient(90deg,#3b82f6,#6366f1)' }))

  // Gênero
  let masc = 0, fem = 0, ind = 0
  clientes.forEach(c => {
    const g = estimarGenero(c.nome || '')
    if (g === 'M') masc++
    else if (g === 'F') fem++
    else ind++
  })

  // Servidor
  const srvMap: Record<string, number> = {}
  clientes.forEach(c => { const s = (c.servidor || 'Sem servidor').toUpperCase(); srvMap[s] = (srvMap[s] || 0) + 1 })
  const topSrv = Object.entries(srvMap).sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({ label, count, pct: (count / total) * 100, cor: ['linear-gradient(90deg,#f59e0b,#d97706)', 'linear-gradient(90deg,#8b5cf6,#6d28d9)', 'linear-gradient(90deg,#10b981,#059669)', 'linear-gradient(90deg,#ef4444,#dc2626)'][i % 4] }))

  // Status
  const ativo = clientes.filter(c => c.status === 'ativo').length
  const inativo = clientes.filter(c => c.status === 'inativo').length

  // Vencimentos
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const parseD = (v: string) => { if (!v) return null; const p = v.split('/'); if (p.length !== 3) return null; return new Date(Number(p[2]), Number(p[1])-1, Number(p[0])) }
  const vencHoje = clientes.filter(c => { const d = parseD(c.vencimento); return d && d.getTime() === hoje.getTime() }).length
  const venc7   = clientes.filter(c => { const d = parseD(c.vencimento); return d && d > hoje && (d.getTime()-hoje.getTime())/(86400000) <= 7 }).length
  const vencido = clientes.filter(c => { const d = parseD(c.vencimento); return d && d < hoje }).length

  // Ticket médio
  const valoresValidos = clientes.filter(c => c.valor && !isNaN(parseFloat(String(c.valor).replace(',','.'))))
  const ticketMedio = valoresValidos.length ? valoresValidos.reduce((acc, c) => acc + parseFloat(String(c.valor).replace(',','.')), 0) / valoresValidos.length : 0
  const recorrenciaMensal = valoresValidos.reduce((acc, c) => acc + parseFloat(String(c.valor).replace(',','.')), 0)

  const cardStyle: React.CSSProperties = { padding: '20px 24px', borderRadius: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 'bold', margin: 0 }}>📍 Posicionamento</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '13px' }}>Análise da base de {total} clientes</p>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total de Clientes', value: total, icon: <Users size={20} color="white" />, grad: 'linear-gradient(135deg,#3b82f6,#6366f1)' },
          { label: 'Ticket Médio', value: `R$ ${ticketMedio.toFixed(2).replace('.',',')}`, icon: <DollarSign size={20} color="white" />, grad: 'linear-gradient(135deg,#22c55e,#16a34a)' },
          { label: 'MRR estimado', value: `R$ ${recorrenciaMensal.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}`, icon: <Activity size={20} color="white" />, grad: 'linear-gradient(135deg,#f59e0b,#d97706)' },
          { label: 'Vencendo em 7d', value: venc7, icon: <MapPin size={20} color="white" />, grad: 'linear-gradient(135deg,#ef4444,#dc2626)' },
        ].map(({ label, value, icon, grad }) => (
          <div key={label} style={{ borderRadius: '16px', background: grad, padding: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', margin: '0 0 6px' }}>{label}</p>
                <p style={{ color: 'white', fontSize: '22px', fontWeight: 'bold', margin: 0 }}>{value}</p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '10px' }}>{icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Distribuição por Servidor */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
            <Server size={16} color="#60a5fa" />
            <h3 style={{ color: 'white', margin: 0, fontSize: '14px', fontWeight: '600' }}>Por Servidor</h3>
          </div>
          {topSrv.map(b => <BarraHorizontal key={b.label} {...b} />)}
        </div>

        {/* Status e Vencimentos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={cardStyle}>
            <h3 style={{ color: 'white', margin: '0 0 16px', fontSize: '14px', fontWeight: '600' }}>📊 Status</h3>
            {[
              { label: 'Ativos', count: ativo, pct: (ativo/total)*100, cor: 'linear-gradient(90deg,#22c55e,#16a34a)' },
              { label: 'Inativos', count: inativo, pct: (inativo/total)*100, cor: 'linear-gradient(90deg,#ef4444,#dc2626)' },
            ].map(b => <BarraHorizontal key={b.label} {...b} />)}
          </div>
          <div style={cardStyle}>
            <h3 style={{ color: 'white', margin: '0 0 16px', fontSize: '14px', fontWeight: '600' }}>📅 Vencimentos</h3>
            {[
              { label: 'Vencem hoje', count: vencHoje, pct: (vencHoje/total)*100, cor: 'linear-gradient(90deg,#f59e0b,#d97706)' },
              { label: 'Vencem em 7 dias', count: venc7, pct: (venc7/total)*100, cor: 'linear-gradient(90deg,#3b82f6,#6366f1)' },
              { label: 'Vencidos', count: vencido, pct: (vencido/total)*100, cor: 'linear-gradient(90deg,#ef4444,#dc2626)' },
            ].map(b => <BarraHorizontal key={b.label} {...b} />)}
          </div>
        </div>
      </div>

      {/* Estimativa de Gênero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
            <Users size={16} color="#a78bfa" />
            <h3 style={{ color: 'white', margin: 0, fontSize: '14px', fontWeight: '600' }}>Estimativa de Gênero</h3>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', marginLeft: 'auto' }}>Estimado por nome</span>
          </div>
          {[
            { label: '♂ Masculino', count: masc, pct: (masc/total)*100, cor: 'linear-gradient(90deg,#3b82f6,#2563eb)' },
            { label: '♀ Feminino',  count: fem,  pct: (fem/total)*100,  cor: 'linear-gradient(90deg,#ec4899,#db2777)' },
            { label: '❓ Indefinido', count: ind,  pct: (ind/total)*100,  cor: 'linear-gradient(90deg,#6b7280,#4b5563)' },
          ].map(b => <BarraHorizontal key={b.label} {...b} />)}
        </div>

        {/* Top DDDs */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
            <MapPin size={16} color="#34d399" />
            <h3 style={{ color: 'white', margin: 0, fontSize: '14px', fontWeight: '600' }}>Top Regiões por DDD</h3>
          </div>
          {topDDD.slice(0, 8).map(b => <BarraHorizontal key={b.label} {...b} />)}
        </div>
      </div>
    </div>
  )
}
