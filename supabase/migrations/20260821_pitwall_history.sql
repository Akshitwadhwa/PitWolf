-- Pitwall Copilot: simple persistent history.
-- Run this file once in the Supabase SQL Editor.
-- It creates the three logs used by the project:
--   1. sessions             — one record for each Start Lap run
--   2. telemetry_snapshots  — lap/stress values captured during that run
--   3. radio_logs           — driver, engineer and Pitwall AI messages

create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  circuit_name text not null,
  circuit_year integer,
  driver_name text not null,
  source text not null default 'live-demo',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.telemetry_snapshots (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  lap_number integer,
  lap_progress numeric,
  lap_seconds numeric,
  cockpit_temp numeric,
  track_temp numeric,
  g_force numeric,
  hydration_pct numeric,
  psi_score numeric,
  heart_rate numeric,
  breathing_rate numeric,
  source text not null default 'demo-derived',
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.radio_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  telemetry_id bigint references public.telemetry_snapshots(id) on delete set null,
  recorded_at timestamptz not null default now(),
  role text not null,
  transcript text not null,
  detected_mood text,
  mood_confidence numeric,
  fused_issue text,
  classifier_confidence numeric,
  provider text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists sessions_created_idx on public.sessions(created_at desc);
create index if not exists telemetry_session_idx on public.telemetry_snapshots(session_id, recorded_at);
create index if not exists radio_session_idx on public.radio_logs(session_id, recorded_at);

-- Keep external access closed until the app authentication decision is made.
-- You can still inspect and add records from the Supabase dashboard/SQL Editor.
alter table public.sessions enable row level security;
alter table public.telemetry_snapshots enable row level security;
alter table public.radio_logs enable row level security;
