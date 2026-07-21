-- Add per-section time tracking to landing analytics
alter table landing_analytics
  add column if not exists section_times jsonb;
