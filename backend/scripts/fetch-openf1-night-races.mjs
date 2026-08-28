/**
 * Download compact, replay-ready real data for the requested 2023 night races.
 *
 * Source: OpenF1 public historical API. We keep the raw F1 radio dataset
 * separate; this file is for lap/sector times, true car position, and car data.
 * It deliberately stores recording URLs rather than redistributing F1 audio.
 *
 * Run:
 *   npm --workspace pitwall-copilot-backend run fetch:night-races
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = 'https://api.openf1.org/v1'
const YEAR = 2023
const requestedRaces = ['Bahrain', 'Qatar', 'Singapore']
const selectedDriverNumber = 4 // Lando Norris: present in all three 2023 races.
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const output = path.join(scriptDir, '..', 'data', 'openf1-2023-night-races.json')

async function get(endpoint, params = {}) {
  const url = new URL(`${API_ROOT}/${endpoint}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: { 'user-agent': 'pitwall-copilot-replay-data/1.0' } })
    if (response.ok) return response.json()
    if (response.status !== 429 || attempt === 4) throw new Error(`${endpoint} failed (${response.status}): ${url}`)
    const retryAfter = Number(response.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1800 * (attempt + 1)
    console.log(`Rate limited while reading ${endpoint}; retrying in ${Math.ceil(waitMs / 1000)}s`)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
  throw new Error(`Unexpected retry failure: ${endpoint}`)
}

function isCleanLap(lap) {
  return Number.isFinite(lap.lap_duration)
    && lap.lap_duration > 50
    && !lap.is_pit_out_lap
    && Number.isFinite(lap.duration_sector_1)
    && Number.isFinite(lap.duration_sector_2)
    && Number.isFinite(lap.duration_sector_3)
}

function compactLap(lap) {
  return {
    lap_number: lap.lap_number,
    duration: lap.lap_duration,
    sector_1: lap.duration_sector_1,
    sector_2: lap.duration_sector_2,
    sector_3: lap.duration_sector_3,
    date_start: lap.date_start,
    pit_out_lap: lap.is_pit_out_lap,
    i1_speed: lap.i1_speed,
    i2_speed: lap.i2_speed,
    speed_trap: lap.st_speed,
  }
}

function downsample(samples, maximum = 220) {
  if (samples.length <= maximum) return samples
  const step = (samples.length - 1) / (maximum - 1)
  return Array.from({ length: maximum }, (_, index) => samples[Math.round(index * step)])
}

function withinLap(lap) {
  const start = new Date(lap.date_start)
  const end = new Date(start.getTime() + lap.lap_duration * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function samplesForLap(samples, { start, end }, keepOnlyTrackPoints = false) {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  const withinWindow = samples.filter((sample) => {
    const time = Date.parse(sample.date)
    return time >= startMs && time <= endMs && (!keepOnlyTrackPoints || sample.x !== 0 || sample.y !== 0)
  })
  if (withinWindow.length) return withinWindow
  // Some historic OpenF1 sessions do not support time-window filters server-side.
  // Retaining the driver's non-zero route still gives an authentic circuit outline.
  return keepOnlyTrackPoints ? samples.filter((sample) => sample.x !== 0 || sample.y !== 0) : samples
}

function chooseComparison(laps) {
  const clean = laps.filter(isCleanLap).sort((left, right) => left.lap_number - right.lap_number)
  const current = [...clean].sort((left, right) => left.lap_duration - right.lap_duration)[0]
  const reference = clean
    .filter((lap) => lap.lap_number !== current.lap_number)
    .sort((left, right) => Math.abs(left.lap_duration - current.lap_duration) - Math.abs(right.lap_duration - current.lap_duration)
      || Math.abs(left.lap_number - current.lap_number) - Math.abs(right.lap_number - current.lap_number))[0]
  if (!current || !reference) throw new Error('Could not find two clean laps for comparison')
  return { current, reference }
}

async function fetchRace(countryName) {
  const sessions = await get('sessions', { year: YEAR, country_name: countryName, session_name: 'Race' })
  const session = sessions[0]
  if (!session) throw new Error(`No ${YEAR} race session found for ${countryName}`)

  // OpenF1 is public and rate-limited, so keep heavyweight race endpoints paced.
  const drivers = await get('drivers', { session_key: session.session_key })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const rawLaps = await get('laps', { session_key: session.session_key })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const weather = await get('weather', { session_key: session.session_key })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const radio = await get('team_radio', { session_key: session.session_key, driver_number: selectedDriverNumber })

  const selectedDriver = drivers.find((driver) => driver.driver_number === selectedDriverNumber)
  if (!selectedDriver) throw new Error(`Driver #${selectedDriverNumber} is unavailable for ${countryName}`)

  const driverLaps = rawLaps.filter((lap) => lap.driver_number === selectedDriverNumber)
  const { current, reference } = chooseComparison(driverLaps)
  const currentWindow = withinLap(current)
  const referenceWindow = withinLap(reference)
  await new Promise((resolve) => setTimeout(resolve, 500))
  const allPosition = await get('location', { session_key: session.session_key, driver_number: selectedDriverNumber })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const allCarData = await get('car_data', { session_key: session.session_key, driver_number: selectedDriverNumber })
  const currentPosition = samplesForLap(allPosition, currentWindow, true)
  const referencePosition = samplesForLap(allPosition, referenceWindow, true)
  const currentCarData = samplesForLap(allCarData, currentWindow)
  const referenceCarData = samplesForLap(allCarData, referenceWindow)

  return {
    session: {
      year: session.year,
      session_key: session.session_key,
      meeting_key: session.meeting_key,
      country_name: session.country_name,
      circuit_short_name: session.circuit_short_name,
      location: session.location,
      date_start: session.date_start,
      date_end: session.date_end,
      session_name: session.session_name,
    },
    selected_driver: {
      driver_number: selectedDriver.driver_number,
      name_acronym: selectedDriver.name_acronym,
      full_name: selectedDriver.full_name,
      team_name: selectedDriver.team_name,
      team_colour: selectedDriver.team_colour,
    },
    comparison: {
      current: compactLap(current),
      reference: compactLap(reference),
      delta_seconds: Number((current.lap_duration - reference.lap_duration).toFixed(3)),
      selection_rule: 'Fastest clean lap compared with the nearest valid lap-time reference.',
    },
    drivers: drivers.map((driver) => ({
      driver_number: driver.driver_number,
      name_acronym: driver.name_acronym,
      full_name: driver.full_name,
      team_name: driver.team_name,
      team_colour: driver.team_colour,
    })),
    laps: rawLaps.map((lap) => ({ driver_number: lap.driver_number, ...compactLap(lap) })),
    track_position: {
      current: downsample(currentPosition.map((point) => ({ date: point.date, x: point.x, y: point.y }))),
      reference: downsample(referencePosition.map((point) => ({ date: point.date, x: point.x, y: point.y }))),
    },
    car_data: {
      current: downsample(currentCarData.map((sample) => ({
        date: sample.date,
        speed: sample.speed,
        throttle: sample.throttle,
        brake: sample.brake,
        gear: sample.n_gear,
        drs: sample.drs,
      }))),
      reference: downsample(referenceCarData.map((sample) => ({
        date: sample.date,
        speed: sample.speed,
        throttle: sample.throttle,
        brake: sample.brake,
        gear: sample.n_gear,
        drs: sample.drs,
      }))),
    },
    weather: weather.map((sample) => ({
      date: sample.date,
      air_temperature: sample.air_temperature,
      track_temperature: sample.track_temperature,
      humidity: sample.humidity,
      rainfall: sample.rainfall,
    })),
    radio_clips: radio.map((clip) => ({ date: clip.date, recording_url: clip.recording_url })),
  }
}

async function main() {
  console.log(`Fetching OpenF1 ${YEAR} race data for ${requestedRaces.join(', ')}…`)
  const races = {}
  for (const countryName of requestedRaces) {
    races[countryName.toLowerCase()] = await fetchRace(countryName)
    console.log(`Fetched ${countryName}`)
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source: {
      provider: 'OpenF1',
      documentation: 'https://openf1.org/docs/',
      historical_data_note: 'Historical data from 2023 onward is available without authentication.',
      audio_note: 'Radio recording URLs are source references; audio files are not included in this repository.',
    },
    races,
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Saved ${output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
