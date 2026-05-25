import { readFileSync, writeFileSync } from 'fs'

// App.tsx
let app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n')
app = app.replace(
  `import Pagamentos from "./pages/Pagamentos";`,
  `import Pagamentos from "./pages/Pagamentos";
import Followup from "./pages/Followup";`
)
app = app.replace(
  `            <Route path="posicionamento" element={<Posicionamento />} />`,
  `            <Route path="posicionamento" element={<Posicionamento />} />
            <Route path="followup" element={<Followup />} />`
)
writeFileSync('src/App.tsx', app, 'utf8')
console.log('✅ App.tsx — rota Follow-up adicionada!')

// MenuLateral.tsx
let menu = readFileSync('src/components/MenuLateral.tsx', 'utf8').replace(/\r\n/g, '\n')
menu = menu.replace(
  `import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp, CreditCard, MapPin } from 'lucide-react'`,
  `import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp, CreditCard, MapPin, PhoneCall } from 'lucide-react'`
)
menu = menu.replace(
  `  { path: 'posicionamento', icon: <MapPin size={18} />,          label: 'Posicionamento' },`,
  `  { path: 'posicionamento', icon: <MapPin size={18} />,          label: 'Posicionamento' },
  { path: 'followup',       icon: <PhoneCall size={18} />,        label: 'Follow-up' },`
)
writeFileSync('src/components/MenuLateral.tsx', menu, 'utf8')
console.log('✅ MenuLateral.tsx — item Follow-up adicionado!')
