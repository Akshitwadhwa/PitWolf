import React, { useMemo, useState } from 'react'
import scenario from '../data/scenarios/las-vegas-2023-lec-per.json'
import { CircuitMap, formatLapTime } from './CircuitMap'
import {
  computeEnergyTrace,
  attackCostMj,
  recoveryAheadMj,
  ENERGY_MODEL_VERSION,
  REGULATION,
  CALIBRATION,
  DEFAULT_START_RESERVE_PCT,
} from '../lib/energyModel'
import { recommend, feasibilityScore, STRATEGIES, DECISION_ENGINE_VERSION } from '../lib/decisionEngine'

const tabs = ['STRATEGY', 'TRACK', 'TELEMETRY', 'ENERGY', 'OVERTAKE', 'LEGENDS']

const { meta, attacker, defender, distance_m: distance, derived } = scenario
const atk = scenario.attacker_telemetry
const def = scenario.defender_telemetry
const driverData = scenario.drivers ?? {}
const attackerRace = driverData[attacker.code] ?? {}
const defenderRace = driverData[defender.code] ?? {}
const attackerFocusLap = (attackerRace.lap_history ?? []).find((lap) => lap.lap === meta.focus_lap) ?? attackerRace.fastest_lap
const defenderFocusLap = (defenderRace.lap_history ?? []).find((lap) => lap.lap === meta.focus_lap) ?? defenderRace.fastest_lap
const lastIndex = distance.length - 1

// The energy trace is deterministic for a given scenario, so it is computed once
// at module load rather than on every scrub.
const energy = computeEnergyTrace({
  distanceM: distance,
  speedKph: atk.speed_kph,
  throttlePct: atk.throttle_pct,
  brakePct: atk.brake_pct,
})

const onTrackPasses = scenario.decision_points.filter((point) => point.on_track_pass)
const excludedPasses = scenario.decision_points.filter((point) => !point.on_track_pass)

// Open on the approach to the heaviest braking zone on the lap, which is the
// Turn 14 zone the pass was actually made into. Picking it by entry speed rather
// than by distance keeps this correct if the scenario is ever re-exported.
const passZone = derived.braking_zones.reduce(
  (best, zone) => (zone.entry_speed_kph > best.entry_speed_kph ? zone : best),
  derived.braking_zones[0],
)
const DEFAULT_FOCUS = Math.max(0, distance.findIndex((m) => m >= passZone.start_m - 110))

const SERIES = {
  speed: { primary: atk.speed_kph, secondary: def.speed_kph, max: 380, min: 0, unit: 'km/h' },
  gap: { primary: derived.gap_s, secondary: null, max: 1.4, min: -0.3, unit: 's' },
  throttle: { primary: atk.throttle_pct, secondary: def.throttle_pct, max: 100, min: 0, unit: '%' },
  brake: { primary: atk.brake_pct, secondary: def.brake_pct, max: 100, min: 0, unit: '%' },
  drs: { primary: atk.drs_active.map((active) => active ? 1 : 0), secondary: def.drs_active.map((active) => active ? 1 : 0), max: 1, min: 0, unit: '' },
  reserve: { primary: energy.reservePct, secondary: null, max: 100, min: 0, unit: '%' },
}

function Chart({ type = 'speed', focus }) {
  const width = 760
  const height = 205
  const pad = { x: 42, y: 20, r: 20, b: 30 }
  const { primary, secondary, min, max, unit } = SERIES[type]

  const path = useMemo(() => {
    const point = (v, i) =>
      `${pad.x + (i / lastIndex) * (width - pad.x - pad.r)},` +
      `${pad.y + (1 - (v - min) / (max - min)) * (height - pad.y - pad.b)}`
    return {
      primary: primary.map(point).join(' '),
      secondary: secondary ? secondary.map(point).join(' ') : null,
    }
  }, [type, primary, secondary, min, max])

  const markerX = pad.x + (focus / lastIndex) * (width - pad.x - pad.r)
  const markerY = pad.y + (1 - (primary[focus] - min) / (max - min)) * (height - pad.y - pad.b)

  return <div className="ov-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${type} trace for lap ${meta.focus_lap}`}>
      <g className="chart-grid">
        <line x1={pad.x} y1={pad.y} x2={width - pad.r} y2={pad.y} />
        <line x1={pad.x} y1={(height - pad.b) / 2} x2={width - pad.r} y2={(height - pad.b) / 2} />
        <line x1={pad.x} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} />
      </g>
      {path.secondary && <polyline className="chart-secondary" points={path.secondary} />}
      <polyline className="chart-primary" points={path.primary} />
      <line className="chart-marker" x1={markerX} y1={pad.y} x2={markerX} y2={height - pad.b} />
      <circle className="chart-marker-dot" cx={markerX} cy={markerY} r="5" />
    </svg>
    <div className="chart-axis">
      <span>{type === 'drs' ? 'OPEN' : `${max}${unit}`}</span>
      <span>{type === 'drs' ? '—' : `${((max + min) / 2).toFixed(unit === 's' ? 2 : 0)}${unit}`}</span>
      <span>{type === 'drs' ? 'CLOSED' : `${min}${unit}`}</span>
      <b>DISTANCE / {meta.lap_length_m.toLocaleString()} m</b>
    </div>
    <div className="chart-legend">
      <span><i className="line-real" /> {attacker.code} {attacker.name.toUpperCase()}</span>
      {secondary && <span><i className="line-reference" /> {defender.code} {defender.name.toUpperCase()}</span>}
      <em>● {Math.round(distance[focus]).toLocaleString()} m</em>
    </div>
  </div>
}

function LapHistoryChart({ driver, selectedLap }) {
  const width = 760
  const height = 205
  const pad = { x: 42, y: 20, r: 20, b: 30 }
  const rows = (driver.lap_history ?? []).filter((row) => row.lap_time_s != null)
  if (!rows.length) return <p className="ov-notes">No lap-time history was available for this driver.</p>
  const values = rows.map((row) => row.lap_time_s)
  const min = Math.min(...values) - 0.5
  const max = Math.max(...values) + 0.5
  const last = Math.max(rows.length - 1, 1)
  const point = (row, index) => `${pad.x + (index / last) * (width - pad.x - pad.r)},${pad.y + (1 - (row.lap_time_s - min) / (max - min)) * (height - pad.y - pad.b)}`
  const selectedIndex = Math.max(0, rows.findIndex((row) => row.lap === selectedLap))
  const selected = rows[selectedIndex] ?? rows[rows.length - 1]
  const selectedPoint = point(selected, selectedIndex)
  const [markerX, markerY] = selectedPoint.split(',')
  return <div className="ov-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${driver.code} lap time history`}>
      <g className="chart-grid">
        <line x1={pad.x} y1={pad.y} x2={width - pad.r} y2={pad.y} />
        <line x1={pad.x} y1={(height - pad.b) / 2} x2={width - pad.r} y2={(height - pad.b) / 2} />
        <line x1={pad.x} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} />
      </g>
      <polyline className="chart-primary" points={rows.map(point).join(' ')} />
      <line className="chart-marker" x1={markerX} y1={pad.y} x2={markerX} y2={height - pad.b} />
      <circle className="chart-marker-dot" cx={markerX} cy={markerY} r="5" />
    </svg>
    <div className="chart-axis"><span>{max.toFixed(1)}s</span><span>{((max + min) / 2).toFixed(1)}s</span><span>{min.toFixed(1)}s</span><b>LAP NUMBER / {driver.race_laps ?? rows.length}</b></div>
    <div className="chart-legend"><span><i className="line-real" /> {driver.code} REAL LAP TIMES</span><em>L{selected.lap} · {selected.lap_time_s.toFixed(3)}s · {selected.compound ?? 'TYRE N/A'}</em></div>
  </div>
}

function DataBadge({ children, tone = 'real' }) {
  return <span className={`data-badge ${tone}`}><i />{children}</span>
}

export function StrategyDashboard() {
  const [tab, setTab] = useState('STRATEGY')
  const focus = DEFAULT_FOCUS
  const [strategy, setStrategy] = useState('ATTACK')
  const [drsOverride, setDrsOverride] = useState(null)

  const gap = derived.gap_s[focus]
  const speed = atk.speed_kph[focus]
  const speedDelta = derived.speed_delta_kph[focus]
  const drsReal = atk.drs_active[focus]
  const drs = drsOverride === null ? drsReal : drsOverride
  const reserve = energy.reservePct[focus]

  const recovery = useMemo(
    () => recoveryAheadMj(derived.braking_zones, distance[focus], speed),
    [focus, speed],
  )
  const distanceToZone = recovery.nextZoneM === null ? null : recovery.nextZoneM - distance[focus]

  const decision = useMemo(
    () => recommend({
      gapS: gap,
      closingRateKph: speedDelta,
      drsActive: drs,
      reservePct: reserve,
      distanceToBrakingZoneM: distanceToZone,
    }),
    [gap, speedDelta, drs, reserve, distanceToZone],
  )
  const feasibility = feasibilityScore({ gapS: gap, closingRateKph: speedDelta, drsActive: drs, reservePct: reserve })
  const cost = attackCostMj()

  return <main className="ov-dashboard">
    <header className="ov-header">
      <div className="ov-brand"><span>✦</span><strong>PIT<em>WOLF</em></strong><small>RACE STRATEGY INTELLIGENCE</small></div>
      <div className="ov-header-center">
        <b>{meta.event_date.slice(0, 4)} {meta.event.toUpperCase()}</b>
        <span>{meta.session.toUpperCase()} / LAP {meta.focus_lap} OF {meta.total_laps} / {meta.circuit.toUpperCase()}</span>
      </div>
      <div className="ov-header-right"><DataBadge tone="real">FASTF1 {meta.fastf1_version}</DataBadge><button className="ov-menu">☰</button></div>
    </header>

    <section className="ov-toolbar">
      <div className="ov-select"><span>ATTACKER</span><b>{attacker.name.toUpperCase()}</b><i>{attacker.team}</i></div>
      <div className="ov-select"><span>DEFENDER</span><b>{defender.name.toUpperCase()}</b><i>{defender.team}</i></div>
      <div className="ov-select"><span>SCENARIO</span><b>{meta.title.toUpperCase()}</b><i>P{defender.finish_position} → P{attacker.finish_position}</i></div>
      <div className="ov-toolbar-note"><span>SOURCE</span><b>{meta.source.toUpperCase()}</b></div>
    </section>

    <nav className="ov-tabs">
      {tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      <span className="ov-tab-caveat">Cached {meta.event_date} session · every value labelled by source</span>
    </nav>

    <section className="ov-content">
      <div className="ov-title-row">
        <div>
          <p className="ov-eyebrow">SCENARIO ANALYSIS / {tab}</p>
          <h1>Should we spend<br /><em>energy here?</em></h1>
        </div>
        <div className="ov-scenario-summary">
          <DataBadge tone="real">REAL RACE CONTEXT</DataBadge>
          <strong>{attacker.code} <span>vs</span> {defender.code}</strong>
          <p>Lap {meta.focus_lap} · {meta.lap_length_m.toLocaleString()} m · {meta.circuit}</p>
        </div>
      </div>

      {tab === 'STRATEGY' && <>
        <div className="ov-alert">
          <span>◆</span>
          <div>
            <b>{decision.recommendation === 'SAVE' ? 'NO WINDOW AT THIS POINT' : 'DECISION WINDOW OPEN'}</b>
            <p>{decision.reason}</p>
          </div>
          <strong>{decision.recommendation} RECOMMENDED</strong>
        </div>

        <div className="ov-main-grid">
          <section className="ov-panel ov-chart-panel">
            <div className="ov-panel-head"><span>SPEED / {attacker.code} vs {defender.code}</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
            <Chart type="speed" focus={focus} />
            <div className="ov-panel-head second"><span>GAP TO CAR AHEAD</span><DataBadge tone="derived">DERIVED</DataBadge></div>
            <Chart type="gap" focus={focus} />
            <div className="ov-panel-head second"><span>RACE LAP TIMES / ALL LAPS</span><DataBadge tone="real">REAL TIMING</DataBadge></div>
            <LapHistoryChart driver={attackerRace} selectedLap={meta.focus_lap} />
          </section>

          <aside className="ov-panel ov-energy-panel">
            <div className="ov-panel-head"><span>RACE DATA SNAPSHOT</span><DataBadge tone="real">REAL FASTF1</DataBadge></div>
            <div className="ov-big-metric">
              <span>{attacker.code} FASTEST RACE LAP</span>
              <strong>{attackerRace.fastest_lap?.lap_time_s?.toFixed(3) ?? '—'}<small>s</small></strong>
              <p>Lap {attackerRace.fastest_lap?.lap ?? '—'} · {attackerRace.fastest_lap?.compound ?? 'TYRE N/A'} · tyre life {attackerRace.fastest_lap?.tyre_life ?? '—'} laps.</p>
            </div>
            <div className="ov-energy-rows">
              <div><span>FOCUS LAP / {attacker.code}</span><b>{attackerFocusLap?.lap_time_s?.toFixed(3) ?? '—'}s</b><em>{attackerFocusLap?.compound ?? 'TYRE N/A'} · {attackerFocusLap?.tyre_life ?? '—'}L</em></div>
              <div><span>FOCUS LAP / {defender.code}</span><b>{defenderFocusLap?.lap_time_s?.toFixed(3) ?? '—'}s</b><em>{defenderFocusLap?.compound ?? 'TYRE N/A'} · {defenderFocusLap?.tyre_life ?? '—'}L</em></div>
              <div><span>DRS TELEMETRY</span><b>{attackerRace.telemetry_summary?.drs_active_pct?.toFixed(1) ?? '—'}%</b><em>{attackerRace.telemetry_summary?.samples?.toLocaleString() ?? '—'} SAMPLES</em></div>
            </div>
            <div className="ov-assumption">
              ENERGY DATA LIMITATION
              <p>FastF1 does not expose team battery SOC, MGU-K deployment, or boost-button state. The separate energy tab is an explicitly modelled proxy, never measured telemetry.</p>
            </div>
          </aside>
        </div>

        <div className="ov-strategy-row">
          <div className="ov-section-label"><span>COUNTERFACTUALS</span><b>COMPARE THE CHOICES</b></div>
          <div className="ov-strategy-cards">
            {Object.entries(STRATEGIES).map(([name, data]) => <button
              key={name}
              className={`ov-strategy-card ${strategy === name ? 'selected' : ''}`}
              style={{ '--strategy-color': data.color }}
              onClick={() => setStrategy(name)}
            >
              <span>{decision.recommendation === name ? '★ ENGINE RECOMMENDS' : 'SCENARIO'}</span>
              <strong>{name}</strong>
              <p>{data.text}</p>
              <div>
                <b>{name === 'ATTACK' ? `${feasibility}%` : name === 'DELAY' ? `${Math.max(0, feasibility - 12)}%` : '—'}</b>
                <small>PASS CHANCE · DERIVED</small>
                <b>{name === 'ATTACK' ? `${cost.toFixed(2)} MJ` : name === 'DELAY' ? `${(cost * 0.6).toFixed(2)} MJ` : '0.00 MJ'}</b>
                <small>ENERGY COST · MODELLED</small>
              </div>
            </button>)}
          </div>
        </div>
      </>}

      {tab === 'TRACK' && <div className="ov-track-layout">
        <article className="ov-panel ov-track-card">
          <div className="ov-panel-head">
            <span>{meta.circuit.toUpperCase()} / FIXED FOCUS LAP</span>
            <DataBadge tone="real">REAL GPS</DataBadge>
          </div>
          <CircuitMap attacker={atk} defender={def} focus={focus} circuitName={meta.circuit} passIndex={DEFAULT_FOCUS} />
          <div className="ov-track-readout">
            <b>{formatLapTime(atk.elapsed_s[focus])}</b>
            <span>ACTUAL LAP {meta.focus_lap} · {attacker.code} {speed.toFixed(0)} km/h</span>
          </div>
          <div className="chart-legend">
            <span><i className="line-real" /> {attacker.code} ATTACKER</span>
            <span><i className="line-reference" /> {defender.code} DEFENDER</span>
            <em>GAP {gap >= 0 ? '+' : ''}{gap.toFixed(3)}s</em>
          </div>
        </article>

        <aside className="ov-panel ov-timeline-panel">
          <div className="ov-panel-head"><span>LAP TIMELINE</span><DataBadge tone="real">SECTOR TIMES</DataBadge></div>
          <div className="ov-timeline-line"><i style={{ height: `${(focus / lastIndex) * 100}%` }} /></div>
          <ol>
            {[
              { label: 'GRID EXIT', index: 0, value: '00:00' },
              { label: 'S1', index: scenario.timing.markers.find((m) => m.label === 'S1')?.index ?? 0, value: `${scenario.timing.attacker.sector_1_s.toFixed(3)}s` },
              { label: 'S2', index: scenario.timing.markers.find((m) => m.label === 'S2')?.index ?? 0, value: `${scenario.timing.attacker.sector_2_s.toFixed(3)}s` },
              { label: 'TURN 14', index: DEFAULT_FOCUS, value: `${Math.round(distance[DEFAULT_FOCUS]).toLocaleString()} m` },
              { label: 'FINISH', index: lastIndex, value: formatLapTime(scenario.timing.attacker.lap_time_s) },
            ].map((item) => <li key={item.label} className={focus >= item.index ? 'is-passed' : ''}>
              <span>{item.label}</span><b>{item.value}</b>
            </li>)}
          </ol>
          <div className="ov-pit-extra">
            <span>PIT EXTRA TIMING</span>
            {scenario.pit_extras.map((pit) => <div key={`${pit.driver}-${pit.in_lap}`}>
              <b>{pit.driver}</b>
              <em>L{pit.in_lap}→{pit.out_lap}</em>
              <strong>{pit.stationary_s.toFixed(3)}s</strong>
              <small>{pit.compound_in} → {pit.compound_out}</small>
            </div>)}
            <p>Stationary time from official pit-in to pit-out. Laps 22 and 27 position swaps were excluded as these pit cycles.</p>
          </div>
          <div className="ov-pit-extra">
            <span>TYRE STINTS / REAL TIMING</span>
            {[attackerRace, defenderRace].map((driver) => <div key={driver.code}>
              <b>{driver.code}</b>
              <em>{(driver.tyre_stints ?? []).map((stint) => `${stint.compound} L${stint.lap_start}–${stint.lap_end}`).join(' · ') || 'N/A'}</em>
            </div>)}
            {scenario.weather_summary?.available && <p>Weather: track {scenario.weather_summary.ranges.track_temp_c.min}–{scenario.weather_summary.ranges.track_temp_c.max}°C · air {scenario.weather_summary.ranges.air_temp_c.min}–{scenario.weather_summary.ranges.air_temp_c.max}°C.</p>}
          </div>
        </aside>
      </div>}

      {tab === 'TELEMETRY' && <div className="ov-tab-grid">
        <section className="ov-panel ov-chart-panel">
          <div className="ov-panel-head"><span>SPEED COMPARISON</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
          <Chart type="speed" focus={focus} />
          <div className="ov-panel-head second"><span>THROTTLE APPLICATION</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
          <Chart type="throttle" focus={focus} />
          <div className="ov-panel-head second"><span>DRS STATE / TELEMETRY SAMPLES</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
          <Chart type="drs" focus={focus} />
        </section>
        <section className="ov-panel ov-chart-panel">
          <div className="ov-panel-head"><span>BRAKE APPLICATION</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
          <Chart type="brake" focus={focus} />
          <div className="ov-panel-head second"><span>MEASURED AT THIS POINT</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
          <div className="ov-factor-panel">
            {[
              ['Speed', `${speed.toFixed(0)} km/h`, 'real'],
              ['Gear', `${atk.gear[focus]}`, 'real'],
              ['RPM', atk.rpm[focus].toLocaleString(), 'real'],
              ['DRS flap', drsReal ? 'OPEN' : 'CLOSED', 'real'],
              ['Speed delta', `${speedDelta >= 0 ? '+' : ''}${speedDelta.toFixed(1)} km/h`, 'derived'],
              ['Top speed this lap', `${derived.attacker_top_speed_kph} vs ${derived.defender_top_speed_kph} km/h`, 'real'],
              ['Telemetry samples', `${attackerRace.telemetry_summary?.samples?.toLocaleString() ?? '—'} / ${defenderRace.telemetry_summary?.samples?.toLocaleString() ?? '—'}`, 'real'],
            ].map(([label, value, tone]) => <div className="ov-factor" key={label}>
              <span>{label}</span><b className={tone === 'real' ? 'positive' : ''}>{value}</b>
            </div>)}
          </div>
        </section>
      </div>}

      {tab === 'ENERGY' && <div className="ov-tab-grid">
        <section className="ov-panel ov-energy-detail">
          <div className="ov-panel-head"><span>ENERGY PROXY / BRAKE + THROTTLE INPUTS</span><DataBadge tone="simulated">MODELLED</DataBadge></div>
          <Chart type="reserve" focus={focus} />
          <div className="ov-energy-list">
            <div><b>{derived.braking_zones.length}</b><span>BRAKING ZONES DETECTED</span><strong>DERIVED</strong></div>
            <div><b>{energy.recoveredMj[focus].toFixed(2)} MJ</b><span>RECOVERED BY THIS POINT</span><strong>MODELLED</strong></div>
            <div><b>{energy.deployedMj[focus].toFixed(2)} MJ</b><span>DEPLOYED BY THIS POINT</span><strong>MODELLED</strong></div>
          </div>
          <p className="ov-notes">No measured battery or ERS trace is included here: FastF1 publishes the inputs shown above, not team-specific state of charge or deployment.</p>
        </section>
        <section className="ov-panel ov-evidence">
          <div className="ov-panel-head"><span>ENERGY DATA AVAILABILITY</span><DataBadge tone="real">FASTF1 CHECK</DataBadge></div>
          <div className="ov-evidence-item"><i>00</i><div><b>Battery state of charge</b><p>Not exposed by FastF1 for this session. No measured value is displayed.</p></div><strong>NOT AVAILABLE</strong></div>
          <div className="ov-evidence-item"><i>00</i><div><b>MGU-K / boost deployment</b><p>Not exposed by FastF1. The model cannot claim when the driver pressed an overtake button.</p></div><strong>NOT AVAILABLE</strong></div>
          <div className="ov-evidence-item"><i>00</i><div><b>DRS flap state</b><p>Available from the real car telemetry and charted in the telemetry tab.</p></div><strong>AVAILABLE</strong></div>
          <div className="ov-panel-head second"><span>MODEL INPUTS / FOR PROXY ONLY</span><b>{ENERGY_MODEL_VERSION}</b></div>
          <div className="ov-evidence-item"><i>01</i><div><b>MGU-K power limit</b><p>Published regulation ceiling used for both deployment and recovery rate.</p></div><strong>{REGULATION.mguKMaxPowerKw} kW</strong></div>
          <div className="ov-evidence-item"><i>02</i><div><b>Recovery limit per lap</b><p>Caps how much the braking zones on this lap can return to the store.</p></div><strong>{REGULATION.mguKRecoveryLimitMjPerLap} MJ</strong></div>
          <div className="ov-evidence-item"><i>03</i><div><b>Store deployment limit per lap</b><p>Caps energy drawn from the battery. MGU-H supply to the MGU-K is not counted against it.</p></div><strong>{REGULATION.esDeploymentLimitMjPerLap} MJ</strong></div>
          <div className="ov-evidence-item calibrated"><i>04</i><div><b>MGU-H direct supply</b><p>Calibrated by us, not a regulation limit. Fitted so the lap stays energy-plausible.</p></div><strong>{CALIBRATION.mguHDirectSupplyKw} kW</strong></div>
          <div className="ov-evidence-item calibrated"><i>05</i><div><b>Assumed start reserve</b><p>The one unverifiable input. Set above neutral because Leclerc stated he recharged on the penultimate lap.</p></div><strong>{DEFAULT_START_RESERVE_PCT} %</strong></div>
        </section>
      </div>}

      {tab === 'OVERTAKE' && <div className="ov-overtake-layout">
        <section className="ov-panel ov-overtake-hero">
          <div className="ov-panel-head"><span>OVERTAKE WINDOW / REPLAY</span><DataBadge tone="derived">DERIVED SCORE</DataBadge></div>
          <strong>{feasibility}%</strong>
          <p>FEASIBILITY SCORE · REAL SPEED/GAP/DRS INPUTS</p>
          <div className="ov-meter large"><i style={{ width: `${feasibility}%` }} /></div>
          <div className="ov-risk">
            <span>ENGINE {DECISION_ENGINE_VERSION}</span>
            <b className={feasibility > 70 ? 'safe' : 'watch'}>{decision.recommendation}</b>
          </div>
          <button className="ov-play" onClick={() => setDrsOverride(drsOverride === null ? !drsReal : null)}>
            {drsOverride === null ? `COUNTERFACTUAL: FORCE DRS ${drsReal ? 'CLOSED' : 'OPEN'}` : `RESET TO REAL DRS (${drsReal ? 'OPEN' : 'CLOSED'})`}
          </button>
          <div className="ov-real-callout"><DataBadge tone="real">OBSERVED PASS</DataBadge><b>{onTrackPasses.length} on-track position changes</b><p>Race-control and classified-position changes are kept separate from pit-cycle swaps.</p></div>
        </section>
        <section className="ov-panel ov-factor-panel">
          <div className="ov-panel-head"><span>WHAT IS DRIVING THE RECOMMENDATION?</span><b>EXPLAINABLE</b></div>
          {decision.factors.map((factor) => <div className="ov-factor" key={factor.label}>
            <span>{factor.label} <DataBadge tone={factor.source}>{factor.source.toUpperCase()}</DataBadge></span>
            <b className={factor.tone}>{factor.value}</b>
            <i style={{ width: factor.tone === 'positive' ? '78%' : factor.tone === 'neutral' ? '55%' : '32%' }} />
            <em>{factor.note}</em>
          </div>)}
          <div className="ov-panel-head second"><span>OBSERVED PASS EVENTS</span><DataBadge tone="real">REAL RACE HISTORY</DataBadge></div>
          {onTrackPasses.slice(-4).map((point) => <div className="ov-factor" key={`pass-${point.lap}`}>
            <span>Lap {point.lap} · {point.gained_position} took the position from {point.lost_position}</span>
            <b className="positive">{point.gap_before_s?.toFixed(3) ?? '—'}s gap before</b>
            <em>{point.attacker_tyre.compound} {point.attacker_tyre.age_laps}L vs {point.defender_tyre.compound} {point.defender_tyre.age_laps}L</em>
          </div>)}
        </section>
      </div>}

      {tab === 'LEGENDS' && <div className="ov-legend-grid">
        <section className="ov-panel">
          <div className="ov-panel-head"><span>DATA PROVENANCE</span><b>READ THIS FIRST</b></div>
          <div className="ov-legend-item"><DataBadge tone="real">REAL</DataBadge><p>Loaded from FastF1 official timing and car telemetry: {meta.provenance.real.join(', ')}.</p></div>
          <div className="ov-legend-item"><DataBadge tone="derived">DERIVED</DataBadge><p>Calculated from those real values: {meta.provenance.derived.join(', ')}.</p></div>
          <div className="ov-legend-item"><DataBadge tone="simulated">SIMULATED</DataBadge><p>Produced by energy model {ENERGY_MODEL_VERSION}. ERS deployment and battery state of charge are not public and are never presented as measured team data.</p></div>
          <div className="ov-panel-head second"><span>SESSION COVERAGE</span><DataBadge tone="real">REAL FASTF1</DataBadge></div>
          <div className="ov-factor"><span>Weather samples</span><b className="positive">{scenario.weather_summary?.samples?.toLocaleString() ?? '—'}</b><em>Air, track, humidity, pressure and wind ranges included.</em></div>
          <div className="ov-factor"><span>Race-control messages</span><b className="positive">{scenario.race_control?.length ?? 0}</b><em>Flags, DRS notices, safety-car context and lap references where supplied.</em></div>
        </section>
        <section className="ov-panel">
          <div className="ov-panel-head"><span>FASTEST RACE LAPS</span><DataBadge tone="real">REAL TIMING</DataBadge></div>
          {(scenario.fastest_laps ?? []).slice(0, 5).map((lap, index) => <div className="ov-factor" key={`${lap.Driver}-${lap.LapNumber}`}>
            <span>#{index + 1} · {lap.Driver} · lap {lap.LapNumber}</span>
            <b className={lap.Driver === attacker.code ? 'positive' : ''}>{lap.LapTime?.toFixed?.(3) ?? '—'}s</b>
            <em>{lap.Compound ?? 'TYRE N/A'} · tyre life {lap.TyreLife ?? '—'} · speed FL {lap.SpeedFL ?? '—'} km/h</em>
          </div>)}
          <div className="ov-panel-head second"><span>DECISION POINTS IN THIS RACE</span><b>OBSERVABLE GROUND TRUTH</b></div>
          {onTrackPasses.map((point) => <div className="ov-factor" key={point.lap}>
            <span>Lap {point.lap} · {point.gained_position} took the position</span>
            <b className="positive">{point.gap_before_s}s before</b>
            <em>{point.attacker_tyre.compound} {point.attacker_tyre.age_laps}L vs {point.defender_tyre.compound} {point.defender_tyre.age_laps}L</em>
          </div>)}
          <p className="ov-notes">
            {excludedPasses.length} further position swaps (laps {excludedPasses.map((p) => p.lap).join(', ')}) were
            excluded as pit-stop cycles rather than on-track passes. Counting them would inflate the label set.
          </p>
          <p className="ov-notes">
            Scrub the lap to inspect any point. Every chart, metric and recommendation follows the selected distance.
          </p>
        </section>
      </div>}

    </section>

    <footer className="ov-footer">
      <span>PITWOLF / {meta.scenario_id}</span>
      <span>REAL TELEMETRY · DERIVED FEATURES · ENERGY MODEL {ENERGY_MODEL_VERSION} · ENGINE {DECISION_ENGINE_VERSION}</span>
    </footer>
  </main>
}
