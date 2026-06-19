create table if not exists public.team_users (
  id text primary key,
  name text not null,
  role text default '',
  color text default '#2f5fd6',
  initials text default '',
  lane text default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.team_users to anon, authenticated;

insert into public.team_users (id, name, role, color, initials, lane, sort_order, is_active)
values
  ('asher', 'Asher', 'Services', '#2f5fd6', 'AW', 'sales', 1, true),
  ('sammy', 'Sammy', 'Manager', '#16894a', 'SM', 'sales', 2, true),
  ('robert', 'Robert', 'Creator', '#a93268', 'RW', 'creator', 3, true)
on conflict (id) do update
set
  name = excluded.name,
  role = excluded.role,
  color = excluded.color,
  initials = excluded.initials,
  lane = excluded.lane,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();
