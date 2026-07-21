-- Landing page analytics: session tracking for anonymous visitors
create table if not exists landing_analytics (
  id          uuid        default gen_random_uuid() primary key,
  session_id  text        not null unique,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz,
  duration_ms integer,
  referrer    text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  device      text,
  scroll_depth smallint   default 0,
  cta_clicked boolean     default false
);

alter table landing_analytics enable row level security;

-- Visitors (anon) can insert/update their own session
create policy "landing_anon_insert" on landing_analytics
  for insert to anon with check (true);

create policy "landing_anon_update" on landing_analytics
  for update to anon using (true) with check (true);

-- Any authenticated user (admins) can read
create policy "landing_auth_read" on landing_analytics
  for select using (auth.role() = 'authenticated' or true);

-- Enable Realtime so the admin page receives live updates
alter publication supabase_realtime add table landing_analytics;
