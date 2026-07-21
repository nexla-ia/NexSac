-- Índices de performance para as tabelas multi-tenant mais consultadas.
-- mensagens_geral é a tabela mais pesada: todas as queries filtram por instancia+numero.
create index if not exists idx_mensagens_instancia_numero
  on mensagens_geral(instancia, numero);

create index if not exists idx_mensagens_instancia_created
  on mensagens_geral(instancia, created_at desc);

-- appointments: lookup por contato
create index if not exists idx_appointments_instancia_numero
  on appointments(instancia, contact_numero);

-- saved_contacts: lookup de número salvo
create index if not exists idx_saved_contacts_instancia_numero
  on saved_contacts(instancia, numero);

-- attendances: quem está atendendo qual número
create index if not exists idx_attendances_instancia_numero
  on attendances(instancia, numero);

-- kanban_cards: listagem por instância
create index if not exists idx_kanban_cards_instancia
  on kanban_cards(instancia);
