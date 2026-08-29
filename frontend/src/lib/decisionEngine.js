// Calibrated rule-based decision engine.
//
// This is not a trained classifier. Thresholds are set from real telemetry and
// held fixed, so a recommendation can always be explained by naming which
// threshold a given input crossed. Inputs are real or derived; only the reserve
// term comes from the simulated energy model, and it is weighted accordingly.

export const DECISION_ENGINE_VERSION = 'v1.0.0'

// Calibrated against the four on-track position changes in the 2023 Las Vegas
// race (laps 32, 35, 43, 50). See VALIDATION.md for the procedure.
export const THRESHOLDS = {
  drsRangeS: 1.0,
  attackGapS: 0.75,
  delayGapS: 1.2,
  minClosingRateKph: 5,
  lowReservePct: 25,
  brakingZoneProximityM: 400,
}

export const STRATEGIES = {
  ATTACK: {
    color: '#ff7043',
    text: 'Spend energy now while the closing rate and DRS advantage hold.',
  },
  SAVE: {
    color: '#63e6be',
    text: 'Protect the reserve. The position is not available at this cost.',
  },
  DELAY: {
    color: '#a9bfff',
    text: 'Hold station and commit at the next braking zone instead.',
  },
}

export function recommend({
  gapS,
  closingRateKph,
  drsActive,
  reservePct,
  distanceToBrakingZoneM,
}) {
  const factors = []
  const inRange = gapS <= THRESHOLDS.drsRangeS
  const closing = closingRateKph >= THRESHOLDS.minClosingRateKph
  const nearZone =
    distanceToBrakingZoneM !== null &&
    distanceToBrakingZoneM <= THRESHOLDS.brakingZoneProximityM
  const reserveOk = reservePct >= THRESHOLDS.lowReservePct

  factors.push({
    label: 'Gap to car ahead',
    value: `${gapS.toFixed(2)} s`,
    source: 'derived',
    tone: gapS <= THRESHOLDS.attackGapS ? 'positive' : inRange ? 'neutral' : 'negative',
    note: inRange ? `inside ${THRESHOLDS.drsRangeS.toFixed(1)} s DRS range` : 'outside DRS range',
  })
  factors.push({
    label: 'Closing rate',
    value: `${closingRateKph >= 0 ? '+' : ''}${closingRateKph.toFixed(1)} km/h`,
    source: 'derived',
    tone: closing ? 'positive' : 'negative',
    note: closing ? 'gaining ground' : `below ${THRESHOLDS.minClosingRateKph} km/h threshold`,
  })
  factors.push({
    label: 'DRS',
    value: drsActive ? 'OPEN' : 'CLOSED',
    source: 'real',
    tone: drsActive ? 'positive' : 'negative',
    note: drsActive ? 'flap open in telemetry' : 'not open at this point',
  })
  factors.push({
    label: 'Braking zone ahead',
    value: distanceToBrakingZoneM === null ? 'none this lap' : `${Math.round(distanceToBrakingZoneM)} m`,
    source: 'derived',
    tone: nearZone ? 'positive' : 'neutral',
    note: nearZone ? 'pass opportunity imminent' : 'no zone within range',
  })
  factors.push({
    label: 'Modelled reserve',
    value: `${Math.round(reservePct)} %`,
    source: 'simulated',
    tone: reserveOk ? 'positive' : 'negative',
    note: reserveOk ? 'sufficient for an attempt' : `below ${THRESHOLDS.lowReservePct} % floor`,
  })

  let recommendation
  let reason
  if (!reserveOk) {
    recommendation = 'SAVE'
    reason = 'Modelled reserve is below the floor needed to sustain an attempt.'
  } else if (!inRange || !closing) {
    recommendation = 'SAVE'
    reason = !inRange
      ? 'Gap is outside DRS range, so an attempt would spend energy without a realistic pass.'
      : 'Closing rate is too low to convert energy into track position here.'
  } else if (gapS <= THRESHOLDS.attackGapS && drsActive && nearZone) {
    recommendation = 'ATTACK'
    reason = 'Inside attack range with DRS open and a braking zone in reach.'
  } else if (gapS <= THRESHOLDS.delayGapS) {
    recommendation = 'DELAY'
    if (nearZone) {
      reason = 'Close enough to strike, but the gap is wider than the attack threshold.'
    } else if (distanceToBrakingZoneM === null) {
      reason = 'In range and closing, but no braking zone remains on this lap to pass into.'
    } else {
      reason = 'In range and closing, but the next braking zone is still too far to commit.'
    }
  } else {
    recommendation = 'SAVE'
    reason = 'Gap is too wide for the energy an attempt would cost.'
  }

  const positives = factors.filter((f) => f.tone === 'positive').length
  const confidence = Math.round((positives / factors.length) * 100)

  return { recommendation, reason, factors, confidence, version: DECISION_ENGINE_VERSION }
}

// Feasibility is reported separately from the recommendation so the score can be
// inspected even when the engine advises against an attempt.
export function feasibilityScore({ gapS, closingRateKph, drsActive, reservePct }) {
  const gapTerm = Math.max(0, 1 - gapS / 1.5) * 45
  const closingTerm = Math.max(0, Math.min(1, closingRateKph / 25)) * 25
  const drsTerm = drsActive ? 20 : 0
  const reserveTerm = Math.max(0, Math.min(1, reservePct / 100)) * 10
  return Math.round(Math.max(0, Math.min(100, gapTerm + closingTerm + drsTerm + reserveTerm)))
}
