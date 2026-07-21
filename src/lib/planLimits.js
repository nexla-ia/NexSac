// ────────────────────────────────────────────────────────────────────────────
// Plan limits — fonte única de verdade
//
// Cada plano tem:
//   - Limites quantitativos (profissionais, usuários, agendas, etc)
//   - Feature flags (métricas avançadas, round-robin, etc)
//
// As empresas podem ter overrides individuais em `companies` (ex: extra_users
// pra add-on de R$39/usuário, ou max_professionals customizado pra cliente
// especial). Quando o override for null, cai no default do plano.
// ────────────────────────────────────────────────────────────────────────────

export const UNLIMITED = Infinity

// Defaults por plano. UNLIMITED = sem limite.
export const PLAN_DEFAULTS = {
  Starter: {
    label: 'Starter',
    price: 247,
    professionals: 3,
    users: 5,
    agendas: 1,
    whatsapp_instances: 1,
    instagram_accounts: 0,
    // feature flags
    advanced_metrics: false,    // abas Equipe / Financeiro / Leads
    round_robin: false,
    hsm_templates: false,
    multi_filial_compare: false,
    ia_posts: false,
    ia_laudos: false,
    api_custom: false,
  },
  Pro: {
    label: 'Pro',
    price: 597,
    professionals: 25,
    users: 20,
    agendas: UNLIMITED,
    whatsapp_instances: 1,
    instagram_accounts: 1,
    advanced_metrics: true,
    round_robin: true,
    hsm_templates: true,
    multi_filial_compare: false,
    ia_posts: false,
    ia_laudos: false,
    api_custom: false,
  },
  Business: {
    label: 'Business',
    price: null, // sob medida
    professionals: UNLIMITED,
    users: UNLIMITED,
    agendas: UNLIMITED,
    whatsapp_instances: UNLIMITED,
    instagram_accounts: UNLIMITED,
    advanced_metrics: true,
    round_robin: true,
    hsm_templates: true,
    multi_filial_compare: true,
    ia_posts: true,        // Em breve
    ia_laudos: true,       // Em breve
    api_custom: true,
  },
}

export const PLAN_NAMES = ['Starter', 'Pro', 'Business']

// Add-on de usuário extra: R$ 39/mês cada, disponível em Starter e Pro
export const ADDON_USER_PRICE = 39

// Resolve os limites efetivos pra uma empresa específica (plano + overrides).
// Retorna sempre um objeto com TODOS os campos resolvidos.
export function getEffectiveLimits(company) {
  if (!company) return PLAN_DEFAULTS.Starter
  const plan = company.plan && PLAN_DEFAULTS[company.plan] ? company.plan : 'Starter'
  const defaults = PLAN_DEFAULTS[plan]

  const extraUsers = Number(company.extra_users || 0)
  const overrideMaxUsers = company.max_users != null && company.max_users > 0 ? Number(company.max_users) : null

  return {
    ...defaults,
    plan,
    // max_users: usa override se existir; senão default + extra_users
    users: overrideMaxUsers ?? (defaults.users === UNLIMITED ? UNLIMITED : defaults.users + extraUsers),
    extra_users: extraUsers,
    // overrides opcionais (nullable nas colunas do banco)
    professionals: company.max_professionals ?? defaults.professionals,
    agendas: company.max_agendas ?? defaults.agendas,
  }
}

// Helpers de check
export function reachedLimit(current, limit) {
  if (limit === UNLIMITED) return false
  return Number(current) >= Number(limit)
}

export function formatLimit(limit) {
  return limit === UNLIMITED ? 'ilimitado' : String(limit)
}

// Mensagens de upgrade — usadas no LimitReachedModal
export function upgradeMessage(resource, limit, planName) {
  const messages = {
    professionals: {
      title: 'Limite de profissionais atingido',
      body: `Seu plano ${planName} cobre até ${formatLimit(limit)} profissionais cadastrados. Pra liberar mais, é só subir de plano (ou pedir um override pro time).`,
      cta: 'Falar com o time',
    },
    users: {
      title: 'Limite de usuários atingido',
      body: `Seu plano ${planName} cobre ${formatLimit(limit)} usuários. Você pode adicionar usuários extras (R$ 39/mês cada) ou subir de plano pra liberar muito mais.`,
      cta: 'Falar com o time',
    },
    agendas: {
      title: 'Limite de agendas atingido',
      body: `Seu plano ${planName} cobre ${formatLimit(limit)} agenda${limit > 1 ? 's' : ''}. No Pro são ilimitadas — fala com a gente pra subir.`,
      cta: 'Falar com o time',
    },
    instagram: {
      title: 'Instagram disponível só no Pro',
      body: 'Instagram unificado com IA está disponível a partir do plano Pro. Sobe de plano pra ativar.',
      cta: 'Falar com o time',
    },
    advanced_metrics: {
      title: 'Métricas avançadas só no Pro',
      body: 'As abas Equipe, Financeiro e Leads são exclusivas do Pro. Visão geral, Atendimento e Agenda continuam no Starter.',
      cta: 'Falar com o time',
    },
  }
  return messages[resource] || {
    title: 'Recurso indisponível no seu plano',
    body: `Seu plano ${planName} não inclui esse recurso. Fala com a gente pra subir de plano.`,
    cta: 'Falar com o time',
  }
}
