import React, { useEffect, useMemo, useState } from 'react'
import { fetchModelDiff } from '../lib/f1api'

const TEAMS = [
  { name: 'Ferrari', drivers: ['LEC', 'HAM'], color: '#e8002d' },
  { name: 'Mercedes', drivers: ['RUS', 'ANT'], color: '#27f4d2' },
  { name: 'McLaren', drivers: ['NOR', 'PIA'], color: '#ff8000' },
  { name: 'Red Bull', drivers: ['VER', 'HAD'], color: '#4781d7' },
]

function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value) * 100)}%`
}

function leadLabel(ahead) {
  if (ahead === true) return 'LEADS'
  if (ahead === false) return 'TRAILS'
  return '—'
}

function gradeLabel(item) {
  if (item.major) return 'MAJOR'
  if (item.worked) return 'SUCCESS'
  return ''
}

export function DiffResultPage({ onOpenSimulation }) {
  const [report, setReport] = useState({ loading: true })
  const [raceRound, setRaceRound] = useState(1)
  const [openKey, setOpenKey] = useState(null)

  useEffect(() => {
    let live = true
    fetchModelDiff()
      .then((data) => { if (live) setReport({ data }) })
      .catch((error) => { if (live) setReport({ error: error.message }) })
    return () => { live = false }
  }, [])

  const races = report.data?.races ?? []
  const overall = report.data?.overall ?? {}
  const selected = useMemo(
    () => races.find((race) => Number(race.round) === Number(raceRound)) ?? races[0] ?? null,
    [races, raceRound],
  )

  const seasonDrivers = useMemo(() => {
    const out = {}
    races.forEach((race) => {
      Object.entries(race.stats?.byDriver || {}).forEach(([code, row]) => {
        const bucket = out[code] || { driver: code, team: row.team, windows: 0, worked: 0, major: 0 }
        bucket.windows += Number(row.windows) || 0
        bucket.worked += Number(row.worked) || 0
        bucket.major += Number(row.major) || 0
        out[code] = bucket
      })
    })
    return TEAMS.flatMap((team) => team.drivers.map((code) => out[code] || { driver: code, team: team.name, windows: 0, worked: 0, major: 0 }))
  }, [races])

  const circuitDrivers = useMemo(() => {
    const stats = selected?.stats?.byDriver || {}
    return TEAMS.flatMap((team) => team.drivers.map((code) => {
      const row = stats[code] || {}
      return {
        driver: code,
        team: team.name,
        windows: Number(row.windows) || 0,
        worked: Number(row.worked) || 0,
        major: Number(row.major) || 0,
      }
    }))
  }, [selected])

  const pickCircuit = (round) => {
    setRaceRound(Number(round))
    setOpenKey(null)
  }

  if (report.loading) {
    return <section className="ov-panel dt-diff-page"><div className="lx-loading"><span className="lx-spinner" />LOADING 2026 MODEL VS RACE DIFFS…</div></section>
  }
  if (report.error) {
    return <section className="ov-panel dt-diff-page"><p className="ov-notes">Diff results are not ready: {report.error}</p></section>
  }

  return <div className="dt-diff-page">
    <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>MODEL VS RACE · 2026 WORKS EIGHT</span><span className="data-badge derived"><i />CONSTRUCTED C5.2</span></div>
      <p className="ov-notes">Ferrari LEC/HAM, Mercedes RUS/ANT, McLaren NOR/PIA, Red Bull VER/HAD. Pick a circuit. Success is more pair-ahead laps than that race — that is enough. Major is still holding the place when the classified pair did not. After a take they keep attacking; we SAVE to delay that re-pass. Two cars only. Not team battery.</p>
      <div className="dt-validation-summary">
        <div><b>{pct(overall.rate)}</b><span>SEASON SUCCESS RATE</span></div>
        <div><b>{overall.worked ?? '—'}</b><span>SUCCESS · HELD LONGER</span></div>
        <div><b>{overall.major ?? '—'}</b><span>MAJOR · BETTER PAIR RESULT</span></div>
        <div><b>{overall.windows ?? '—'}</b><span>HUNT WINDOWS SCORED</span></div>
        <div><b>{races.length}</b><span>CIRCUITS</span></div>
      </div>
      <div className="dt-diff-teams">
        {TEAMS.map((team) => <div key={team.name} className="dt-diff-team" style={{ '--team': team.color }}>
          <b>{team.name}</b>
          <span>{team.drivers.join(' · ')}</span>
        </div>)}
      </div>
    </section>

    <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>CIRCUIT</span><span className="data-badge real"><i />EVERY 2026 RACE</span></div>
      <div className="dt-models-racebar">
        <label className="ov-select">
          <span>CIRCUIT</span>
          <select value={selected?.round || ''} onChange={(event) => pickCircuit(event.target.value)}>
            {races.map((race) => <option key={race.round} value={race.round}>R{race.round} · {race.name} · {race.location}</option>)}
          </select>
        </label>
        <p className="ov-notes">All 13 completed 2026 races. Changing the circuit reloads that track’s hunt windows, driver rates, and the JUMP laps vs the recorded pair.</p>
      </div>
      {selected && <div className="dt-validation-summary">
        <div><b>R{selected.round}</b><span>{String(selected.location || '').toUpperCase()}</span></div>
        <div><b>{pct(selected.stats?.rate)}</b><span>SUCCESS RATE</span></div>
        <div><b>{selected.stats?.worked ?? '—'} / {selected.stats?.windows ?? '—'}</b><span>SUCCESS · HELD LONGER</span></div>
        <div><b>{selected.stats?.major ?? '—'}</b><span>MAJOR</span></div>
        <div><b>{(selected.cases || []).length}</b><span>SHOW LAPS</span></div>
      </div>}
    </section>

    {selected && <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>R{selected.round} · {String(selected.name || '').toUpperCase()} · DRIVERS</span><span className="data-badge derived"><i />THIS CIRCUIT</span></div>
      <div className="dt-validation-head dt-diff-driver-head dt-diff-driver-head-major"><span>DRIVER</span><span>TEAM</span><span>WINDOWS</span><span>SUCCESS</span><span>MAJOR</span><span>RATE</span></div>
      <div className="dt-validation-list">
        {circuitDrivers.map((row) => <div className="dt-validation-row dt-diff-driver-row dt-diff-driver-row-major" key={row.driver}>
          <span>{row.driver}</span>
          <span>{row.team}</span>
          <span>{row.windows}</span>
          <span>{row.worked}</span>
          <span>{row.major}</span>
          <b className={row.worked > 0 ? 'positive' : ''}>{row.windows ? pct(row.worked / row.windows) : '—'}</b>
        </div>)}
      </div>
    </section>}

    {selected && <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>R{selected.round} · {String(selected.name || '').toUpperCase()}</span><span className="data-badge real"><i />MODEL VS RECORDED</span></div>
      <p className="ov-notes">{selected.location} · {selected.stats?.worked || 0} of {selected.stats?.windows || 0} hunt windows held the pair longer ({selected.stats?.major || 0} major). After a take they keep attacking. Showing the best working divergences you can open in the sim.</p>
      {(selected.cases || []).length === 0 && <p className="ov-notes">No working pair-hold for the eight cars on this circuit.</p>}
      {(selected.cases || []).map((item) => {
        const key = `${selected.round}:${item.driver}:${item.lap}`
        const open = openKey === key
        const grade = gradeLabel(item)
        return <article key={key} className={`dt-diff-case${open ? ' is-open' : ''}`}>
          <button type="button" className="dt-diff-case-head" onClick={() => setOpenKey(open ? null : key)}>
            <b>{item.driver} L{item.lap}</b>
            <span>{item.recordedAction || '—'} → {item.modelAction || '—'} · {item.role} {item.opponent} · P{item.position} vs P{item.opponentPosition}</span>
            <em>{grade ? `${grade} · ` : ''}{item.holdDelta > 0 ? '+' : ''}{item.holdDelta} pair-ahead laps</em>
          </button>
          {open && <>
            <p>{item.why}</p>
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
            <div className="dt-diff-laps">
              <div className="dt-diff-lap-head"><span>LAP</span><span>RECORDED</span><span>MODEL</span></div>
              {(item.recorded || []).map((row) => {
                const mod = (item.model || []).find((step) => Number(step.lap) === Number(row.lap)) || {}
                const changed = Boolean(row.ahead) !== Boolean(mod.ahead) || (row.action && mod.action && row.action !== mod.action)
                return <div key={row.lap} className={`dt-diff-lap-row${changed ? ' is-diff' : ''}`}>
                  <span>L{row.lap}</span>
                  <span>{row.event || '—'} · {row.action || '—'} · {leadLabel(row.ahead)} · {row.leftPct ?? '—'}%</span>
                  <span>{mod.event || '—'} · {mod.action || '—'}{mod.opponentAction ? ` / ${mod.opponentAction}` : ''} · {leadLabel(mod.ahead)} · {mod.leftPct ?? '—'}%</span>
                </div>
              })}
            </div>
          </>}
        </article>
      })}
    </section>}

    <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>ALL CIRCUITS</span><span className="data-badge derived"><i />CLICK TO OPEN</span></div>
      <div className="dt-validation-head dt-diff-race-head dt-diff-race-head-major"><span>CIRCUIT</span><span>WINDOWS</span><span>SUCCESS</span><span>MAJOR</span><span>RATE</span><span>SHOW</span></div>
      <div className="dt-validation-list">
        {races.map((race) => {
          const active = selected && Number(selected.round) === Number(race.round)
          const show = (race.cases || []).map((item) => `${item.driver} L${item.lap}`).join(' · ') || 'none'
          return <button type="button" key={race.round} className={`dt-validation-row dt-diff-race-row dt-diff-race-row-major${active ? ' is-active' : ''}`} onClick={() => pickCircuit(race.round)}>
            <span>R{race.round} {race.name}</span>
            <span>{race.stats?.windows ?? '—'}</span>
            <span>{race.stats?.worked ?? '—'}</span>
            <span>{race.stats?.major ?? '—'}</span>
            <b className={(race.stats?.worked || 0) > 0 ? 'positive' : ''}>{pct(race.stats?.rate)}</b>
            <em>{show}</em>
          </button>
        })}
      </div>
    </section>

    <section className="ov-panel dt-validation-panel">
      <div className="ov-panel-head"><span>SEASON · SUCCESS BY DRIVER</span><span className="data-badge derived"><i />ALL 13 CIRCUITS</span></div>
      <div className="dt-validation-head dt-diff-driver-head dt-diff-driver-head-major"><span>DRIVER</span><span>TEAM</span><span>WINDOWS</span><span>SUCCESS</span><span>MAJOR</span><span>RATE</span></div>
      <div className="dt-validation-list">
        {seasonDrivers.map((row) => <div className="dt-validation-row dt-diff-driver-row dt-diff-driver-row-major" key={row.driver}>
          <span>{row.driver}</span>
          <span>{row.team || '—'}</span>
          <span>{row.windows}</span>
          <span>{row.worked}</span>
          <span>{row.major}</span>
          <b className={row.worked > 0 ? 'positive' : ''}>{row.windows ? pct(row.worked / row.windows) : '—'}</b>
        </div>)}
      </div>
    </section>
  </div>
}
