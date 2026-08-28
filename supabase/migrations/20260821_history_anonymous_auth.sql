-- Pitwall Copilot: private browser-owned history.
-- Run after the two history migrations. Also enable Auth > Providers >
-- Anonymous Sign-Ins in the Supabase dashboard before testing the UI.

alter table public.sessions
  add column if not exists owner_id uuid default auth.uid();

create index if not exists sessions_owner_idx on public.sessions(owner_id, created_at desc);

drop policy if exists "Users can create their own Pitwall sessions" on public.sessions;
create policy "Users can create their own Pitwall sessions"
  on public.sessions for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Users can view their own Pitwall sessions" on public.sessions;
create policy "Users can view their own Pitwall sessions"
  on public.sessions for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Users can finish their own Pitwall sessions" on public.sessions;
create policy "Users can finish their own Pitwall sessions"
  on public.sessions for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Users can add telemetry to their own sessions" on public.telemetry_snapshots;
create policy "Users can add telemetry to their own sessions"
  on public.telemetry_snapshots for insert to authenticated
  with check (exists (
    select 1 from public.sessions
    where sessions.id = telemetry_snapshots.session_id and sessions.owner_id = auth.uid()
  ));

drop policy if exists "Users can view telemetry from their own sessions" on public.telemetry_snapshots;
create policy "Users can view telemetry from their own sessions"
  on public.telemetry_snapshots for select to authenticated
  using (exists (
    select 1 from public.sessions
    where sessions.id = telemetry_snapshots.session_id and sessions.owner_id = auth.uid()
  ));

drop policy if exists "Users can add radio to their own sessions" on public.radio_logs;
create policy "Users can add radio to their own sessions"
  on public.radio_logs for insert to authenticated
  with check (exists (
    select 1 from public.sessions
    where sessions.id = radio_logs.session_id and sessions.owner_id = auth.uid()
  ));

drop policy if exists "Users can view radio from their own sessions" on public.radio_logs;
create policy "Users can view radio from their own sessions"
  on public.radio_logs for select to authenticated
  using (exists (
    select 1 from public.sessions
    where sessions.id = radio_logs.session_id and sessions.owner_id = auth.uid()
  ));
