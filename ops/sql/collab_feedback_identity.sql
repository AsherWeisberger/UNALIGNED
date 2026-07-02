-- Identity fields so feedback stays tied to the right partner / deal card.
-- Run once in Supabase SQL editor after collab_feedback.sql.

alter table public.collab_feedback
  add column if not exists contact_handle text default '',
  add column if not exists thread_key text default '',
  add column if not exists source_channel text default '';

create index if not exists collab_feedback_card_idx on public.collab_feedback (card_id);
create index if not exists collab_feedback_email_idx on public.collab_feedback (lower(contact_email));
create index if not exists collab_feedback_thread_idx on public.collab_feedback (thread_key);