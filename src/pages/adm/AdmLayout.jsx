import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'
import { LayoutDashboard, Building2, Eye, Headset, Telescope, BarChart2 } from 'lucide-react'
import './Adm.css'

const links = [
  { to: '/adm',          end: true, icon: LayoutDashboard, label: 'Dashboard'    },
  { to: '/adm/empresas',            icon: Building2,       label: 'Empresas'     },
  { to: '/adm/analise',             icon: Telescope,       label: 'Análise 360°' },
  { to: '/adm/landing',             icon: BarChart2,       label: 'Landing Page' },
  { to: '/adm/suporte',             icon: Headset,         label: 'Suporte'      },
]

export default function AdmLayout() {
  return (
    <div className="adm-root">
      <Sidebar links={links} role="adm" />
      <main className="adm-main">
        <Outlet />
      </main>
    </div>
  )
}
