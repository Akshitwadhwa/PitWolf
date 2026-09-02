// Thin clients for the PitWolf decision-engine backend endpoints.
//
// ENERGY  -> /api/f1/energyrace   (2026-reg physics projection + validation gates)
// OVERTAKE-> /api/f1/decisionpoints (batch-extracted, labelled ATTACK/DELAY/SAVE)
//          + /api/f1/overtake/predict (RandomForest class probabilities)
//          + /api/f1/modelreport (training provenance: split, holdout accuracy)
//          + /api/f1/rounds (per-season round numbers + race names from cache)
//
// Every energy figure is MODELLED from real telemetry under cited FIA limits; it
// is never measured team data. The overtake labels are modelled outcomes too.

import { fetchJson, fetchWithRetry } from '../components/LapExplorer'

export function fetchEnergyRace(year, round, session, driver) {
  const q = `year=${year}&round=${round}&session=${encodeURIComponent(session)}&driver=${encodeURIComponent(driver)}`
  // First fetch spawns a ~1-3 min physics pass, so retry transient 5xx.
  return fetchWithRetry(`/api/f1/energyrace?${q}`, 3)
}

export function fetchEnergyLap(year, round, session, driver, lap) {
  const q = `year=${year}&round=${round}&session=${encodeURIComponent(session)}&driver=${encodeURIComponent(driver)}&lap=${lap}`
  return fetchWithRetry(`/api/f1/energy?${q}`, 3)
}

export function fetchDecisionPoints(year, round, session) {
  const q = `year=${year}&round=${round}&session=${encodeURIComponent(session)}`
  return fetchJson(`/api/f1/decisionpoints?${q}`)
}

export async function predictOvertake(rows) {
  const response = await fetch('/api/f1/overtake/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || `predict failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return payload
}

export function fetchModelReport() {
  return fetchJson('/api/f1/modelreport')
}

export async function fetchEvents(year) {
  const payload = await fetchJson(`/api/f1/rounds?year=${year}`)
  return payload.events ?? []
}

// Strategy accent colours, kept identical to the rule engine so the rebuilt
// pages preserve the PitWolf palette (ATTACK orange / SAVE teal / DELAY blue).
export const STRATEGY_COLORS = {
  ATTACK: '#ff7043',
  SAVE: '#63e6be',
  DELAY: '#a9bfff',
}

export const STRATEGY_ORDER = ['ATTACK', 'DELAY', 'SAVE']
