import React, { useMemo, useState } from 'react'

const options = {
  ATTACK: { color: '#ff6b35', gain: '+0.18s', cost: '2.4%', probability: '72%', score: 78, consequence: 'Uses energy now for a high-probability pass.' },
  SAVE: { color: '#63e6be', gain: '—', cost: '0.0%', probability: '0%', score: 61, consequence: 'Protects the reserve but gives up this window.' },
  DELAY: { color: '#9db7ff', gain: '+0.24s', cost: '1.5%', probability: '81%', score: 86, consequence: 'Waits for the next braking zone with better energy value.' },
}

export function StrategyDemo() {
  const [choice, setChoice] = useState('DELAY')
  const [gap, setGap] = useState(0.8)
  const [drs, setDrs] = useState(true)
  const selected = useMemo(() => options[choice], [choice])
  const recommendation = gap <= 0.5 && drs ? 'ATTACK' : gap > 1.1 || !drs ? 'SAVE' : 'DELAY'
  const rec = options[recommendation]

  return (
    <main className="strategy-demo" style={{ '--strategy-accent': rec.color }}>
      <header className="strategy-demo-header">
        <div className="strategy-brand"><span>✦</span><strong>PITWALL <em>COPILOT</em></strong></div>
        <div className="strategy-kicker"><i /> STRATEGY LAB / DEMO 01</div>
        <div className="strategy-data-state"><b>REAL TELEMETRY</b><span>SIMULATED ENERGY MODEL</span></div>
      </header>

      <section className="strategy-hero">
        <div>
          <p className="strategy-eyebrow">BAHRAIN GP / RACE / LAP 47</p>
          <h1>Spend energy<br /><em>with intent.</em></h1>
          <p className="strategy-lede">A replayable decision view for the moment before an overtake. Explore the trade-off between position now and energy later.</p>
        </div>
        <div className="strategy-track-card">
          <div className="track-label"><span /> TURN 10 APPROACH <b>LIVE REPLAY</b></div>
          <svg viewBox="0 0 520 230" role="img" aria-label="Simplified Bahrain track replay">
            <path className="track-shadow" d="M48 182C54 130 78 67 143 55c63-12 79 45 135 35 65-12 77-66 139-54 43 8 39 56 5 70-42 17-71-13-99 18-32 37 11 73 60 63 53-11 78-58 92-108" />
            <path className="track-line" d="M48 182C54 130 78 67 143 55c63-12 79 45 135 35 65-12 77-66 139-54 43 8 39 56 5 70-42 17-71-13-99 18-32 37 11 73 60 63 53-11 78-58 92-108" />
            <circle className="track-dot" cx="258" cy="90" r="9" /><circle className="track-opponent" cx="292" cy="82" r="6" />
            <text x="235" y="125">DRS WINDOW</text><text x="272" y="69">YOU</text>
          </svg>
          <div className="track-legend"><span><i className="dot-orange" /> CURRENT CAR</span><span><i className="dot-blue" /> CAR AHEAD</span><span>1.2 km TO BRAKING ZONE</span></div>
        </div>
      </section>

      <section className="strategy-grid">
        <div className="strategy-panel scenario-panel">
          <div className="panel-heading"><span>01 / SCENARIO</span><b>REAL INPUTS</b></div>
          <div className="metric-row"><span>GAP TO CAR AHEAD</span><strong>{gap.toFixed(1)}<small>s</small></strong></div>
          <input className="gap-slider" type="range" min="0.3" max="1.8" step="0.1" value={gap} onChange={(e) => setGap(Number(e.target.value))} />
          <div className="scenario-columns"><div><span>SPEED DELTA</span><b>+17 km/h</b></div><div><span>TYRE ADVANTAGE</span><b>+4 laps</b></div><div><span>BATTERY RESERVE</span><b>68%</b></div><div><span>DEPLOYMENT MODE</span><b>Balanced</b></div></div>
          <button className={`toggle-control ${drs ? 'on' : ''}`} onClick={() => setDrs(!drs)}><i /> DRS AVAILABLE <b>{drs ? 'YES' : 'NO'}</b></button>
        </div>
        <div className="strategy-panel recommendation-panel">
          <div className="panel-heading"><span>02 / DECISION ENGINE</span><b>EXPLAINABLE</b></div>
          <p className="recommendation-label">RECOMMENDATION</p>
          <h2 style={{ color: rec.color }}>{recommendation}</h2>
          <p className="recommendation-copy">{recommendation === 'ATTACK' ? 'The gap is inside the attack threshold and DRS is available.' : recommendation === 'SAVE' ? 'The window is weak or DRS is unavailable. Preserve the reserve.' : 'A feasible pass exists, but the next braking zone offers better energy value.'}</p>
          <div className="confidence"><span>CONFIDENCE</span><b>{rec.score}%</b><div><i style={{ width: `${rec.score}%` }} /></div></div>
          <div className="source-note"><i /> Decision combines real telemetry with a regulation-based energy simulation.</div>
        </div>
      </section>

      <section className="strategy-choices">
        <div className="panel-heading"><span>03 / COUNTERFACTUALS</span><b>CHOOSE A STRATEGY TO REPLAY</b></div>
        <div className="choice-cards">{Object.entries(options).map(([name, data]) => <button key={name} className={`choice-card ${choice === name ? 'selected' : ''}`} style={{ '--choice-color': data.color }} onClick={() => setChoice(name)}><span>{name === recommendation ? 'AI RECOMMENDS' : 'SCENARIO'}</span><strong>{name}</strong><small>{data.consequence}</small><div><b>{data.gain}</b><em>{data.cost} energy</em><i>{data.probability} pass chance</i></div></button>)}</div>
      </section>
      <footer className="strategy-footer"><span>UPDATED DESIGN / FIRST DEMO</span><span>REAL = TELEMETRY · DERIVED = FEATURES · SIMULATED = ENERGY</span></footer>
    </main>
  )
}
