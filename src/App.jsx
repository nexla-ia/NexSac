import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import Landing from './pages/Landing'
import AdmLayout from './pages/adm/AdmLayout'
import AdmDashboard from './pages/adm/AdmDashboard'
import AdmCompanies from './pages/adm/AdmCompanies'
import AdmCompanyDetail from './pages/adm/AdmCompanyDetail'
import AdmEspiao from './pages/adm/AdmEspiao'
import AdmOperacao from './pages/adm/AdmOperacao'
import AdmSupport from './pages/adm/AdmSupport'
import AdmQualidade from './pages/adm/AdmQualidade'
import AdmAnalise from './pages/adm/AdmAnalise'
import AdmLanding from './pages/adm/AdmLanding'
import CompanyLayout from './pages/company/CompanyLayout'
import CompanyHistory from './pages/company/CompanyHistory'
import CompanyAlerts from './pages/company/CompanyAlerts'
import CompanyConversations from './pages/company/CompanyConversations'
import CompanyContacts from './pages/company/CompanyContacts'
import CompanyContactDetail from './pages/company/CompanyContactDetail'
import CompanyAgenda from './pages/company/CompanyAgenda'
import CompanyKanban from './pages/company/CompanyKanban'
import CompanyCatalog from './pages/company/CompanyCatalog'
import CompanyTutorial from './pages/company/CompanyTutorial'
import CompanyInstagram from './pages/company/CompanyInstagram'
import CompanyNews from './pages/company/CompanyNews'
import CompanyMetrics from './pages/company/CompanyMetrics'
import CompanyAdmin from './pages/company/CompanyAdmin'
import CompanySeguranca from './pages/company/CompanySeguranca'
import CompanyFeedback from './pages/company/CompanyFeedback'
import CompanyGroups from './pages/company/CompanyGroups'
import CompanyFinanceiro from './pages/company/CompanyFinanceiro'
import CompanyCRM from './pages/company/CompanyCRM'

function PrivateAdm({ children }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== 'adm') return <Navigate to="/painel" replace />
  return children
}

function PrivateCompany({ children }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== 'company') return <Navigate to="/adm" replace />
  return children
}

function RootRedirect() {
  return <Landing />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="/adm" element={<PrivateAdm><AdmLayout /></PrivateAdm>}>
            <Route index element={<AdmDashboard />} />
            <Route path="empresas" element={<AdmCompanies />} />
            <Route path="empresas/:id" element={<AdmCompanyDetail />} />
            <Route path="espiao" element={<AdmEspiao />} />
            <Route path="operacao" element={<AdmOperacao />} />
            <Route path="suporte" element={<AdmSupport />} />
            <Route path="qualidade" element={<AdmQualidade />} />
            <Route path="analise" element={<AdmAnalise />} />
            <Route path="landing" element={<AdmLanding />} />
          </Route>

          <Route path="/painel" element={<PrivateCompany><CompanyLayout /></PrivateCompany>}>
            <Route index element={<Navigate to="/painel/conversas" replace />} />
            <Route path="conversas" element={<CompanyConversations />} />
            <Route path="historico" element={<CompanyHistory />} />
            <Route path="contatos" element={<CompanyContacts />} />
            <Route path="contatos/:id" element={<CompanyContactDetail />} />
            <Route path="agenda" element={<CompanyAgenda />} />
            <Route path="atividades" element={<CompanyKanban />} />
            <Route path="catalogo" element={<CompanyCatalog />} />
            <Route path="tutorial" element={<CompanyTutorial />} />
            <Route path="instagram" element={<CompanyInstagram />} />
            <Route path="novidades" element={<CompanyNews />} />
            <Route path="alertas" element={<CompanyAlerts />} />
            <Route path="metricas" element={<CompanyMetrics />} />
            <Route path="admin" element={<CompanyAdmin />} />
            <Route path="seguranca" element={<CompanySeguranca />} />
            <Route path="feedback"  element={<CompanyFeedback />} />
            <Route path="grupos"    element={<CompanyGroups />} />
            <Route path="financeiro" element={<CompanyFinanceiro />} />
            <Route path="crm" element={<CompanyCRM />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
