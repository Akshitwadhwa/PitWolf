import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { EmotionLens } from './EmotionLens'

const lapTimeLabel = (seconds) => { if (!Number.isFinite(seconds)) return '—'; const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}` }
const normaliseTrackPoints = (points, width, height, padding = 22) => { const valid = (points || []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)); if (valid.length < 2) return []; const xs = valid.map((p) => p.x); const ys = valid.map((p) => p.y); const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys); const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY)); return valid.map((point) => ({ x: padding + (point.x - minX) * scale, y: height - padding - (point.y - minY) * scale })) }

function EngineerMode({ team, driverTranscript, driverIssue, driverMood, driverTrackContext = null, radioEvents = [], lapProgress = 0, autoEngineerResponse, replayData, replayError = '', stoppedEarly = false, stoppedAt = 0, onClose, stressMetrics, setStressTemp, setStressTrackTemp, setStressGForce, setStressLap, conversationLog = [] }) {
  const [issueFocused, setIssueFocused] = useState(false)
  const [manualReview, setManualReview] = useState({ battle: 'NOT REVIEWED', drs: 'NOT REVIEWED', trackState: 'AUTO' })
  const issue = driverIssue || 'AWAITING RADIO REPORT'
  const report = driverTranscript || 'No driver radio has been captured for this run yet.'
  const currentLap = replayData?.comparison?.current
  const referenceLap = replayData?.comparison?.reference
  const delta = replayData?.comparison?.delta_seconds
  const track = normaliseTrackPoints(replayData?.track_position, 860, 560, 64)
  const trackPolyline = track.map((point) => `${point.x},${point.y}`).join(' ')
  const radioEvent = radioEvents?.at(-1)
  const trackContext = driverTrackContext || radioEvent?.trackContext || null
  // Keep the engineer map on the same car position as the replay. A radio
  // event has its own capture position; otherwise use the exact stop/current
  // progress instead of falling back to a visually arbitrary map point.
  const markerProgress = Math.max(0, Math.min(1, Number(radioEvent?.progress ?? trackContext?.progress ?? lapProgress)))
  const markerIndex = Math.min(track.length - 1, Math.max(0, Math.round(markerProgress * Math.max(0, track.length - 1))))
  const marker = track[markerIndex]
  const turnPoints = (replayData?.turn_markers || []).map((turn) => ({
    ...turn,
    point: track[Math.min(track.length - 1, Math.max(0, Math.round(turn.progress * Math.max(0, track.length - 1))))],
  })).filter((turn) => turn.point)
  const issueZone = driverIssue ? track.slice(Math.max(0, markerIndex - 9), Math.min(track.length, markerIndex + 10)) : []
  const issueZonePoints = issueZone.map((point) => `${point.x},${point.y}`).join(' ')
  const carData = replayData?.car_data || []
  const telemetry = carData[Math.min(carData.length - 1, Math.max(0, Math.round(markerProgress * Math.max(0, carData.length - 1))))]
  const weather = replayData?.weather?.at(-1)
  const tyreStatus = /TYRE|WHEEL|FRONT|REAR|GRIP/.test(issue) ? `${issue} / REVIEW` : 'NO TYRE FLAG'
  const strategyStatus = stoppedEarly ? 'EARLY REVIEW' : radioEvent ? 'RADIO REVIEW' : 'BASELINE PLAN'
  const driverName = team.primaryDriver?.name || team.drivers?.[0]?.name || 'DRIVER'
  const replayTraceLabel = team.id === 'mclaren' ? 'ACTUAL / 2023' : 'REFERENCE TRACE / 2023'
  const deltaLabel = Number.isFinite(delta) ? `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s` : '—'

  const [wave, setWave] = useState(Array.from({ length: 30 }, () => 50))
  useEffect(() => {
    const waveInterval = setInterval(() => {
      setWave(prev => {
        const nextWave = [...prev.slice(1)]
        const lastVal = prev[prev.length - 1]
        let nextVal = lastVal + (Math.random() * 16 - 8)
        if (nextVal > 90) nextVal = 75
        if (nextVal < 10) nextVal = 25
        nextWave.push(nextVal)
        return nextWave
      })
    }, 90)
    return () => clearInterval(waveInterval)
  }, [])

  const wavePath = wave.map((val, i) => {
    const wx = 389 + i * (222 / (wave.length - 1))
    const wy = 352 + (val - 50) * 0.16
    return `${i === 0 ? 'M' : 'L'} ${wx} ${wy}`
  }).join(' ')

  return <section className="engineer-mode engineer-console" role="dialog" aria-modal="true" aria-label="Engineer Mode track comparison">
    <header className="engineer-mode-top">
      <div><span>ENGINEER MODE / LIVE REVIEW</span><h2>PIT WALL</h2></div>
      <div className="engineer-session-meta"><span>{replayData?.session?.circuit_short_name || 'CIRCUIT'} / 2023 RACE</span><b>{driverName.toUpperCase()}</b></div>
      <button type="button" onClick={onClose}><X size={16} /> CLOSE</button>
    </header>

    <div className="engineer-console-grid">
      <section className="engineer-map-pane">
        <div className="map-pane-head"><span><i /> TRACK MAP / RADIO POSITION</span><b>{trackContext?.label || (stoppedEarly ? `STOPPED ${lapTimeLabel(stoppedAt)}` : 'RUN REVIEW')}</b></div>
        <svg viewBox="0 0 860 560" role="img" aria-label="Circuit map with the driver radio issue highlighted">
          {track.length > 1 ? <>
            <polyline points={trackPolyline} fill="none" stroke="#263a36" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={trackPolyline} fill="none" stroke="#dcebe6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="11 14" opacity=".72" />
            <polyline points={trackPolyline} fill="none" stroke={team.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".58" />
            {turnPoints.map((turn) => <g className="track-turn-marker" key={`turn-${turn.number}`}>
              <circle cx={turn.point.x} cy={turn.point.y} r="11" />
              <text x={turn.point.x} y={turn.point.y + 3.5}>{turn.number}</text>
            </g>)}
            {issueZone.length > 1 && <polyline points={issueZonePoints} fill="none" stroke="#f21f2d" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" className="issue-zone-line" />}
            {marker && <>
              <g className="track-issue-target" role="button" tabIndex="0" aria-label="Focus the reported issue on the track" onClick={() => setIssueFocused((focused) => !focused)} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && setIssueFocused((focused) => !focused)}>
                <circle cx={marker.x} cy={marker.y} r="30" fill="#f21f2d" opacity=".18"><animate attributeName="r" values="22;39;22" dur="1.8s" repeatCount="indefinite" /></circle>
                <circle cx={marker.x} cy={marker.y} r="15" fill="#f21f2d" stroke="#f0fff9" strokeWidth="4" />
                <path d={`M ${marker.x + 16} ${marker.y - 16} L ${marker.x + 66} ${marker.y - 58}`} fill="none" stroke="#f21f2d" strokeWidth="2" />
                <rect x={Math.min(marker.x + 66, 628)} y={Math.max(marker.y - (issueFocused ? 126 : 105), 20)} width="200" height={issueFocused ? "79" : "58"} rx="5" fill="#08100f" stroke="#f21f2d" strokeWidth="1.3" />
                <text x={Math.min(marker.x + 77, 639)} y={Math.max(marker.y - (issueFocused ? 103 : 82), 43)} fill="#f21f2d" fontSize="10" fontFamily="DM Mono, monospace" letterSpacing="1.2">{issueFocused ? 'ISSUE FOCUS / CLICK TO CLOSE' : 'DRIVER REPORT / CLICK TO FOCUS'}</text>
                <text x={Math.min(marker.x + 77, 639)} y={Math.max(marker.y - (issueFocused ? 82 : 61), 64)} fill="#effff9" fontSize="15" fontWeight="700" fontFamily="Space Grotesk, sans-serif">{issue}</text>
                {issueFocused && <text x={Math.min(marker.x + 77, 639)} y={Math.max(marker.y - 60, 85)} fill="#a9bdb6" fontSize="9" fontFamily="DM Mono, monospace">{driverMood || 'RADIO'} / {lapTimeLabel(radioEvent?.seconds ?? markerProgress * (currentLap?.duration || 0))}</text>}
              </g>
            </>}
          </> : <>
            <text x="430" y="268" fill="#f0b040" textAnchor="middle" fontSize="14" fontFamily="DM Mono, monospace">{replayError ? 'TRACK API OFFLINE' : 'TRACK DATA LOADING'}</text>
            <text x="430" y="296" fill="#95aaa3" textAnchor="middle" fontSize="10" fontFamily="DM Mono, monospace">{replayError ? 'START BACKEND / PORT 8787' : 'CONNECTING TO REPLAY SOURCE'}</text>
          </>}
        </svg>
        <div className="map-event-log"><span>RADIO LOG</span><b>{driverName} / {driverMood || 'NO EMOTION SIGNAL'} / {issue}</b><p>“{report}”</p>{trackContext && <small>{trackContext.label} · {trackContext.sampledSpeedKph ?? '—'} KM/H · {trackContext.trackState}</small>}</div>
        <div className="track-legend"><span><i /> CURRENT LAP</span><span><i /> REFERENCE LAP</span><span><i /> TURN MARKER</span><span><i /> ISSUE ZONE</span></div>
      </section>

      <aside className="engineer-data-pane">
        <div className="data-pane-head"><span><i /> PIT WALL DATA / {team.driverLabel?.toUpperCase()}</span><b>{replayTraceLabel}</b></div>
        <div className="data-primary"><span>CURRENT LAP</span><strong>{currentLap ? lapTimeLabel(currentLap.duration) : '—'}</strong><p>Lap {currentLap?.lap_number ?? '—'} / Δ {deltaLabel} vs reference</p></div>
        <div className="engineer-data-grid">
          <article><span>STRATEGY</span><b>{strategyStatus}</b><small>{stoppedEarly ? 'Manual review opened' : 'Human approval required'}</small></article>
          <article><span>TYRE STATUS</span><b>{tyreStatus}</b><small>AI radio assessment</small></article>
          <article><span>TRACK TEMP</span><b>{Number.isFinite(weather?.track_temperature) ? `${weather.track_temperature.toFixed(1)}°C` : '—'}</b><small>Historic session weather</small></article>
          <article><span>AIR TEMP</span><b>{Number.isFinite(weather?.air_temperature) ? `${weather.air_temperature.toFixed(1)}°C` : '—'}</b><small>Humidity {weather?.humidity ?? '—'}%</small></article>
          <article><span>EVENT SPEED</span><b>{Number.isFinite(telemetry?.speed) ? `${telemetry.speed} KM/H` : '—'}</b><small>Throttle {telemetry?.throttle ?? '—'}%</small></article>
          <article><span>BRAKE / GEAR</span><b>{telemetry?.brake ? 'BRAKING' : 'OFF BRAKE'}</b><small>Gear {telemetry?.gear ?? '—'}</small></article>
        </div>
        <section className="manual-review-card">
          <span>RADIO POSITION / MANUAL REVIEW</span>
          <b>{trackContext?.label || 'AWAITING TRACK CONTEXT'}</b>
          <p>{trackContext ? `${trackContext.sampledSpeedKph ?? '—'} KM/H at report · Gear ${trackContext.sampledGear ?? '—'} · ${trackContext.sampledBrake ? 'braking' : 'off brake'}` : 'Record driver radio while the replay data is loaded to attach turn and speed context.'}</p>
          <div className="manual-review-controls">
            <label>BATTLE<select value={manualReview.battle} onChange={(event) => setManualReview((review) => ({ ...review, battle: event.target.value }))}><option>NOT REVIEWED</option><option>IN BATTLE</option><option>CLEAR AIR</option></select></label>
            <label>DRS<select value={manualReview.drs} onChange={(event) => setManualReview((review) => ({ ...review, drs: event.target.value }))}><option>NOT REVIEWED</option><option>DRS ON</option><option>DRS OFF</option></select></label>
            <label>TRACK<select value={manualReview.trackState} onChange={(event) => setManualReview((review) => ({ ...review, trackState: event.target.value }))}><option>AUTO</option><option>CORNER</option><option>STRAIGHT</option></select></label>
          </div>
        </section>
        <section className="engineer-action-card"><span>COPILOT ACTION</span><b>{autoEngineerResponse?.display || 'AWAIT ENGINEER'}</b><p>{autoEngineerResponse?.reply || 'No automated response is attached yet. Use the driver radio to create one.'}</p></section>
      </aside>
    </div>

    {stressMetrics && (
      <div className="stress-card">
        <div className="stress-card-head">
          <span>DRIVER PHYSICAL STRESS MONITOR</span>
          <h3>Cockpit Environment & Biometrics</h3>
        </div>
        
        <div className="stress-card-grid">
          <div className="stress-card-top-row">
            <div className="stress-card-top-left">
              <span className="stress-sub-label">CURRENT PHYSICAL STRESS LEVEL</span>
              <div className={`stress-status-display stress-level-${stressMetrics.psi >= 70 ? (stressMetrics.hydration < 15 ? 'critical' : 'tired') : (stressMetrics.psi >= 45 ? 'elevated' : 'calm')}`}>
                <div className="stress-status-text">
                  <strong>{stressMetrics.level}</strong>
                  <small>PSI Score: {stressMetrics.psi} / 100</small>
                </div>
              </div>
            </div>
            
            <div className="stress-card-top-right">
              <span className="stress-sub-label">DRIVER BIOMETRIC READOUT</span>
              <div className="biometric-readout-grid">
                <div className="biometric-item">
                  <div className="biometric-values">
                    <label>EST. HEART RATE</label>
                    <strong>{stressMetrics.hr} <small>bpm</small></strong>
                  </div>
                </div>
                <div className="biometric-item">
                  <div className="biometric-values">
                    <label>EST. BREATHING RATE</label>
                    <strong>{stressMetrics.br} <small>bpm</small></strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="stress-card-bottom-row">
            <span className="stress-sub-label">LIVE TELEMETRY CONFIGURATOR</span>
            <div className="engineer-data-grid stress-stats-grid">
              <article className="stress-stat-editable">
                <span>COCKPIT TEMP</span>
                <b>
                  <input 
                    type="number" 
                    value={stressMetrics.temp} 
                    onChange={(e) => setStressTemp(parseFloat(e.target.value) || 0)} 
                    step="0.1" 
                  />
                  <small className="unit">°C</small>
                </b>
                <small>Simulation cockpit heat</small>
              </article>
              
              <article className="stress-stat-editable">
                <span>TRACK TEMP</span>
                <b>
                  <input 
                    type="number" 
                    value={stressMetrics.trackTemp} 
                    onChange={(e) => setStressTrackTemp(parseFloat(e.target.value) || 0)} 
                    step="0.1" 
                  />
                  <small className="unit">°C</small>
                </b>
                <small>Track surface temperature</small>
              </article>

              <article className="stress-stat-editable">
                <span>CURRENT LAP</span>
                <b>
                  <input 
                    type="number" 
                    value={stressMetrics.lap} 
                    onChange={(e) => setStressLap(parseInt(e.target.value) || 1)} 
                    step="1" 
                  />
                  <small className="unit">/ 78</small>
                </b>
                <small>Current lap number</small>
              </article>

              <article className="stress-stat-editable">
                <span>AVG G-FORCE</span>
                <b>
                  <input 
                    type="number" 
                    value={stressMetrics.gforce} 
                    onChange={(e) => setStressGForce(parseFloat(e.target.value) || 0)} 
                    step="0.1" 
                  />
                  <small className="unit">G</small>
                </b>
                <small>Average lateral Gs</small>
              </article>

              <article className="readonly">
                <span>REMAINING HYDRATION</span>
                <b className={stressMetrics.hydration < 15 ? 'critical-text' : ''}>
                  {stressMetrics.hydration}
                  <small className="unit">%</small>
                </b>
                <small className={stressMetrics.hydration < 15 ? 'critical-text' : ''}>Driver hydration level</small>
              </article>

              <article className="readonly">
                <span>PHYSICAL STRESS INDEX</span>
                <b className={stressMetrics.psi >= 70 ? 'critical-text' : ''}>
                  {stressMetrics.psi}
                  <small className="unit">/ 100</small>
                </b>
                <small className={stressMetrics.psi >= 70 ? 'critical-text' : ''}>Composite stress level</small>
              </article>
            </div>
            
            {/* Real-time telemetry ECG wave drawing at the bottom */}
            <svg viewBox="371 340 258 20" style={{ height: '20px', width: '100%', marginTop: '15px' }}>
              <path d={wavePath} fill="none" stroke="#5d746f" strokeWidth="1.5" opacity="0.6" />
            </svg>
          </div>
        </div>
      </div>
    )}

    <EmotionLens currentLap={currentLap} referenceLap={referenceLap} radioEvents={radioEvents} conversationLog={conversationLog} />
  </section>
}



export { EngineerMode }
