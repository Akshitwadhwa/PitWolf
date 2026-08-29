// Modelled energy layer. Every value produced here is SIMULATED.
//
// Actual battery state of charge and team ERS deployment maps are not public, so
// this module does not attempt to recover them. It integrates published
// regulation limits against real speed, throttle and brake traces to produce a
// reproducible estimate.
//
// REGULATION holds published limits that can be cited. CALIBRATION holds values
// we fitted ourselves; they are kept separate so a report never presents a
// fitted parameter as a regulation fact. Bump the version on any change to
// either, so a figure in a write-up traces to one revision.

export const ENERGY_MODEL_VERSION = 'v1.1.0'

// Published F1 power unit regulation limits for the 2014-2025 formula.
export const REGULATION = {
  season: 2023,
  mguKMaxPowerKw: 120,
  mguKRecoveryLimitMjPerLap: 2,
  esDeploymentLimitMjPerLap: 4,
  storeUsableMj: 4,
  // The MGU-H had no per-lap recovery limit in this formula and could supply the
  // MGU-K directly, bypassing both limits above. Omitting it makes any model
  // drain the store and flatline, which is not how these cars behave.
  mguHRecoveryLimited: false,
}

// Values we calibrated. Not regulation facts.
export const CALIBRATION = {
  // Fitted so that a full lap of the reference scenario stays energy-plausible:
  // MGU-K recovery reaches its 2 MJ cap and store deployment stays inside the
  // 4 MJ limit, leaving the reserve fluctuating rather than pinned at a rail.
  mguHDirectSupplyKw: 80,
  // Assumed store level entering the focus lap. This is the one input that
  // cannot be verified against public data. For this scenario it is set above a
  // neutral value because Leclerc stated he recharged on the penultimate lap in
  // order to attack on the last one. That is driver testimony, not telemetry.
  startReservePct: 65,
}

export const DEFAULT_START_RESERVE_PCT = CALIBRATION.startReservePct

export function computeEnergyTrace(
  { distanceM, speedKph, throttlePct, brakePct },
  startReservePct = CALIBRATION.startReservePct,
) {
  const n = distanceM.length
  const deployedMj = new Array(n).fill(0)
  const recoveredMj = new Array(n).fill(0)
  const reservePct = new Array(n).fill(startReservePct)

  let store = REGULATION.storeUsableMj * (startReservePct / 100)
  let esDeployed = 0
  let kRecovered = 0

  for (let i = 1; i < n; i += 1) {
    const segmentM = distanceM[i] - distanceM[i - 1]
    const speedMs = Math.max(speedKph[i] / 3.6, 1)
    const dt = segmentM / speedMs
    const load = throttlePct[i] / 100

    // What the MGU-K is asked to deliver at this throttle position.
    const demandMj = (REGULATION.mguKMaxPowerKw * load * dt) / 1000

    // MGU-H output scales with engine load and is supplied first, because it can
    // feed the MGU-K directly without touching the energy store.
    const mguHMj = (CALIBRATION.mguHDirectSupplyKw * load * dt) / 1000
    const directMj = Math.min(demandMj, mguHMj)

    // Whatever the MGU-H cannot cover is drawn from the store, subject to the
    // per-lap store deployment limit and what is actually left.
    const fromStoreMj = Math.max(0, Math.min(
      demandMj - directMj,
      REGULATION.esDeploymentLimitMjPerLap - esDeployed,
      store,
    ))

    // MGU-K braking recovery, subject to its per-lap cap and store capacity.
    const recoverMj = Math.max(0, Math.min(
      (REGULATION.mguKMaxPowerKw * (brakePct[i] / 100) * dt) / 1000,
      REGULATION.mguKRecoveryLimitMjPerLap - kRecovered,
      REGULATION.storeUsableMj - store,
    ))

    // MGU-H output beyond what the MGU-K is drawing goes back into the store.
    const surplusMj = Math.max(0, mguHMj - directMj)

    esDeployed += fromStoreMj
    kRecovered += recoverMj
    store = Math.min(
      REGULATION.storeUsableMj,
      Math.max(0, store - fromStoreMj + recoverMj + surplusMj),
    )

    deployedMj[i] = esDeployed
    recoveredMj[i] = kRecovered
    reservePct[i] = (store / REGULATION.storeUsableMj) * 100
  }

  return { deployedMj, recoveredMj, reservePct }
}

// Store energy a sustained overtake attempt would draw from this point.
export function attackCostMj(durationS = 3.2) {
  const netKw = Math.max(0, REGULATION.mguKMaxPowerKw - CALIBRATION.mguHDirectSupplyKw)
  return Math.min(REGULATION.esDeploymentLimitMjPerLap, (netKw * durationS) / 1000)
}

// Recoverable energy in the braking zones still ahead on this lap.
export function recoveryAheadMj(brakingZones, currentDistanceM, speedKph = 250) {
  const ahead = brakingZones.filter((zone) => zone.start_m >= currentDistanceM)
  const total = ahead.reduce((sum, zone) => {
    const dt = zone.length_m / Math.max(speedKph / 3.6, 1)
    return sum + (REGULATION.mguKMaxPowerKw * (zone.peak_brake / 100) * dt) / 1000
  }, 0)
  return {
    zones: ahead.length,
    totalMj: Math.min(total, REGULATION.mguKRecoveryLimitMjPerLap),
    nextZoneM: ahead.length ? ahead[0].start_m : null,
  }
}
