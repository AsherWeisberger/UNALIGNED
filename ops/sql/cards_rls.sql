-- cards RLS hardening — run once in Supabase SQL editor (idempotent).
-- Anon key is public in the dashboard bundle; RLS is the security boundary.

alter table public.cards enable row level security;

grant select, insert, update on public.cards to anon, authenticated;
-- No DELETE grant: trash moves are soft (list_id = trash/dead-leads).

drop policy if exists cards_sel on public.cards;
create policy cards_sel on public.cards
  for select to anon, authenticated using (true);

drop policy if exists cards_ins on public.cards;
create policy cards_ins on public.cards
  for insert to anon, authenticated with check (true);

drop policy if exists cards_upd on public.cards;
create policy cards_upd on public.cards
  for update to anon, authenticated using (true) with check (true);

-- confirm: select tablename, rowsecurity from pg_tables where tablename = 'cards';