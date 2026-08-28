const turnCounts = {
  bahrain: 15,
  qatar: 16,
  singapore: 19,
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function replayArrays(race) {
  return {
    positions: Array.isArray(race.track_position) ? race.track_position : race.track_position?.current || [],
    carData: Array.isArray(race.car_data) ? race.car_data : race.car_data?.current || [],
  }
}

// OpenF1's supplied samples contain the path and car state but not a corner-ID
// feed. These markers are therefore consistent review reference points along the
// replay path, not a replacement for a certified marshal/GPS corner feed.
export function buildTurnMarkers(circuitId, race) {
  const count = turnCounts[circuitId] || 0
  const { positions } = replayArrays(race)
  if (!count || positions.length < 2) return []

  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    progress: Number(((index + 1) / (count + 1)).toFixed(4)),
    source: 'replay-review-reference',
  }))
}

export function resolveTrackContext(circuitId, race, progress = 0) {
  const safeProgress = clamp(Number(progress) || 0)
  const markers = buildTurnMarkers(circuitId, race)
  const nearest = markers.reduce((closest, marker) => (
    !closest || Math.abs(marker.progress - safeProgress) < Math.abs(closest.progress - safeProgress)
      ? marker
      : closest
  ), null)
  const { carData } = replayArrays(race)
  const sampleIndex = Math.min(carData.length - 1, Math.max(0, Math.round(safeProgress * Math.max(0, carData.length - 1))))
  const car = carData[sampleIndex] || null
  const offset = nearest ? safeProgress - nearest.progress : 0
  const phase = !nearest ? 'UNMAPPED' : Math.abs(offset) <= 0.018 ? 'DURING' : offset < 0 ? 'BEFORE' : 'AFTER'

  return {
    circuit: circuitId,
    progress: safeProgress,
    turnNumber: nearest?.number ?? null,
    turnPhase: phase,
    label: nearest ? `${phase} T${nearest.number}` : 'TRACK POSITION UNMAPPED',
    trackState: phase === 'DURING' ? 'CORNER' : 'APPROACH / EXIT',
    sampledSpeedKph: Number.isFinite(car?.speed) ? car.speed : null,
    sampledGear: Number.isFinite(car?.gear) ? car.gear : null,
    sampledThrottlePct: Number.isFinite(car?.throttle) ? car.throttle : null,
    sampledBrake: typeof car?.brake === 'boolean' ? car.brake : null,
    drs: 'MANUAL REVIEW REQUIRED',
    battle: 'MANUAL REVIEW REQUIRED',
    source: '2023 replay sample + review marker',
  }
}
