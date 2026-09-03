import React, { useEffect, useMemo, useState } from 'react'
import {
  fetchEnergyRace,
  fetchDecisionPoints,
  fetchModelReport,
  fetchEvents,
  predictOvertake,
  STRATEGY_COLORS,
  STRATEGY_ORDER,
} from '../lib/f1api'

// ─── Shared helpers ──────────────────────────────────────────────────────────

const pct = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(d)}%`)
const mj = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(d)} MJ`)
const num = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d))

function Badge({ tone = 'real', children }) {
  return <span className={`data-badge ${tone}`}><i />{children}</span>
}

// Three-segment ATTACK/DELAY/SAVE probability bar.
function ProbBar({ probabilities, height = 7 }) {
  const total = STRATEGY_ORDER.reduce((s, k) => s + (probabilities?.[k] ?? 0), 0) || 1
  return <div className="dt-probbar" style={{ height }}>
    {STRATEGY_ORDER.map((k) => {
      const w = ((probabilities?.[k] ?? 0) / total) * 100
      return w > 0.4
        ? <i key={k} style={{ width: `${w}%`, background: STRATEGY_COLORS[k] }} title={`${k} ${w.toFixed(0)}%`} />
        : null
    })}
  </div>
}

function GatePill({ pass }) {
  return <b className={`dt-gate ${pass ? 'pass' : 'fail'}`}>{pass ? '✓ PASS' : '✗ FAIL'}</b>
}

// ─── Energy-aware recursive counterfactual tree ─────────────────────────────

const TREE_ACTIONS = ['ATTACK', 'SAVE', 'DELAY']
const TREE_CAPACITY_MJ = 4.0
const TREE_ENERGY = {
  ATTACK: { cost: 0.85, harvest: 0.05 },
  SAVE: { cost: 0.15, harvest: 0.35 },
  DELAY: { cost: 0.40, harvest: 0.15 },
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function buildSurrogateSoc(laps, rows, driver, totalLaps) {
  const explicit = new Map((laps ?? []).map((lap) => [Number(lap.lap), Number(lap.socEndMj)]))
  const events = rows.filter((row) => row.driver === driver || row.defender === driver)
  let soc = TREE_CAPACITY_MJ * 0.7
  const profile = {}
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    if (explicit.has(lap) && Number.isFinite(explicit.get(lap))) {
      soc = clamp(explicit.get(lap), 0, TREE_CAPACITY_MJ)
      profile[lap] = soc
      continue
    }
    const event = [...events].reverse().find((row) => row.lap <= lap) ?? events[0]
    const pace = clamp(0.5 + ((event?.speedDeltaKph ?? 0) / 40) + ((event?.closingRateS ?? 0) / 8), 0.15, 0.9)
    const tyreLoad = clamp(Math.abs(event?.tyreAgeDiff ?? 0) / 20, 0, 0.3)
    const deploy = 0.25 + (0.5 * pace) + tyreLoad
    const harvest = 0.22 + (0.24 * (1 - pace))
    soc = clamp(soc - deploy + harvest, 0, TREE_CAPACITY_MJ)
    if (event?.pitDistorted) soc = clamp(soc + 1.0, 0, TREE_CAPACITY_MJ)
    profile[lap] = soc
  }
  return profile
}

function treeActionProbability(action, row, reverseRow, ourSoc, defenderSoc, ahead) {
  const probabilities = row?.pred?.probabilities ?? {}
  const reverseProbabilities = reverseRow?.pred?.probabilities ?? {}
  const ownReserve = clamp(ourSoc / TREE_CAPACITY_MJ, 0, 1)
  const opponentReserve = clamp(defenderSoc / TREE_CAPACITY_MJ, 0, 1)
  if (!ahead) {
    const base = action === 'ATTACK'
      ? (probabilities.ATTACK ?? 0.2)
      : action === 'DELAY'
        ? (probabilities.DELAY ?? 0.25) * 0.72
        : (probabilities.SAVE ?? 0.55) * 0.08
    return clamp(base * (0.55 + (0.5 * ownReserve)) * (1.05 - (0.4 * opponentReserve)), 0.01, 0.98)
  }
  // Once ahead, the selected car is defending. The old defender becomes the
  // attacker and can spend whatever energy remains to reverse the pass.
  const opponentAttack = reverseProbabilities.ATTACK ?? probabilities.ATTACK ?? 0.25
  const response = opponentAttack * (0.45 + (0.65 * opponentReserve)) * (1.05 - (0.25 * ownReserve))
  const defensiveUse = action === 'ATTACK' ? 0.9 : action === 'DELAY' ? 0.68 : 0.48
  return clamp(1 - (response * defensiveUse), 0.02, 0.99)
}

function buildStrategyTree({ focus, rows, energyLaps, totalLaps, holdLaps = 6, finishPositions = {} }) {
  if (!focus) return null
  const startLap = Number(focus.lap)
  const horizon = Math.max(0, Math.min(holdLaps, totalLaps - startLap))
  const selected = focus.driver
  const initialDefender = focus.defender
  const ourProfile = buildSurrogateSoc(energyLaps, rows, selected, totalLaps)
  const defenderProfile = buildSurrogateSoc([], rows, initialDefender, totalLaps)
  let nodeCount = 0
  let leafCount = 0

  const rowAt = (lap, driver, defender) => rows.find((row) => row.lap === lap && row.driver === driver && row.defender === defender)

  const expand = (state, depth) => {
    nodeCount += 1
    if (depth >= horizon || state.lap >= totalLaps) {
      leafCount += 1
      return {
        value: (state.leadLaps * 100) + (state.aheadProbability * 20) + (state.ourSoc * 2),
        node: { lap: state.lap, role: state.ahead ? 'DEFENDING' : 'ATTACKING', leadLaps: state.leadLaps, aheadProbability: state.aheadProbability, children: [] },
      }
    }

    const lap = state.lap
    const forwardRow = rowAt(lap, selected, initialDefender) ?? focus
    const reverseRow = rowAt(lap, initialDefender, selected)
    const observed = state.ahead ? reverseRow : forwardRow
    const children = TREE_ACTIONS.map((action) => {
      const energy = TREE_ENERGY[action]
      let ourSoc = clamp(state.ourSoc - energy.cost + energy.harvest, 0, TREE_CAPACITY_MJ)
      let defenderSoc = clamp(state.defenderSoc - 0.2 + (state.ahead ? 0.08 : 0.22), 0, TREE_CAPACITY_MJ)
      const pitWindow = Boolean(observed?.pitDistorted)
      const pitPlan = pitWindow && action !== 'ATTACK' ? 'BOX / ENERGY RESET' : pitWindow ? 'STAY / ATTACK BEFORE BOX' : 'STAY OUT'
      if (pitWindow && action !== 'ATTACK') ourSoc = clamp(ourSoc + 1.0, 0, TREE_CAPACITY_MJ)
      const survival = treeActionProbability(action, forwardRow, reverseRow, ourSoc, defenderSoc, state.ahead)
      const nextAheadProbability = state.ahead
        ? state.aheadProbability * survival
        : state.aheadProbability + ((1 - state.aheadProbability) * survival)
      const leadLaps = state.leadLaps + nextAheadProbability
      const next = expand({
        lap: lap + 1,
        ahead: nextAheadProbability >= 0.5,
        aheadProbability: nextAheadProbability,
        leadLaps,
        ourSoc,
        defenderSoc,
      }, depth + 1)
      return {
        action,
        probability: survival,
        ourSoc,
        defenderSoc,
        pitPlan,
        result: next,
      }
    })
    const best = children.reduce((winner, child) => child.result.value > winner.result.value ? child : winner, children[0])
    return {
      value: best.result.value,
      node: {
        lap,
        role: state.ahead ? 'DEFENDING' : 'ATTACKING',
        leadLaps: state.leadLaps,
        aheadProbability: state.aheadProbability,
        ourSoc: state.ourSoc,
        defenderSoc: state.defenderSoc,
        bestAction: best.action,
        children: children.map((child) => ({
          action: child.action,
          probability: child.probability,
          leadLaps: child.result.node.leadLaps,
          ourSoc: child.ourSoc,
          defenderSoc: child.defenderSoc,
          pitPlan: child.pitPlan,
          best: child.action === best.action,
          next: child.result.node,
        })),
      },
    }
  }

  const initialOurSoc = ourProfile[startLap] ?? TREE_CAPACITY_MJ * 0.7
  const initialDefenderSoc = defenderProfile[startLap] ?? TREE_CAPACITY_MJ * 0.7
  const tree = expand({
    lap: startLap,
    ahead: false,
    aheadProbability: 0,
    leadLaps: 0,
    ourSoc: initialOurSoc,
    defenderSoc: initialDefenderSoc,
  }, 0)

  const path = []
  let cursor = tree.node
  while (cursor?.children?.length) {
    const best = cursor.children.find((child) => child.best) ?? cursor.children[0]
    path.push({ lap: cursor.lap, role: cursor.role, action: best.action, probability: best.probability, leadLaps: best.leadLaps, ourSoc: best.ourSoc, defenderSoc: best.defenderSoc, pitPlan: best.pitPlan })
    cursor = best.next
  }
  const actualLeadLaps = focus.held ? holdLaps : focus.passedNow ? 1 : 0
  return {
    tree: tree.node,
    path,
    nodeCount,
    leafCount,
    horizon,
    actualLeadLaps,
    expectedLeadLaps: path.length ? path[path.length - 1].leadLaps : 0,
    actualFinishPosition: finishPositions?.[selected] ?? null,
    success: path.length > 0 && path[path.length - 1].leadLaps > actualLeadLaps,
    selected,
    defender: initialDefender,
  }
}

function StrategyTreePanel({ tree }) {
  if (!tree) return null
  return <section className="ov-panel dt-tree-panel">
    <div className="ov-panel-head"><span>RECURSIVE STRATEGY TREE / 3 ACTIONS PER LAP</span><Badge tone="derived">{tree.nodeCount.toLocaleString()} NODES</Badge></div>
    <div className="dt-tree-summary">
      <div><b>{tree.expectedLeadLaps.toFixed(1)}</b><span>EXPECTED LAPS AHEAD</span></div>
      <div><b>{tree.actualLeadLaps}</b><span>ACTUAL LABEL HORIZON</span></div>
      <div><b>{tree.actualFinishPosition ? `P${tree.actualFinishPosition}` : '—'}</b><span>REAL FINISH POSITION</span></div>
      <div><b className={tree.success ? 'positive' : ''}>{tree.success ? 'BETTER' : 'NOT YET'}</b><span>COUNTERFACTUAL RESULT</span></div>
    </div>
    <div className="dt-tree-path">
      {tree.path.map((step) => <div className="dt-tree-step" key={`${step.lap}-${step.action}`}>
        <span>L{step.lap}</span><b className={step.action === 'ATTACK' ? 'tree-attack' : step.action === 'SAVE' ? 'tree-save' : 'tree-delay'}>{step.action}</b>
        <em>{step.role} · {Math.round(step.probability * 100)}% · lead {step.leadLaps.toFixed(1)}L · {step.pitPlan} · SoC {step.ourSoc.toFixed(2)} / defender {step.defenderSoc.toFixed(2)} MJ</em>
      </div>)}
    </div>
    <p className="ov-notes">Every node evaluates ATTACK, SAVE, and DELAY. After a pass, the selected driver becomes the defender and the opponent’s remaining energy drives the repass risk. The tree optimizes continuous laps ahead over the {tree.horizon}-lap persistence horizon; energy values are modelled surrogates, not measured battery telemetry.</p>
  </section>
}

// ─── Race / driver selector ──────────────────────────────────────────────────

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]
const ROUNDS = Array.from({ length: 24 }, (_, i) => i + 1)

export function RaceSelector({ sel, onChange, drivers, events }) {
  const set = (patch) => onChange({ ...sel, ...patch })
  // Prefer real race names from the decision-point cache; fall back to bare
  // round codes only while the list loads or a season has no extracted data.
  const rounds = events?.length ? events : ROUNDS.map((r) => ({ round: r, name: null }))
  const hasCurrent = rounds.some((e) => Number(e.round) === Number(sel.round))
  return <div className="ov-toolbar dt-selector">
    <label className="ov-select"><span>SEASON</span>
      <select value={sel.year} onChange={(e) => set({ year: Number(e.target.value) })}>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
    <label className="ov-select"><span>ROUND</span>
      <select value={sel.round} onChange={(e) => set({ round: Number(e.target.value) })}>
        {!hasCurrent && <option value={sel.round}>{`R${sel.round} (no data)`}</option>}
        {rounds.map((e) => <option key={e.round} value={e.round}>{e.name || `R${e.round}`}</option>)}
      </select>
    </label>
    <label className="ov-select"><span>SESSION</span>
      <select value={sel.session} onChange={(e) => set({ session: e.target.value })}>
        {['R', 'Q', 'P', 'S', 'FP1', 'FP2', 'FP3'].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
    <label className="ov-select"><span>DRIVER (ENERGY)</span>
      <select value={sel.driver} onChange={(e) => set({ driver: e.target.value })}>
        {(drivers?.length ? drivers : [sel.driver]).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </label>
    <div className="ov-toolbar-note"><span>DATA</span><b>168 RACES EXTRACTED</b></div>
  </div>
}

// ─── Data hook: decision points + ML predictions + energy race ───────────────

export function useRaceEngine(sel) {
  const [decision, setDecision] = useState({ loading: true })
  const [energy, setEnergy] = useState({ loading: true })
  const [preds, setPreds] = useState(null)
  const [report, setReport] = useState(null)
  const [events, setEvents] = useState([])

  useEffect(() => {
    let live = true
    fetchModelReport().then((r) => { if (live) setReport(r) }).catch(() => { if (live) setReport(null) })
    return () => { live = false }
  }, [])

  // Round -> race-name list for the season, read from the cache (instant).
  useEffect(() => {
    let live = true
    setEvents([])
    fetchEvents(sel.year)
      .then((list) => { if (live) setEvents(list) })
      .catch(() => { if (live) setEvents([]) })
    return () => { live = false }
  }, [sel.year])

  // Decision points (instant, cached) — also yields the driver list.
  useEffect(() => {
    let live = true
    setDecision({ loading: true })
    setPreds(null)
    fetchDecisionPoints(sel.year, sel.round, sel.session)
      .then((dp) => { if (live) setDecision({ data: dp }) })
      .catch((e) => { if (live) setDecision({ error: e.message }) })
    return () => { live = false }
  }, [sel.year, sel.round, sel.session])

  // Score every decision point with the RandomForest once they arrive.
  useEffect(() => {
    const rows = decision.data?.rows
    if (!rows?.length) return
    let live = true
    predictOvertake(rows)
      .then((p) => { if (live) setPreds(p.predictions) })
      .catch(() => { if (live) setPreds(null) })
    return () => { live = false }
  }, [decision.data])

  // Energy race (slow on first fetch, then cached).
  useEffect(() => {
    if (!sel.driver) return
    let live = true
    setEnergy({ loading: true })
    fetchEnergyRace(sel.year, sel.round, sel.session, sel.driver)
      .then((d) => { if (live) setEnergy({ data: d }) })
      .catch((e) => { if (live) setEnergy({ error: e.message }) })
    return () => { live = false }
  }, [sel.year, sel.round, sel.session, sel.driver])

  const drivers = useMemo(() => {
    const rows = decision.data?.rows ?? []
    const set = new Set()
    rows.forEach((r) => { if (r.driver) set.add(r.driver); if (r.defender) set.add(r.defender) })
    return [...set].sort()
  }, [decision.data])

  return { decision, energy, preds, drivers, report, events }
}

// ─── OVERTAKE tab ────────────────────────────────────────────────────────────

export function OvertakeTab({ sel, decision, preds, report }) {
  const dp = decision.data
  if (decision.loading) return <div className="lx-loading"><span className="lx-spinner" />LOADING DECISION POINTS</div>
  if (decision.error) return <p className="lx-empty">No decision points for {sel.year} R{sel.round} {sel.session}. {decision.error}</p>

  const rows = dp.rows ?? []
  const scored = rows.map((r, i) => ({ ...r, pred: preds?.[i] })).filter((r) => r.pred)
  const agree = scored.filter((r) => r.pred.label === r.label).length
  const accuracy = scored.length ? Math.round((agree / scored.length) * 100) : null
  const lc = dp.labelCounts ?? {}
  const total = rows.length || 1

  const trainYears = report?.temporalSplit?.trainYears ?? []
  const testYears = report?.temporalSplit?.testYears ?? []
  const holdAcc = report?.testAccuracy != null ? Math.round(report.testAccuracy * 100) : null
  const tc = report?.classCounts?.test ?? {}
  const tcTotal = Object.values(tc).reduce((a, b) => a + b, 0)
  const majKey = Object.keys(tc).reduce((m, k) => ((tc[k] ?? 0) > (tc[m] ?? -1) ? k : m), Object.keys(tc)[0] ?? 'SAVE')
  const baseline = tcTotal ? Math.round(((tc[majKey] ?? 0) / tcTotal) * 100) : null
  const inSample = trainYears.includes(sel.year)

  return <div className="dt-overtake">
    <section className="ov-panel">
      <div className="ov-panel-head"><span>DETECTED DECISION POINTS / {dp.eventName?.toUpperCase()}</span><Badge tone="derived">GAP + SPEED-TRAP</Badge></div>
      <div className="dt-bignum"><strong>{rows.length}</strong><span>BATTLES DETECTED · {dp.totalLaps} LAPS · MAX GAP {dp.maxGapThresholdS}s</span></div>
      <div className="dt-distbar">
        {STRATEGY_ORDER.map((k) => <i key={k} style={{ width: `${((lc[k] ?? 0) / total) * 100}%`, background: STRATEGY_COLORS[k] }} title={`${k}: ${lc[k] ?? 0}`} />)}
      </div>
      <div className="dt-distlegend">
        {STRATEGY_ORDER.map((k) => <span key={k}><i style={{ background: STRATEGY_COLORS[k] }} />{k} · {lc[k] ?? 0} ({Math.round(((lc[k] ?? 0) / total) * 100)}%)</span>)}
      </div>
      <div className="ov-panel-head second"><span>MODEL vs GROUND TRUTH (THIS RACE)</span><Badge tone="simulated">RANDOMFOREST</Badge></div>
      <div className="dt-accuracy">
        <b>{accuracy == null ? '—' : `${accuracy}%`}</b>
        <span>{agree} of {scored.length} decision points · predicted label matches the observed outcome</span>
      </div>
      <p className="ov-notes">Labels are modelled outcomes: ATTACK = pass made and held {dp.holdLaps} laps, DELAY = durable pass within {dp.holdLaps} laps, SAVE = no durable pass. Trained on {trainYears[0]}–{trainYears[trainYears.length - 1]}, validated on an unseen {testYears.join(', ')} holdout at {holdAcc == null ? '—' : `${holdAcc}%`} accuracy against a {baseline == null ? '—' : `${baseline}%`} always-{majKey} baseline. {inSample ? `Agreement above for ${sel.year} is in-sample (inside the training window); the ${testYears.join(', ')} holdout is the honest generalisation figure.` : `Agreement above for ${sel.year} is on the held-out season.`}</p>
    </section>

    <section className="ov-panel dt-dp-panel">
      <div className="ov-panel-head"><span>DECISION POINTS · MODEL PROBABILITIES</span><b>{scored.length} ROWS</b></div>
      <div className="dt-dp-head"><span>LAP</span><span>ATTACKER → DEFENDER</span><span>GAP</span><span>Δ SPD</span><span>MODEL</span><span>TRUTH</span></div>
      <div className="dt-dp-list">
        {scored.map((r, i) => {
          const hit = r.pred.label === r.label
          return <div className={`dt-dp-row ${hit ? 'hit' : 'miss'}`} key={`${r.lap}-${r.driver}-${r.defender}-${i}`}>
            <span className="dt-lap">L{r.lap}</span>
            <span className="dt-matchup"><b>{r.driver}</b>→{r.defender}<em>P{r.position}</em></span>
            <span className="dt-cell">{num(r.gapS, 2)}s</span>
            <span className="dt-cell">{r.speedDeltaKph == null ? '—' : `${r.speedDeltaKph > 0 ? '+' : ''}${r.speedDeltaKph}k`}</span>
            <span className="dt-model">
              <b style={{ color: STRATEGY_COLORS[r.pred.label] }}>{r.pred.label}</b>
              <ProbBar probabilities={r.pred.probabilities} height={5} />
            </span>
            <span className="dt-truth" style={{ color: STRATEGY_COLORS[r.label] }}>{r.label}</span>
          </div>
        })}
      </div>
    </section>
  </div>
}

// ─── ENERGY tab ──────────────────────────────────────────────────────────────

function SocChart({ laps }) {
  const width = 760, height = 190, pad = { x: 40, y: 18, r: 16, b: 26 }
  const window_ = 4.0
  const pts = laps.map((l, i) => {
    const x = pad.x + (i / Math.max(laps.length - 1, 1)) * (width - pad.x - pad.r)
    const y = pad.y + (1 - Math.min(l.socEndMj, window_) / window_) * (height - pad.y - pad.b)
    return `${x},${y}`
  })
  return <div className="ov-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Battery state of charge across the race">
      <g className="chart-grid">
        <line x1={pad.x} y1={pad.y} x2={width - pad.r} y2={pad.y} />
        <line x1={pad.x} y1={(height - pad.b) / 2} x2={width - pad.r} y2={(height - pad.b) / 2} />
        <line x1={pad.x} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} />
      </g>
      <polyline className="chart-primary" points={pts.join(' ')} />
    </svg>
    <div className="chart-axis"><span>{window_} MJ</span><span>2 MJ</span><span>0 MJ</span><b>BATTERY STATE OF CHARGE / LAP</b></div>
  </div>
}

function DeployHarvestChart({ laps }) {
  const width = 760, height = 170, pad = { x: 40, y: 16, r: 16, b: 24 }
  const maxV = Math.max(...laps.map((l) => Math.max(l.deployMj ?? 0, l.harvestMj ?? 0)), 1) * 1.1
  const bw = (width - pad.x - pad.r) / laps.length
  return <div className="ov-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Per-lap deployment vs harvest">
      {laps.map((l, i) => {
        const x = pad.x + i * bw
        const dh = ((l.deployMj ?? 0) / maxV) * (height - pad.y - pad.b)
        const hh = ((l.harvestMj ?? 0) / maxV) * (height - pad.y - pad.b)
        const base = height - pad.b
        return <g key={l.lap}>
          <rect x={x + bw * 0.12} y={base - dh} width={bw * 0.34} height={dh} fill="#ff7043" opacity="0.9" />
          <rect x={x + bw * 0.52} y={base - hh} width={bw * 0.34} height={hh} fill="#63e6be" opacity="0.85" />
        </g>
      })}
    </svg>
    <div className="chart-axis"><span>{maxV.toFixed(1)} MJ</span><span>—</span><span>0</span><b>DEPLOY (ORANGE) vs HARVEST (TEAL) / LAP</b></div>
  </div>
}

export function EnergyTab({ sel, energy }) {
  if (energy.loading) return <div className="lx-loading"><span className="lx-spinner" />COMPUTING 2026-REG ENERGY PROJECTION FOR {sel.driver}…</div>
  if (energy.error) return <p className="lx-empty">Energy projection failed for {sel.driver}: {energy.error}</p>
  const d = energy.data
  const laps = d.laps ?? []
  const g = d.gates ?? {}
  const za = g.zoneAlignment ?? {}, ce = g.ceilings ?? {}, ct = g.crossTrackConsistency ?? {}

  return <div className="dt-energy">
    <section className="ov-panel">
      <div className="ov-panel-head"><span>ENERGY PROJECTION / {d.driver} · {d.year} R{d.round}</span><Badge tone="simulated">MODELLED · 2026 REG PHYSICS</Badge></div>
      <div className="ov-energy-list">
        <div><b>{num(ct.meanDeployMjPerLap, 2)} MJ</b><span>DEPLOY / LAP</span><strong>ERS-K OUTPUT</strong></div>
        <div><b>{num(ct.meanHarvestMjPerLap, 2)} MJ</b><span>HARVEST / LAP</span><strong>REGEN UNDER BRAKING</strong></div>
        <div><b>{num(ct.meanFuelEnergyMjPerLap, 1)} MJ</b><span>FUEL ENERGY / LAP</span><strong>ICE BURN</strong></div>
      </div>
      <div className="ov-panel-head second"><span>BATTERY STATE OF CHARGE ACROSS THE RACE</span><Badge tone="simulated">4 MJ WINDOW</Badge></div>
      <SocChart laps={laps} />
      <div className="ov-panel-head second"><span>PER-LAP DEPLOY vs HARVEST</span><Badge tone="simulated">MODELLED</Badge></div>
      <DeployHarvestChart laps={laps} />
      <p className="ov-notes">Projected from real speed/throttle/brake telemetry under cited 2026 power-unit limits — never measured team data. Total clipping this race: {num(ct.totalClipSeconds, 1)} s.</p>
    </section>

    <section className="ov-panel dt-gates">
      <div className="ov-panel-head"><span>VALIDATION GATES</span><Badge tone="derived">PHYSICS SANITY</Badge></div>

      <div className="dt-gatecard">
        <div className="dt-gatehead"><b>01 · ZONE ALIGNMENT</b><GatePill pass={za.pass} /></div>
        <div className="dt-gaterow"><span>Deploy at full throttle</span><strong>{pct(za.deployAtFullThrottlePct, 1)}</strong></div>
        <div className="dt-gaterow"><span>Harvest above {num(za.highSpeedKph, 0)} km/h</span><strong>{pct(za.harvestAtHighSpeedPct, 1)}</strong></div>
        <p>{za.description}</p>
      </div>

      <div className="dt-gatecard">
        <div className="dt-gatehead"><b>02 · REGULATORY CEILINGS</b><GatePill pass={ce.pass} /></div>
        <div className="dt-gaterow"><span>Max harvest / lap (cap {ce.harvestCapMj} MJ)</span><strong>{mj(ce.maxHarvestPerLapMj)}</strong></div>
        <div className="dt-gaterow"><span>Max SoC swing (window {ce.socWindowMj} MJ)</span><strong>{mj(ce.maxSocSwingMj)}</strong></div>
        <p>{ce.description}</p>
      </div>

      <div className="dt-gatecard">
        <div className="dt-gatehead"><b>03 · CROSS-TRACK CONSISTENCY</b><Badge tone="derived">COMPARE ACROSS EVENTS</Badge></div>
        <div className="dt-gaterow"><span>Mean deploy / lap</span><strong>{mj(ct.meanDeployMjPerLap)}</strong></div>
        <div className="dt-gaterow"><span>Mean harvest / lap</span><strong>{mj(ct.meanHarvestMjPerLap)}</strong></div>
        <div className="dt-gaterow"><span>Mean fuel energy / lap</span><strong>{mj(ct.meanFuelEnergyMjPerLap, 1)}</strong></div>
        <p>{ct.description}</p>
      </div>

      <div className="ov-panel-head second"><span>REGULATION CITATIONS</span><Badge tone="real">FIA 2026</Badge></div>
      {Object.entries(d.citations ?? {}).map(([k, v]) => <div className="ov-factor" key={k}>
        <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span>
        <b className="positive">{v}</b>
      </div>)}
    </section>
  </div>
}

// ─── STRATEGY tab (fusion of energy + overtake) ──────────────────────────────

export function StrategyTab({ sel, decision, preds, energy }) {
  const dp = decision.data
  const rows = dp?.rows ?? []
  const allScored = rows.map((r, i) => ({ ...r, pred: preds?.[i] })).filter((r) => r.pred)
  const scored = allScored.filter((r) => r.driver === sel.driver)

  // Focus on the selected driver's most attack-favourable detected point.
  const [focusLap, setFocusLap] = useState(null)
  const focus = useMemo(() => {
    if (!scored.length) return null
    return scored.find((r) => r.lap === focusLap)
      ?? scored.reduce((best, r) => (r.pred.probabilities.ATTACK > best.pred.probabilities.ATTACK ? r : best), scored[0])
  }, [scored, focusLap])

  const eLaps = energy.data?.laps ?? []
  const eLap = focus ? eLaps.find((l) => l.lap === focus.lap) ?? eLaps[eLaps.length - 1] : null
  const socAvail = eLap?.socEndMj ?? null
  const deployHeadroom = socAvail == null ? null : Math.max(0, 4.0 - socAvail)
  const affordable = socAvail == null ? null : socAvail >= 1.0
  const tree = useMemo(() => buildStrategyTree({
    focus,
    rows: allScored,
    energyLaps: eLaps,
    totalLaps: dp?.totalLaps ?? 0,
    holdLaps: dp?.holdLaps ?? 6,
    finishPositions: dp?.finishPositions,
  }), [focus, allScored, eLaps, dp?.totalLaps, dp?.holdLaps, dp?.finishPositions])

  if (decision.loading) return <div className="lx-loading"><span className="lx-spinner" />BUILDING FUSED DECISION…</div>
  if (!focus) return <p className="lx-empty">No decision points detected for {sel.driver} in this race. Pick another driver or race above.</p>

  const p = focus.pred.probabilities
  const rec = focus.pred.label
  const energyReady = energy.data && !energy.loading

  return <div className="dt-strategy">
    <div className="ov-alert" style={{ borderLeftColor: STRATEGY_COLORS[rec], background: `${STRATEGY_COLORS[rec]}14` }}>
      <span style={{ color: STRATEGY_COLORS[rec] }}>◆</span>
      <div>
        <b>LAP {focus.lap} · {focus.driver} ON {focus.defender} · GAP {num(focus.gapS, 2)}s</b>
        <p>{rec === 'ATTACK' ? 'Model sees a durable pass here — commit energy.'
          : rec === 'DELAY' ? 'A pass lands within a few laps — hold and strike at the next zone.'
          : 'No durable pass at this cost — protect the battery.'}</p>
      </div>
      <strong style={{ color: STRATEGY_COLORS[rec] }}>{rec} RECOMMENDED</strong>
    </div>

    <div className="ov-main-grid">
      <section className="ov-panel">
        <div className="ov-panel-head"><span>OVERTAKE MODEL · CLASS PROBABILITIES</span><Badge tone="simulated">RANDOMFOREST</Badge></div>
        <div className="dt-recbig" style={{ color: STRATEGY_COLORS[rec] }}>{rec}<em>{pct(p[rec] * 100, 0)}</em></div>
        <ProbBar probabilities={p} height={12} />
        <div className="dt-problegend">
          {STRATEGY_ORDER.map((k) => <span key={k}><i style={{ background: STRATEGY_COLORS[k] }} />{k} {pct(p[k] * 100, 0)}</span>)}
        </div>
        <div className="ov-panel-head second"><span>WHAT THE MODEL SEES</span><b>FEATURES</b></div>
        <div className="ov-factor"><span>Gap to car ahead <Badge tone="derived">DERIVED</Badge></span><b className={focus.gapS <= 1 ? 'positive' : 'negative'}>{num(focus.gapS, 3)} s</b><em>{focus.gapS <= 1 ? 'inside DRS/override range' : 'outside range'}</em></div>
        <div className="ov-factor"><span>Speed-trap delta <Badge tone="real">REAL</Badge></span><b className={focus.speedDeltaKph > 0 ? 'positive' : 'negative'}>{focus.speedDeltaKph == null ? '—' : `${focus.speedDeltaKph > 0 ? '+' : ''}${focus.speedDeltaKph} km/h`}</b><em>attacker vs defender</em></div>
        <div className="ov-factor"><span>Closing rate <Badge tone="derived">DERIVED</Badge></span><b>{num(focus.closingRateS, 2)} s/lap</b><em>negative = gaining</em></div>
        <div className="ov-factor"><span>Tyre age differential <Badge tone="real">REAL</Badge></span><b>{num(focus.tyreAgeDiff, 0)} laps</b><em>{focus.attackerCompound} vs {focus.defenderCompound}</em></div>
        <div className="ov-factor"><span>Car mass <Badge tone="simulated">MODELLED</Badge></span><b>{focus.pred.mass ? `${focus.pred.mass.attackerKg} vs ${focus.pred.mass.defenderKg} kg` : '—'}</b><em>Δ {focus.pred.mass?.deltaKg ?? 0} kg · reg floor + tyres + 82 kg driver + fuel burn</em></div>
        <div className="ov-factor"><span>Observed outcome <Badge tone="real">GROUND TRUTH</Badge></span><b style={{ color: STRATEGY_COLORS[focus.label] }}>{focus.label}</b><em>{focus.passedNow ? 'passed on track' : 'no immediate pass'}{focus.held ? ' · held' : ''}</em></div>
      </section>

      <aside className="ov-panel">
        <div className="ov-panel-head"><span>ENERGY BUDGET AT LAP {focus.lap}</span><Badge tone="simulated">{energyReady ? 'MODELLED' : 'LOADING'}</Badge></div>
        {energyReady && eLap ? <>
          <div className="ov-big-metric">
            <span>BATTERY AVAILABLE</span>
            <strong style={{ color: affordable ? '#63e6be' : '#ff9b78' }}>{mj(socAvail)}</strong>
            <p>of a 4.0 MJ usable window · {eLap.compound ?? 'TYRE N/A'}{eLap.pit ? ' · PIT LAP' : ''}</p>
          </div>
          <div className="ov-energy-rows">
            <div><span>DEPLOY HEADROOM</span><b>{mj(deployHeadroom)}</b><em>BELOW WINDOW CAP</em></div>
            <div><span>THIS LAP DEPLOY</span><b>{mj(eLap.deployMj)}</b><em>ERS-K OUT</em></div>
            <div><span>THIS LAP HARVEST</span><b>{mj(eLap.harvestMj)}</b><em>REGEN IN</em></div>
            <div><span>CLIPPING</span><b>{num(eLap.clipSeconds, 1)} s</b><em>POWER LIMITED</em></div>
          </div>
          <div className={`ov-assumption ${affordable ? 'ok' : 'tight'}`}>
            {affordable ? 'ENERGY AFFORDABLE' : 'ENERGY TIGHT'}
            <p>{affordable
              ? `The battery holds ${mj(socAvail)} entering lap ${focus.lap}, enough to fund an ${rec} without breaching the 4 MJ window.`
              : `Only ${mj(socAvail)} available — an attack would clip. Favour SAVE/DELAY and harvest first.`}</p>
          </div>
        </> : <div className="lx-loading"><span className="lx-spinner" />LOADING ENERGY FOR {sel.driver}…</div>}
        <div className="ov-panel-head second"><span>FUSED VERDICT</span><Badge tone="derived">ENERGY × OVERTAKE</Badge></div>
        <p className="ov-notes">
          {rec === 'ATTACK' && affordable
            ? 'ATTACK: the model sees a durable pass and the battery can fund it. Commit at the next zone.'
            : rec === 'ATTACK' && !affordable
            ? 'CAUTION: a pass is modelled but energy is tight — harvest this lap, then attack.'
            : rec === 'DELAY'
            ? 'DELAY: hold station, keep the battery topped, strike within the next few laps.'
            : 'SAVE: no durable pass here — protect the battery for a better window.'}
        </p>
      </aside>
    </div>

    <StrategyTreePanel tree={tree} />

    <div className="ov-strategy-row">
      <div className="ov-section-label"><span>{sel.driver} DECISION POINTS THIS RACE</span><b>SELECT A LAP TO INSPECT</b></div>
      <div className="dt-lapstrip">
        {scored.map((r) => <button
          key={`${r.lap}-${r.defender}`}
          className={`dt-lapchip ${focus.lap === r.lap ? 'active' : ''}`}
          style={{ '--c': STRATEGY_COLORS[r.pred.label] }}
          onClick={() => setFocusLap(r.lap)}
          title={`L${r.lap} vs ${r.defender} · ${r.pred.label} ${(r.pred.probabilities[r.pred.label] * 100).toFixed(0)}%`}
        >L{r.lap}<i>{r.pred.label[0]}</i></button>)}
      </div>
    </div>
  </div>
}
