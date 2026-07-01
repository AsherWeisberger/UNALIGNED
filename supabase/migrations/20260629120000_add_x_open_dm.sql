alter table if exists public.cards
  add column if not exists x_open_dm text;

create unique index if not exists cards_x_open_dm_uniq
  on public.cards (x_open_dm)
  where x_open_dm is not null;

comment on column public.cards.x_open_dm is
  'X DM compose URL identity key; one card per openDm thread.';