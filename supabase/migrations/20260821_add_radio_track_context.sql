-- Pitwall Copilot: location-aware radio report fields.
-- Run this after 20260821_pitwall_history.sql.

alter table public.radio_logs
  add column if not exists circuit_id text,
  add column if not exists turn_number integer,
  add column if not exists turn_phase text,
  add column if not exists sampled_speed_kph numeric,
  add column if not exists track_state text,
  add column if not exists drs_state text,
  add column if not exists battle_state text,
  add column if not exists reviewer_note text,
  add column if not exists reviewed_at timestamptz;

create index if not exists radio_context_idx
  on public.radio_logs(session_id, circuit_id, turn_number, recorded_at);
