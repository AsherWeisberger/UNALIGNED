-- Let Company OS (anon key) read submitted partner feedback for the dashboard panel.
-- Run once in Supabase SQL editor after collab_feedback.sql.

drop policy if exists collab_feedback_sel_submitted on public.collab_feedback;
create policy collab_feedback_sel_submitted on public.collab_feedback
  for select to anon, authenticated
  using (status in ('pending', 'submitted'));