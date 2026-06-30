-- Pipeline observability columns on ops_health (idempotent).

alter table public.ops_health add column if not exists scraper_last_run    timestamptz;
alter table public.ops_health add column if not exists scraper_last_status text not null default '';
alter table public.ops_health add column if not exists scraper_robert_ok   boolean not null default false;
alter table public.ops_health add column if not exists scraper_asher_ok    boolean not null default false;
alter table public.ops_health add column if not exists gmail_delta_at      timestamptz;
alter table public.ops_health add column if not exists gmail_delta_status  text not null default '';
alter table public.ops_health add column if not exists cards_patched       int not null default 0;
alter table public.ops_health add column if not exists cards_created       int not null default 0;