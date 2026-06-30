-- Add X Comment + Like to the live pricing_tiers table.
-- Run in Supabase SQL Editor for project hbnpwphxjurvtydezwgh.

update public.pricing_tiers set sort_order = sort_order + 1 where sort_order >= 2;

insert into public.pricing_tiers (id, name, price, short, items, sort_order, is_active, kind)
values (
  10,
  'X Comment + Like',
  1995,
  'COMMENT',
  '["1 strategic X comment from Robert", "Like included"]'::jsonb,
  2,
  true,
  'single'
)
on conflict (id) do update
set
  name = excluded.name,
  price = excluded.price,
  short = excluded.short,
  items = excluded.items,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  kind = excluded.kind,
  updated_at = now();
