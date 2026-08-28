import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY

// The API receives a Supabase user token from the signed-in browser and forwards
// it to Postgres. That keeps RLS active for every history read and write.
function database(accessToken) {
  if (!supabaseUrl || !anonKey) {
    const error = new Error('History storage is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.')
    error.statusCode = 503
    throw error
  }
  if (!accessToken) {
    const error = new Error('A signed-in Supabase user is required for history storage.')
    error.statusCode = 401
    throw error
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

const allowedRoles = new Set(['driver', 'engineer', 'ai'])

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
  return value.trim()
}

function optionalNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function optionalInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

function cleanTelemetry(telemetry = {}) {
  return {
    lap_number: optionalInteger(telemetry.lapNumber),
    lap_progress: optionalNumber(telemetry.lapProgress),
    lap_seconds: optionalNumber(telemetry.lapSeconds),
    cockpit_temp: optionalNumber(telemetry.cockpitTemp),
    track_temp: optionalNumber(telemetry.trackTemp),
    g_force: optionalNumber(telemetry.gForce),
    hydration_pct: optionalNumber(telemetry.hydration),
    psi_score: optionalNumber(telemetry.psi),
    heart_rate: optionalNumber(telemetry.heartRate),
    breathing_rate: optionalNumber(telemetry.breathingRate),
    source: telemetry.source === 'historical' ? 'historical' : 'demo-derived',
    raw_payload: typeof telemetry.rawPayload === 'object' && telemetry.rawPayload ? telemetry.rawPayload : {},
  }
}

export function historyStorageStatus() {
  return {
    configured: Boolean(supabaseUrl && anonKey),
    provider: supabaseUrl && anonKey ? 'supabase-postgres' : 'not-configured',
    authentication: 'Supabase Auth bearer token required',
    requires: supabaseUrl && anonKey ? ['signed-in user'] : ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  }
}

export async function createHistorySession(input, accessToken) {
  const client = database(accessToken)
  const record = {
    team_id: requiredString(input.teamId, 'teamId').toLowerCase(),
    circuit_name: requiredString(input.circuitName, 'circuitName'),
    circuit_year: optionalInteger(input.circuitYear),
    driver_name: requiredString(input.driverName, 'driverName'),
    source: input.source === 'historical-replay' ? 'historical-replay' : 'live-demo',
    status: 'active',
  }

  const { data, error } = await client.from('sessions').insert(record).select().single()
  if (error) throw new Error(`Could not create history session: ${error.message}`)
  return data
}

export async function saveHistoryTelemetry(input, accessToken) {
  const client = database(accessToken)
  const sessionId = requiredString(input.sessionId, 'sessionId')
  const telemetry = cleanTelemetry(input.telemetry)
  const { data, error } = await client
    .from('telemetry_snapshots')
    .insert({ session_id: sessionId, ...telemetry })
    .select()
    .single()
  if (error) throw new Error(`Could not save telemetry snapshot: ${error.message}`)
  return data
}

export async function logHistoryEvent(input, accessToken) {
  const client = database(accessToken)
  const sessionId = requiredString(input.sessionId, 'sessionId')
  const role = requiredString(input.role, 'role').toLowerCase()
  if (!allowedRoles.has(role)) throw new Error('role must be driver, engineer, or ai')

  const telemetry = cleanTelemetry(input.telemetry)
  const hasTelemetry = Object.entries(telemetry).some(([key, value]) => key !== 'raw_payload' && key !== 'source' && value !== null)
  let telemetryId = null

  if (hasTelemetry) {
    const { data, error } = await client
      .from('telemetry_snapshots')
      .insert({ session_id: sessionId, ...telemetry })
      .select('id')
      .single()
    if (error) throw new Error(`Could not save telemetry: ${error.message}`)
    telemetryId = data.id
  }

  const trackContext = typeof input.trackContext === 'object' && input.trackContext ? input.trackContext : {}
  const manualReview = typeof input.manualReview === 'object' && input.manualReview ? input.manualReview : {}
  const record = {
    session_id: sessionId,
    telemetry_id: telemetryId,
    role,
    transcript: requiredString(input.transcript, 'transcript'),
    detected_mood: typeof input.detectedMood === 'string' ? input.detectedMood.toUpperCase() : null,
    mood_confidence: optionalNumber(input.moodConfidence),
    fused_issue: typeof input.issue === 'string' ? input.issue : null,
    classifier_confidence: optionalNumber(input.classifierConfidence),
    provider: typeof input.provider === 'string' ? input.provider : null,
    circuit_id: typeof trackContext.circuit === 'string' ? trackContext.circuit : null,
    turn_number: optionalInteger(trackContext.turnNumber),
    turn_phase: typeof trackContext.turnPhase === 'string' ? trackContext.turnPhase : null,
    sampled_speed_kph: optionalNumber(trackContext.sampledSpeedKph),
    track_state: typeof manualReview.trackState === 'string' ? manualReview.trackState : trackContext.trackState || null,
    drs_state: typeof manualReview.drs === 'string' ? manualReview.drs : trackContext.drs || null,
    battle_state: typeof manualReview.battle === 'string' ? manualReview.battle : trackContext.battle || null,
    reviewer_note: typeof manualReview.note === 'string' ? manualReview.note : null,
    reviewed_at: manualReview.reviewedAt || null,
    metadata: {
      ...(typeof input.metadata === 'object' && input.metadata ? input.metadata : {}),
      track_context: trackContext,
      manual_review: manualReview,
    },
  }

  const { data, error } = await client.from('radio_logs').insert(record).select().single()
  if (error) throw new Error(`Could not save radio event: ${error.message}`)
  return data
}

export async function finishHistorySession(sessionId, status = 'completed', accessToken) {
  const client = database(accessToken)
  const resolvedStatus = status === 'stopped' ? 'stopped' : 'completed'
  const { data, error } = await client
    .from('sessions')
    .update({ status: resolvedStatus, ended_at: new Date().toISOString() })
    .eq('id', requiredString(sessionId, 'sessionId'))
    .select()
    .single()
  if (error) throw new Error(`Could not finish history session: ${error.message}`)
  return data
}

export async function listHistorySessions(teamId, accessToken) {
  const client = database(accessToken)
  let query = client.from('sessions').select('id, team_id, circuit_name, circuit_year, driver_name, source, status, created_at, ended_at').order('created_at', { ascending: false }).limit(50)
  if (teamId) query = query.eq('team_id', teamId.toLowerCase())
  const { data, error } = await query
  if (error) throw new Error(`Could not load history sessions: ${error.message}`)
  return data
}

export async function getHistorySession(sessionId, accessToken) {
  const client = database(accessToken)
  const id = requiredString(sessionId, 'sessionId')
  const { data: session, error: sessionError } = await client.from('sessions').select('*').eq('id', id).single()
  if (sessionError) throw new Error(`Could not load history session: ${sessionError.message}`)

  const [{ data: telemetry, error: telemetryError }, { data: radio, error: radioError }] = await Promise.all([
    client.from('telemetry_snapshots').select('*').eq('session_id', id).order('recorded_at'),
    client.from('radio_logs').select('*, telemetry_snapshots(*)').eq('session_id', id).order('recorded_at'),
  ])
  if (telemetryError) throw new Error(`Could not load telemetry history: ${telemetryError.message}`)
  if (radioError) throw new Error(`Could not load radio history: ${radioError.message}`)
  return { session, telemetry, radio }
}
