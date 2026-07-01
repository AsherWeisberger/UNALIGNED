-- Gmail token watchdog columns on ops_health (idempotent).

alter table public.ops_health add column if not exists gmail_token_checked_at   timestamptz;
alter table public.ops_health add column if not exists gmail_token_robert_ok    boolean not null default false;
alter table public.ops_health add column if not exists gmail_token_asher_ok     boolean not null default false;
alter table public.ops_health add column if not exists gmail_token_robert_error text not null default '';
alter table public.ops_health add column if not exists gmail_token_asher_error  text not null default '';