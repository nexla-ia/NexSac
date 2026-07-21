create or replace function check_user_limit()
returns trigger language plpgsql as $$
declare
  co      record;
  max_u   int;
  curr_u  int;
  plan_max int;
begin
  select * into co from companies where id = new.company_id;
  if not found then return new; end if;

  -- Limite efetivo: override direto tem prioridade; senão, default do plano + extras
  if co.max_users is not null and co.max_users > 0 then
    max_u := co.max_users;
  else
    plan_max := case co.plan
      when 'Starter'  then 5
      when 'Pro'      then 20
      when 'Business' then null
      else 5
    end;
    if plan_max is null then return new; end if; -- Business = ilimitado
    max_u := plan_max + coalesce(co.extra_users, 0);
  end if;

  select count(*) into curr_u
    from users
    where company_id = new.company_id
      and active is not false;

  if curr_u >= max_u then
    raise exception 'Limite de usuários atingido para esta empresa (máx: %). Contrate usuários extras ou faça upgrade de plano.', max_u;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_user_limit on users;
create trigger trg_check_user_limit
  before insert on users
  for each row execute function check_user_limit();
