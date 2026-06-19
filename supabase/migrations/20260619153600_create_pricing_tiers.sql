create table if not exists public.pricing_tiers (
  id integer primary key,
  name text not null,
  price numeric(10, 2) not null default 0,
  short text,
  items jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.pricing_tiers to anon, authenticated;

insert into public.pricing_tiers (id, name, price, short, items, sort_order, is_active)
values
  (1, 'Retweet', 1195, 'RT', '["1 retweet"]'::jsonb, 1, true),
  (2, 'Quote Repost', 1895, 'QUOTE', '["1 quote repost", "Robert''s original quote (≤3 sentences)"]'::jsonb, 2, true),
  (3, 'Custom X Post', 1995, 'CUSTOM X', '["1 custom-written X post"]'::jsonb, 3, true),
  (4, 'Narrative Thread', 2495, 'THREAD', '["1 thread (1 + 2 attached)"]'::jsonb, 4, true),
  (5, 'Content Core', 2995, 'CORE', '["1 custom X post", "1 LinkedIn post", "Newsletter feature"]'::jsonb, 5, true),
  (6, 'Growth Bundle', 3995, 'GROWTH', '["1 custom X post", "1 LinkedIn post", "1 retweet", "Newsletter feature"]'::jsonb, 6, true),
  (7, 'Maximum Impact', 5995, 'MAX', '["2 custom X posts", "1 LinkedIn post", "2 retweets", "Newsletter feature", "Strategy sync"]'::jsonb, 7, true)
on conflict (id) do update
set
  name = excluded.name,
  price = excluded.price,
  short = excluded.short,
  items = excluded.items,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();
