-- Approval console schema. Run once in the Supabase SQL editor
-- (Project > SQL editor > New query > paste > Run). Idempotent; safe to re-run.

-- 1. Per-card "why" fields, so the Machine Room web console can read the Deal Desk
--    reasoning (orchestrator.log is not reachable from the browser).
alter table public.cards add column if not exists agent_assessment   text;
alter table public.cards add column if not exists recommended_action text;
alter table public.cards add column if not exists agent_tier         text;
-- estimated_value and the stage move (list_id) already exist and already persist.

-- 2. Operator health, a single row (id = 1) the orchestrator heartbeats each run and
--    the console binds to: status light, the two counters, and the halt bar.
create table if not exists public.ops_health (
  id                 int primary key default 1,
  status             text        not null default 'ok',   -- 'ok' | 'halted'
  halt_reason        text        not null default '',
  heartbeat          timestamptz,
  day                date,                                  -- the day the counters cover
  local_tokens_today bigint      not null default 0,        -- Qwen tokens today (the 90%)
  claude_spend_today numeric     not null default 0,        -- Claude $ today (the 10%)
  now_handling       text        not null default '',        -- e.g. "deal_desk → Heygen"; powers the Organs .work organ
  updated_at         timestamptz not null default now()
);
-- (re-run safe) add the Organs field if the table predates it.
alter table public.ops_health add column if not exists now_handling text not null default '';

insert into public.ops_health (id, status) values (1, 'ok')
  on conflict (id) do nothing;

-- The dashboard and the orchestrator both use the anon key. This project enforces
-- RLS on new tables, so grants alone are not enough: add policies that let anon
-- read + heartbeat this single operational row. No delete policy (matches the cards
-- hardening, which blocks anon delete).
grant select, insert, update on public.ops_health to anon, authenticated;
alter table public.ops_health enable row level security;
drop policy if exists ops_health_sel on public.ops_health;
create policy ops_health_sel on public.ops_health for select to anon, authenticated using (true);
drop policy if exists ops_health_ins on public.ops_health;
create policy ops_health_ins on public.ops_health for insert to anon, authenticated with check (true);
drop policy if exists ops_health_upd on public.ops_health;
create policy ops_health_upd on public.ops_health for update to anon, authenticated using (true) with check (true);

-- Optional: confirm.
-- select * from public.ops_health;
-- select column_name from information_schema.columns
--   where table_name='cards' and column_name in
--   ('agent_assessment','recommended_action','agent_tier');
