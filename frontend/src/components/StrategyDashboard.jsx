import React, { useEffect, useMemo, useRef, useState } from 'react'
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
const PLAYBACK_RATE = 4

const SERIES = {
  speed: { primary: atk.speed_kph, secondary: def.speed_kph, max: 380, min: 0, unit: 'km/h' },
  gap: { primary: derived.gap_s, secondary: null, max: 1.4, min: -0.3, unit: 's' },
  throttle: { primary: atk.throttle_pct, secondary: def.throttle_pct, max: 100, min: 0, unit: '%' },
  brake: { primary: atk.brake_pct, secondary: def.brake_pct, max: 100, min: 0, unit: '%' },
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
      <span>{max}{unit}</span>
      <span>{((max + min) / 2).toFixed(unit === 's' ? 2 : 0)}{unit}</span>
      <span>{min}{unit}</span>
      <b>DISTANCE / {meta.lap_length_m.toLocaleString()} m</b>
    </div>
    <div className="chart-legend">
      <span><i className="line-real" /> {attacker.code} {attacker.name.toUpperCase()}</span>
      {secondary && <span><i className="line-reference" /> {defender.code} {defender.name.toUpperCase()}</span>}
      <em>● {Math.round(distance[focus]).toLocaleString()} m</em>
    </div>
  </div>
}

function DataBadge({ children, tone = 'real' }) {
  return <span className={`data-badge ${tone}`}><i />{children}</span>
}

export function StrategyDashboard() {
  const [tab, setTab] = useState('STRATEGY')
  const [focus, setFocus] = useState(DEFAULT_FOCUS)
  const [playing, setPlaying] = useState(false)
  const [strategy, setStrategy] = useState('ATTACK')
  const [drsOverride, setDrsOverride] = useState(null)
  const focusRef = useRef(focus)
  focusRef.current = focus

  useEffect(() => {
    if (!playing) return undefined
    let frame
    let last = performance.now()
    const tick = (now) => {
      const dt = ((now - last) / 1000) * PLAYBACK_RATE
      last = now
      const current = focusRef.current
      const target = atk.elapsed_s[current] + dt
      if (target >= atk.elapsed_s[lastIndex]) {
        setFocus(lastIndex)
        setPlaying(false)
        return
      }
      let next = current
      while (next < lastIndex && atk.elapsed_s[next] < target) next += 1
      setFocus(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

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
          </section>

          <aside className="ov-panel ov-energy-panel">
            <div className="ov-panel-head"><span>ENERGY MODEL {ENERGY_MODEL_VERSION}</span><DataBadge tone="simulated">MODELLED</DataBadge></div>
            <div className="ov-big-metric">
              <span>ESTIMATED RESERVE</span>
              <strong>{Math.round(reserve)}<small>%</small></strong>
              <div className="ov-meter"><i style={{ width: `${reserve}%` }} /></div>
              <p>Integrated from real brake and throttle traces against published {REGULATION.season} regulation limits.</p>
            </div>
            <div className="ov-energy-rows">
              <div><span>RECOVERY AHEAD</span><b>{recovery.totalMj.toFixed(2)} MJ</b><em>{recovery.zones} ZONES LEFT</em></div>
              <div><span>ATTACK COST</span><b>{cost.toFixed(2)} MJ</b><em>3.2 SEC BURST</em></div>
              <div><span>STORE USED THIS LAP</span><b>{energy.deployedMj[focus].toFixed(2)} MJ</b><em>LIMIT {REGULATION.esDeploymentLimitMjPerLap} MJ</em></div>
            </div>
            <div className="ov-assumption">
              SIMULATION ASSUMPTION
              <p>Start-of-lap store assumed at {DEFAULT_START_RESERVE_PCT}%. Team battery state of charge is not public and is never presented as measured.</p>
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
                <small>PASS CHANCE</small>
                <b>{name === 'ATTACK' ? `${cost.toFixed(2)} MJ` : name === 'DELAY' ? `${(cost * 0.6).toFixed(2)} MJ` : '0.00 MJ'}</b>
                <small>ENERGY COST</small>
              </div>
            </button>)}
          </div>
        </div>
      </>}

      {tab === 'TRACK' && <div className="ov-track-layout">
        <article className="ov-panel ov-track-card">
          <div className="ov-panel-head">
            <span>{meta.circuit.toUpperCase()} / {playing ? 'LIVE RUN' : 'REPLAY'}</span>
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
        </aside>
      </div>}

      {tab === 'TELEMETRY' && <div className="ov-tab-grid">
        <section className="ov-panel ov-chart-panel">
          <div className="ov-panel-head"><span>SPEED COMPARISON</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
          <Chart type="speed" focus={focus} />
          <div className="ov-panel-head second"><span>THROTTLE APPLICATION</span><DataBadge tone="real">REAL TELEMETRY</DataBadge></div>
          <Chart type="throttle" focus={focus} />
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
            ].map(([label, value, tone]) => <div className="ov-factor" key={label}>
              <span>{label}</span><b className={tone === 'real' ? 'positive' : ''}>{value}</b>
            </div>)}
          </div>
        </section>
      </div>}

      {tab === 'ENERGY' && <div className="ov-tab-grid">
        <section className="ov-panel ov-energy-detail">
          <div className="ov-panel-head"><span>MODELLED RESERVE ACROSS THE LAP</span><DataBadge tone="simulated">MODELLED</DataBadge></div>
          <Chart type="reserve" focus={focus} />
          <div className="ov-energy-list">
            <div><b>{derived.braking_zones.length}</b><span>BRAKING ZONES DETECTED</span><strong>DERIVED</strong></div>
            <div><b>{energy.recoveredMj[focus].toFixed(2)} MJ</b><span>RECOVERED BY THIS POINT</span><strong>MODELLED</strong></div>
            <div><b>{energy.deployedMj[focus].toFixed(2)} MJ</b><span>DEPLOYED BY THIS POINT</span><strong>MODELLED</strong></div>
          </div>
        </section>
        <section className="ov-panel ov-evidence">
          <div className="ov-panel-head"><span>MODEL INPUTS</span><b>{ENERGY_MODEL_VERSION}</b></div>
          <div className="ov-evidence-item"><i>01</i><div><b>MGU-K power limit</b><p>Published regulation ceiling used for both deployment and recovery rate.</p></div><strong>{REGULATION.mguKMaxPowerKw} kW</strong></div>
          <div className="ov-evidence-item"><i>02</i><div><b>Recovery limit per lap</b><p>Caps how much the braking zones on this lap can return to the store.</p></div><strong>{REGULATION.mguKRecoveryLimitMjPerLap} MJ</strong></div>
          <div className="ov-evidence-item"><i>03</i><div><b>Store deployment limit per lap</b><p>Caps energy drawn from the battery. MGU-H supply to the MGU-K is not counted against it.</p></div><strong>{REGULATION.esDeploymentLimitMjPerLap} MJ</strong></div>
          <div className="ov-evidence-item calibrated"><i>04</i><div><b>MGU-H direct supply</b><p>Calibrated by us, not a regulation limit. Fitted so the lap stays energy-plausible.</p></div><strong>{CALIBRATION.mguHDirectSupplyKw} kW</strong></div>
          <div className="ov-evidence-item calibrated"><i>05</i><div><b>Assumed start reserve</b><p>The one unverifiable input. Set above neutral because Leclerc stated he recharged on the penultimate lap.</p></div><strong>{DEFAULT_START_RESERVE_PCT} %</strong></div>
        </section>
      </div>}

      {tab === 'OVERTAKE' && <div className="ov-overtake-layout">
        <section className="ov-panel ov-overtake-hero">
          <div className="ov-panel-head"><span>OVERTAKE WINDOW</span><DataBadge tone="derived">DERIVED SCORE</DataBadge></div>
          <strong>{feasibility}%</strong>
          <p>FEASIBILITY SCORE</p>
          <div className="ov-meter large"><i style={{ width: `${feasibility}%` }} /></div>
          <div className="ov-risk">
            <span>ENGINE {DECISION_ENGINE_VERSION}</span>
            <b className={feasibility > 70 ? 'safe' : 'watch'}>{decision.recommendation}</b>
          </div>
          <button className="ov-play" onClick={() => setDrsOverride(drsOverride === null ? !drsReal : null)}>
            {drsOverride === null ? `COUNTERFACTUAL: FORCE DRS ${drsReal ? 'CLOSED' : 'OPEN'}` : `RESET TO REAL DRS (${drsReal ? 'OPEN' : 'CLOSED'})`}
          </button>
        </section>
        <section className="ov-panel ov-factor-panel">
          <div className="ov-panel-head"><span>WHAT IS DRIVING THE RECOMMENDATION?</span><b>EXPLAINABLE</b></div>
          {decision.factors.map((factor) => <div className="ov-factor" key={factor.label}>
            <span>{factor.label} <DataBadge tone={factor.source}>{factor.source.toUpperCase()}</DataBadge></span>
            <b className={factor.tone}>{factor.value}</b>
            <i style={{ width: factor.tone === 'positive' ? '78%' : factor.tone === 'neutral' ? '55%' : '32%' }} />
            <em>{factor.note}</em>
          </div>)}
        </section>
      </div>}

      {tab === 'LEGENDS' && <div className="ov-legend-grid">
        <section className="ov-panel">
          <div className="ov-panel-head"><span>DATA PROVENANCE</span><b>READ THIS FIRST</b></div>
          <div className="ov-legend-item"><DataBadge tone="real">REAL</DataBadge><p>Loaded from FastF1 official timing and car telemetry: {meta.provenance.real.join(', ')}.</p></div>
          <div className="ov-legend-item"><DataBadge tone="derived">DERIVED</DataBadge><p>Calculated from those real values: {meta.provenance.derived.join(', ')}.</p></div>
          <div className="ov-legend-item"><DataBadge tone="simulated">SIMULATED</DataBadge><p>Produced by energy model {ENERGY_MODEL_VERSION}. ERS deployment and battery state of charge are not public and are never presented as measured team data.</p></div>
        </section>
        <section className="ov-panel">
          <div className="ov-panel-head"><span>DECISION POINTS IN THIS RACE</span><b>OBSERVABLE GROUND TRUTH</b></div>
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

      <div className="ov-scrubber">
        <div><span>LAP DISTANCE</span><b>{Math.round(distance[focus]).toLocaleString()} m</b><em> / {meta.lap_length_m.toLocaleString()} m</em></div>
        <input
          type="range"
          min="0"
          max={lastIndex}
          value={focus}
          onChange={(e) => {
            setPlaying(false)
            setFocus(Number(e.target.value))
          }}
        />
        <div className="ov-scrub-stops">
          <span>LAP START</span><span>DRS ZONE</span><span>TURN 14 BRAKING</span><span>FINISH</span>
        </div>
        <button
          className={`ov-play ${playing ? 'is-playing' : ''}`}
          onClick={() => {
            if (playing) {
              setPlaying(false)
              return
            }
            if (focus >= lastIndex) setFocus(0)
            setPlaying(true)
            if (tab !== 'TRACK') setTab('TRACK')
          }}
        >
          {playing ? '■ PAUSE' : '▶ START'}
        </button>
      </div>
    </section>

    <footer className="ov-footer">
      <span>PITWOLF / {meta.scenario_id}</span>
      <span>REAL TELEMETRY · DERIVED FEATURES · ENERGY MODEL {ENERGY_MODEL_VERSION} · ENGINE {DECISION_ENGINE_VERSION}</span>
    </footer>
  </main>
}
