-- Per-deal helper chat persistence on cards (idempotent).

alter table public.cards add column if not exists helper_thread jsonb;