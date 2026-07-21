import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Mock data (contacts/conversations/alerts — migrar para API depois) ────────
export const mockContacts = {
  'comp-1': [
    { id: 'c1', name: 'Roberto Alves',    phone: '+55 11 91234-5678', status: 'attended',  lastMsg: 'Quero agendar um atendimento para amanhã.', time: '14:32', unread: 0 },
    { id: 'c2', name: 'Patrícia Souza',   phone: '+55 11 99876-5432', status: 'waiting',   lastMsg: 'Olá, vocês têm horário na sexta?',          time: '13:10', unread: 2 },
    { id: 'c3', name: 'Fernando Rocha',   phone: '+55 21 98765-4321', status: 'help',      lastMsg: 'Não consigo entender o que a IA disse...',  time: '12:55', unread: 1 },
    { id: 'c4', name: 'Camila Nunes',     phone: '+55 11 94567-8901', status: 'scheduled', lastMsg: 'Confirmado! Às 15h de quinta.',              time: '11:30', unread: 0 },
    { id: 'c5', name: 'Tiago Moreira',    phone: '+55 31 93456-7890', status: 'attended',  lastMsg: 'Ok, obrigado pelo atendimento.',             time: '10:05', unread: 0 },
  ],
  'comp-2': [
    { id: 'c6', name: 'Bruna Cavalcanti', phone: '+55 81 97654-3210', status: 'waiting',   lastMsg: 'Gostaria de ver o apartamento no centro.',  time: '15:00', unread: 3 },
    { id: 'c7', name: 'Henrique Leal',    phone: '+55 11 96543-2109', status: 'help',      lastMsg: 'A IA não sabe responder sobre o contrato.', time: '14:20', unread: 1 },
    { id: 'c8', name: 'Monique Farias',   phone: '+55 85 95432-1098', status: 'scheduled', lastMsg: 'Visita marcada para sábado às 10h.',         time: '09:45', unread: 0 },
  ],
  'comp-3': [
    { id: 'c9',  name: 'Lucas Pimentel',  phone: '+55 11 94321-0987', status: 'waiting',   lastMsg: 'Quanto custa banho e tosa poodle médio?',   time: '16:10', unread: 1 },
    { id: 'c10', name: 'Vanessa Lima',    phone: '+55 11 93210-9876', status: 'attended',  lastMsg: 'Perfeito! Até amanhã então.',                time: '13:25', unread: 0 },
  ],
}

export const mockConversations = {
  c1: [
    { id: 1, from: 'client', text: 'Boa tarde! Gostaria de agendar um atendimento.',        time: '14:20' },
    { id: 2, from: 'ai',     text: 'Olá! Sou a assistente da Soluções Total. Posso te ajudar com o agendamento. Qual serviço você precisa?', time: '14:20' },
    { id: 3, from: 'client', text: 'Atendimento geral, por favor.',                        time: '14:25' },
    { id: 4, from: 'ai',     text: 'Perfeito! Temos horários disponíveis na terça (manhã e tarde) e quinta (tarde). Qual preferir?', time: '14:25' },
    { id: 5, from: 'client', text: 'Terça de manhã seria ótimo.',                         time: '14:28' },
    { id: 6, from: 'ai',     text: 'Ótimo! Tenho disponível às 9h, 10h e 11h. Qual horário prefere?', time: '14:28' },
    { id: 7, from: 'client', text: 'Às 10h perfeito.',                                    time: '14:30' },
    { id: 8, from: 'ai',     text: '✅ Agendamento confirmado! Terça-feira às 10h com Marcos. Vou te enviar o endereço e instruções. Até lá!', time: '14:32', type: 'scheduled' },
  ],
  c2: [
    { id: 1, from: 'client', text: 'Olá, vocês têm horário disponível na sexta-feira?',  time: '13:05' },
    { id: 2, from: 'ai',     text: 'Olá! Sexta-feira temos alguns horários. Para qual serviço você precisa?', time: '13:06' },
    { id: 3, from: 'client', text: 'Orçamento, por favor.',                               time: '13:10' },
    { id: 4, from: 'ai',     text: 'Verificando disponibilidade para orçamento na sexta...', time: '13:10', pending: true },
  ],
  c3: [
    { id: 1, from: 'client', text: 'Oi, quero saber sobre os planos de assinatura.',     time: '12:40' },
    { id: 2, from: 'ai',     text: 'Claro! Temos diversos planos disponíveis. Quer contratar ou tem alguma dúvida específica?', time: '12:41' },
    { id: 3, from: 'client', text: 'Preciso saber se há desconto à vista.',              time: '12:50' },
    { id: 4, from: 'ai',     text: '🆘 Preciso de ajuda para responder sobre descontos de pagamento. Aguardando atendente humano.', time: '12:55', type: 'help' },
  ],
}

export const mockAlerts = {
  'comp-1': [
    { id: 'a1', contactName: 'Fernando Rocha',   phone: '+55 21 98765-4321', type: 'help',      message: 'Cliente perguntou sobre condições de pagamento. IA não conseguiu responder adequadamente.', time: '12:55', resolved: false },
    { id: 'a2', contactName: 'Patrícia Souza',   phone: '+55 11 99876-5432', type: 'schedule',  message: 'Cliente quer agendar para sexta, mas sistema não tem disponibilidade. Verificar agenda manual.', time: '13:10', resolved: false },
    { id: 'a3', contactName: 'Camila Nunes',     phone: '+55 11 94567-8901', type: 'schedule',  message: 'Agendamento confirmado: quinta-feira às 15h. Contato notificado com sucesso.', time: '11:30', resolved: true },
  ],
  'comp-2': [
    { id: 'a4', contactName: 'Henrique Leal',    phone: '+55 11 96543-2109', type: 'help',      message: 'Dúvida sobre cláusulas contratuais. IA redirecionou para atendimento humano.', time: '14:20', resolved: false },
    { id: 'a5', contactName: 'Monique Farias',   phone: '+55 85 95432-1098', type: 'schedule',  message: 'Visita agendada: sábado 10h. Corretor Rafael designado.', time: '09:45', resolved: true },
  ],
  'comp-3': [
    { id: 'a6', contactName: 'Lucas Pimentel',   phone: '+55 11 94321-0987', type: 'schedule',  message: 'Cliente aguarda confirmação de preço para banho e tosa. Aguardando tabela atualizada.', time: '16:10', resolved: false },
  ],
}

// ─── Auth context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

const SESSION_KEY = 'nx_session'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
  })
  const [db, setDb] = useState({ companies: [] })
  const [dbLoading, setDbLoading] = useState(false)
  const [dbError, setDbError] = useState(null)

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  }, [session])

  const loadDB = useCallback(async () => {
    setDbLoading(true)
    setDbError(null)
    const { data, error } = await supabase
      .from('companies')
      .select('*, users(*)')
      .order('created_at', { ascending: false })
    if (error) {
      setDbError('Erro ao carregar dados. Verifique as políticas RLS no Supabase.')
    } else if (data) {
      setDb({ companies: data })
    }
    setDbLoading(false)
  }, [])

  useEffect(() => {
    if (session?.role === 'adm') loadDB()
  }, [session?.role, loadDB])

  // Verifica a cada 5 min se o usuário/empresa ainda está ativo no banco.
  // Protege contra o caso de um admin desativar um usuário logado.
  useEffect(() => {
    if (!session || session.role === 'adm') return
    async function checkActive() {
      const [{ data: userData }, { data: companyData }] = await Promise.all([
        supabase.from('users').select('active').eq('id', session.user.id).single(),
        supabase.from('companies').select('active').eq('id', session.company.id).single(),
      ])
      if ((userData && !userData.active) || (companyData && !companyData.active)) {
        logout()
      }
    }
    const id = setInterval(checkActive, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [session?.user?.id, session?.company?.id])

  async function login(email, password, mode) {
    const { data, error } = await supabase.rpc('login_user', {
      p_email: email,
      p_password: password,
    })

    if (error) {
      return { ok: false, error: 'Erro ao conectar com o servidor. Tente novamente.' }
    }

    if (!data?.length) {
      return { ok: false, error: 'E-mail ou senha incorretos.' }
    }

    const user = data[0]

    if (mode === 'adm') {
      if (user.role !== 'adm') return { ok: false, error: 'Credenciais ADM inválidas.' }
      setSession({ role: 'adm', user: { name: user.name, email: user.email } })
      return { ok: true }
    }

    if (user.role === 'adm' || !user.company_id) {
      return { ok: false, error: 'E-mail ou senha incorretos.' }
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*, users(*)')
      .eq('id', user.company_id)
      .single()

    if (companyError || !company) {
      return { ok: false, error: 'Erro ao carregar dados da empresa. Tente novamente.' }
    }

    if (!company.active) {
      return { ok: false, error: 'Empresa inativa. Contate o administrador.' }
    }

    // Carrega setor do usuário (graceful: tabela pode não existir ainda)
    let sector = null
    try {
      const { data: memberData } = await supabase
        .from('sector_members')
        .select('sector_id, sectors(id, name, color)')
        .eq('user_id', user.id)
        .maybeSingle()
      sector = memberData?.sectors || null
    } catch {}

    setSession({ role: 'company', user: { ...user, sector }, company })
    return { ok: true }
  }

  function logout() { setSession(null); localStorage.removeItem(SESSION_KEY) }

  async function addCompany(data) {
    const slug = data.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')

    const { data: newComp, error } = await supabase
      .from('companies')
      .insert({
        name: data.name,
        slug,
        plan: data.plan || 'Starter',
        contacts_table: data.contactsTable || null,
        history_table: data.historyTable || null,
        instance: data.instance || null,
        api_instancia: data.apiInstancia || null,
      })
      .select()
      .single()

    if (error) return null

    // Configura RLS + Realtime nas tabelas se já existirem
    if (newComp) {
      if (data.historyTable) await supabase.rpc('ensure_table_setup', { p_table: data.historyTable })
      if (data.contactsTable) await supabase.rpc('ensure_table_setup', { p_table: data.contactsTable })
    }

    await loadDB()
    return newComp
  }

  async function addUser(companyId, userData) {
    const { error } = await supabase.rpc('create_user', {
      p_name: userData.name,
      p_email: userData.email,
      p_password: userData.password,
      p_role: userData.role || 'admin',
      p_company_id: companyId,
    })
    if (error) return { ok: false, error: error.message }
    await loadDB()
    return { ok: true }
  }

  async function updateUser(userId, userData) {
    const updates = {
      name: userData.name,
      email: userData.email,
      role: userData.role,
    }
    const { error } = await supabase.from('users').update(updates).eq('id', userId)
    if (error) return { ok: false, error: error.message }

    if (userData.password) {
      const { error: pwErr } = await supabase.rpc('update_user_password', {
        p_user_id: userId,
        p_password: userData.password,
      })
      if (pwErr) return { ok: false, error: pwErr.message }
    }

    await loadDB()
    return { ok: true }
  }

  async function toggleUserActive(companyId, userId) {
    const company = db.companies.find(c => c.id === companyId)
    const user = company?.users?.find(u => u.id === userId)
    if (!user) return
    const { error } = await supabase.from('users').update({ active: !user.active }).eq('id', userId)
    if (!error) await loadDB()
  }

  async function toggleCompanyActive(companyId) {
    const company = db.companies.find(c => c.id === companyId)
    if (!company) return
    const { error } = await supabase.from('companies').update({ active: !company.active }).eq('id', companyId)
    if (!error) await loadDB()
  }

  return (
    <AuthContext.Provider value={{ session, db, dbLoading, dbError, login, logout, loadDB, addCompany, addUser, updateUser, toggleUserActive, toggleCompanyActive }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
