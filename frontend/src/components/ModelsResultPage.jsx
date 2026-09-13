import React, { useEffect, useMemo, useState } from 'react'
import { fetchModelsResult } from '../lib/f1api'

const TEAMS = [
  { name: 'Ferrari', drivers: ['LEC', 'HAM'], color: '#e8002d' },
  { name: 'Mercedes', drivers: ['RUS', 'ANT'], color: '#27f4d2' },
  { name: 'McLaren', drivers: ['NOR', 'PIA'], color: '#ff8000' },
  { name: 'Red Bull', drivers: ['VER', 'HAD'], color: '#4781d7' },
]

const FEATURE_LABELS = {
  closingRateS: 'closing rate',
  leftPct: 'leftover %',
  gapS: 'gap',
  lapFraction: 'lap fraction',
  inOvertakeWindow: 'hunt window',
  inBattle: 'in battle',
  trackBrakes: 'track brakes',
  driverBattleAttackRate: 'driver battle attack',
  driverOvertakeAttackRate: 'driver hunt attack',
  driverOpenSaveRate: 'driver open save',
  driverHighLeftAttackRate: 'high leftover attack',
  driverLowLeftSaveRate: 'low leftover save',
  position: 'running order',
  modelledUsedMj: 'modelled used MJ',
  modelledLeftPct: 'modelled leftover',
  closeBattle: 'close battle',
  driverOvertakeRate: 'driver take rate',
  driverRecoverRate: 'driver recover',
  trackOvertakeRate: 'track take rate',
  inDrs: 'in 1.0s window',
  lapsInDrs: 'laps in window',
  driverEfficiency: 'driver convert %',
  typicalWaitLaps: 'typical wait',
  deltaToPrevS: 'delta to car ahead',
}

function pct(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${(Number(value) * 100).toFixed(digits)}%`
}

function num(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function featureLabel(key) {
  return FEATURE_LABELS[key] || key
}

function topImportances(map, limit = 8) {
  return Object.entries(map || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([name, value]) => ({ name, label: featureLabel(name), value: Number(value) }))
}

function ImportanceChart({ items, title }) {
  const width = 760
  const rowH = 26
  const pad = { l: 168, r: 48, t: 8, b: 8 }
  const height = pad.t + pad.b + items.length * rowH
  const max = Math.max(...items.map((item) => item.value), 0.001)
  return <div className="ov-chart dt-models-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {items.map((item, index) => {
        const y = pad.t + index * rowH
        const bar = ((width - pad.l - pad.r) * item.value) / max
        return <g key={item.name}>
          <text x={pad.l - 10} y={y + 14} textAnchor="end" className="dt-models-axis">{item.label}</text>
          <rect x={pad.l} y={y + 5} width={Math.max(bar, 2)} height={12} fill="#ff7043" opacity={0.85} />
          <text x={pad.l + bar + 8} y={y + 14} className="dt-models-axis dt-models-axis-value">{pct(item.value, 1)}</text>
        </g>
      })}
    </svg>
  </div>
}

function GroupedRateChart({ drivers, series }) {
  const width = 760
  const height = 230
  const pad = { x: 42, y: 18, r: 16, b: 36 }
  const bars = series || [
    { key: 'huntAttackRate', color: '#ff7043', label: 'HUNT ATTACK' },
    { key: 'u', color: '#63e6be', label: 'u TAKE RATE' },
    { key: 'convertRate', color: '#a9bfff', label: 'CONVERT %' },
  ]
  const inner = width - pad.x - pad.r
  const groupW = inner / Math.max(drivers.length, 1)
  const barW = groupW / (bars.length + 1)
  const plotH = height - pad.y - pad.b
  return <div className="ov-chart dt-models-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Works-eight hunt attack, take rate and convert rate">
      <g className="chart-grid">
        <line x1={pad.x} y1={pad.y} x2={width - pad.r} y2={pad.y} />
        <line x1={pad.x} y1={pad.y + plotH / 2} x2={width - pad.r} y2={pad.y + plotH / 2} />
        <line x1={pad.x} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} />
      </g>
      {drivers.map((row, index) => bars.map((item, slot) => {
        const value = Math.max(0, Math.min(1, Number(row[item.key]) || 0))
        const x = pad.x + index * groupW + slot * barW + barW * 0.35
        const h = value * plotH
        return <rect key={`${row.driver}-${item.key}`} x={x} y={height - pad.b - h} width={barW * 0.85} height={h} fill={item.color} opacity={0.9} />
      }))}
      {drivers.map((row, index) => (
        <text key={row.driver} x={pad.x + index * groupW + groupW / 2} y={height - 12} textAnchor="middle" className="dt-models-axis">{row.driver}</text>
      ))}
    </svg>
    <div className="chart-legend">
      {bars.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
    </div>
  </div>
}

function leadLabel(ahead) {
  if (ahead === true) return 'LEADS'
  if (ahead === false) return 'TRAILS'
  return '—'
}

function MaeChart({ candidates }) {
  const rows = Object.entries(candidates || {}).map(([name, metrics]) => ({
    name: name.replace('Regressor', ''),
    mae: Number(metrics.maeS),
    bias: Number(metrics.biasS),
  })).filter((row) => Number.isFinite(row.mae))
  if (!rows.length) return null
  const width = 760
  const height = 170
  const pad = { x: 48, y: 16, r: 24, b: 28 }
  const max = Math.max(...rows.map((row) => row.mae), 0.5) * 1.25
  const plotW = width - pad.x - pad.r
  const barW = plotW / (rows.length * 2)
  return <div className="ov-chart dt-models-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Held-out qualifying pace MAE">
      <g className="chart-grid">
        <line x1={pad.x} y1={pad.y} x2={width - pad.r} y2={pad.y} />
        <line x1={pad.x} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} />
      </g>
      {rows.map((row, index) => {
        const x = pad.x + plotW * ((index + 0.5) / rows.length) - barW / 2
        const h = (row.mae / max) * (height - pad.y - pad.b)
        return <g key={row.name}>
          <rect x={x} y={height - pad.b - h} width={barW} height={h} fill="#ff7043" />
          <text x={x + barW / 2} y={height - pad.b - h - 8} textAnchor="middle" className="dt-models-axis dt-models-axis-value">{row.mae.toFixed(3)}s</text>
          <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="dt-models-axis">{row.name}</text>
        </g>
      })}
    </svg>
  </div>
}

export function ModelsResultPage({ onOpenSimulation }) {
  const [report, setReport] = useState({ loading: true })
  const [raceRound, setRaceRound] = useState(1)
  const [openKey, setOpenKey] = useState(null)

  useEffect(() => {
    let live = true
    fetchModelsResult()
      .then((data) => { if (live) setReport({ data }) })
      .catch((error) => { if (live) setReport({ error: error.message }) })
    return () => { live = false }
  }, [])

  const data = report.data
  const races = data?.races ?? []
  const selected = useMemo(
    () => races.find((race) => Number(race.round) === Number(raceRound)) ?? races[0] ?? null,
    [races, raceRound],
  )
  const habitsImp = useMemo(() => topImportances(data?.habits?.model?.importances), [data])
  const overtakeImp = useMemo(() => topImportances(data?.recommend?.overtakeSoon?.importances), [data])
  const drivers = data?.drivers ?? []
  const raceDrivers = (selected?.drivers || []).map((row) => ({
    ...row,
    convertRate: row.jumpWindows ? (row.jumpWorked || 0) / row.jumpWindows : null,
    huntAttackRate: row.huntAttackRate,
    u: row.u,
  }))

  if (report.loading) {
    return <section className="ov-panel dt-models-page"><div className="lx-loading"><span className="lx-spinner" />LOADING MODELNEXT RESULTS…</div></section>
  }
  if (report.error) {
    return <section className="ov-panel dt-models-page"><p className="ov-notes">Model results are not ready: {report.error}</p></section>
  }

  const pace = data.qualifyingPace || {}
  const habits = data.habits
  const rec = data.recommend

  return <div className="dt-models-page">
    <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>MODELNEXT · TRAINED RESULTS</span><span className="data-badge derived"><i />RANDOM FOREST LIVE</span></div>
      <p className="ov-notes">{data.family} Ferrari LEC/HAM, Mercedes RUS/ANT, McLaren NOR/PIA, Red Bull VER/HAD. Every energy figure is modelled C5.2 leftover, not team battery.</p>
      <div className="dt-models-phases">
        {(data.phases || []).map((phase) => <article key={phase.id} className="dt-models-phase">
          <span>{phase.kind}</span>
          <b>{phase.title}</b>
          <em>{String(phase.status || '').replaceAll('_', ' ')}</em>
          <p>{phase.note}</p>
        </article>)}
      </div>
    </section>

    {races.length > 0 && <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>PER RACE · MODEL VS RECORDED</span><span className="data-badge real"><i />2026 JUMP + HABITS</span></div>
      <div className="dt-models-racebar">
        <label className="ov-select">
          <span>RACE</span>
          <select value={selected?.round || ''} onChange={(event) => { setRaceRound(Number(event.target.value)); setOpenKey(null) }}>
            {races.map((race) => <option key={race.round} value={race.round}>R{race.round} · {race.name}</option>)}
          </select>
        </label>
        <p className="ov-notes">{data.raceNote} Pick any completed 2026 race. After a take they keep attacking — we SAVE to cover and delay that re-pass. Success is more hold laps than the race. Major is a better pair result than the classified race.</p>
      </div>
      {selected && <>
        <div className="dt-validation-summary">
          <div><b>R{selected.round}</b><span>{String(selected.location || '').toUpperCase()}</span></div>
          <div><b>{pct(selected.jump?.rate)}</b><span>SUCCESS RATE</span></div>
          <div><b>{selected.jump?.worked ?? '—'} / {selected.jump?.windows ?? '—'}</b><span>SUCCESS · HELD LONGER</span></div>
          <div><b>{selected.jump?.major ?? '—'}</b><span>MAJOR · BETTER PAIR</span></div>
          <div><b>{pct(selected.agreement)}</b><span>FIRST-ACTION AGREE</span></div>
          <div><b>{selected.heldOutHabits ? 'YES' : 'NO'}</b><span>HABITS HOLD-OUT</span></div>
        </div>
        <GroupedRateChart
          drivers={raceDrivers}
          series={[
            { key: 'huntAttackRate', color: '#ff7043', label: 'THIS RACE HUNT' },
            { key: 'u', color: '#63e6be', label: 'u TAKE RATE' },
            { key: 'convertRate', color: '#a9bfff', label: 'JUMP WORKED' },
          ]}
        />
        <p className="ov-notes">Orange is this race’s hunt ATTACK share. Teal is season u. Blue is JUMP windows that held the pair longer. This GP is stripped from the habit features when the forest calls the lap.</p>
        <div className="dt-validation-head dt-models-race-driver-head"><span>DRIVER</span><span>HUNT ATTACK</span><span>SEASON HUNT</span><span>u</span><span>SUCCESS</span><span>MAJOR</span></div>
        <div className="dt-validation-list">
          {selected.drivers.map((row) => <div className="dt-validation-row dt-models-race-driver-row" key={row.driver}>
            <span>{row.driver}</span>
            <b>{pct(row.huntAttackRate)}{row.huntN != null ? ` · ${row.huntN}` : ''}</b>
            <span>{pct(row.seasonHuntAttackRate)}</span>
            <span>{pct(row.u, 1)}</span>
            <b className={(row.jumpWorked || 0) > 0 ? 'positive' : ''}>{row.jumpWindows ? `${row.jumpWorked || 0}/${row.jumpWindows}` : '—'}</b>
            <b className={(row.jumpMajor || 0) > 0 ? 'positive' : ''}>{row.jumpMajor ?? 0}</b>
          </div>)}
        </div>
        <div className="dt-models-pred-head">MODEL FIRST ACTION VS THE RACE</div>
        {(selected.predictions || []).length === 0 && <p className="ov-notes">No works-eight JUMP disagreement on this race.</p>}
        {(selected.predictions || []).map((item) => {
          const key = `${selected.round}:${item.driver}:${item.lap}:${item.opponent}`
          const open = openKey === key
          const delta = item.holdDelta
          return <article key={key} className={`dt-diff-case${open ? ' is-open' : ''}`}>
            <button type="button" className="dt-diff-case-head" onClick={() => setOpenKey(open ? null : key)}>
              <b>{item.driver} L{item.lap}</b>
              <span>{item.recordedAction || '—'} → {item.modelAction || '—'} · {item.role} {item.opponent}</span>
              <em className={item.major || item.worked ? 'positive' : ''}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} pair laps`}{item.major ? ' · MAJOR' : item.worked ? ' · SUCCESS' : ''}</em>
            </button>
            {open && <>
              {item.why && <p>{item.why}</p>}
              <div className="dt-diff-actions">
                <span>Recorded {item.recordedAction} · Model {item.modelAction}</span>
                {onOpenSimulation && <button type="button" onClick={() => onOpenSimulation({
                  year: selected.year || 2026,
                  round: selected.round,
                  session: 'Race',
                  driver: item.driver,
                  otherDriver: item.opponent,
                  lap: item.lap,
                  resultLap: item.lap,
                })}>SHOW ON TRACK ↗</button>}
              </div>
              {(item.recorded || []).length > 0 && <div className="dt-diff-laps">
                <div className="dt-diff-lap-head"><span>LAP</span><span>RECORDED</span><span>MODEL</span></div>
                {(item.recorded || []).map((row) => {
                  const mod = (item.model || []).find((step) => Number(step.lap) === Number(row.lap)) || {}
                  const changed = Boolean(row.ahead) !== Boolean(mod.ahead) || (row.action && mod.action && row.action !== mod.action)
                  return <div key={row.lap} className={`dt-diff-lap-row${changed ? ' is-diff' : ''}`}>
                    <span>L{row.lap}</span>
                    <span>{row.event || '—'} · {row.action || '—'} · {leadLabel(row.ahead)} · {row.leftPct ?? '—'}%</span>
                    <span>{mod.event || '—'} · {mod.action || '—'} · {leadLabel(mod.ahead)} · {mod.leftPct ?? '—'}%</span>
                  </div>
                })}
              </div>}
            </>}
          </article>
        })}
      </>}
    </section>}

    <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>PHASE 2 · QUALIFYING PACE</span><span className="data-badge derived"><i />{pace.selectedModel || 'RANDOM FOREST'}</span></div>
      <div className="dt-validation-summary">
        <div><b>{pace.selectedHeldOutMetrics?.maeS ?? '—'}s</b><span>HELD-OUT MAE</span></div>
        <div><b>{pace.selectedHeldOutMetrics?.biasS > 0 ? '+' : ''}{pace.selectedHeldOutMetrics?.biasS ?? '—'}s</b><span>BIAS</span></div>
        <div><b>{pace.evaluationRows ?? '—'}</b><span>CLEAN LAPS</span></div>
        <div><b>{String(pace.status || '').replaceAll('_', ' ')}</b><span>GATE</span></div>
        <div><b>NO</b><span>XGBOOST TRAINED</span></div>
      </div>
      <MaeChart candidates={pace.candidates} />
      <p className="ov-notes">How the graph is made: Ridge and RandomForestRegressor predict observed delta to the event pole on public telemetry. The last three completed 2026 qualifying rounds stay out of training. Lower MAE wins. {pace.source === 'ModelNext.md' ? 'These numbers are the ModelNext.md evaluation — the joblib is not in this cache.' : 'Metrics come from the saved qualifying_pace_report.'} Phase 3 XGBoost is not trained because it has not beaten this forest.</p>
    </section>

    {habits && <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>PHASE 6 · DRIVER ENERGY HABITS FOREST</span><span className="data-badge real"><i />2026 · THIS GP STRIPPED</span></div>
      <div className="dt-validation-summary">
        <div><b>{pct(habits.model?.testAccuracy)}</b><span>HOLD-OUT ACCURACY</span></div>
        <div><b>{habits.model?.samplesTest ?? '—'}</b><span>TEST LAPS</span></div>
        <div><b>{habits.energyRaces ?? '—'}</b><span>2026 RACES</span></div>
        <div><b>{pct(habits.aggressionGlobalRate, 1)}</b><span>GLOBAL u 2018–26</span></div>
        <div><b>{(habits.testRaces || []).map((race) => String(race).split('|')[1]).join(' · ') || '—'}</b><span>HELD-OUT RACES</span></div>
      </div>
      <ImportanceChart items={habitsImp} title="Driver energy habit feature importance" />
      <p className="ov-notes">How the graph is made: {habits.how}</p>
    </section>}

    {rec && <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>PHASE 6 · OVERTAKE SOON FOREST</span><span className="data-badge derived"><i />2018–2025 RACE HOLDOUT</span></div>
      <div className="dt-validation-summary">
        <div><b>{num(rec.overtakeSoon?.testAuc, 3)}</b><span>OVERTAKE AUC</span></div>
        <div><b>{num(rec.overtakeSoon?.testBrier, 3)}</b><span>BRIER</span></div>
        <div><b>{pct(rec.drs?.efficiency, 1)}</b><span>DRS CONVERT</span></div>
        <div><b>{num(rec.drs?.convertWithin1?.testAuc, 3)}</b><span>CONVERT-IN-1 AUC</span></div>
        <div><b>{num(rec.placesToFlag?.testMaePlaces, 2)}</b><span>PLACES-TO-FLAG MAE</span></div>
      </div>
      <ImportanceChart items={overtakeImp} title="Overtake-soon feature importance" />
      <p className="ov-notes">How the graph is made: {rec.how}</p>
    </section>}

    <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>WORKS EIGHT · DRIVER RANDOMNESS</span><span className="data-badge real"><i />HUNT · u · CONVERT</span></div>
      <div className="dt-diff-teams">
        {TEAMS.map((team) => <div key={team.name} className="dt-diff-team" style={{ '--team': team.color }}>
          <b>{team.name}</b>
          <span>{team.drivers.join(' · ')}</span>
        </div>)}
      </div>
      <GroupedRateChart drivers={drivers} />
      <p className="ov-notes">How the graph is made: orange is 2026 modelled ATTACK share inside a 1.0s hunt. Teal is u, the 2018–2026 rate of actually taking a place. Blue is historical convert % on those 1.0s windows. Three different questions — do not read them as one success rate.</p>
      <div className="dt-validation-head dt-models-driver-head"><span>DRIVER</span><span>TEAM</span><span>HUNT ATTACK</span><span>u TAKE</span><span>CONVERT</span><span>u LAPS</span></div>
      <div className="dt-validation-list">
        {drivers.map((row) => <div className="dt-validation-row dt-models-driver-row" key={row.driver}>
          <span>{row.driver}</span>
          <span>{row.team}</span>
          <b>{pct(row.huntAttackRate)}</b>
          <b>{pct(row.u, 1)}</b>
          <b>{pct(row.convertRate)}</b>
          <span>{row.uLaps?.toLocaleString?.() ?? '—'}</span>
        </div>)}
      </div>
    </section>
  </div>
}
