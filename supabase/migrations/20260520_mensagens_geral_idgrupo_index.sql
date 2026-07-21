-- Índice para filtrar mensagens de grupos (idgrupo sempre termina em @g.us quando preenchido)
create index if not exists idx_mensagens_geral_idgrupo
  on mensagens_geral (instancia, idgrupo)
  where idgrupo is not null;
