import React, { useEffect, useMemo, useRef, useState } from 'react'

const MOOD_COLOUR = { ANGRY: '#ff4040', URGENT: '#ff4f5e', FRUSTRATED: '#ff9020', CALM: '#40d490', FOCUSED: '#40d490', REVIEW: '#f0b040', TIRED: '#8aa9f5' }
const emotionColour = (mood) => MOOD_COLOUR[mood] || '#9db3ab'
const confidenceLabel = (value) => { const numeric = Number(value); if (!Number.isFinite(numeric)) return value || '—'; return `${Math.round(numeric <= 1 ? numeric * 100 : numeric)}%` }
const lapTimeLabel = (seconds) => { if (!Number.isFinite(seconds)) return '—'; const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}` }

// about a historic driver's private emotion. Real radio events replace it when
// the user records a message during the replay.
function demoEmotionScenario(duration) {
  return [
    { progress: .06, mood: 'CALM', label: 'OPENING PHASE', detail: 'Stable opening inputs.', source: 'DEMO ANNOTATION' },
    { progress: .32, mood: 'FOCUSED', label: 'HIGH-LOAD CURVES', detail: 'High attention through successive corners.', source: 'DEMO ANNOTATION' },
    { progress: .58, mood: 'FRUSTRATED', label: 'POSITION BATTLE', detail: 'Illustrative grip complaint under pressure.', source: 'DEMO ANNOTATION' },
    { progress: .84, mood: 'CALM', label: 'RECOVERY PHASE', detail: 'Communication returns to a steady tone.', source: 'DEMO ANNOTATION' },
  ].map((event) => ({ ...event, seconds: duration * event.progress }))
}

function EvidenceCard({ entry, currentLap, referenceLap }) {
  const delta = currentLap && referenceLap ? currentLap.duration - referenceLap.duration : null
  const context = entry.trackContext || {}
  const evidenceLabel = entry.role === 'driver' ? 'AI RADIO EVIDENCE' : entry.role === 'ai' ? 'AUTOMATED RESPONSE' : 'MANUAL RADIO RECORD'
  return <div className="evidence-card">
    <div className="evidence-card-head"><span>{evidenceLabel}</span><b>{entry.circuit || 'CIRCUIT'} · RUN {entry.recordNumber || '—'}</b></div>
    <div className="evidence-card-grid">
      <span><small>ISSUE</small><strong>{entry.issue || 'MESSAGE LOGGED'}</strong></span>
      <span><small>EMOTION</small><strong style={{ color: emotionColour(entry.mood) }}>{entry.mood || '—'}{entry.confidence != null ? ` · ${confidenceLabel(entry.confidence)}` : ''}</strong></span>
      <span><small>RADIO POSITION</small><strong>{context.label || 'POSITION PENDING'}</strong></span>
      <span><small>CAR STATE</small><strong>{context.sampledSpeedKph != null ? `${context.sampledSpeedKph} KM/H` : '—'}{context.sampledGear != null ? ` · G${context.sampledGear}` : ''}</strong></span>
    </div>
    <div className="evidence-card-foot"><span>{context.trackState || 'Awaiting track context'}{context.sampledThrottlePct != null ? ` · THR ${context.sampledThrottlePct}%` : ''}</span><b>{delta == null ? 'LAP DELTA —' : `LAP DELTA ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`}</b></div>
  </div>
}

function EmotionLens({ currentLap, referenceLap, radioEvents = [], conversationLog = [] }) {
  const duration = currentLap?.duration || 90
  const usingLiveEvents = radioEvents.length > 0 || conversationLog.length > 0
  const demoEvents = demoEmotionScenario(duration)
  const delta = currentLap && referenceLap ? currentLap.duration - referenceLap.duration : null
  const [roleFilter, setRoleFilter] = useState('all')
  const [moodFilter, setMoodFilter] = useState('all')
  const [sortMode, setSortMode] = useState('newest')

  const visibleLog = useMemo(() => {
    const filtered = conversationLog.filter((entry) => {
      const roleMatches = roleFilter === 'all' || entry.role === roleFilter
      const moodMatches = moodFilter === 'all' || entry.mood === moodFilter
      return roleMatches && moodMatches
    })
    return [...filtered].sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || '') || 0
      const rightTime = Date.parse(right.createdAt || '') || 0
      return sortMode === 'oldest' ? leftTime - rightTime : rightTime - leftTime
    })
  }, [conversationLog, moodFilter, roleFilter, sortMode])

  // For the dot timeline: use driver-only entries from conversationLog (they have a mood),
  // falling back to radioEvents, then demo scenario dots.
  const timelineDots = conversationLog.length > 0
    ? conversationLog.filter(e => e.role === 'driver').map((e, i) => ({ ...e, progress: 0.1 + (i / Math.max(1, conversationLog.filter(x => x.role === 'driver').length - 1)) * 0.8, seconds: 0 }))
    : radioEvents.length > 0
    ? radioEvents
    : demoEvents

  const highestEvent = [...timelineDots].sort((l, r) => ({ CALM: 0, FOCUSED: 1, REVIEW: 1, FRUSTRATED: 2, URGENT: 3, ANGRY: 4, TIRED: 1 }[r.mood] || 0) - ({ CALM: 0, FOCUSED: 1, REVIEW: 1, FRUSTRATED: 2, URGENT: 3, ANGRY: 4, TIRED: 1 }[l.mood] || 0))[0]
  const deltaSentence = delta == null ? 'The lap-time comparison is loading.' : `The selected lap was ${Math.abs(delta).toFixed(3)}s ${delta < 0 ? 'faster' : 'slower'} than its real reference lap.`

  // Ref for the scrollable timeline — auto-scroll to right on new entries
  const timelineRef = useRef(null)
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollLeft = timelineRef.current.scrollWidth
  }, [timelineDots.length])

  // Ref for conversation — auto-scroll to bottom on new message
  const logRef = useRef(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [visibleLog.length])

  return <section className="emotion-lens" aria-label="Emotion lens">
    <div className="emotion-lens-head">
      <div><span>EMOTION LENS / RADIO CONTEXT</span><h3>Driver state across the lap</h3></div>
      <b className={usingLiveEvents ? 'is-live' : ''}>{usingLiveEvents ? 'LIVE RADIO OVERLAY' : 'DEMO OVERLAY'}</b>
    </div>

    {/* ── Scrollable mood dot timeline ── */}
    <div className="emotion-track-scroll" ref={timelineRef} aria-label="Emotion timeline">
      <div className="emotion-track-inner" style={{ '--emotion-count': Math.max(1, timelineDots.length), minWidth: `${Math.max(100, timelineDots.length * 140)}px` }}>
        <div className="emotion-track-line" />
        {timelineDots.map((event, index) => (
          <div key={`dot-${index}`} className="emotion-event emotion-event-pinned" style={{ '--emotion': emotionColour(event.mood) }}>
            <i />
            <strong>{event.mood}</strong>
            <small>{event.ts || lapTimeLabel(event.seconds)}</small>
          </div>
        ))}
      </div>
    </div>

    {/* ── Conversation log OR demo cards ── */}
    {conversationLog.length > 0 ? (
      <>
      <div className="conv-toolbar" aria-label="Radio history filters">
        <span>{visibleLog.length} RECORD{visibleLog.length === 1 ? '' : 'S'} / {conversationLog.length} TOTAL</span>
        <label>ROLE <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">ALL</option><option value="driver">DRIVER</option><option value="engineer">ENGINEER</option><option value="ai">PITWALL AI</option></select></label>
        <label>MOOD <select value={moodFilter} onChange={(event) => setMoodFilter(event.target.value)}><option value="all">ALL</option>{Object.keys(MOOD_COLOUR).map((mood) => <option key={mood} value={mood}>{mood}</option>)}</select></label>
        <label>SORT <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}><option value="newest">NEWEST FIRST</option><option value="oldest">OLDEST FIRST</option></select></label>
      </div>
      <div className="conv-log" ref={logRef}>
        {visibleLog.map((entry) => {
          const isDriver = entry.role === 'driver'
          const isEngineer = entry.role === 'engineer'
          const isAI = entry.role === 'ai'
          return (
            <article
              key={entry.id}
              className={`conv-entry conv-${entry.role}`}
              style={{
                '--conv-color': isDriver ? emotionColour(entry.mood) : '#8b5cf6',
              }}
            >
              <div className="conv-meta">
                <span className="conv-role">
                  {isDriver ? `DRIVER · ${entry.mood}` : isEngineer ? 'ENGINEER RADIO' : `PITWALL AI · ${entry.issue}`}
                </span>
                <span className="conv-ts">{entry.ts} · RUN {entry.recordNumber || '—'} · LAP {entry.lapNumber || '—'}</span>
              </div>
              {entry.issue && isDriver && <b className="conv-issue">{entry.issue}</b>}
              <p className="conv-text">"{entry.text}"</p>
              <EvidenceCard entry={entry} currentLap={currentLap} referenceLap={referenceLap} />
            </article>
          )
        })}
      </div>
      </>
    ) : (
      <div className="emotion-events">
        {demoEvents.map((event, index) => <article key={`${event.label}-${index}`} style={{ '--emotion': emotionColour(event.mood) }}>
          <span>{event.mood} / {lapTimeLabel(event.seconds)}</span>
          <b>{event.label || event.issue || 'RADIO EVENT'}</b>
          <p>{event.detail || event.transcript || 'Driver radio emotion detected during the replay.'}</p>
        </article>)}
      </div>
    )}

    <div className="emotion-insight">
      <span>EXPLAINABLE OBSERVATION</span>
      <p>{highestEvent ? `${highestEvent.mood} signal ${usingLiveEvents ? `recorded at ${highestEvent.ts || lapTimeLabel(highestEvent.seconds)}` : 'shown in the demo scenario'}. ` : ''}{deltaSentence} Emotion is contextual evidence, not proof that it caused the lap-time change.</p>
    </div>
  </section>
}


export { EvidenceCard, EmotionLens }
