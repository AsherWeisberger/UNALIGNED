alter table if exists public.cards
add column if not exists brief_status text;
