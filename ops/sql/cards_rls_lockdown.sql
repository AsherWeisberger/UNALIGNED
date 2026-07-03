-- Lock down direct anon access to leads + desk intake reads.
-- Mac dashboard uses brief-server /supabase-proxy (service role).
-- Public connect form writes via Firebase robertDeskIntake (service role).

revoke select, insert, update on public.cards from anon;
drop policy if exists cards_sel on public.cards;
drop policy if exists cards_ins on public.cards;
drop policy if exists cards_upd on public.cards;

revoke select, update on public.robert_desk_intake from anon;
drop policy if exists robert_desk_intake_sel on public.robert_desk_intake;
drop policy if exists robert_desk_intake_upd_status on public.robert_desk_intake;