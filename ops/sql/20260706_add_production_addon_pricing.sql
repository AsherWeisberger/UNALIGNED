-- Robert's Team Demo & Media production add-on (+$500 per post).
-- Applies to every tier. $500 for each post UNALIGNED produces media for.
-- Without it the client supplies links for all media.
-- Run in Supabase SQL Editor for project hbnpwphxjurvtydezwgh.

insert into public.pricing_tiers (id, name, price, short, items, sort_order, is_active, kind)
values (
  11,
  'Robert''s Team Demo & Media',
  500,
  'PROD',
  '["Robert''s team produces demo clips and screen media", "$500 per post produced, applies to every tier including Maximum Impact", "Without the add-on the client supplies links for all media"]'::jsonb,
  99,
  true,
  'addon'
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