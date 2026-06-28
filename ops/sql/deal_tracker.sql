-- Deal Tracker (Phase 1 shadow) — board fields the tracker writes its READ into.
-- Run once in the Supabase SQL editor. Idempotent. All nullable / safe defaults.
-- None of these change a deal stage; list_id is never touched by the tracker in Phase 1.

alter table public.cards add column if not exists deal_state        text;          -- engaged|rates-sent|negotiating|ready-to-invoice|stalled|declined|unclear
alter table public.cards add column if not exists deal_confidence   text;          -- high|medium|low
alter table public.cards add column if not exists deal_awaiting      text;          -- us|them|none
alter table public.cards add column if not exists deal_evidence      text;          -- exact quoted sentence
alter table public.cards add column if not exists deal_next_action   text;          -- one line: who owns the next move
alter table public.cards add column if not exists last_inbound_at    timestamptz;   -- last message time used for quiet_days
alter table public.cards add column if not exists needs_human_read   boolean not null default false;
alter table public.cards add column if not exists needs_reply        boolean not null default false;
alter table public.cards add column if not exists needs_followup     boolean not null default false;
alter table public.cards add column if not exists ready_to_invoice   boolean not null default false;
alter table public.cards add column if not exists agreement          boolean not null default false;

-- confirm:
-- select column_name from information_schema.columns where table_name='cards'
--   and column_name in ('deal_state','deal_confidence','deal_awaiting','deal_evidence',
--   'deal_next_action','last_inbound_at','needs_human_read','needs_reply','needs_followup',
--   'ready_to_invoice','agreement');
