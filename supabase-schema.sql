create type staff_presence_status as enum ('available', 'busy', 'offline');
create type call_session_status as enum (
  'queued',
  'ringing',
  'accepted',
  'declined',
  'timed_out',
  'no_staff_available',
  'ended',
  'failed'
);

create table staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  status staff_presence_status not null default 'offline',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  location text,
  token_hash text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table call_sessions (
  id uuid primary key default gen_random_uuid(),
  kiosk_device_id uuid not null references kiosk_devices(id),
  assigned_staff_id uuid references staff_profiles(user_id),
  status call_session_status not null default 'queued',
  ring_expires_at timestamptz,
  routing_attempt integer not null default 0,
  started_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create table call_routing_state (
  id text primary key default 'global',
  last_staff_user_id uuid references staff_profiles(user_id),
  updated_at timestamptz not null default now(),
  constraint call_routing_state_singleton check (id = 'global')
);

insert into call_routing_state (id)
values ('global')
on conflict (id) do nothing;

create table call_events (
  id bigint generated always as identity primary key,
  call_session_id uuid references call_sessions(id) on delete cascade,
  actor_type text not null check (actor_type in ('kiosk', 'staff', 'system')),
  actor_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table signaling_messages (
  id bigint generated always as identity primary key,
  call_session_id uuid not null references call_sessions(id) on delete cascade,
  sender_type text not null check (sender_type in ('kiosk', 'staff')),
  sender_id text,
  message_type text not null check (message_type in ('offer', 'answer', 'ice', 'hangup')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table staff_profiles enable row level security;
alter table kiosk_devices enable row level security;
alter table call_sessions enable row level security;
alter table call_routing_state enable row level security;
alter table call_events enable row level security;
alter table signaling_messages enable row level security;

create policy "Staff can read staff profiles"
  on staff_profiles for select
  to authenticated
  using (true);

create policy "Staff can update own profile"
  on staff_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Staff can insert own profile"
  on staff_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Staff can read assigned calls"
  on call_sessions for select
  to authenticated
  using (assigned_staff_id = auth.uid());

create policy "Staff can update assigned calls"
  on call_sessions for update
  to authenticated
  using (assigned_staff_id = auth.uid())
  with check (assigned_staff_id = auth.uid());

create policy "Staff can read assigned call events"
  on call_events for select
  to authenticated
  using (
    exists (
      select 1
      from call_sessions
      where call_sessions.id = call_events.call_session_id
      and call_sessions.assigned_staff_id = auth.uid()
    )
  );

create policy "Staff can read assigned signaling"
  on signaling_messages for select
  to authenticated
  using (
    exists (
      select 1
      from call_sessions
      where call_sessions.id = signaling_messages.call_session_id
      and call_sessions.assigned_staff_id = auth.uid()
    )
  );

-- Kiosk device validation, call creation, routing state, and system event writes
-- should happen through server-side code using the service-role key.
