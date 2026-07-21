do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_session_instancia_unique'
  ) then
    alter table conversations
      add constraint conversations_session_instancia_unique
      unique (session_id, instancia);
  end if;
end $$;
