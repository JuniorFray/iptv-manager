import { readFileSync, writeFileSync } from 'fs'

// ── App.tsx — add Posicionamento route ───────────────────────────────────────
let app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n')

app = app.replace(
  `import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";`,
  `import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Posicionamento from "./pages/Posicionamento";`
)

app = app.replace(
  `            <Route path="pagamentos" element={<Pagamentos />} />`,
  `            <Route path="pagamentos" element={<Pagamentos />} />
            <Route path="posicionamento" element={<Posicionamento />} />`
)

writeFileSync('src/App.tsx', app, 'utf8')
console.log('✅ App.tsx — rota Posicionamento adicionada!')

// ── MenuLateral.tsx — add Posicionamento menu item ───────────────────────────
let menu = readFileSync('src/components/MenuLateral.tsx', 'utf8').replace(/\r\n/g, '\n')

menu = menu.replace(
  `import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp, CreditCard } from 'lucide-react'`,
  `import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, MessageSquare, LogOut, Tv, Server, TrendingUp, CreditCard, MapPin } from 'lucide-react'`
)

menu = menu.replace(
  `  { path: 'pagamentos',   icon: <CreditCard size={18} />,      label: 'Pagamentos' },
]`,
  `  { path: 'pagamentos',   icon: <CreditCard size={18} />,      label: 'Pagamentos' },
  { path: 'posicionamento', icon: <MapPin size={18} />,          label: 'Posicionamento' },
]`
)

writeFileSync('src/components/MenuLateral.tsx', menu, 'utf8')
console.log('✅ MenuLateral.tsx — item Posicionamento adicionado!')
