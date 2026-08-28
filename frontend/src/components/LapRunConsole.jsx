import React from 'react'
import { ArrowUpRight } from 'lucide-react'

const lapTimeLabel = (seconds) => { if (!Number.isFinite(seconds)) return '—'; const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}` }
const normaliseTrackPoints = (points, width, height, padding = 22) => { const valid = (points || []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)); if (valid.length < 2) return []; const xs = valid.map((p) => p.x); const ys = valid.map((p) => p.y); const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys); const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY)); return valid.map((point) => ({ x: padding + (point.x - minX) * scale, y: height - padding - (point.y - minY) * scale })) }

function LapRunConsole({ team, lapState, lapProgress, driverTranscript, engineerTranscript, autoEngineerReply, driverMood, driverIssue, replayData, onEngineerMode, uploadState, uploadMessage, onUploadNow }) {
  const actualLap = replayData?.comparison?.current
  const track = normaliseTrackPoints(replayData?.track_position, 420, 220, 30)
  const car = track[Math.min(track.length - 1, Math.round(lapProgress * Math.max(0, track.length - 1)))]
  const activeEvent = lapProgress < .22 ? 'GRID EXIT' : lapProgress < .48 ? 'SECTOR 1' : lapProgress < .76 ? 'RADIO WINDOW' : lapProgress < 1 ? 'SECTOR 3' : 'FINISH'
  const angle = lapProgress * Math.PI * 2 - Math.PI / 2
  const carX = 50 + Math.cos(angle) * 34 + Math.sin(angle * 3) * 5
  const carY = 50 + Math.sin(angle) * 27 + Math.cos(angle * 2) * 4
  const timeline = [
    ['GRID EXIT', 0, '00:00'], ['S1', .24, actualLap ? `${actualLap.sector_1.toFixed(3)}s` : '—'], ['RADIO', .52, 'LIVE'], ['S3', .78, actualLap ? `${actualLap.sector_3.toFixed(3)}s` : '—'], ['FINISH', 1, actualLap ? lapTimeLabel(actualLap.duration) : '—'],
  ]

  return <section className={`lap-run-console lap-${lapState}`} aria-label="Lap simulation">
    <article className="lap-radio-feed">
      <div className="lap-panel-label"><i /> LIVE RADIO</div>
      <div><span>DRIVER</span><b>{driverTranscript || 'CHANNEL ARMED — HOLD DRIVER RADIO TO SPEAK'}</b></div>
      <div><span>{autoEngineerReply ? 'PITWALL AI' : 'ENGINEER'}</span><b>{autoEngineerReply || engineerTranscript || 'CHANNEL ARMED — HOLD ENGINEER RADIO TO SPEAK'}</b></div>
      <small>{driverMood ? `${driverMood} / ${driverIssue || 'ISSUE PENDING'}` : 'WAITING FOR FIRST MESSAGE'}</small>
    </article>

    <article className="lap-track-card">
      <div className="lap-panel-label"><i /> {lapState === 'finished' ? 'RUN COMPLETE' : `${replayData?.session?.circuit_short_name || 'CIRCUIT'} / LIVE RUN`}</div>
      <svg viewBox="0 0 420 220" role="img" aria-label="Simplified circuit with animated car">
        {track.length > 1 ? <>
          <polyline points={track.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#344b46" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={track.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={team.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 9" opacity=".85" />
          {car && <><circle cx={car.x} cy={car.y} r="10" fill={team.color} stroke="#effff9" strokeWidth="3" /><path d={`M ${car.x - 4} ${car.y + 5} L ${car.x + 8} ${car.y} L ${car.x - 4} ${car.y - 5} Z`} fill="#07100e" /></>}
        </> : <><path d="M69 111 C69 57 127 35 178 56 C223 20 317 38 341 82 C374 139 320 185 257 167 C215 203 121 190 84 151 C69 136 65 124 69 111Z" fill="none" stroke="#344b46" strokeWidth="13" strokeLinecap="round" /><path d="M69 111 C69 57 127 35 178 56 C223 20 317 38 341 82 C374 139 320 185 257 167 C215 203 121 190 84 151 C69 136 65 124 69 111Z" fill="none" stroke={team.color} strokeWidth="3" strokeLinecap="round" strokeDasharray="6 9" opacity=".8" /><circle cx={carX * 4.2} cy={carY * 2.2} r="10" fill={team.color} stroke="#effff9" strokeWidth="3" /></>}
      </svg>
      <div className="lap-track-readout"><b>{actualLap ? lapTimeLabel(lapProgress * actualLap.duration) : `${String(Math.round(lapProgress * 100)).padStart(2, '0')}%`}</b><span>{actualLap ? `ACTUAL LAP ${actualLap.lap_number}` : activeEvent}</span></div>
    </article>

    <article className="lap-timeline-panel">
      <div className="lap-panel-label"><i /> LAP TIMELINE</div>
      <div className="lap-timeline-line"><i style={{ height: `${lapProgress * 100}%` }} /></div>
      <ol>{timeline.map(([label, at, value]) => <li key={label} className={lapProgress >= at ? 'is-passed' : ''}><span>{label}</span><b>{value}</b></li>)}</ol>
      <button type="button" className={`lap-upload-button is-${uploadState}`} onClick={onUploadNow} disabled={uploadState === 'uploading' || uploadState === 'unavailable'}>
        {uploadState === 'uploading' ? 'UPLOADING…' : uploadState === 'saved' ? 'UPLOAD SAVED ✓' : 'UPLOAD TO SUPABASE'}
      </button>
      <small className={`lap-upload-state is-${uploadState}`}>{uploadMessage}</small>
      <button type="button" onClick={onEngineerMode} disabled={lapState !== 'finished'}>ENGINEER MODE <ArrowUpRight size={13} /></button>
    </article>
  </section>
}


export { LapRunConsole }
