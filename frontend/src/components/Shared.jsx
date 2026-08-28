import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CircleDot, Radio } from 'lucide-react'

const MOOD_COLOUR = { ANGRY: '#ff4040', URGENT: '#ff4f5e', FRUSTRATED: '#ff9020', CALM: '#40d490', FOCUSED: '#40d490', REVIEW: '#f0b040', TIRED: '#8aa9f5' }
const MOOD_LABEL = { ANGRY: '⚠ ANGRY', URGENT: '‼ URGENT', FRUSTRATED: '! FRUSTRATED', CALM: '✓ CALM', FOCUSED: '✓ FOCUSED', REVIEW: '? UNCERTAIN', TIRED: '💤 TIRED' }
const apiUrl = (path) => `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}${path}`
const moodColor = (mood) => MOOD_COLOUR[mood] || '#8da19a'

function StepHeader({ step, onBack, title }) {
  return <header className="step-header">
    <button className="wordmark" onClick={onBack}><span><Radio size={16} /></span> PITWALL <em>COPILOT</em></button>
    {title ? <div className="desk-header-title">{title}</div> : <div className="step-track"><b className={step >= 1 ? 'done' : ''}>01 <small>WELCOME</small></b><i /><b className={step >= 2 ? 'done' : ''}>02 <small>TEAM</small></b><i /><b className={step >= 3 ? 'done' : ''}>03 <small>BRIEFING</small></b></div>}
    <div className="header-status"><CircleDot size={12} /> SEASON / 2026</div>
  </header>
}

function LiveRadioCard({ team, onOpen, onAccessPitwall, signalMessage = '', mood = '', issue = '', reply = '', processing = false, confidence = null, timestamp = '' }) {
  const driverLabel = team?.driverLabel || team?.code || 'CH --'
  const messages = useMemo(() => [
    team ? `${team.name} radio online. The channel is tuned to this team's terminology.` : 'Select a team to tune the radio channel to its terminology.',
    'Pitwall Copilot listens for signal loss, urgency and missed acknowledgement.',
  ], [team])
  const [messageIndex, setMessageIndex] = useState(0)
  const [typedMessage, setTypedMessage] = useState('')
  const confidenceNumber = confidence == null ? null : Number.parseFloat(String(confidence).replace('%', ''))
  const confidenceLabel = confidenceNumber == null || Number.isNaN(confidenceNumber) ? '—' : `${Math.round(confidenceNumber <= 1 ? confidenceNumber * 100 : confidenceNumber)}%`

  useEffect(() => {
    setTypedMessage('')
  }, [signalMessage])

  useEffect(() => {
    const activeMessage = signalMessage || messages[messageIndex]
    if (typedMessage.length < activeMessage.length) {
      const timer = window.setTimeout(() => setTypedMessage(activeMessage.slice(0, typedMessage.length + 1)), 23)
      return () => window.clearTimeout(timer)
    }
    if (signalMessage) return undefined
    const timer = window.setTimeout(() => {
      setTypedMessage('')
      setMessageIndex((current) => (current + 1) % messages.length)
    }, 3200)
    return () => window.clearTimeout(timer)
  }, [messageIndex, messages, signalMessage, typedMessage])

  const openDesk = () => onOpen?.()
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDesk() }
  }

  return <aside className="live-radio-card" aria-label="Live team radio example" role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={openDesk} onKeyDown={handleKeyDown}>
    <div className="radio-card-top"><span>LIVE SIGNAL</span><i /><span>{driverLabel}</span></div>
    <div className="radio-team"><span className="radio-number">{driverLabel}</span><div><strong>{team?.name || 'RADIO'}</strong><b>RADIO</b></div></div>
    <div className="mini-wave" aria-hidden="true">{Array.from({ length: 25 }).map((_, index) => <i key={index} style={{ '--h': `${7 + (index % 6) * 4}px`, '--delay': `${index * -.075}s` }} />)}</div>
    <p>{typedMessage}<span className="typing-cursor">|</span></p>
    <div className={`radio-progress ${processing ? 'is-processing' : ''}`} aria-label={processing ? 'Transcription and analysis in progress' : 'Signal processed'}><i /></div>
    {mood && <div className="radio-signal-meta"><strong style={{ color: moodColor(mood) }}>{MOOD_LABEL[mood] || mood}</strong>{issue && <span>{issue}</span>}</div>}
    {reply && <div className="radio-reply"><span>ENGINEER REPLY</span><b>{reply}</b></div>}
    <div className="radio-metrics"><span>AI CONFIDENCE <b>{confidenceLabel}</b></span><span>RECEIVED <b>{timestamp || '—'}</b></span></div>
    <div className="radio-card-footer"><span>COMMUNICATION EVENT</span><span>LISTENING</span></div>
    {onAccessPitwall && <button type="button" className="access-pitwall-button" onClick={(event) => { event.stopPropagation(); onAccessPitwall() }}>ACCESS PITWALL <ArrowUpRight size={13} /></button>}
  </aside>
}

function BackendStatus() {
  const [status, setStatus] = useState('checking')
  const [historyReady, setHistoryReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const response = await fetch(apiUrl('/api/health'))
        const payload = await response.json()
        if (!cancelled) {
          setStatus(response.ok && payload.ok ? 'online' : 'offline')
          setHistoryReady(Boolean(payload.history?.configured))
        }
      } catch {
        if (!cancelled) { setStatus('offline'); setHistoryReady(false) }
      }
    }
    check()
    const timer = window.setInterval(check, 10000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  return <div className={`backend-status backend-${status}`} aria-label={`Backend ${status}`}>
    <span className="backend-status-dot" />
    <b>{status === 'checking' ? 'CHECKING API' : status === 'online' ? 'API ONLINE' : 'API OFFLINE'}</b>
    <i />
    <span>{status === 'online' && historyReady ? 'SUPABASE READY' : status === 'online' ? 'LOCAL API' : 'START PORT 8787'}</span>
  </div>
}

// ─── F1 Wheel — hold-to-speak buttons ────────────────────────────────────────
// Left button = ENGINEER RADIO, Right button = DRIVER RADIO (swapped per spec)


export { StepHeader, LiveRadioCard, BackendStatus }

