-- Collaborator feedback invites + submissions.
-- Run once in Supabase SQL editor (project hbnpwphxjurvtydezwgh).
-- Writes go through Firebase collabFeedback (service role). No anon policies.

create table if not exists public.collab_feedback (
  id              bigserial primary key,
  token           text unique not null,
  card_id         bigint,
  brand           text not null default '',
  contact_name    text not null default '',
  contact_email   text default '',
  contact_handle  text default '',
  thread_key      text default '',
  source_channel  text default '',
  deliverable     text default '',
  tier            text default '',
  status          text not null default 'pending'
                    check (status in ('pending', 'submitted', 'expired')),
  overall_score   smallint check (overall_score is null or overall_score between 1 and 10),
  process_score   smallint check (process_score is null or process_score between 1 and 10),
  robert_score    smallint check (robert_score is null or robert_score between 1 and 10),
  communication_score smallint check (communication_score is null or communication_score between 1 and 10),
  nps             smallint check (nps is null or nps between 0 and 10),
  would_again     text check (would_again is null or would_again in ('yes', 'maybe', 'no')),
  went_well       text default '',
  improve         text default '',
  public_ok       boolean default false,
  testimonial     text default '',
  responses       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  expires_at      timestamptz
);

create index if not exists collab_feedback_status_idx on public.collab_feedback (status);
create index if not exists collab_feedback_submitted_idx on public.collab_feedback (submitted_at desc nulls last);

alter table public.collab_feedback enable row level security;

grant usage, select on sequence public.collab_feedback_id_seq to service_role;
grant all on table public.collab_feedback to service_role;