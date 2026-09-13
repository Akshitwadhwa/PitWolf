import React, { useEffect, useMemo, useRef, useState } from 'react'
import { circuitBasis, fitCircuitView } from './CircuitMap'
import { fetchBatteryClip, fetchEnergyLap, fetchRecommend } from '../lib/f1api'
import '../simulationreplay.css'

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]
const SPEEDS = [1, 2, 4, 8]
const MAX_VISUAL_SELECTIONS = 4
const BATTLE_GAP_S = 1.0
const SESSION_LABELS = {
  'Practice 1': 'FP1',
  'Practice 2': 'FP2',
  'Practice 3': 'FP3',
  'Sprint Qualifying': 'Sprint Qualifying',
  Sprint: 'Sprint Race',
  Qualifying: 'Qualifying',
  Race: 'Race',
}
const FALLBACK_COLORS = ['#63e6be', '#ff7043', '#a9bfff', '#ffbf69', '#f472b6', '#2dd4bf']

function sessionNameOf(session) {
  if (!session || session === 'R') return 'Race'
  if (session === 'Q') return 'Qualifying'
  if (session === 'S') return 'Sprint'
  return session
}

function mapForcedAction(call) {
  if (call === 'ATTACK' || call === 'SAVE') return call
  if (call === 'HOLD' || call === 'DELAY') return 'DELAY'
  return null
}

function dummyWhatIfPred(action) {
  const forced = mapForcedAction(action) || 'DELAY'
  const probabilities = { ATTACK: 0.15, SAVE: 0.15, DELAY: 0.15 }
  probabilities[forced] = 0.7
  return { label: forced, probabilities }
}

function selectionFromRequest(request) {
  if (!request) return { year: 2026, round: 1, session: 'Race', driver: 'RUS', lap: 1 }
  return {
    year: Number(request.year) || 2026,
    round: Number(request.round) || 1,
    session: sessionNameOf(request.session),
    driver: request.driver || 'RUS',
    lap: Number(request.lap) || 1,
  }
}

function requestJson(url) {
  return fetch(url).then(async (response) => {
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || `request failed (${response.status})`)
    return payload
  })
}

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || `request failed (${response.status})`)
    return payload
  })
}

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`
}

function displayDriverName(driver) {
  return String(driver?.name || driver?.driver || '—').replace(/^[A-Z]\s+/, '')
}

function displayPosition(driver, fallback) {
  return /^\d+$/.test(String(driver?.classifiedPosition ?? '')) ? driver.classifiedPosition : fallback
}

function projection(points, height = 520, padding = 46, rotation = 0) {
  if (!points?.length) return null
  return fitCircuitView(points, 760, height, padding, circuitBasis(points, rotation))
}

function offsetCornerLabel(point, outline, distance = 16, width = 760, height = 520) {
  if (!outline?.length) return point
  const meanX = outline.reduce((sum, item) => sum + item.x, 0) / outline.length
  const meanY = outline.reduce((sum, item) => sum + item.y, 0) / outline.length
  const dx = point.x - meanX
  const dy = point.y - meanY
  const length = Math.hypot(dx, dy) || 1
  return {
    x: Math.min(width - 12, Math.max(12, point.x + (dx / length) * distance)),
    y: Math.min(height - 12, Math.max(12, point.y + (dy / length) * distance)),
  }
}

function pointAtDistance(points, distance) {
  if (!points?.length || !Number.isFinite(Number(distance))) return null
  return points.reduce((nearest, point) => (
    Math.abs(Number(point.d) - Number(distance)) < Math.abs(Number(nearest.d) - Number(distance)) ? point : nearest
  ), points[0])
}

function pointsForZone(points, startD, endD) {
  if (!points?.length || startD == null || endD == null) return []
  if (startD <= endD) return points.filter((point) => Number(point.d) >= startD && Number(point.d) <= endD)
  return [...points.filter((point) => Number(point.d) >= startD), ...points.filter((point) => Number(point.d) <= endD)]
}

function interpolateFrame(frames, time) {
  if (!frames?.length) return null
  if (time <= frames[0].t) return frames[0]
  if (time >= frames[frames.length - 1].t) return frames[frames.length - 1]
  let low = 0
  let high = frames.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (frames[middle].t < time) low = middle + 1
    else high = middle
  }
  const next = frames[low]
  const previous = frames[Math.max(0, low - 1)]
  const span = Math.max(.001, next.t - previous.t)
  const fraction = Math.max(0, Math.min(1, (time - previous.t) / span))
  const nextByDriver = new Map(next.cars.map((car) => [car.driver, car]))
  return {
    t: time,
    cars: previous.cars.map((car) => {
      const later = nextByDriver.get(car.driver)
      if (!later) return car
      return { ...car, x: car.x + (later.x - car.x) * fraction, y: car.y + (later.y - car.y) * fraction }
    }),
  }
}

function trackDistance(point, trackPoints) {
  if (!point || !trackPoints?.length) return null
  let nearest = trackPoints[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of trackPoints) {
    const dx = Number(candidate.x) - Number(point.x)
    const dy = Number(candidate.y) - Number(point.y)
    const distance = dx * dx + dy * dy
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  return Number(nearest.d)
}

function selectedGapRows(frame, trackmap, drivers, selectedDrivers, lapTimeS) {
  const selected = new Set(selectedDrivers)
  const positions = (frame?.cars ?? [])
    .map((car) => ({ ...car, d: trackDistance(car, trackmap?.points) }))
    .filter((car) => Number.isFinite(Number(car.timingPosition)) || Number.isFinite(car.d))
  if (!positions.length) return []
  // The P-number must come from recorded lap timing. GPS/map distance is only
  // retained as a last-resort gap visualisation, never as a substitute for an
  // official position (it wraps at the finish line and can reverse the order).
  const ordered = [...positions].sort((left, right) => {
    const leftPosition = Number(left.timingPosition)
    const rightPosition = Number(right.timingPosition)
    if (Number.isFinite(leftPosition) && Number.isFinite(rightPosition)) return leftPosition - rightPosition
    if (Number.isFinite(leftPosition)) return -1
    if (Number.isFinite(rightPosition)) return 1
    return right.d - left.d
  })
  const positionByDriver = new Map(ordered.map((car, index) => [car.driver, Number.isFinite(Number(car.timingPosition)) ? Number(car.timingPosition) : index + 1]))
  const leader = ordered.find((car) => Number(car.timingPosition) === 1) ?? ordered[0]
  const length = Number(trackmap?.length ?? trackmap?.points?.at(-1)?.d ?? 0)
  const lapSeconds = Number(lapTimeS)
  return ordered
    .filter((car) => selected.has(car.driver))
    .map((car) => ({
      ...car,
      position: positionByDriver.get(car.driver),
      gapS: Number.isFinite(car.timingGapS)
        ? car.timingGapS
        // When the TimingData stream has not published a gap yet (for
        // example on the grid), a dash is more truthful than a GPS-derived
        // number. Map distance is never presented as an official gap.
        : car.timingSource === 'OFFICIAL_TIMING_STREAM' || car.timingSource === 'RECORDED_GRID_POSITION'
          ? null
          : car.driver === leader.driver || !length || !Number.isFinite(lapSeconds) || !Number.isFinite(car.d) || !Number.isFinite(leader.d)
            ? 0
            : Math.min(Math.abs(leader.d - car.d), length - Math.abs(leader.d - car.d)) / length * lapSeconds,
    }))
    .sort((left, right) => left.position - right.position)
}

function GapLeaderboard({ rows, drivers, heading = 'SELECTED DRIVERS · RECORDED TIMING' }) {
  const infoByDriver = new Map((drivers ?? []).map((driver) => [driver.driver, driver]))
  if (!rows.length) return null
  return <div className="sim-gap-leaderboard" aria-label="Selected driver gaps">
    <div className="sim-gap-heading">{heading}</div>
    {rows.map((row, index) => {
      const info = infoByDriver.get(row.driver)
      const name = displayDriverName(info ?? { driver: row.driver })
      return <div className="sim-gap-row" key={row.driver}>
        <i style={{ background: info?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] }} />
        <b>P{row.position} {name}</b>
        <span>{row.position === 1 ? 'LEAD' : Number.isFinite(row.gapS) ? `+${row.gapS.toFixed(2)}` : '—'}</span>
      </div>
    })}
  </div>
}

function formatGapToCarAhead(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const value = Math.max(0, Number(seconds))
  const minutes = Math.floor(value / 60)
  const remainder = (value - minutes * 60).toFixed(3).padStart(6, '0')
  return `-${minutes}:${remainder}`
}

function lapStateAt(boundaries, time) {
  const entries = boundaries ?? []
  return entries.find((entry, index) => {
    const isLast = index === entries.length - 1
    return time >= entry.startT && (time < entry.endT || (isLast && time <= entry.endT))
  }) ?? null
}

function playheadForLap(boundaries, frames, lap) {
  const boundary = (boundaries ?? []).find((entry) => Number(entry.lap) === Number(lap))
  if (!boundary || !Number.isFinite(Number(boundary.startT))) return null
  const start = Number(boundary.startT)
  const end = Number(boundary.endT)
  // Sit just inside the lap so the map is not the previous lap’s finish line.
  const time = Number.isFinite(end) && end > start
    ? Math.min(start + 0.15, start + Math.max(0.05, (end - start) * 0.02), end - 0.01)
    : start
  const index = (frames ?? []).findIndex((frame) => Number(frame.t) >= time)
  return { time, index: index < 0 ? Math.max(0, (frames?.length ?? 1) - 1) : index, lap: Number(boundary.lap) }
}

function fastestCompletedLapDriver(lapBoundariesByDriver, time) {
  let fastest = null
  Object.entries(lapBoundariesByDriver ?? {}).forEach(([driver, entries]) => {
    entries.forEach((entry) => {
      if (time < entry.endT || !Number.isFinite(Number(entry.lapTimeS))) return
      if (!fastest || Number(entry.lapTimeS) < Number(fastest.lapTimeS)) fastest = { driver, lapTimeS: Number(entry.lapTimeS) }
    })
  })
  return fastest
}

function raceControlAt(lapBoundariesByDriver, time) {
  const codes = new Set(Object.values(lapBoundariesByDriver ?? {}).map((entries) => lapStateAt(entries, time)?.trackStatus).filter(Boolean).flatMap((status) => String(status).split('')))
  if (codes.has('5')) return { label: 'RED FLAG', tone: 'red' }
  if (codes.has('4')) return { label: 'SAFETY CAR', tone: 'yellow' }
  if (codes.has('6') || codes.has('7')) return { label: 'VIRTUAL SAFETY CAR', tone: 'yellow' }
  return null
}

function recordedRaceOrder(frame, drivers, lapBoundariesByDriver, time) {
  const infoByDriver = new Map((drivers ?? []).map((driver) => [driver.driver, driver]))
  const fastestLap = fastestCompletedLapDriver(lapBoundariesByDriver, time)
  const classified = (frame?.cars ?? [])
    .filter((car) => Number.isFinite(Number(car.timingPosition)))
    // Grid positions are an honest opening-state fallback, but a car that
    // never receives a live timing update must not keep a stale grid P-number
    // in the classification later in the race (for example after retirement).
    .filter((car) => car.timingSource !== 'RECORDED_GRID_POSITION' || Number(time) <= 60)
    .sort((left, right) => Number(left.timingPosition) - Number(right.timingPosition))

  return classified.map((car, index) => {
    const carGapToLeader = Number(car.timingGapS)
    const aheadGapToLeader = Number(classified[index - 1]?.timingGapS)
    return {
      ...car,
      info: infoByDriver.get(car.driver),
      tyre: lapStateAt(lapBoundariesByDriver?.[car.driver], time)?.compound ?? null,
      hasFastestLap: fastestLap?.driver === car.driver,
      gapToAheadS: index === 0 || !Number.isFinite(carGapToLeader) || !Number.isFinite(aheadGapToLeader)
        ? null
        : Math.max(0, carGapToLeader - aheadGapToLeader),
    }
  })
}

function isGridFallbackOrder(order) {
  return Boolean(order?.length) && order.every((row) => row.timingSource === 'RECORDED_GRID_POSITION')
}

function runningOrderNeighbours(order, driver) {
  const index = (order ?? []).findIndex((row) => row.driver === driver)
  if (index < 0) return { us: null, ahead: null, behind: null }
  const us = order[index]
  const lastPosition = Math.max(0, ...order.map((row) => Number(row.timingPosition) || 0))
  const leader = Number(us.timingPosition) === 1 || index === 0
  const last = Number(us.timingPosition) === lastPosition || index === order.length - 1
  return {
    us,
    ahead: leader ? null : order[index - 1],
    behind: last ? null : order[index + 1],
  }
}

function officialRaceOrder(frames, drivers, lapBoundariesByDriver, time, lapEntry) {
  const frame = interpolateFrame(frames, time)
  let order = recordedRaceOrder(frame, drivers, lapBoundariesByDriver, time)
  // Lights-out frames still carry the grid. Official lap Position is the
  // end-of-lap classification — use that whenever the current sample is grid-only.
  if (lapEntry && isGridFallbackOrder(order)) {
    const endT = Math.max(Number(lapEntry.startT) || 0, Number(lapEntry.endT) - 0.05)
    const endFrame = interpolateFrame(frames, endT) ?? frame
    order = recordedRaceOrder(endFrame, drivers, lapBoundariesByDriver, endT)
  }
  return order
}

function mergeOfficialActors(official, field) {
  if (!official?.us) return field ?? null
  const sameAhead = field?.ahead?.driver && official.ahead?.driver === field.ahead.driver
  const sameBehind = field?.behind?.driver && official.behind?.driver === field.behind.driver
  return {
    us: {
      ...official.us,
      gapToAheadS: official.us.gapToAheadS ?? (sameAhead ? field.us?.gapToAheadS : null),
    },
    ahead: official.ahead
      ? { ...official.ahead, gapToAheadS: official.ahead.gapToAheadS ?? (sameAhead ? field?.us?.gapToAheadS : null) }
      : null,
    behind: official.behind
      ? { ...official.behind, gapToAheadS: official.behind.gapToAheadS ?? (sameBehind ? field?.behind?.gapToAheadS : null) }
      : null,
    closingRateS: field?.closingRateS,
  }
}

function isCloseBattle(gapS) {
  return Number.isFinite(Number(gapS)) && Number(gapS) <= BATTLE_GAP_S
}

function isRaceLeader(us, ahead) {
  return Number(us?.timingPosition) === 1 || !ahead?.driver || ahead.driver === us?.driver
}

function isRaceLast(us, behind) {
  return !behind?.driver || behind.driver === us?.driver
}

function resolveBattleFocus(us, ahead, behind) {
  // Ahead / behind are this lap’s running order only. P1 has no attack
  // target. Last has no car to defend against.
  const closeAhead = !isRaceLeader(us, ahead) && isCloseBattle(us?.gapToAheadS)
  const closeBehind = !isRaceLast(us, behind) && isCloseBattle(behind?.gapToAheadS)
  if (closeAhead) {
    return {
      role: 'ATTACKING',
      opponent: ahead.driver,
      gapS: Number(us.gapToAheadS),
      closeAhead,
      closeBehind,
    }
  }
  if (closeBehind) {
    return {
      role: 'DEFENDING',
      opponent: behind.driver,
      gapS: Number(behind.gapToAheadS),
      closeAhead,
      closeBehind,
    }
  }
  return { role: null, opponent: null, gapS: null, closeAhead, closeBehind }
}

function leadInLap(lap) {
  const value = Number(lap)
  return Number.isFinite(value) && value > 1 ? value - 1 : value
}

function branchStepForLap(tree, lap) {
  if (!tree?.path?.length || !Number.isFinite(Number(lap))) return null
  const start = Number(tree.startLap ?? tree.path[0]?.lap)
  if (!Number.isFinite(start) || Number(lap) < start) return null
  return tree.path.find((item) => Number(item.lap) === Number(lap)) ?? tree.path.at(-1)
}

function applyBranchPairOrder(rows, tree, driver, defender, lap) {
  if (!tree?.path?.length || !rows?.length || !driver || !defender) return rows
  const step = branchStepForLap(tree, lap)
  if (!step) return rows
  const copy = rows.map((row) => ({ ...row }))
  const ours = copy.findIndex((row) => row.driver === driver)
  const theirs = copy.findIndex((row) => row.driver === defender)
  if (ours < 0 || theirs < 0) return rows
  const shouldLead = Boolean(step.ahead)
  const leadsNow = ours < theirs
  if (shouldLead === leadsNow) return copy
  const low = Math.min(ours, theirs)
  const high = Math.max(ours, theirs)
  const swap = copy[low]
  copy[low] = copy[high]
  copy[high] = swap
  return copy.map((row, index) => ({ ...row, timingPosition: index + 1 }))
}

function applyBranchPairToGapRows(rows, tree, driver, defender, lap) {
  if (!rows?.length) return rows
  return applyBranchPairOrder(
    rows.map((row) => ({ ...row, timingPosition: row.position })),
    tree,
    driver,
    defender,
    lap,
  ).map((row, index) => ({ ...row, position: row.timingPosition ?? index + 1 }))
}

function applyBranchPairToFrame(frame, tree, driver, defender, lap) {
  if (!frame?.cars?.length || !tree?.path?.length || !driver || !defender) return frame
  const step = branchStepForLap(tree, lap)
  if (!step) return frame
  const ours = frame.cars.find((car) => car.driver === driver)
  const theirs = frame.cars.find((car) => car.driver === defender)
  if (!ours || !theirs) return frame
  const oursPos = Number(ours.timingPosition)
  const theirsPos = Number(theirs.timingPosition)
  if (!Number.isFinite(oursPos) || !Number.isFinite(theirsPos)) return frame
  const shouldLead = Boolean(step.ahead)
  const leadsNow = oursPos < theirsPos
  if (shouldLead === leadsNow) return frame
  return {
    ...frame,
    cars: frame.cars.map((car) => {
      if (car.driver === driver) return { ...car, x: theirs.x, y: theirs.y }
      if (car.driver === defender) return { ...car, x: ours.x, y: ours.y }
      return car
    }),
  }
}

function RaceOrderBoard({ rows, branched = false }) {
  if (!rows.length) return null
  return <section className="sim-card sim-race-order" aria-label="Full recorded race classification">
    <div className="sim-panel-head"><span>RACE CLASSIFICATION</span><em>{branched ? 'BRANCH PAIR ORDER' : 'RECORDED TIMING'}</em></div>
    <p className="sim-order-help">LIVE CLASSIFICATION · GAP TO CAR AHEAD</p>
    <div className="sim-order-list">
      {rows.map((row, index) => {
        const info = row.info ?? { driver: row.driver }
        return <div className="sim-order-row" key={row.driver}>
          <span>P{row.timingPosition}</span>
          <i style={{ background: info.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] }} />
          <b>{displayDriverName(info)}</b>
          <em className={row.hasFastestLap ? 'is-fastest' : ''}>{index === 0 ? '----' : formatGapToCarAhead(row.gapToAheadS)}</em>
          <strong className={`sim-tyre tyre-${String(row.tyre ?? 'unknown').toLowerCase()}`} title={row.tyre ?? 'Tyre unknown'}>{String(row.tyre ?? '—').charAt(0)}</strong>
        </div>
      })}
    </div>
  </section>
}

function AutoRoleControl({ label, driver, info, emptyLabel }) {
  return <div className="sim-auto-role">
    <span>{label}</span>
    <b>{driver ? displayDriverName(info?.get(driver) ?? { driver }) : emptyLabel}</b>
  </div>
}

function fieldStep(field, driver, lap) {
  if (!field?.drivers || !driver) return null
  const row = field.drivers.find((item) => item.driver === driver)
  const laps = row?.laps ?? []
  const target = Number(lap)
  return laps.find((item) => Number(item.lap) === target)
    ?? [...laps].reverse().find((item) => Number(item.lap) <= target)
    ?? laps[0]
    ?? null
}

function fieldStepExact(field, driver, lap) {
  if (!field?.drivers || !driver) return null
  const row = field.drivers.find((item) => item.driver === driver)
  return (row?.laps ?? []).find((item) => Number(item.lap) === Number(lap)) ?? null
}

function fieldBattleActors(field, driver, lap) {
  const step = fieldStepExact(field, driver, lap)
  if (!step) return null
  const leader = Number(step.timingPosition) === 1 || !step.ahead || step.ahead === driver
  const last = !step.behind || step.behind === driver
  const aheadStep = leader ? null : fieldStepExact(field, step.ahead, lap)
  const behindStep = last ? null : fieldStepExact(field, step.behind, lap)
  return {
    us: {
      driver,
      timingPosition: step.timingPosition,
      gapToAheadS: leader ? null : step.gapToAheadS,
    },
    ahead: leader ? null : { driver: step.ahead, timingPosition: aheadStep?.timingPosition },
    behind: last ? null : { driver: step.behind, timingPosition: behindStep?.timingPosition, gapToAheadS: step.gapToBehindS },
    closingRateS: step.closingRateS,
  }
}

function formatLapTime(seconds) {
  if (!Number.isFinite(Number(seconds))) return '—'
  const value = Number(seconds)
  const minutes = Math.floor(value / 60)
  return `${minutes}:${(value - minutes * 60).toFixed(3).padStart(6, '0')}`
}

function fieldDriver(field, driver) {
  return field?.drivers?.find((item) => item.driver === driver) ?? null
}

function lapsInDrsSoFar(row, currentLap, gapLimit = 1) {
  const past = (row?.laps ?? []).filter((step) => Number(step.lap) <= Number(currentLap))
  if (!past.length) return 0
  const now = past[past.length - 1]
  if (!now?.ahead || now.isPitLap || Number(now.gapToAheadS ?? 99) > gapLimit) return 0
  let held = 0
  for (let index = past.length - 1; index >= 0; index -= 1) {
    const step = past[index]
    if (step.isPitLap || step.ahead !== now.ahead || Number(step.gapToAheadS ?? 99) > gapLimit) break
    held += 1
  }
  return held
}

function paceWindow(row, lap, count = 5) {
  return (row?.laps ?? []).filter((step) => Number(step.lap) <= Number(lap) && !step.isPitLap).slice(-count)
}

function averageLap(steps) {
  if (!steps.length) return null
  return steps.reduce((sum, step) => sum + Number(step.lapTimeS), 0) / steps.length
}

function pickBenchmark(field, selected, ahead, behind) {
  const present = new Set((field?.drivers ?? []).map((item) => item.driver))
  const preferred = ['NOR', 'VER', 'LEC', 'PIA', 'HAM', 'RUS', 'ANT']
  return preferred.find((code) => present.has(code) && code !== selected && code !== ahead && code !== behind)
    ?? (behind && behind !== selected ? behind : null)
}

function modelledPct(step, progress = 1) {
  const model = step?.modelled
  if (!model) return null
  const start = Number(model.startPct)
  const end = Number(model.endPct)
  const fraction = Math.max(0, Math.min(1, progress))
  const trough = Math.max(0, Math.min(100, start - (Number(model.consumedMj) / 4) * 100))
  if (fraction < 0.45) return start + (trough - start) * (fraction / 0.45)
  return trough + (end - trough) * ((fraction - 0.45) / 0.55)
}

function energyZoneOf(step) {
  if (step?.energyZone) return step.energyZone
  if (step?.modelled?.zone) return step.modelled.zone
  if (step?.isPitLap) return 'PIT'
  const hunt = step?.ahead && Number.isFinite(Number(step.gapToAheadS)) && Number(step.gapToAheadS) <= 1.0
  if (hunt) return 'OVERTAKE_WINDOW'
  const fight = Math.min(Number(step?.gapToAheadS ?? 9), Number(step?.gapToBehindS ?? 9)) <= 1.2
  return fight ? 'BATTLE' : 'OPEN'
}

function socToPct(mj, capacity = 4) {
  if (!Number.isFinite(Number(mj)) || !Number.isFinite(Number(capacity)) || capacity <= 0) return null
  return Math.max(0, Math.min(100, (Number(mj) / Number(capacity)) * 100))
}

function bestGoFromState(step, driver, personality, leftover) {
  const zone = energyZoneOf(step)
  const left = Number(leftover)
  const huntRate = Number(personality?.overtake?.attackRate ?? personality?.battle?.attackRate)
  if (!Number.isFinite(left)) return null
  if (left < 22) return { call: 'REBUILD', place: 'BRAKE HARVEST', note: `${driver} has ${Math.round(left)}% of the 4 MJ C5.2 window. Harvest first.` }
  if (zone === 'OVERTAKE_WINDOW' && left >= 40 && (!Number.isFinite(huntRate) || huntRate >= 0.28)) {
    return { call: 'GO', place: 'OVERTAKE WINDOW', note: `This 1.0s window is the better place to spend. ${driver} has ${Math.round(left)}% left.` }
  }
  if (zone === 'OVERTAKE_WINDOW') return { call: 'HOLD WINDOW', place: 'OVERTAKE WINDOW', note: `${driver} is inside 1.0s with ${Math.round(left)}% left. Stay in this window.` }
  if (zone === 'BATTLE') return { call: 'COVER', place: 'BATTLE', note: `${driver} is covering with ${Math.round(left)}% left. The go is the car ahead inside 1.0s.` }
  return { call: 'REBUILD', place: 'OPEN', note: `${driver} is in open air with ${Math.round(left)}% left. Wait for the next overtake window.` }
}

function harvestLawLine(law) {
  if (!law?.brakes || law.sliceMj == null) return null
  return `${law.brakes} brakes · ≤${Number(law.sliceMj).toFixed(2)} MJ/stop · lap ≤${Number(law.lapHarvestMj ?? law.lapHarvestCapMj ?? 8.5).toFixed(2)} MJ`
}

function BatteryCell({ label, code, pct, action, zone, consumed, harvested, clip, law, tone = 'real' }) {
  if (!code) return <div className="sim-battery-cell is-empty"><span>{label}</span><b>—</b></div>
  const width = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const lawLine = harvestLawLine(law)
  return <div className={`sim-battery-cell is-${tone}`}>
    <div className="sim-battery-head"><span>{label} · {code}</span><b>{pct == null ? '—' : `${Math.round(pct)}%`}</b></div>
    <div className="sim-battery-track" role="progressbar" aria-label={`${code} constructed C5.2 leftover`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct == null ? 0 : Math.round(pct)}><i style={{ width: `${width}%` }} /></div>
    <em>{action || '—'} · {String(zone || 'OPEN').replaceAll('_', ' ')}{consumed == null ? '' : ` · −${Number(consumed).toFixed(2)} MJ`}{harvested == null ? '' : ` / +${Number(harvested).toFixed(2)} MJ`}</em>
    {lawLine ? <small>{lawLine}</small> : null}
    {clip ? <small>{clip}</small> : null}
  </div>
}

function BatteryBoard({ selected, ahead, compare, spark, go, branchSelected, branchAhead }) {
  return <section className="sim-battery" aria-label="Constructed C5.2 battery">
    <div className="sim-battery-title"><span>CONSTRUCTED BATTERY · C5.2</span><em>4 MJ WINDOW · SHARED STORE · NOT TEAM TELEMETRY</em></div>
    <div className={`sim-battery-grid${branchSelected ? ' has-branch' : ''}`}>
      <BatteryCell {...selected} label="SELECTED" />
      <BatteryCell {...ahead} label="AHEAD / PAIR" />
      {compare?.code ? <BatteryCell {...compare} label="COMPARE" /> : null}
      {branchSelected ? <BatteryCell {...branchSelected} label="PITWOLF SELECTED" tone="model" /> : null}
      {branchAhead ? <BatteryCell {...branchAhead} label="PITWOLF PAIR" tone="model" /> : null}
    </div>
    {spark?.length ? <div className="sim-battery-spark" role="img" aria-label="Leftover percent by lap">{spark.map((tick) => <i key={tick.lap} className={tick.current ? 'is-current' : ''} title={`L${tick.lap} ${Math.round(tick.pct)}%`} style={{ height: `${Math.max(8, tick.pct * 0.28)}%` }} />)}</div> : null}
    <p className="sim-battery-honest">Constructed 4 MJ C5.2 store. Driver spend is scaled onto legal brake slices. Recorded replay and PitWolf share this store. One brake cannot refill the window.</p>
    {go ? <p className="sim-battery-go"><b>{go.call} · {go.place}</b><span>{go.note}</span></p> : null}
  </section>
}

function recLineKind(line) {
  if (/^Do not push\b/.test(line) || /^IF the gap stays this small: PUSH/.test(line) || /^IF .+ starts to lose time/.test(line)) {
    return 'output'
  }
  if (
    line.startsWith('MODELLED ES')
    || /\bRandomForest\b/.test(line)
    || /DRS efficiency/.test(line)
    || /Historical (efficiency|net-gain)/.test(line)
    || /training races/.test(line)
    || /from prior races/.test(line)
    || /Modelled wait/.test(line)
    || /Not in DRS yet/.test(line)
  ) {
    return 'model'
  }
  return 'actual'
}

function RecsBlock({ kicker, tone, call, children }) {
  const items = React.Children.toArray(children).filter(Boolean)
  if (!items.length && !call) return null
  return (
    <div className={`sim-recs-block is-${tone}`}>
      <i>{kicker}</i>
      {call ? <b className="sim-recs-call">{call}</b> : null}
      {items}
    </div>
  )
}

function nowcastLines({ selected, benchmark, selectedRow, benchRow, selectedStep, aheadStep, behindStep, benchStep, progress }) {
  const lines = []
  if (aheadStep && selectedStep?.ahead) {
    if (aheadStep.lapTimeS < selectedStep.lapTimeS && selectedStep.gapToAheadS <= 2) {
      lines.push(`${selectedStep.ahead} was faster this lap and is ${selectedStep.gapToAheadS.toFixed(2)}s ahead. ${selected} should not force a push on this lap.`)
    } else if (selectedStep.closingRateS >= 0.12 && selectedStep.gapToAheadS <= 1.3) {
      lines.push(`${selected} was catching ${selectedStep.ahead} by ${selectedStep.closingRateS.toFixed(2)}s on this lap.`)
    } else {
      lines.push(`${selectedStep.ahead} is ${selectedStep.gapToAheadS.toFixed(2)}s up the road on this lap.`)
    }
  }
  if (benchRow && selectedRow && selectedStep && benchmark) {
    const ours = averageLap(paceWindow(selectedRow, selectedStep.lap))
    const theirs = averageLap(paceWindow(benchRow, selectedStep.lap))
    if (ours != null && theirs != null) {
      const delta = ours - theirs
      if (delta > 0.08) {
        lines.push(`${benchmark} has been ${delta.toFixed(2)}s quicker than ${selected} over the last timed laps so far.`)
      } else if (delta < -0.08) {
        lines.push(`${selected} has been ${Math.abs(delta).toFixed(2)}s quicker than ${benchmark} over the last timed laps so far.`)
      }
    }
  }
  if (behindStep?.closingRateS >= 0.15 && behindStep.gapToAheadS <= 1.4) {
    lines.push(`${selectedStep.behind} was catching ${selected} on this lap.`)
  }
  const batteryPeople = [
    { code: selected, step: selectedStep },
    { code: selectedStep?.ahead, step: aheadStep },
    { code: benchmark, step: benchStep },
  ].filter((item) => item.code && item.step?.modelled)
  batteryPeople.forEach((item) => {
    const pct = modelledPct(item.step, progress)
    if (pct == null) return
    const using = item.step.modelled.action === 'ATTACK' || item.step.modelled.consumedMj > item.step.modelled.harvestedMj
    const zone = energyZoneOf(item.step).replaceAll('_', ' ')
    lines.push(`CONSTRUCTED ES · ${item.code} ${Math.round(pct)}% in ${zone} (${using ? 'using' : 'rebuilding'} this lap). Same 4 MJ C5.2 store as JUMP. Not team battery.`)
  })
  return lines.slice(0, 3)
}

function DriverCompareCard({ label, code, step, progress }) {
  if (!code || !step) return <div className="sim-compare-card is-empty"><b>{label}</b><span>NO CAR</span></div>
  const pct = modelledPct(step, progress)
  return <div className="sim-compare-card">
    <b>{label} · P{step.timingPosition} {code}</b>
    <strong>{formatLapTime(step.lapTimeS)}</strong>
    <span>{step.event}{step.gapToAheadS > 0 ? ` · +${step.gapToAheadS.toFixed(2)}s` : ''}{pct == null ? '' : ` · MODELLED ${Math.round(pct)}%`}</span>
  </div>
}

function RaceFieldHud({ field, driver, playbackLap, playhead, loading, error, event, branchStep = null, compareActive = false, energyPersonality = null, branchCapacity = 4, modelOpponent = null }) {
  const selectedRow = fieldDriver(field, driver)
  const selectedStep = fieldStep(field, driver, playbackLap?.lap)
  const ahead = selectedStep?.ahead
  const behind = selectedStep?.behind
  const benchmark = pickBenchmark(field, driver, ahead, behind)
  const benchRow = fieldDriver(field, benchmark)
  const aheadStep = fieldStep(field, ahead, selectedStep?.lap)
  const behindStep = fieldStep(field, behind, selectedStep?.lap)
  const benchStep = fieldStep(field, benchmark, selectedStep?.lap)
  const span = Math.max(0.001, Number(playbackLap?.endT) - Number(playbackLap?.startT))
  const progress = playbackLap ? Math.max(0, Math.min(1, (Number(playhead) - Number(playbackLap.startT)) / span)) : 1
  const lastLap = Math.max(1, ...(selectedRow?.laps ?? []).map((step) => Number(step.lap) || 0))
  const [recommend, setRecommend] = useState({ idle: true })
  const [recsOpen, setRecsOpen] = useState(false)

  useEffect(() => {
    if (!selectedStep || !driver) {
      setRecommend({ idle: true })
      return undefined
    }
    let live = true
    setRecommend({ loading: true })
    fetchRecommend({
      year: event?.year,
      location: event?.location,
      driver,
      ahead,
      behind,
      lap: selectedStep.lap,
      gapS: selectedStep.gapToAheadS,
      closingRateS: selectedStep.closingRateS,
      position: selectedStep.timingPosition,
      lapFraction: selectedStep.lap / lastLap,
      deltaToPrevS: selectedStep.deltaToPrevS,
      modelledLeftPct: selectedStep.modelled?.endPct,
      modelledUsedMj: selectedStep.modelled?.usedMj,
      lapsInDrs: lapsInDrsSoFar(selectedRow, selectedStep.lap),
      behindClose: Boolean(behindStep && behindStep.gapToAheadS <= 1.2),
    }).then((data) => {
      if (live) setRecommend(data?.error ? { error: data.error } : { data })
    }).catch((err) => {
      if (live) setRecommend({ error: err.message })
    })
    return () => { live = false }
  }, [driver, selectedStep?.lap, selectedStep?.gapToAheadS, selectedStep?.closingRateS, selectedStep?.timingPosition, ahead, behind, event?.year, event?.location, lastLap, behindStep?.gapToAheadS, selectedStep?.deltaToPrevS, selectedStep?.modelled?.endPct, selectedStep?.modelled?.usedMj])

  if (loading) {
    return <aside className="sim-field-bar is-loading" aria-live="polite">LOADING RECORDED FIELD…</aside>
  }
  if (error) {
    return <aside className="sim-field-bar is-error"><span>FIELD UNAVAILABLE</span><em>{error}</em></aside>
  }
  if (!selectedRow || !selectedStep) return null
  const observed = nowcastLines({
    selected: driver, benchmark, selectedRow, benchRow,
    selectedStep, aheadStep, behindStep, benchStep, progress,
  })
  const modelLines = recommend.data?.lines ?? []
  const holdout = recommend.data?.holdout
  const allRecLines = [...observed, ...modelLines]
  const actualLines = allRecLines.filter((line) => recLineKind(line) === 'actual')
  const forestLines = allRecLines.filter((line) => recLineKind(line) === 'model')
  const outputLines = allRecLines.filter((line) => recLineKind(line) === 'output')
  const visibleTicks = (selectedRow.laps ?? []).filter((step) => Number(step.lap) <= Number(selectedStep.lap))
  const tone = recommend.data?.action === 'PUSH' ? 'is-overtake' : selectedStep.event === 'SLOW' ? 'is-slow' : selectedStep.event === 'PIT' ? 'is-pit' : ''
  const selectedPct = modelledPct(selectedStep, progress)
  const aheadPct = modelledPct(aheadStep, progress)
  const benchPct = modelledPct(benchStep, progress)
  const spark = (selectedRow.laps ?? []).filter((step) => Number(step.lap) <= Number(selectedStep.lap)).map((step) => ({
    lap: step.lap,
    pct: Number(step.modelled?.endPct ?? step.modelled?.startPct ?? 0),
    current: step.lap === selectedStep.lap,
  }))
  const go = bestGoFromState(selectedStep, driver, energyPersonality, selectedPct)
  const branchOursPct = compareActive ? socToPct(branchStep?.ourSoc, branchCapacity) : null
  const branchTheirsPct = compareActive ? socToPct(branchStep?.defenderSoc, branchCapacity) : null
  const lawOf = (step) => step?.modelled ? { brakes: step.modelled.brakeSlices, sliceMj: step.modelled.maxSliceMj, lapHarvestMj: step.modelled.lapHarvestCapMj } : null
  return <aside className={`sim-field-bar is-compare ${tone}`} aria-label="Driver comparison field">
    <BatteryBoard
      selected={{ code: driver, pct: selectedPct, action: selectedStep.modelled?.action, zone: energyZoneOf(selectedStep), consumed: selectedStep.modelled?.consumedMj, harvested: selectedStep.modelled?.harvestedMj, clip: selectedStep.modelled?.clipReason, law: lawOf(selectedStep) }}
      ahead={{ code: ahead, pct: aheadPct, action: aheadStep?.modelled?.action, zone: energyZoneOf(aheadStep), consumed: aheadStep?.modelled?.consumedMj, harvested: aheadStep?.modelled?.harvestedMj, law: lawOf(aheadStep) }}
      compare={{ code: benchmark, pct: benchPct, action: benchStep?.modelled?.action, zone: energyZoneOf(benchStep), consumed: benchStep?.modelled?.consumedMj, harvested: benchStep?.modelled?.harvestedMj, law: lawOf(benchStep) }}
      spark={spark}
      go={go}
      branchSelected={branchOursPct == null ? null : { code: driver, pct: branchOursPct, action: branchStep?.action, zone: branchStep?.zone || 'MODEL BRANCH', consumed: branchStep?.deployMj, harvested: branchStep?.harvestMj, clip: branchStep?.clipReason, law: branchStep?.harvestLaw || branchStep?.battery?.harvestLaw }}
      branchAhead={branchTheirsPct == null ? null : { code: modelOpponent || branchStep?.opponent || ahead, pct: branchTheirsPct, action: branchStep?.opponentAction, zone: 'PAIR', consumed: branchStep?.opponentDeployMj, harvested: branchStep?.opponentHarvestMj, law: branchStep?.harvestLaw || branchStep?.battery?.harvestLaw }}
    />
    <div className="sim-compare-row">
      <DriverCompareCard label="SELECTED" code={driver} step={selectedStep} progress={progress} />
      <DriverCompareCard label="AHEAD" code={ahead} step={aheadStep} progress={progress} />
      <DriverCompareCard label="COMPARE" code={benchmark} step={benchStep} progress={progress} />
    </div>
    <div className="sim-field-ticks" role="img" aria-label="Lap events so far for the selected driver">
      {visibleTicks.map((step) => (
        <i
          key={step.lap}
          className={`is-${step.event.toLowerCase()}${step.lap === selectedStep.lap ? ' is-current' : ''}`}
          title={`L${step.lap} ${step.event}`}
        />
      ))}
    </div>
    <div className={`sim-field-recs${recommend.data?.action === 'PUSH' ? ' is-push' : ' is-hold'}${recsOpen ? ' is-open' : ' is-closed'}`}>
      <button
        type="button"
        className="sim-recs-toggle"
        aria-expanded={recsOpen}
        aria-controls="sim-field-recs-body"
        onClick={() => setRecsOpen((open) => !open)}
      >
        <b>L{selectedStep.lap} · {recommend.data?.action || (recommend.loading ? 'SCORING' : 'RECS')} · PRIOR RACES</b>
        <span>{recsOpen ? 'HIDE ▴' : 'SHOW ▾'}</span>
      </button>
      {recsOpen && <div id="sim-field-recs-body" className="sim-field-recs-body">
        <RecsBlock kicker="ACTUAL · THIS LAP" tone="actual">
          {actualLines.map((line) => <strong key={line}>{line}</strong>)}
        </RecsBlock>
        <RecsBlock kicker="MODEL · 2018–2025 FORESTS · NOT THIS GP’S LATER LAPS" tone="model">
          {recommend.loading && <strong>Scoring push / recover from trained prior races…</strong>}
          {forestLines.map((line) => <strong key={line}>{line}</strong>)}
          {holdout?.racesTest ? <em>Holdout: {holdout.racesTrain} train / {holdout.racesTest} random test races · push AUC {holdout.targets?.pushHelps?.testAuc ?? '—'} · recover AUC {holdout.targets?.recoverIfLost?.testAuc ?? '—'}</em> : null}
        </RecsBlock>
        <RecsBlock kicker="OUTPUT · WHAT THIS PANEL IS FOR" tone="output" call={recommend.data?.action || null}>
          {recommend.error && <strong>Recommendation unavailable: {recommend.error}</strong>}
          {outputLines.map((line) => <strong key={line}>{line}</strong>)}
        </RecsBlock>
      </div>}
    </div>
  </aside>
}

function RecordedTrack({ trackmap, frame, drivers, attacker, defender, selectedDrivers, viewMode, branchOverlay, compact = false }) {
  const mapHeight = compact ? 400 : 520
  const geometry = useMemo(() => projection(trackmap?.points, mapHeight, compact ? 36 : 46, trackmap?.rotation), [trackmap, mapHeight, compact])
  const driverByCode = useMemo(() => new Map((drivers ?? []).map((driver) => [driver.driver, driver])), [drivers])
  if (!geometry) return <div className="sim-loading">LOADING RECORDED CIRCUIT GEOMETRY…</div>
  const { project, outline, width, height } = geometry
  const polyline = outline.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const polylineFor = (points) => points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const zones = (trackmap?.visualOverlay?.zones ?? []).map((zone) => ({
    ...zone,
    points: pointsForZone(trackmap.points, Number(zone.startD), Number(zone.endD)).map((point) => project(point.x, point.y)),
  })).filter((zone) => zone.points.length > 1)
  const markers = (trackmap?.visualOverlay?.markers ?? []).map((marker) => ({ ...marker, point: pointAtDistance(trackmap.points, marker.d) }))
  return <svg className={`sim-track ${viewMode === '3D' ? 'is-3d' : ''}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${viewMode} recorded public position replay on circuit map`}>
    <polyline points={polyline} fill="none" stroke="#2a3f3b" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points={polyline} fill="none" stroke="#d7e4df" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points={polyline} fill="none" stroke="#5f736e" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 7" opacity=".5" />
    {zones.map((zone) => <polyline key={zone.id} className="sim-straight-zone" points={polylineFor(zone.points)} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
    {(trackmap?.corners ?? []).map((corner, index) => {
      if (corner.x == null || corner.y == null) return null
      const point = offsetCornerLabel(project(corner.x, corner.y), outline)
      return <g key={`${corner.n}-${index}`} className="sim-corner" transform={`translate(${point.x},${point.y})`}><circle r="8" /><text y="3">{corner.n}</text></g>
    })}
    {markers.map((marker) => {
      if (!marker.point) return null
      const point = project(marker.point.x, marker.point.y)
      return <g key={marker.type} className={`sim-mode-marker ${marker.type.toLowerCase()}`} transform={`translate(${point.x},${point.y})`}><circle r="7" /><text x="11" y="3">{marker.type === 'DETECTION' ? 'DET' : 'ACT'}</text></g>
    })}
    {(frame?.cars ?? []).map((car, index) => {
      const point = project(car.x, car.y)
      const selected = selectedDrivers.includes(car.driver)
      const modelPair = car.driver === attacker || car.driver === defender
      const color = driverByCode.get(car.driver)?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
      return <g key={car.driver} className={`${selected ? 'sim-car selected' : 'sim-car'}${modelPair ? ' model-pair' : ''}`} transform={`translate(${point.x},${point.y})`}>
        <circle r={selected ? 9 : 3.6} fill={color} />
        {selected && <><circle className="sim-car-ring" r="13" /><text y="-18">{car.driver}</text></>}
      </g>
    })}
    {branchOverlay && (frame?.cars ?? []).filter((car) => car.driver === branchOverlay.driver || car.driver === branchOverlay.target).map((car) => {
      const point = project(car.x, car.y)
      const isSelected = car.driver === branchOverlay.driver
      const call = branchOverlay.event && branchOverlay.event !== 'HOLD_PLACE' ? branchOverlay.event : branchOverlay.action
      return <g key={`branch-${car.driver}`} className={`sim-branch-car ${isSelected ? 'ours' : 'target'}`} transform={`translate(${point.x},${point.y})`}>
        <circle r={isSelected ? 22 : 15} />
        {isSelected && <><text y="-30">{call === 'TAKE' ? 'OVERTAKE' : call === 'LOST_PLACE' ? 'DEFEND FAILED' : call === 'FAILED_ATTACK' ? 'ATTACK MISS' : call}</text><text y="32">{call === 'TAKE' ? 'PASSED' : call === 'PIT' ? 'REAL PIT' : call === 'SAVE' || call === 'DELAY' ? 'HOLD / REBUILD' : `${Math.round((branchOverlay.convertP ?? branchOverlay.probability) * 100)}% CONVERT`}</text></>}
      </g>
    })}
  </svg>
}

function TrackPane({
  title,
  kicker,
  tone = 'real',
  trackmap,
  frame,
  drivers,
  attacker,
  defender,
  selectedDrivers,
  viewMode,
  branchOverlay,
  gapRows,
  gapHeading,
  compact,
}) {
  return <div className={`sim-track-pane is-${tone}`}>
    <div className="sim-track-pane-head"><span>{title}</span><em>{kicker}</em></div>
    <div className="sim-track-wrap">
      <RecordedTrack
        trackmap={trackmap}
        frame={frame}
        drivers={drivers}
        attacker={attacker}
        defender={defender}
        selectedDrivers={selectedDrivers}
        viewMode={viewMode}
        branchOverlay={branchOverlay}
        compact={compact}
      />
      <GapLeaderboard rows={gapRows} drivers={drivers} heading={gapHeading} />
    </div>
  </div>
}

function SelectControl({ label, value, onChange, children, disabled = false }) {
  return <label className="sim-control"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

export function SimulationReplayView({ onOpenDashboard, onHome, initialRequest, onRequestConsumed }) {
  const [selection, setSelection] = useState(() => selectionFromRequest(initialRequest))
  const [incomingWhatIf, setIncomingWhatIf] = useState(initialRequest || null)
  const whatIfStartedRef = useRef(null)
  const [events, setEvents] = useState([])
  const [decision, setDecision] = useState({ loading: true })
  const [trackmap, setTrackmap] = useState(null)
  const [replay, setReplay] = useState({ loading: true })
  const [branch, setBranch] = useState({ idle: true })
  const [branchRequest, setBranchRequest] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [viewMode, setViewMode] = useState('2D')
  const [displayMode, setDisplayMode] = useState('OBSERVED')
  const [batteryClip, setBatteryClip] = useState({ loading: true })
  const [selectedDrivers, setSelectedDrivers] = useState([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const cursorRef = useRef(0)
  const seekRef = useRef(null)
  const speedRef = useRef(1)
  const predictionCacheRef = useRef(new Map())
  const branchCacheRef = useRef(new Map())
  const update = (patch) => setSelection((current) => ({ ...current, ...patch }))
  const selectedEvent = events.find((item) => Number(item.round) === Number(selection.round))
  // A round can be on the published calendar without containing a completed,
  // locally ingested Race session. A recorded replay must never fake that.
  const raceReplayUnavailable = Boolean(selectedEvent && selectedEvent.raceDataAvailable === false)

  useEffect(() => {
    if (raceReplayUnavailable) {
      setDecision({ unavailable: true })
      return undefined
    }
    let live = true
    setEvents([])
    requestJson(`/api/f1/events?year=${selection.year}`).then((payload) => { if (live) setEvents(payload.events ?? []) }).catch(() => {
      requestJson(`/api/f1/rounds?year=${selection.year}`).then((payload) => { if (live) setEvents(payload.events ?? []) }).catch(() => { if (live) setEvents([]) })
    })
    return () => { live = false }
  }, [selection.year])

  useEffect(() => {
    if (!events.length) return
    const event = events.find((item) => Number(item.round) === Number(selection.round)) ?? events[0]
    const sessions = event.sessions ?? ['Race']
    const session = sessions.includes(selection.session) ? selection.session : (sessions.includes('Race') ? 'Race' : sessions[0])
    if (Number(event.round) !== Number(selection.round) || session !== selection.session) update({ round: event.round, session, lap: 1 })
    // Only changes a stale round after changing season.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  useEffect(() => {
    let live = true
    setDecision({ loading: true })
    requestJson(`/api/f1/decisionpoints?year=${selection.year}&round=${selection.round}&session=${selection.session}`).then((payload) => {
      if (!live) return
      const roster = payload.participants ?? []
      const rows = payload.analysisRows ?? payload.rows ?? []
      let driver = roster.includes(selection.driver) ? selection.driver : roster[0]
      // Keep the selected / default driver (Australia RUS at lights-out)
      // unless that code is not even in the session.
      if (!roster.includes(selection.driver) && rows.length) driver = rows[0].driver
      setDecision({ data: payload })
      update({ driver: driver ?? selection.driver })
    }).catch((error) => { if (live) setDecision({ error: error.message }) })
    return () => { live = false }
    // Race selection, rather than pair selection, fetches the source state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceReplayUnavailable, selection.year, selection.round, selection.session])

  useEffect(() => {
    if (raceReplayUnavailable) {
      setTrackmap({ unavailable: true })
      return undefined
    }
    let live = true
    setTrackmap(null)
    requestJson(`/api/f1/trackmap?year=${selection.year}&round=${selection.round}&session=${selection.session}`).then((payload) => { if (live) setTrackmap(payload) }).catch(() => { if (live) setTrackmap({ error: 'no recorded circuit geometry' }) })
    return () => { live = false }
  }, [raceReplayUnavailable, selection.year, selection.round, selection.session])

  useEffect(() => {
    if (raceReplayUnavailable) {
      cursorRef.current = 0
      seekRef.current = null
      setFrameIndex(0)
      setPlayhead(0)
      setPlaying(false)
      setReplay({ unavailable: true })
      setSelectedDrivers([])
      setBranch({ idle: true })
      return undefined
    }
    if (!selection.lap) return undefined
    let live = true
    cursorRef.current = 0
    seekRef.current = null
    setFrameIndex(0)
    setPlayhead(0)
    setPlaying(false)
    setReplay({ loading: true })
    requestJson(`/api/f1/racereplay?year=${selection.year}&round=${selection.round}&session=${selection.session}`).then((payload) => { if (live) setReplay({ data: payload }) }).catch((error) => { if (live) setReplay({ error: error.message }) })
    return () => { live = false }
  }, [raceReplayUnavailable, selection.year, selection.round, selection.session])

  useEffect(() => {
    if (raceReplayUnavailable || !selection.driver) {
      setBatteryClip({ idle: true })
      return undefined
    }
    let live = true
    setBatteryClip({ loading: true })
    fetchBatteryClip({
      year: selection.year,
      round: selection.round,
      session: selection.session,
      driver: selection.driver,
      startSocMj: 4,
    }).then((data) => {
      if (!live) return
      setBatteryClip(data?.error ? { error: data.error } : { data })
    }).catch((error) => { if (live) setBatteryClip({ error: error.message }) })
    return () => { live = false }
  }, [raceReplayUnavailable, selection.year, selection.round, selection.session, selection.driver])

  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => {
    if (!playing || !replay.data?.frames?.length) return undefined
    let animation
    let previous = performance.now()
    const { frames } = replay.data
    const duration = replay.data.window.durationS
    const tick = (now) => {
      // Honour an explicit lap seek before adding elapsed time. Otherwise a
      // leftover RAF tick can walk the playhead away from the JUMP lap.
      if (seekRef.current != null) {
        cursorRef.current = seekRef.current
        seekRef.current = null
        previous = now
      }
      // 1× is the real elapsed time recorded for the selected driver's lap.
      // Higher settings are exact multiples of that recorded timebase.
      cursorRef.current += ((now - previous) / 1000) * speedRef.current
      previous = now
      if (cursorRef.current >= duration) { cursorRef.current = duration; setPlaying(false) }
      const next = frames.findIndex((item) => item.t >= cursorRef.current)
      setFrameIndex(next < 0 ? frames.length - 1 : next)
      setPlayhead(cursorRef.current)
      if (cursorRef.current < duration) animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animation)
  }, [playing, replay.data])

  const orderedDrivers = useMemo(() => [...(replay.data?.drivers ?? [])].sort((left, right) => {
    const leftPosition = Number(left.classifiedPosition)
    const rightPosition = Number(right.classifiedPosition)
    if (Number.isFinite(leftPosition) && Number.isFinite(rightPosition)) return leftPosition - rightPosition
    if (Number.isFinite(leftPosition)) return -1
    if (Number.isFinite(rightPosition)) return 1
    return String(left.driver).localeCompare(String(right.driver))
  }), [replay.data])
  const roster = decision.data?.participants ?? orderedDrivers.map((driver) => driver.driver)
  useEffect(() => {
    if (!roster.length) return
    setSelectedDrivers((current) => {
      const valid = current.filter((driver) => roster.includes(driver))
      if (valid.length) return valid.slice(0, MAX_VISUAL_SELECTIONS)
      return [selection.driver].filter((driver) => driver && roster.includes(driver)).slice(0, MAX_VISUAL_SELECTIONS)
    })
  // Keep a user's visual selection stable while the replay frame changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.data, replay.data])
  const rows = decision.data?.analysisRows ?? decision.data?.rows ?? []
  // The recorded-input panel is intentionally strict: if this exact lap was
  // not a detected close battle, it must say so rather than borrow a battle
  // from another lap for the same pair.
  const totalLaps = replay.data?.totalLaps ?? decision.data?.totalLaps ?? selection.lap
  const driverLapBoundaries = replay.data?.lapBoundariesByDriver?.[selection.driver] ?? []
  const availableLaps = useMemo(() => driverLapBoundaries.map((entry) => entry.lap), [driverLapBoundaries])
  const frames = replay.data?.frames ?? []
  const currentFrame = interpolateFrame(frames, playhead) ?? frames[frameIndex] ?? frames[0]
  const event = selectedEvent
  const infoByDriver = new Map((replay.data?.drivers ?? []).map((driver) => [driver.driver, driver]))
  const visualOverlay = trackmap?.visualOverlay
  const raceTime = replay.data ? replay.data.window.sessionStartS + (currentFrame?.t ?? 0) : null
  // Adjacent laps share a boundary. Treat the end as exclusive so a jump to
  // L20's start is visibly L20, not the tail end of L19.
  const playbackLap = lapStateAt(driverLapBoundaries, currentFrame?.t ?? 0) ?? driverLapBoundaries.at(-1)
  const selectedBranchLap = driverLapBoundaries.find((entry) => entry.lap === selection.lap)
  const gapRows = selectedGapRows(currentFrame, trackmap, replay.data?.drivers, selectedDrivers, playbackLap?.lapTimeS ?? replay.data?.window?.durationS)
  const playbackTime = currentFrame?.t ?? 0
  const lapBoundariesByDriver = replay.data?.lapBoundariesByDriver ?? {}
  const raceOrder = recordedRaceOrder(currentFrame, replay.data?.drivers, lapBoundariesByDriver, playbackTime)
  // The branch input must be resolved at the lap selected in JUMP / BRANCH
  // LAP, not at whichever moment the observed replay happens to be showing.
  // Otherwise choosing (for example) Hadjar at L8 would accidentally use the
  // car ahead of Hadjar at L1 as the model opponent.
  // End of the JUMP lap, not lights-out: start frames are still the grid.
  const branchTime = selectedBranchLap
    ? Math.max(Number(selectedBranchLap.startT) || 0, Number(selectedBranchLap.endT) - 0.05)
    : playbackTime
  const branchRaceOrder = officialRaceOrder(frames, replay.data?.drivers, lapBoundariesByDriver, branchTime, selectedBranchLap)
  const liveRaceOrder = officialRaceOrder(frames, replay.data?.drivers, lapBoundariesByDriver, playbackTime, playbackLap)
  const raceControl = raceControlAt(lapBoundariesByDriver, playbackTime)
  const liveActors = runningOrderNeighbours(liveRaceOrder, selection.driver)
  const jumpFrameActors = runningOrderNeighbours(branchRaceOrder, selection.driver)
  // Official lap Position is the pair source for every selected driver.
  // Lights-out timing frames are still the grid (VER: ANT / NOR). Do not let
  // that override the end-of-lap classification (VER L1: ANT / PIA).
  const displayLap = Number(playbackLap?.lap ?? selection.lap)
  const liveFieldActors = fieldBattleActors(batteryClip.data?.field, selection.driver, displayLap)
  const fieldActors = fieldBattleActors(batteryClip.data?.field, selection.driver, selection.lap)
  const jumpActors = fieldActors ?? mergeOfficialActors(jumpFrameActors, null)
  const livePair = liveFieldActors ?? mergeOfficialActors(liveActors, fieldActors)
  const attackingRow = livePair?.ahead ?? null
  const defendingRow = livePair?.behind ?? null
  const attackingDriver = attackingRow?.driver ?? null
  const defendingDriver = defendingRow?.driver ?? null
  const selectedDriverRow = livePair?.us ?? jumpActors?.us ?? null
  const nextHuntActors = fieldBattleActors(batteryClip.data?.field, selection.driver, Number(selection.lap) + 1)
  const nextHuntFocus = resolveBattleFocus(nextHuntActors?.us, nextHuntActors?.ahead, nextHuntActors?.behind)
  const battleFocus = !jumpActors?.us && batteryClip.loading
    ? { role: null, opponent: null, gapS: null, closeAhead: false, closeBehind: false }
    : resolveBattleFocus(jumpActors?.us, jumpActors?.ahead, jumpActors?.behind)
  const jumpAvailable = Boolean(battleFocus.opponent || nextHuntFocus.opponent)
  const extractedAttack = battleFocus.role === 'ATTACKING' && battleFocus.opponent
    ? rows.find((row) => row.driver === selection.driver && row.defender === battleFocus.opponent && Number(row.lap) === Number(selection.lap)) ?? null
    : null
  const extractedDefend = battleFocus.role === 'DEFENDING' && battleFocus.opponent
    ? rows.find((row) => row.driver === battleFocus.opponent && row.defender === selection.driver && Number(row.lap) === Number(selection.lap)) ?? null
    : null
  const battle = extractedAttack ?? extractedDefend
  const branchRole = battleFocus.role
  const modelOpponent = battleFocus.opponent
  const opponentRow = branchRaceOrder.find((row) => row.driver === modelOpponent)
  const opponentField = fieldStepExact(batteryClip.data?.field, modelOpponent, selection.lap)
  const branchFocus = !modelOpponent ? null : battleFocus.role === 'DEFENDING'
    ? {
        ...(extractedDefend || {}),
        year: selection.year,
        round: selection.round,
        session: selection.session,
        lap: selection.lap,
        driver: selection.driver,
        defender: modelOpponent,
        position: extractedDefend?.defenderPosition ?? selectedDriverRow?.timingPosition,
        defenderPosition: extractedDefend?.position ?? opponentField?.timingPosition ?? opponentRow?.timingPosition,
        gapS: battleFocus.gapS ?? extractedDefend?.gapS ?? 0.8,
        closingRateS: extractedDefend?.closingRateS ?? fieldActors?.closingRateS ?? 0,
        lapFraction: selection.lap / Math.max(1, totalLaps),
        selectedRole: 'DEFENDING',
        sourcePerspective: extractedDefend ? 'OBSERVED_OPPONENT_ATTACK' : 'LIVE_GAP_BATTLE',
        pitDistorted: Boolean(extractedDefend?.pitDistorted),
      }
    : {
        ...(extractedAttack || {}),
        year: selection.year,
        round: selection.round,
        session: selection.session,
        lap: selection.lap,
        driver: selection.driver,
        defender: modelOpponent,
        position: extractedAttack?.position ?? selectedDriverRow?.timingPosition,
        defenderPosition: extractedAttack?.defenderPosition ?? opponentField?.timingPosition ?? opponentRow?.timingPosition,
        gapS: battleFocus.gapS ?? extractedAttack?.gapS ?? 0.8,
        closingRateS: extractedAttack?.closingRateS ?? fieldActors?.closingRateS ?? 0,
        lapFraction: selection.lap / Math.max(1, totalLaps),
        selectedRole: 'ATTACKING',
        sourcePerspective: extractedAttack ? 'OBSERVED_SELECTED_ATTACK' : 'LIVE_GAP_BATTLE',
        pitDistorted: Boolean(extractedAttack?.pitDistorted),
      }
  useEffect(() => {
    const required = [selection.driver]
    if (modelOpponent) required.push(modelOpponent)
    if (battleFocus.closeAhead && attackingDriver) required.push(attackingDriver)
    if (battleFocus.closeBehind && defendingDriver) required.push(defendingDriver)
    setSelectedDrivers((current) => {
      const pinned = required.filter((code, index, list) => code && list.indexOf(code) === index)
      const extras = current.filter((code) => !pinned.includes(code))
      return [...pinned, ...extras].slice(0, MAX_VISUAL_SELECTIONS)
    })
  }, [selection.driver, selection.lap, modelOpponent, battleFocus.closeAhead, battleFocus.closeBehind, attackingDriver, defendingDriver])
  const toggleVisualDriver = (driver) => setSelectedDrivers((current) => {
    if (current.includes(driver)) {
      if (current.length <= 2) return current
      return current.filter((item) => item !== driver)
    }
    if (current.length >= MAX_VISUAL_SELECTIONS) return current
    return [...current, driver]
  })
  const restart = () => { cursorRef.current = 0; seekRef.current = null; setFrameIndex(0); setPlayhead(0); setPlaying(false); setBranchRequest(null); setBranch({ idle: true }); setDisplayMode('OBSERVED') }
  const seekPlayheadToLap = (lap, { play = false } = {}) => {
    const seek = playheadForLap(driverLapBoundaries, frames, lap)
    if (!seek) return null
    cursorRef.current = seek.time
    seekRef.current = seek.time
    setFrameIndex(seek.index)
    setPlayhead(seek.time)
    setPlaying(Boolean(play))
    return seek
  }
  const jumpToLap = (lap, { play = false, keepBranch = false } = {}) => {
    const seek = playheadForLap(driverLapBoundaries, frames, lap)
    if (!seek) return null
    cursorRef.current = seek.time
    seekRef.current = seek.time
    setFrameIndex(seek.index)
    setPlayhead(seek.time)
    setPlaying(Boolean(play))
    if (Number(selection.lap) !== seek.lap) {
      if (!keepBranch) {
        setBranchRequest(null)
        setBranch({ idle: true })
        setDisplayMode('OBSERVED')
      }
      update({ lap: seek.lap })
    }
    return seek
  }
  const actorsAtLap = (lap) => {
    const field = fieldBattleActors(batteryClip.data?.field, selection.driver, lap)
    const boundary = driverLapBoundaries.find((entry) => Number(entry.lap) === Number(lap))
    const time = boundary
      ? Math.max(Number(boundary.startT) || 0, Number(boundary.endT) - 0.05)
      : branchTime
    const order = officialRaceOrder(frames, replay.data?.drivers, lapBoundariesByDriver, time, boundary)
    return mergeOfficialActors(runningOrderNeighbours(order, selection.driver), field)
  }
  const startPitwolfBranch = (opts = {}) => {
    const forcedFirstAction = mapForcedAction(opts.forcedFirstAction)
    const preferredOpponent = opts.preferredOpponent
    const whatIf = opts.whatIf
    const requestedResultLap = Number(opts.resultLap ?? whatIf?.resultLap ?? 0) || null
    let jumpLap = requestedResultLap || Number(selection.lap)
    let pack = actorsAtLap(jumpLap)
    let packFocus = resolveBattleFocus(pack?.us, pack?.ahead, pack?.behind)
    if (!preferredOpponent && !packFocus.opponent && !requestedResultLap) {
      const nextLap = Number(selection.lap) + 1
      const nextPack = actorsAtLap(nextLap)
      const nextFocus = resolveBattleFocus(nextPack?.us, nextPack?.ahead, nextPack?.behind)
      if (nextFocus.opponent) {
        jumpLap = nextLap
        pack = nextPack
        packFocus = nextFocus
      }
    }
    const seek = jumpToLap(jumpLap, { play: false, keepBranch: true })
    jumpLap = Number(seek?.lap ?? jumpLap)
    setDisplayMode('BRANCH')
    let role = packFocus.role || branchRole
    let opponent = preferredOpponent || packFocus.opponent || modelOpponent
    const extractedAtJumpAttack = opponent
      ? rows.find((row) => row.driver === selection.driver && row.defender === opponent && Number(row.lap) === Number(jumpLap)) ?? null
      : null
    const extractedAtJumpDefend = opponent
      ? rows.find((row) => row.driver === opponent && row.defender === selection.driver && Number(row.lap) === Number(jumpLap)) ?? null
      : null
    const selectedAtJump = pack?.us ?? selectedDriverRow
    const opponentAtJump = (replay.data?.drivers && officialRaceOrder) ? (pack?.ahead?.driver === opponent ? pack.ahead : pack?.behind?.driver === opponent ? pack.behind : null) : null
    const opponentFieldAtJump = fieldStepExact(batteryClip.data?.field, opponent, jumpLap)
    let focus = !opponent ? null : (packFocus.role === 'DEFENDING' || (preferredOpponent && extractedAtJumpDefend && !extractedAtJumpAttack))
      ? {
          ...(extractedAtJumpDefend || {}),
          year: selection.year,
          round: selection.round,
          session: selection.session,
          lap: jumpLap,
          driver: selection.driver,
          defender: opponent,
          position: extractedAtJumpDefend?.defenderPosition ?? selectedAtJump?.timingPosition,
          defenderPosition: extractedAtJumpDefend?.position ?? opponentFieldAtJump?.timingPosition ?? opponentAtJump?.timingPosition,
          gapS: packFocus.gapS ?? extractedAtJumpDefend?.gapS ?? 0.8,
          closingRateS: extractedAtJumpDefend?.closingRateS ?? pack?.closingRateS ?? 0,
          lapFraction: jumpLap / Math.max(1, totalLaps),
          selectedRole: 'DEFENDING',
          sourcePerspective: extractedAtJumpDefend ? 'OBSERVED_OPPONENT_ATTACK' : 'LIVE_GAP_BATTLE',
          pitDistorted: Boolean(extractedAtJumpDefend?.pitDistorted),
        }
      : {
          ...(extractedAtJumpAttack || {}),
          year: selection.year,
          round: selection.round,
          session: selection.session,
          lap: jumpLap,
          driver: selection.driver,
          defender: opponent,
          position: extractedAtJumpAttack?.position ?? selectedAtJump?.timingPosition,
          defenderPosition: extractedAtJumpAttack?.defenderPosition ?? opponentFieldAtJump?.timingPosition ?? opponentAtJump?.timingPosition,
          gapS: packFocus.gapS ?? extractedAtJumpAttack?.gapS ?? 0.8,
          closingRateS: extractedAtJumpAttack?.closingRateS ?? pack?.closingRateS ?? 0,
          lapFraction: jumpLap / Math.max(1, totalLaps),
          selectedRole: 'ATTACKING',
          sourcePerspective: extractedAtJumpAttack ? 'OBSERVED_SELECTED_ATTACK' : 'LIVE_GAP_BATTLE',
          pitDistorted: Boolean(extractedAtJumpAttack?.pitDistorted),
        }
    if (focus?.selectedRole) role = focus.selectedRole
    let predictionRow = extractedAtJumpAttack ?? extractedAtJumpDefend ?? focus
    if (preferredOpponent) {
      const attackRow = rows.find((row) => row.driver === selection.driver && row.defender === preferredOpponent && Number(row.lap) === Number(jumpLap))
      const defendRow = rows.find((row) => row.driver === preferredOpponent && row.defender === selection.driver && Number(row.lap) === Number(jumpLap))
      if (attackRow) {
        role = 'ATTACKING'
        opponent = preferredOpponent
        focus = { ...attackRow, selectedRole: 'ATTACKING', sourcePerspective: 'OBSERVED_SELECTED_ATTACK' }
        predictionRow = attackRow
      } else if (defendRow) {
        role = 'DEFENDING'
        opponent = preferredOpponent
        focus = {
          ...defendRow,
          driver: selection.driver,
          defender: preferredOpponent,
          position: defendRow.defenderPosition,
          defenderPosition: defendRow.position,
          selectedRole: 'DEFENDING',
          sourcePerspective: 'OBSERVED_OPPONENT_ATTACK',
        }
        predictionRow = defendRow
      } else {
        const us = pack?.us ?? branchRaceOrder.find((row) => row.driver === selection.driver)
        const them = (pack?.ahead?.driver === preferredOpponent ? pack.ahead : pack?.behind?.driver === preferredOpponent ? pack.behind : null)
          ?? branchRaceOrder.find((row) => row.driver === preferredOpponent)
        role = whatIf?.kind === 'DEFEND' ? 'DEFENDING' : 'ATTACKING'
        opponent = preferredOpponent
        focus = {
          year: selection.year,
          round: selection.round,
          session: selection.session,
          lap: jumpLap,
          driver: selection.driver,
          defender: preferredOpponent,
          position: us?.timingPosition ?? whatIf?.position,
          defenderPosition: them?.timingPosition,
          gapS: (role === 'DEFENDING' ? whatIf?.gapToBehindS : whatIf?.gapToAheadS) ?? packFocus.gapS ?? 0.8,
          closingRateS: 0,
          lapFraction: jumpLap / Math.max(1, totalLaps),
          selectedRole: role,
          sourcePerspective: 'INCIDENT_WHAT_IF',
          pitDistorted: false,
        }
        predictionRow = focus
      }
    }
    if (!opponent || !focus) {
      setDisplayMode('OBSERVED')
      setBranchRequest(null)
      setBranch({ error: 'No 1.0s battle at this lap. JUMP needs the car ahead or the car behind within 1.0s of the selected driver.' })
      return
    }
    setBranch({ loading: true })
    const required = [selection.driver, opponent]
    if (battleFocus.closeAhead && attackingDriver) required.push(attackingDriver)
    if (battleFocus.closeBehind && defendingDriver) required.push(defendingDriver)
    if (whatIf?.driver) required.push(whatIf.driver)
    if (whatIf?.otherDriver) required.push(whatIf.otherDriver)
    setSelectedDrivers((current) => {
      const pinned = required.filter((code, index, list) => code && list.indexOf(code) === index)
      const extras = current.filter((code) => !pinned.includes(code))
      return [...pinned, ...extras].slice(0, MAX_VISUAL_SELECTIONS)
    })
    const usModel = fieldStepExact(batteryClip.data?.field, selection.driver, jumpLap)?.modelled
    const themModel = fieldStepExact(batteryClip.data?.field, opponent, jumpLap)?.modelled
    setBranchRequest({
      id: `${Date.now()}:${selection.year}:${selection.round}:${selection.session}:${selection.driver}:${opponent}:${role}:${jumpLap}:${forcedFirstAction || 'policy'}`,
      year: selection.year,
      round: Number(selection.round),
      session: selection.session,
      driver: selection.driver,
      defender: opponent,
      constructedSoc: {
        ours: Number(usModel?.startMj ?? usModel?.endMj),
        theirs: Number(themModel?.startMj ?? themModel?.endMj),
      },
      lap: jumpLap,
      watchFromLap: leadInLap(jumpLap),
      role,
      focus,
      predictionRow,
      forcedFirstAction,
      whatIf: whatIf ? {
        call: mapForcedAction(whatIf.call) || forcedFirstAction,
        kind: whatIf.kind,
        problem: whatIf.problem,
        theyDid: whatIf.theyDid,
        otherDriver: whatIf.otherDriver,
        leftPct: whatIf.leftPct,
        gapToAheadS: whatIf.gapToAheadS,
        gapToBehindS: whatIf.gapToBehindS,
        position: whatIf.position,
        observedFinish: whatIf.observedFinish,
        raceEnd: whatIf.raceEnd,
        takes: whatIf.takes,
        keyTake: whatIf.keyTake,
        opponent: whatIf.opponent,
        netPass: whatIf.netPass,
        pPass: whatIf.pPass,
      } : null,
      totalLaps: decision.data?.totalLaps ?? totalLaps,
      finishPositions: decision.data?.finishPositions ?? {},
      ruleContext: decision.data?.ruleContext,
    })
  }

  useEffect(() => {
    if (!availableLaps.length || availableLaps.includes(selection.lap)) return
    update({ lap: availableLaps[0] })
  // The server returns real lap boundaries for the selected driver. If they
  // did not complete the currently selected lap, choose their first real lap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.driver, replay.data])

  useEffect(() => {
    if (!initialRequest) return
    setIncomingWhatIf(initialRequest)
    setSelection(selectionFromRequest(initialRequest))
    setDisplayMode('BRANCH')
    setSelectedDrivers([initialRequest.driver, initialRequest.otherDriver].filter(Boolean).slice(0, MAX_VISUAL_SELECTIONS))
    whatIfStartedRef.current = null
  }, [initialRequest])

  useEffect(() => {
    const request = incomingWhatIf
    if (!request || whatIfStartedRef.current === request) return
    if (!replay.data?.frames?.length || !decision.data) return
    if (batteryClip.loading && !batteryClip.data?.field) return
    if (Number(selection.year) !== Number(request.year) || Number(selection.round) !== Number(request.round)) return
    if (selection.driver !== request.driver) return
    const lap = Number(request.lap)
    if (availableLaps.length && !availableLaps.includes(lap)) return
    if (Number(selection.lap) !== lap) {
      jumpToLap(lap)
      return
    }
    whatIfStartedRef.current = request
    startPitwolfBranch({
      forcedFirstAction: request.call,
      preferredOpponent: request.otherDriver,
      resultLap: request.resultLap || request.lap,
      whatIf: request,
    })
    setSpeed(2)
    onRequestConsumed?.()
  // Auto-start only after the recorded race for this request has loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingWhatIf, replay.data, decision.data, batteryClip.loading, batteryClip.data, selection.year, selection.round, selection.driver, selection.lap, availableLaps])

  useEffect(() => {
    if (!branchRequest) return undefined
    let live = true
    const ruleKey = branchRequest.ruleContext?.eventKey ?? branchRequest.ruleContext?.status ?? 'no-rule-context'
    const pairKey = `${branchRequest.year}:${branchRequest.round}:${branchRequest.session}:${branchRequest.driver}:${branchRequest.defender}:${branchRequest.role}:${ruleKey}`
    const branchKey = `${pairKey}:${branchRequest.lap}:race-to-flag:${branchRequest.forcedFirstAction || 'policy'}`
    const cachedBranch = branchCacheRef.current.get(branchKey)
    if (cachedBranch) {
      setBranch({ data: cachedBranch })
      seekPlayheadToLap(branchRequest.watchFromLap ?? leadInLap(branchRequest.lap), { play: true })
      return undefined
    }
    const focusRow = branchRequest.focus
    const predictionRow = branchRequest.predictionRow ?? focusRow
    const constructedOurs = Number(branchRequest.constructedSoc?.ours)
    const constructedTheirs = Number(branchRequest.constructedSoc?.theirs)
    const leftoverOurs = Number.isFinite(constructedOurs)
      ? constructedOurs
      : (branchRequest.whatIf ? Math.max(0, Math.min(4, ((Number(branchRequest.whatIf.leftPct) || 70) / 100) * 4)) : null)
    const leftoverTheirs = Number.isFinite(constructedTheirs) ? constructedTheirs : leftoverOurs
    setBranch({ loading: true })
    Promise.all([
      predictionCacheRef.current.get(pairKey)
        ? Promise.resolve(predictionCacheRef.current.get(pairKey))
        : postJson('/api/f1/overtake/predict', { rows: [predictionRow], ruleContext: branchRequest.ruleContext }).then((payload) => {
          predictionCacheRef.current.set(pairKey, payload)
          return payload
        }).catch(() => ({ predictions: [dummyWhatIfPred(branchRequest.forcedFirstAction)] })),
      leftoverOurs != null
        ? Promise.resolve({ summary: { socStartMj: leftoverOurs } })
        : fetchEnergyLap(branchRequest.year, branchRequest.round, branchRequest.session, branchRequest.driver, branchRequest.lap).catch(() => null),
      leftoverTheirs != null
        ? Promise.resolve({ summary: { socStartMj: leftoverTheirs } })
        : fetchEnergyLap(branchRequest.year, branchRequest.round, branchRequest.session, branchRequest.defender, branchRequest.lap).catch(() => null),
    ]).then(([prediction, attackerEnergy, defenderEnergy]) => {
      const focus = { ...focusRow, pred: prediction.predictions?.[0] || dummyWhatIfPred(branchRequest.forcedFirstAction) }
      if (!focus.pred) throw new Error('The selected battle could not be scored for this exact lap.')
      return postJson('/api/f1/replay/strategy', {
        focus,
        mode: 'FUTURE_BLIND_RACE_ROLLOUT',
        forcedFirstAction: branchRequest.forcedFirstAction,
        whatIf: branchRequest.whatIf,
        rows: [],
        year: branchRequest.year,
        round: branchRequest.round,
        session: branchRequest.session,
        location: branchRequest.focus?.location,
        totalLaps: branchRequest.totalLaps,
        finishPositions: branchRequest.finishPositions,
        // The public energy calculation supplies a modelled lap-start SoC.
        // It is explicitly a surrogate, never private team battery telemetry.
        energyLaps: {
          [branchRequest.driver]: [{ lap: branchRequest.lap, socEndMj: attackerEnergy?.summary?.socStartMj ?? (branchRequest.role === 'DEFENDING' ? focusRow.defenderSoCMj : focusRow.attackerSoCMj) }],
          [branchRequest.defender]: [{ lap: branchRequest.lap, socEndMj: defenderEnergy?.summary?.socStartMj ?? (branchRequest.role === 'DEFENDING' ? focusRow.attackerSoCMj : focusRow.defenderSoCMj) }],
        },
        regulationEra: Number(branchRequest.year) >= 2026 ? '2026' : '2018_2025',
        ruleContext: branchRequest.ruleContext,
      }).then((tree) => ({ tree, focus, attackerEnergy, defenderEnergy }))
    }).then((data) => {
      branchCacheRef.current.set(branchKey, data)
      if (live) {
        setBranch({ data })
        seekPlayheadToLap(branchRequest.watchFromLap ?? leadInLap(branchRequest.lap), { play: true })
      }
    }).catch((error) => {
      if (live) setBranch({ error: error.message })
    })
    return () => { live = false }
  }, [branchRequest])

  const branchMatchesSelection = Boolean(
    branchRequest
    && Number(branchRequest.year) === Number(selection.year)
    && Number(branchRequest.round) === Number(selection.round)
    && String(branchRequest.session) === String(selection.session)
    && branchRequest.driver === selection.driver
    && Number(branchRequest.lap) === Number(selection.lap)
  )
  const activeBranch = branchMatchesSelection ? branch : { idle: true }
  const branchTree = activeBranch.data?.tree
  const branchStep = branchTree?.path?.[0]
  const branchPrediction = activeBranch.data?.focus?.pred
  const actionProbabilities = branchTree?.habitProbabilities || branchStep?.habitProbabilities || branchPrediction?.probabilities
  const commandGate = branchTree?.decisionContext?.ruleContext?.application
  const branchStartLap = branchMatchesSelection ? branchRequest.lap : selection.lap
  const watchFromLap = branchMatchesSelection ? (branchRequest.watchFromLap ?? leadInLap(branchStartLap)) : leadInLap(selection.lap)
  const playbackN = Number(playbackLap?.lap ?? branchStartLap)
  const beforeBranch = Number.isFinite(playbackN) && Number.isFinite(Number(branchStartLap)) && playbackN < Number(branchStartLap)
  const branchStepIndex = beforeBranch ? -1 : Math.max(0, Math.min((branchTree?.path?.length ?? 1) - 1, playbackN - Number(branchStartLap)))
  const activeBranchStep = branchStepIndex >= 0 ? (branchTree?.path?.[branchStepIndex] ?? null) : null
  const compareActive = displayMode === 'BRANCH'
  const branchOverlay = compareActive && activeBranchStep && activeBranch.data?.focus?.driver && activeBranch.data?.focus?.defender
    ? {
        driver: activeBranch.data.focus.driver,
        target: activeBranch.data.focus.defender,
        action: activeBranchStep.action,
        event: activeBranchStep.event,
        convertP: activeBranchStep.convertP,
        probability: activeBranchStep.probability,
        aheadProbability: activeBranchStep.aheadProbability,
        role: branchTree?.selectedRoleAtJump ?? branchRequest?.role,
        lap: activeBranchStep.lap,
      }
    : null
  const branchGapRows = applyBranchPairToGapRows(gapRows, branchTree, selection.driver, modelOpponent, playbackLap?.lap)
  const branchFrame = applyBranchPairToFrame(currentFrame, branchTree, selection.driver, modelOpponent, playbackLap?.lap)
  const branchSocCapacity = Number(branchTree?.energyConfig?.capacityMj)
  const branchSocWithinWindow = branchTree?.path?.every((step) => (
    Number.isFinite(Number(step.ourSoc)) && Number.isFinite(Number(step.defenderSoc))
      && Number(step.ourSoc) >= 0 && Number(step.defenderSoc) >= 0
      && Number(step.ourSoc) <= branchSocCapacity && Number(step.defenderSoc) <= branchSocCapacity
  ))

  if (raceReplayUnavailable) {
    return <main className="sim-root">
      <header className="sim-header"><button type="button" className="sim-brand" onClick={onHome} aria-label="Back to home"><span>✦</span><strong>PIT<em>WOLF</em></strong></button><div className="sim-header-title"><b>SIMULATION / RECORDED RACE STATE</b><span>SCHEDULED EVENT · RECORDED REPLAY UNAVAILABLE</span></div><button type="button" className="sim-dashboard" onClick={onOpenDashboard}>STRATEGY DASHBOARD ↗</button></header>
      <section className="sim-controls">
        <SelectControl label="SEASON" value={selection.year} onChange={(year) => update({ year: Number(year) })}>{YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</SelectControl>
        <SelectControl label="RACE" value={selection.round} onChange={(round) => { const next = events.find((item) => Number(item.round) === Number(round)); const sessions = next?.sessions ?? ['Race']; update({ round: Number(round), session: sessions.includes('Race') ? 'Race' : sessions[0], lap: 1 }) }}>{events.map((item) => <option key={item.round} value={item.round}>{item.name}</option>)}</SelectControl>
      </section>
      <section className="sim-unavailable-wrap">
        <div className="sim-card sim-race-unavailable">
          <div className="sim-panel-head"><span>{selectedEvent?.name?.toUpperCase() ?? 'SCHEDULED GRAND PRIX'}</span><em>RACE DATA PENDING</em></div>
          <b>RECORDED REPLAY NOT AVAILABLE YET</b>
          <p>Currently no race has taken place for this Grand Prix. Hold your seats—we’ll simulate it as soon as the race happens and we receive the data.</p>
          {selectedEvent?.date && <span>CALENDAR DATE · {selectedEvent.date}</span>}
        </div>
      </section>
    </main>
  }

  return <main className="sim-root">
    <header className="sim-header"><button type="button" className="sim-brand" onClick={onHome} aria-label="Back to home"><span>✦</span><strong>PIT<em>WOLF</em></strong></button><div className="sim-header-title"><b>SIMULATION / RECORDED RACE STATE</b><span>{branchTree ? 'PUBLIC POSITION + TIMING DATA · MODELLED TWO-CAR BRANCH · ANALYSIS ONLY' : 'PUBLIC FASTF1 POSITION + TIMING DATA · MODEL BRANCH LOADING'}</span></div><button type="button" className="sim-dashboard" onClick={onOpenDashboard}>STRATEGY DASHBOARD ↗</button></header>
    <section className="sim-controls">
      <SelectControl label="SEASON" value={selection.year} onChange={(year) => update({ year: Number(year) })}>{YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</SelectControl>
      <SelectControl label="RACE" value={selection.round} onChange={(round) => { const event = events.find((item) => Number(item.round) === Number(round)); const sessions = event?.sessions ?? ['Race']; update({ round: Number(round), session: sessions.includes('Race') ? 'Race' : sessions[0], lap: 1 }) }}>{events.map((item) => <option key={item.round} value={item.round}>{item.name}</option>)}</SelectControl>
      <SelectControl label="SESSION" value={selection.session} onChange={(session) => update({ session, lap: 1 })}>{(event?.sessions ?? ['Race']).map((session) => <option key={session} value={session}>{SESSION_LABELS[session] ?? session}</option>)}</SelectControl>
      <SelectControl label="DRIVER" value={selection.driver} onChange={(driver) => { update({ driver, lap: 1 }); setSelectedDrivers((current) => [driver, ...current.filter((item) => item !== driver)].slice(0, MAX_VISUAL_SELECTIONS)) }}>{roster.map((driver) => <option key={driver} value={driver}>{displayDriverName(infoByDriver.get(driver) ?? { driver })}</option>)}</SelectControl>
      <AutoRoleControl label="ATTACKING" driver={attackingDriver} info={infoByDriver} emptyLabel={selectedDriverRow ? 'NONE — NO CAR AHEAD' : 'LOADING…'} />
      <AutoRoleControl label="DEFENDING" driver={defendingDriver} info={infoByDriver} emptyLabel={selectedDriverRow ? 'NONE — NO CAR BEHIND' : 'LOADING…'} />
      <label className="sim-lap-control"><span>JUMP / BRANCH LAP</span><select value={selection.lap} onChange={(event) => jumpToLap(Number(event.target.value))}>{availableLaps.map((lap) => <option key={lap} value={lap}>Lap {lap}</option>)}</select><b>SELECT L{selection.lap} / {totalLaps}</b></label>
      <div className="sim-jump-control"><span>WHAT-IF BRANCH</span><button type="button" onClick={() => startPitwolfBranch()} disabled={!jumpAvailable}>JUMP</button><b>{branchRole && modelOpponent ? `${branchRole} ${modelOpponent} · ${Number(battleFocus.gapS).toFixed(2)}s · WATCH L${leadInLap(selection.lap)} · GO L${selection.lap} → FLAG` : nextHuntFocus.opponent ? `${nextHuntFocus.role} ${nextHuntFocus.opponent} · NEXT HUNT L${Number(selection.lap) + 1} · WATCH L${selection.lap}` : batteryClip.loading && !fieldActors ? 'LOADING 1.0s BATTLE…' : 'NO 1.0s BATTLE'}</b></div>
    </section>
    <section className={`sim-content${compareActive ? ' is-split' : ''}`}>
      <aside className="sim-driver-rail">
        <section className="sim-card sim-driver-list">
          <div className="sim-panel-head"><span>DRIVERS</span><em>{selectedDrivers.length} / {roster.length}</em></div>
          <p className="sim-driver-help">Our car plus the 1.0s battle pair are selected automatically. You can still add two more cars.</p>
          <div className="sim-driver-options">
            {orderedDrivers.map((driver, index) => {
              const selected = selectedDrivers.includes(driver.driver)
              const disabled = !selected && selectedDrivers.length >= MAX_VISUAL_SELECTIONS
              return <label className={`sim-driver-option${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`} key={driver.driver}>
                <span className="sim-driver-position">{displayPosition(driver, index + 1)}</span>
                <span className="sim-driver-color" style={{ background: driver.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] }} />
                <span className="sim-driver-name">{displayDriverName(driver)}</span>
                <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleVisualDriver(driver.driver)} aria-label={`Show ${displayDriverName(driver)}`} />
              </label>
            })}
          </div>
        </section>
      </aside>
      <section className="sim-track-panel">
        <div className="sim-panel-head"><span>{`${(event?.name ?? replay.data?.event?.name ?? 'LOADING RACE').toUpperCase()}${trackmap?.event?.location ? ` · ${String(trackmap.event.location).toUpperCase()}` : ''} / ${compareActive ? 'REAL vs PITWOLF' : 'TRACK VISUALIZATION'}`}</span><span className="sim-track-modes"><span className="sim-branch-mode" role="group" aria-label="Replay mode"><button type="button" className={displayMode === 'OBSERVED' ? 'active' : ''} aria-pressed={displayMode === 'OBSERVED'} onClick={() => setDisplayMode('OBSERVED')}>REAL ONLY</button><button type="button" className={displayMode === 'BRANCH' ? 'active' : ''} aria-pressed={displayMode === 'BRANCH'} onClick={() => setDisplayMode('BRANCH')} disabled={!branchRequest}>COMPARE</button></span><span className="sim-view-toggle" role="group" aria-label="Track visualisation mode"><button type="button" className={viewMode === '2D' ? 'active' : ''} aria-pressed={viewMode === '2D'} onClick={() => setViewMode('2D')}>2D</button><button type="button" className={viewMode === '3D' ? 'active' : ''} aria-pressed={viewMode === '3D'} onClick={() => setViewMode('3D')}>3D</button></span></span></div>
        <div className="sim-status-row"><b>LAP {playbackLap?.lap ?? selection.lap} / {totalLaps}</b><span>{raceTime == null ? 'LOADING SESSION TIME…' : `RACE T+${clock(raceTime)}`}</span><i>{playbackLap?.compound ?? '—'} · {playbackLap?.trackStatus === '1' ? 'GREEN' : 'TRACK STATUS UNCONFIRMED'}</i></div>
        {raceControl && <div className={`sim-race-control is-${raceControl.tone}`}>{raceControl.label}</div>}
        {compareActive && (branchOverlay || beforeBranch ? <div className="sim-branch-banner"><b>{`WATCH L${watchFromLap} · TAKE / HOLD ON L${branchStartLap} → FLAG${branchTree?.branchFinishPosition ? ` · P${branchTree.branchFinishPosition}` : ''}${branchTree?.goLap ? ` · GO L${branchTree.goLap}` : ''}`}</b><span>{beforeBranch ? `Approach lap — recorded order. The model take is on L${branchStartLap}.` : activeBranchStep?.event === 'TAKE' ? `PITWOLF TOOK ${branchOverlay.target} this lap` : activeBranchStep?.event === 'PIT' ? 'REAL PIT THIS LAP' : `PITWOLF ${branchOverlay?.action}${branchOverlay?.role === 'DEFENDING' ? ' TO DEFEND' : ' TO ATTACK'} · convert ${Math.round((activeBranchStep?.convertP ?? branchOverlay?.probability) * 100)}%`} · u {branchTree?.driverScore == null ? '—' : Number(branchTree.driverScore).toFixed(2)}</span><em>Playback starts one lap before the JUMP so you see the pair before the model result. Left is the recorded race. Right swaps those two cars only after the model take lap.</em></div> : <div className="sim-branch-banner is-pending"><b>{incomingWhatIf ? `WHAT IF ${incomingWhatIf.call || 'CALL'} · LOADING` : 'SPLIT COMPARE'}</b><span>{activeBranch.loading ? 'Left is the real race. Right will show the PitWolf call from this lap…' : activeBranch.error ? `Branch unavailable — ${activeBranch.error}` : 'Building the model race branch…'}</span><em>After JUMP both maps play the same recorded time. The right map owns the selected car’s call.</em></div>)}
        {!trackmap || (trackmap.loading && !trackmap.points?.length) ? <div className="sim-loading">Loading the recorded GPS lap…</div> : trackmap.error && !trackmap.points?.length ? <div className="sim-error">Circuit map unavailable: {trackmap.error}</div> : compareActive ? <div className="sim-compare-tracks">
          <TrackPane
            title="REAL RACE"
            kicker={`RECORDED · L${playbackLap?.lap ?? selection.lap}`}
            tone="real"
            trackmap={trackmap}
            frame={currentFrame}
            drivers={replay.data?.drivers}
            attacker={selection.driver}
            defender={modelOpponent}
            selectedDrivers={selectedDrivers}
            viewMode={viewMode}
            compact
            gapRows={gapRows}
            gapHeading="RECORDED TIMING"
          />
          <TrackPane
            title="PITWOLF"
            kicker={beforeBranch ? `APPROACH · RESULT L${branchStartLap}` : branchOverlay ? `${branchOverlay.action}${branchTree?.goLap ? ` · GO L${branchTree.goLap}` : ''} · FROM L${branchStartLap}` : activeBranch.loading ? 'SCORING FROM THIS LAP…' : 'AWAITING MODEL'}
            tone="model"
            trackmap={trackmap}
            frame={branchFrame}
            drivers={replay.data?.drivers}
            attacker={selection.driver}
            defender={modelOpponent}
            selectedDrivers={selectedDrivers}
            viewMode={viewMode}
            branchOverlay={branchOverlay}
            compact
            gapRows={branchGapRows}
            gapHeading="MODEL PAIR ORDER"
          />
        </div> : <div className="sim-track-wrap"><RecordedTrack trackmap={trackmap} frame={currentFrame} drivers={replay.data?.drivers} attacker={selection.driver} defender={modelOpponent} selectedDrivers={selectedDrivers} viewMode={viewMode} />{replay.error ? <div className="sim-error sim-replay-overlay">Car positions unavailable: {replay.error}</div> : <GapLeaderboard rows={gapRows} drivers={replay.data?.drivers} />}</div>}
        <RaceFieldHud field={batteryClip.data?.field} driver={selection.driver} playbackLap={playbackLap} playhead={playhead} loading={batteryClip.loading} error={batteryClip.error} event={batteryClip.data?.actualRace?.event} branchStep={activeBranchStep} compareActive={compareActive} energyPersonality={branchTree?.energyPersonality} branchCapacity={Number.isFinite(branchSocCapacity) ? branchSocCapacity : 4} modelOpponent={modelOpponent} />
        <div className="sim-player"><button type="button" onClick={() => setPlaying((value) => !value)} disabled={!frames.length}>{playing ? 'Ⅱ PAUSE' : compareActive ? '▷ PLAY FROM APPROACH' : '▷ PLAY FULL RACE'}</button><button type="button" onClick={restart} disabled={!frames.length}>↻ RESTART</button><input aria-label="Replay frame" type="range" min="0" max={Math.max(0, frames.length - 1)} value={frameIndex} onChange={(event) => { const index = Number(event.target.value); const time = frames[index]?.t ?? 0; cursorRef.current = time; seekRef.current = time; setFrameIndex(index); setPlayhead(time); setPlaying(false) }} /><span className="sim-playback-lap">{compareActive ? `L${playbackLap?.lap ?? '—'} · LEFT REAL · RIGHT PITWOLF FROM L${watchFromLap} · RESULT L${branchStartLap}` : `PLAYING L${playbackLap?.lap ?? '—'} · NO BRANCH`}</span><div className="sim-speeds">{SPEEDS.map((value) => <button key={value} type="button" className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}×</button>)}</div></div>
      </section>
      <aside className="sim-side">
        <RaceOrderBoard
          rows={displayMode === 'BRANCH' ? applyBranchPairOrder(raceOrder, branchTree, selection.driver, modelOpponent, playbackLap?.lap) : raceOrder}
          branched={displayMode === 'BRANCH' && Boolean(branchTree?.path?.length)}
        />
        <section className="sim-card"><div className="sim-panel-head"><span>SELECTED DRIVER STATE</span><em>OFFICIAL ORDER · L{playbackLap?.lap ?? selection.lap}</em></div><div className="sim-pair"><div><span>DRIVER</span><b>{selection.driver}</b><em>{selectedDriverRow ? `P${selectedDriverRow.timingPosition}` : '—'}</em></div><div><span>ATTACKING</span><b>{attackingDriver ?? 'NONE'}</b><em>{attackingDriver ? `${isCloseBattle(selectedDriverRow?.gapToAheadS) ? `${Number(selectedDriverRow.gapToAheadS).toFixed(2)}s` : `P${attackingRow?.timingPosition ?? '—'}`}` : 'NO CAR AHEAD'}</em></div></div><div className="sim-facts"><span>DEFENDING AGAINST <b>{defendingDriver ?? 'NONE — NO CAR BEHIND'}</b></span>{branchRole ? <><span>MODEL FOCUS <b>{branchRole} {modelOpponent} · {Number(battleFocus.gapS).toFixed(2)}s</b></span>{battleFocus.closeAhead && battleFocus.closeBehind ? <span>BOTH SIDES CLOSE <b>FRONT WINS FOCUS</b></span> : null}{battle ? <><span>RELATIVE SPEED <b>{battle.speedDeltaKph == null ? '—' : `${battle.speedDeltaKph > 0 ? '+' : ''}${battle.speedDeltaKph} km/h`}</b></span><span>TYRES <b>{battle.attackerCompound ?? '—'} / {battle.defenderCompound ?? '—'}</b></span></> : null}<span>MODEL STATE <b>{activeBranch.loading ? 'SCORING' : branchTree ? 'MODELLED BRANCH READY' : activeBranch.error ? 'UNAVAILABLE' : 'AWAITING JUMP'}</b></span></> : <span>MODEL STATE <b>{attackingDriver || defendingDriver ? 'NO 1.0s BATTLE AT THIS LAP' : 'NO ADJACENT CAR'}</b></span>}</div>{!branchRole && <p className="sim-note">Ahead and behind come from the real running order. JUMP starts only if one of those cars is within 1.0s. If both are, the model fights the car ahead.</p>}</section>
        <section className="sim-card sim-branch"><div className="sim-panel-head"><span>PITWOLF RACE BRANCH</span><em>{branchTree ? `L${branchTree.startLap} → L${branchTree.finishLap}` : 'AWAITING JUMP'}</em></div>{activeBranch.loading ? <p className="sim-note">Freeze this lap, then the model runs the selected car to the flag. Only real pit stops are read after this.</p> : activeBranch.error ? <p className="sim-note sim-error">This branch could not be scored: {activeBranch.error}</p> : branchTree && branchStep && actionProbabilities ? <><div className="sim-action"><b>{branchStep.action}</b><span>{branchStep.forced || branchRequest?.forcedFirstAction ? 'FORCED FIRST LAP' : 'MODEL FIRST LAP'}</span><em>{branchRequest?.whatIf ? `They spent ${branchRequest.whatIf.theyDid || '—'}; the branch now spends ${branchStep.action} on this lap` : `${Math.round((actionProbabilities[branchStep.action] ?? 0) * 100)}% model confidence for this first action`}</em></div><div className="sim-probabilities">{['ATTACK', 'DELAY', 'SAVE'].map((action) => <span key={action}><i className={`sim-prob-${action.toLowerCase()}`} style={{ width: `${Math.round((actionProbabilities[action] ?? 0) * 100)}%` }} />{action} <b>{Math.round((actionProbabilities[action] ?? 0) * 100)}%</b></span>)}</div><div className="sim-facts"><span>MODEL ROLE AT JUMP <b>{branchTree.selectedRoleAtJump ?? branchRequest?.role ?? '—'}</b></span><span>MODELLED SoC AT JUMP <b>{branchTree.tree.ourSoc.toFixed(2)} / {branchTree.tree.defenderSoc.toFixed(2)} MJ</b></span><span>AFTER FIRST ACTION <b>{branchStep.ourSoc.toFixed(2)} / {branchStep.defenderSoc.toFixed(2)} MJ</b></span><span>OPPONENT WILL USE <b>{branchStep.opponentAction}{branchStep.opponentDeployMj == null ? '' : ` · ${Number(branchStep.opponentDeployMj).toFixed(2)} MJ`}</b></span><span>DRIVER SCORE u <b>{branchTree.driverScore == null ? '—' : Number(branchTree.driverScore).toFixed(2)}</b></span><span>THEIR u <b>{branchTree.opponentScore == null ? '—' : Number(branchTree.opponentScore).toFixed(2)}</b></span>{branchTree.goLap ? <span>PLANNED GO LAP <b>L{branchTree.goLap}</b></span> : null}<span>OUR HUNT DUMP <b>{branchTree.energyPersonality?.overtake?.attackRate == null ? '—' : `${Math.round(branchTree.energyPersonality.overtake.attackRate * 100)}%`}</b></span><span>OUR BATTLE DUMP <b>{branchTree.energyPersonality?.battle?.attackRate == null ? '—' : `${Math.round(branchTree.energyPersonality.battle.attackRate * 100)}%`}</b></span><span>OUR OPEN REBUILD <b>{branchTree.energyPersonality?.open?.saveRate == null ? '—' : `${Math.round(branchTree.energyPersonality.open.saveRate * 100)}%`}</b></span><span>LOW-LEFT SAVE <b>{branchTree.energyPersonality?.leftover?.lowSaveRate == null ? '—' : `${Math.round(branchTree.energyPersonality.leftover.lowSaveRate * 100)}%`}</b></span><span>THEIR BATTLE DUMP <b>{branchTree.opponentEnergyPersonality?.battle?.attackRate == null ? '—' : `${Math.round(branchTree.opponentEnergyPersonality.battle.attackRate * 100)}%`}</b></span><span>PASS AFTER BATTERY <b>{Math.round((branchStep.probability ?? 0) * 100)}%</b></span><span>CONVERT P × u <b>{Math.round((branchStep.convertP ?? 0) * 100)}%</b></span><span>THIS LAP <b>{branchStep.event || branchStep.action}</b></span><span>BRANCH AHEAD AT FLAG <b>{branchTree.modelledPairAheadAtFlag ? 'SELECTED' : 'OPPONENT'}</b></span></div><ol className="sim-branch-log">{(branchTree.takes?.length ? branchTree.takes : (branchTree.actionChanges?.length ? branchTree.actionChanges : branchTree.path).filter((step) => step.event && step.event !== 'HOLD_PLACE')).slice(0, 12).map((step, index) => <li key={`${step.lap}-${index}`}><b>L{step.lap}</b><span>{step.note || `${step.event || step.action}${step.opponentAction ? ` · opponent ${step.opponentAction}` : ''}`}</span><em>{step.pPass != null ? `${Math.round(step.pPass * 100)}% convert · u ${Number(step.u ?? branchTree.driverScore ?? 0).toFixed(2)}` : (step.aheadProbability == null ? (step.event || 'ROLLOUT') : `${Math.round(step.aheadProbability * 100)}% ahead · ${Number(step.ourSoc ?? 0).toFixed(2)} MJ`)}</em></li>)}</ol><p className="sim-note">{`Energy habits are 2026 constructed C5.2 leftover per driver per track, hunt/battle/open and leftover bins, this GP stripped — not team battery. u ${branchTree.driverScore == null ? '—' : Number(branchTree.driverScore).toFixed(2)} is ${selection.driver}’s 2018–2026 take rate. Real pits used: ${(branchTree.pitLaps?.[selection.driver] || []).map((lap) => `L${lap}`).join(' ') || 'none'}. When the pair order flips, those two cars swap recorded places on the right map. Everyone else stays on recorded GPS.`}</p></> : <p className="sim-note">Pick a recorded lap with a close car, then press JUMP to run energy and pass chance to the flag.</p>}</section>
        {branchTree && <section className="sim-card sim-comparison"><div className="sim-panel-head"><span>REAL vs MODEL BATTLE</span><em>HOLD LAPS FIRST</em></div><div className="sim-facts"><span>MODEL HOLD LAPS AHEAD <b>{branchTree.holdComparison?.modelledAheadLaps ?? '—'}</b></span><span>REAL HOLD LAPS AHEAD <b>{branchTree.holdComparison?.observedAheadLaps ?? '—'}</b></span><span>HOLD DELTA <b>{branchTree.holdComparison?.holdDelta == null ? '—' : `${branchTree.holdComparison.holdDelta > 0 ? '+' : ''}${branchTree.holdComparison.holdDelta}`}</b></span><span>MODEL SUCCESS <b>{branchTree.holdComparison?.majorSuccess ? 'MAJOR — BETTER PAIR RESULT' : branchTree.holdComparison?.success ? 'SUCCESS — HELD LONGER' : 'NO HOLD GAIN'}</b></span><span>MODEL: WHO IS AHEAD AT FLAG <b>{branchTree.modelledPairAheadAtFlag ? 'SELECTED DRIVER AHEAD' : 'SELECTED DRIVER BEHIND'}</b></span><span>REAL: WHO WAS AHEAD AT FLAG <b>{branchTree.actualPairAheadAtFlag ? 'SELECTED DRIVER AHEAD' : 'SELECTED DRIVER BEHIND'}</b></span><span>REAL SELECTED FINISH <b>{branchTree.actualFinishPosition ? `P${branchTree.actualFinishPosition}` : 'NOT CLASSIFIED'}</b></span><span>MODELLED ENERGY WINDOW <b>{branchSocWithinWindow ? `WITHIN 0–${branchSocCapacity.toFixed(0)} MJ` : 'OUTSIDE MODEL WINDOW'}</b></span></div><p className="sim-note">{branchTree.holdComparison?.majorSuccess ? 'Major success: the branch still has the place when the classified pair did not.' : branchTree.holdComparison?.success ? 'Success: the branch held this pair longer than the recorded race. That is enough. A better classified pair result would be major.' : 'Attack means take earlier than the race, then delay their re-pass. Defence means delay the lap they passed us. More hold laps is a success; a better pair result than the race is major.'} The car we pass keeps attacking. Loss of lead can still happen. Two cars only.</p></section>}
        <section className="sim-card"><div className="sim-panel-head"><span>TRACK MARKERS</span><em>PROVENANCE</em></div><div className="sim-facts"><span>CARS ON MAP <b>{currentFrame?.cars?.length ?? 0}</b></span><span>CIRCUIT SOURCE <b>PUBLIC GPS / TELEMETRY</b></span><span>CORNER SOURCE <b>{trackmap?.cornerSource?.includes('fastf1-circuit-info') ? 'NUMBERED CIRCUIT DATA' : trackmap?.cornerSource ? 'FALLBACK CIRCUIT DATA' : 'NOT LOADED'}</b></span><span>TURN / ZONE OVERLAY <b>{visualOverlay?.source === 'USER_VISUAL_TURN_REFERENCE' ? 'VISUAL REFERENCE' : 'NOT LOADED'}</b></span><span>ZONE COMMAND GATE <b>ANALYSIS ONLY</b></span></div><p className="sim-note">Corner numbers sit on the recorded GPS map; they are not official FIA detection or activation lines.</p></section>
      </aside>
    </section>
  </main>
}
