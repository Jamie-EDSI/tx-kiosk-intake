-- ============================================================
-- supabase-staff-migration.sql
--
-- Run this in the Supabase SQL editor (after the "intakes" table
-- already exists). Adds the two tables staff.html needs:
--   - staff_presence   one row per staff member, Available/Busy/Offline
--   - call_requests    a staff member calling a specific intake
--
-- Mirrors the permissive, no-auth RLS posture used for "intakes"
-- (anon key can read/write everything). Tighten this before using
-- real client data — see README's existing warning about auth.
-- ============================================================

create table if not exists staff_presence (
  name       text primary key,
  status     text not null default 'Offline' check (status in ('Available', 'Busy', 'Offline')),
  updated_at timestamptz not null default now()
);

create table if not exists call_requests (
  id          uuid primary key default gen_random_uuid(),
  intake_id   uuid references intakes(id) on delete cascade,
  intake_name text not null,
  staff_name  text not null,
  status      text not null default 'Ringing' check (status in ('Ringing', 'Active', 'Ended', 'Declined')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);

alter table staff_presence enable row level security;
alter table call_requests  enable row level security;

create policy "anon full access" on staff_presence
  for all using (true) with check (true);

create policy "anon full access" on call_requests
  for all using (true) with check (true);

-- Enable Realtime change feeds for both tables (Database → Replication
-- in the dashboard does the same thing if you'd rather click than run SQL).
alter publication supabase_realtime add table staff_presence;
alter publication supabase_realtime add table call_requests;
