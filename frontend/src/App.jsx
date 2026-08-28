import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ChevronRight, CircleDot, Mic, Radio, Send, Sparkles as SparkleIcon, Square, Volume2, X } from 'lucide-react'
import haasCar from './assets/haas-f1.jpeg'
import audiCar from './assets/audi-f1.jpg'
import mclarenCar from './assets/mclaren-mcl38.jpg'
import openingVideo from './assets/f1-opening-background.mp4'
import monacoLapRecord from './assets/MONACO LAP RECORD Lando Norris Pole Lap  2025 Monaco Grand Prix  Pirelli.mp4'
import radioSound from './assets/F1 Radio - Sound effect (HD).mp3'
import haasDriverOne from './assets/haas-driver-1.jpeg'
import haasDriverTwo from './assets/haas-driver-2.webp'
import audiDriverOne from './assets/Audi-Driver-1.jpeg'
import audiDriverTwo from './assets/Audi-Driver-2.jpeg'
import mclarenDriverOne from './assets/mclaren-driver- 1.jpg.webp'
import mclarenDriverTwo from './assets/mclaren-driver-2.jpg.webp'
import { historyAccessToken, isHistoryConfigured } from './supabase'
import { StepHeader, LiveRadioCard, BackendStatus } from './components/Shared'
import { F1Wheel } from './components/F1Wheel'
import { EvidenceCard, EmotionLens } from './components/EmotionLens'
import { LapRunConsole } from './components/LapRunConsole'
import { EngineerMode } from './components/EngineerMode'
import { StrategyDemo } from './components/StrategyDemo'
import { RaceReplay3D } from './components/RaceReplay3D'
import { StrategyDashboard } from './components/StrategyDashboard'

const teams = [
  {
    id: 'haas',
    name: 'Haas', code: 'HAA', color: '#d71920', accent: '#f4f4f4', wheelBody: '#151518', wheelTrim: '#f4f4f4',
    driverLabel: 'Olli',
    primaryDriver: { name: 'Oliver Bearman', short: 'Olli', number: '87' },
    image: haasCar,
    drivers: [
      { name: 'Esteban Ocon', number: '31', image: haasDriverOne, profile: 'PRECISE / FEEDBACK' },
      { name: 'Oliver Bearman', number: '87', image: haasDriverTwo, profile: 'DIRECT / HIGH TEMPO' },
    ],
    position: 'P7', points: '22', podiums: '0', races: '11',
    summary: 'A points-focused campaign where clear, concise feedback is essential for extracting the most from each race weekend.',
    signal: 'Prioritise fast issue classification and reliable driver acknowledgement during high-pressure calls.',
    audioIssues: [
      { event: 'ROUND 03 / BAHRAIN', label: 'SIGNAL LOSS', issue: 'Radio dropouts and missed acknowledgements during high-pressure calls.' },
      { event: 'ROUND 07 / IMOLA', label: 'LOW CLARITY', issue: 'Driver messages became difficult to hear over engine and pit-lane noise.' },
      { event: 'SEASON PATTERN', label: 'ACK NEEDED', issue: 'Shorter, confirmed instructions are needed when the race situation changes quickly.' },
    ],
  },
  {
    id: 'audi',
    name: 'Audi', code: 'AUD', color: '#e30613', accent: '#c9cdd1', wheelBody: '#17191c', wheelTrim: '#e7e7e7',
    driverLabel: 'Nico',
    primaryDriver: { name: 'Nico Hulkenberg', short: 'Nico', number: '27' },
    image: audiCar,
    drivers: [
      { name: 'Gabriel Bortoleto', number: '5', image: audiDriverOne, profile: 'PRECISION / CONTROL' },
      { name: 'Nico Hulkenberg', number: '27', image: audiDriverTwo, profile: 'EXPERIENCE / FEEDBACK' },
    ],
    position: 'P8', points: '12', podiums: '0', races: '11',
    summary: 'The team is collecting points in its first season under the Audi name, with the focus on extracting reliable feedback and making every radio message actionable.',
    signal: 'Prioritise radio quality checks and precise issue reporting from the driver.',
    audioIssues: [
      { event: 'ROUND 02 / JEDDAH', label: 'RADIO CHECK', issue: 'Longer driver-to-pit acknowledgements created uncertainty during a strategy call.' },
      { event: 'ROUND 06 / MIAMI', label: 'PIT WALL DELAY', issue: 'Instruction changes needed a clearer repeat-back before the pit window closed.' },
      { event: 'SEASON PATTERN', label: 'CONFIRMATION', issue: 'Prioritise concise issue labels and explicit driver acknowledgement.' },
    ],
  },
  {
    id: 'mclaren',
    name: 'McLaren', code: 'MCL', color: '#ff8000', accent: '#8cebdd', wheelBody: '#17191b', wheelTrim: '#8cebdd',
    driverLabel: 'Lando',
    primaryDriver: { name: 'Lando Norris', short: 'Lando', number: '4' },
    // Local footage keeps the cockpit background reliable in production.
    controllerVideo: monacoLapRecord,
    image: mclarenCar,
    drivers: [
      { name: 'Lando Norris', number: '4', image: mclarenDriverOne, profile: 'DIRECT / PRECISION' },
      { name: 'Oscar Piastri', number: '81', image: mclarenDriverTwo, profile: 'CALM / HIGH TEMPO' },
    ],
    position: 'P3', points: '220', podiums: '3', races: '11',
    summary: 'A recovery after an uneven opening stretch. The team benefits from concise strategy confirmation during high-pressure calls.',
    signal: 'Focus the radio desk on clear confirmation when strategy decisions change quickly.',
    audioIssues: [
      { event: 'ROUND 04 / SUZUKA', label: 'STRATEGY CHANGE', issue: 'Rapid strategy changes required shorter radio instructions and immediate confirmation.' },
      { event: 'ROUND 08 / MONACO', label: 'CROSS-TALK', issue: 'Multiple simultaneous calls made the key pit-wall instruction harder to isolate.' },
      { event: 'SEASON PATTERN', label: 'FAST REPLY', issue: 'Keep the engineer response brief, prioritised, and visible on the driver display.' },
    ],
  },
]

// ─── Mood helpers ──────────────────────────────────────────────────────────────

const MOOD_COLOUR = { ANGRY: '#ff4040', URGENT: '#ff4f5e', FRUSTRATED: '#ff9020', CALM: '#40d490', FOCUSED: '#40d490', REVIEW: '#f0b040', TIRED: '#8aa9f5' }
const MOOD_LABEL = { ANGRY: '⚠ ANGRY', URGENT: '‼ URGENT', FRUSTRATED: '! FRUSTRATED', CALM: '✓ CALM', FOCUSED: '✓ FOCUSED', REVIEW: '? UNCERTAIN', TIRED: '💤 TIRED' }

function moodColor(mood) {
  return MOOD_COLOUR[mood] || '#8da19a'
}

// ─── Voice recorder with browser SpeechRecognition ────────────────────────────
//
// Primary transcription: browser's built-in SpeechRecognition (Chrome/Edge).
// Works with zero API keys. Returns { transcript, audioFeatures: { rms } }.
// Web Audio API is used in parallel to compute RMS (vocal energy) for mood.

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition

function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const analyserRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rmsHistoryRef = useRef([])
  const streamRef = useRef(null)
  const pollIdRef = useRef(null)
  const transcriptRef = useRef('')
  const chunksRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const startTimeRef = useRef(null)

  const start = useCallback(async () => {
    setError(null)
    transcriptRef.current = ''
    startTimeRef.current = Date.now()

    if (!SpeechRecognitionAPI) {
      setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      analyserRef.current = analyser
      rmsHistoryRef.current = []

      const buffer = new Float32Array(analyser.fftSize)
      pollIdRef.current = setInterval(() => {
        if (!analyserRef.current) return
        analyser.getFloatTimeDomainData(buffer)
        const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length)
        rmsHistoryRef.current.push(rms)
      }, 50)

      // Start MediaRecorder to capture blob for Whisper API
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(100)
      mediaRecorderRef.current = mr

      // Start local SpeechRecognition as a fallback
      const recognition = new SpeechRecognitionAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event) => {
        let fullTranscript = ''
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' '
        }
        transcriptRef.current = fullTranscript.trim()
      }

      recognition.onerror = (event) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          setError(`Speech error: ${event.error}`)
        }
      }

      recognition.start()
      recognitionRef.current = recognition
      setRecording(true)
    } catch (err) {
      setError(err.message || 'Microphone access denied')
    }
  }, [])

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      if (pollIdRef.current) { clearInterval(pollIdRef.current); pollIdRef.current = null }
      if (analyserRef.current) { analyserRef.current = null }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }

      const history = rmsHistoryRef.current
      const avgRms = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0
      const audioFeatures = { rms: Number(avgRms.toFixed(4)) }
      const recordingDurationSec = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0

      // Wait for both recorders to finalize
      const p1 = new Promise((r) => {
        const mr = mediaRecorderRef.current
        if (!mr || mr.state === 'inactive') return r(null)
        mr.onstop = () => r(new Blob(chunksRef.current, { type: 'audio/webm' }))
        mr.stop()
      })

      const p2 = new Promise((r) => {
        const rec = recognitionRef.current
        if (!rec) return r('')
        rec.onend = () => r(transcriptRef.current.trim())
        try { rec.stop() } catch {}
      })

      Promise.all([p1, p2]).then(([blob, transcript]) => {
        setRecording(false)
        resolve({ transcript, blob, audioFeatures, recordingDurationSec })
      })
    })
  }, [])

  return { recording, error, start, stop }
}


// ─── Shared UI ────────────────────────────────────────────────────────────────





function normaliseTrackPoints(points, width, height, padding = 22) {
  const valid = (points || []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (valid.length < 2) return []
  const xs = valid.map((point) => point.x)
  const ys = valid.map((point) => point.y)
  const minX = Math.min(...xs); const maxX = Math.max(...xs)
  const minY = Math.min(...ys); const maxY = Math.max(...ys)
  const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY))
  return valid.map((point) => ({
    x: padding + (point.x - minX) * scale,
    y: height - padding - (point.y - minY) * scale,
  }))
}

function lapTimeLabel(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`
}

function emotionColour(mood) {
  return MOOD_COLOUR[mood] || '#9db3ab'
}

const RADIO_LOG_STORAGE_KEY = 'pitwall-copilot:radio-log:v1'

function loadPersistedRadioLog() {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(RADIO_LOG_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.map((entry, index) => ({
      ...entry,
      recordNumber: entry.recordNumber || index + 1,
      lapNumber: entry.lapNumber || null,
    })) : []
  } catch {
    return []
  }
}

// The default layer is intentionally an annotated demo scenario, not a claim
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





function CockpitLink({ team, onBack, onStart, onDriverSpeak }) {
  const sequenceRef = useRef()
  const lockedScrollYRef = useRef(null)
  const [progress, setProgress] = useState(0)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [lapState, setLapState] = useState('idle')
  const [lapProgress, setLapProgress] = useState(0)
  const [engineerMode, setEngineerMode] = useState(false)
  const [lapStoppedEarly, setLapStoppedEarly] = useState(false)
  const [replayCircuit, setReplayCircuit] = useState('bahrain')
  const [replayData, setReplayData] = useState(null)
  const [replayLoading, setReplayLoading] = useState(true)
  const [replayError, setReplayError] = useState('')
  const [replayRequest, setReplayRequest] = useState(0)

  // Voice recorder instances
  const engineerRecorder = useVoiceRecorder()
  const driverRecorder = useVoiceRecorder()

  // Transcript panels
  const [engineerTranscript, setEngineerTranscript] = useState('')
  const [engineerProcessing, setEngineerProcessing] = useState(false)
  const [driverTranscript, setDriverTranscript] = useState('')
  const [driverMood, setDriverMood] = useState(null)
  const [driverIssue, setDriverIssue] = useState('')
  const [driverReply, setDriverReply] = useState('')
  const [autoEngineerResponse, setAutoEngineerResponse] = useState(null)
  const [driverConfidence, setDriverConfidence] = useState(null)
  const [driverTrackContext, setDriverTrackContext] = useState(null)
  const [driverTimestamp, setDriverTimestamp] = useState('')
  const [driverProcessing, setDriverProcessing] = useState(false)
  const [radioEvents, setRadioEvents] = useState([])
  // Full conversation history: [{id, role:'driver'|'engineer'|'ai', text, mood, issue, ts}]
  const [conversationLog, setConversationLog] = useState(loadPersistedRadioLog)

  // Keep the demo ledger on this localhost origin so a refresh or a Vite
  // hot-reload does not erase the evidence being shown to mentors.
  useEffect(() => {
    try {
      window.localStorage.setItem(RADIO_LOG_STORAGE_KEY, JSON.stringify(conversationLog.slice(-200)))
    } catch {}
  }, [conversationLog])


  // If local browser storage was cleared, rehydrate the same ledger from the
  // Supabase radio history for this anonymous browser session.
  useEffect(() => {
    if (!isHistoryConfigured) return undefined
    let cancelled = false
    const loadRemoteHistory = async () => {
      try {
        const token = await historyAccessToken()
        const { sessions = [] } = await requestHistoryRead('/api/history/sessions', token)
        const details = await Promise.all(sessions.slice(0, 12).map((session) => requestHistoryRead(`/api/history/sessions/${session.id}`, token)))
        const remoteEntries = details.flatMap((detail) => (detail.radio || []).map((entry) => {
          const telemetry = Array.isArray(entry.telemetry_snapshots) ? entry.telemetry_snapshots[0] : entry.telemetry_snapshots
          const recordedAt = entry.recorded_at || new Date().toISOString()
          return {
            id: `supabase-${entry.id}`,
            recordNumber: 0,
            role: entry.role,
            text: entry.transcript,
            mood: entry.detected_mood || (entry.role === 'ai' ? 'AI' : 'REVIEW'),
            issue: entry.fused_issue || '',
            ts: new Date(recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: recordedAt,
            lapNumber: telemetry?.lap_number || null,
            lapProgress: telemetry?.lap_progress || 0,
            lapSeconds: telemetry?.lap_seconds || 0,
            circuit: entry.circuit_id || detail.session?.circuit_name || '',
          }
        }))
        if (!cancelled && remoteEntries.length > 0) {
          setConversationLog((current) => current.length > 0 ? current : remoteEntries.map((entry, index) => ({ ...entry, recordNumber: index + 1 })))
        }
      } catch {
        // LocalStorage remains the offline demo source when Supabase history is unavailable.
      }
    }
    void loadRemoteHistory()
    return () => { cancelled = true }
  }, [])

  // One Supabase session represents one started lap. It is created automatically
  // and is finished as either completed or stopped when the run ends.
  const historySessionRef = useRef(null)
  const historyFinishingRef = useRef(false)
  const historyStartingRef = useRef(null)
  const [uploadState, setUploadState] = useState(isHistoryConfigured ? 'idle' : 'unavailable')
  const [uploadMessage, setUploadMessage] = useState(isHistoryConfigured
    ? 'AUTO-SAVES AT LAP START AND FINISH'
    : 'ADD VITE_SUPABASE VALUES TO frontend/.env')

  // Wheel keyword display
  const [wheelKeywords, setWheelKeywords] = useState([])
  const [showWheelKeywords, setShowWheelKeywords] = useState(false)

  // Telemetry dropdown state for Physical Stress Index (PSI) modeling
  const [stressTemp, setStressTemp] = useState(26.2)
  const [stressTrackTemp, setStressTrackTemp] = useState(28.7)
  const [stressGForce, setStressGForce] = useState(1.9)
  const [stressLap, setStressLap] = useState(50)
  // null = calculated from formula; number = user-pinned value via dropdown
  const [stressHydrationOverride, setStressHydrationOverride] = useState(null)

  const stressMetrics = useMemo(() => {
    // Effective Cockpit Temp Index (baseline humidity = 21%)
    const tIndex = stressTemp + (0.55 * 0.21 * (stressTemp - 14.5))
    
    // Dehydration drop per lap (%)
    const dropPerLap = 0.5 + Math.pow(tIndex / 30, 2) * (1 + 0.1 * stressGForce)
    const calculatedHydration = Math.max(5, Number((100 - (dropPerLap * stressLap)).toFixed(1)))
    // If user has locked a hydration value via dropdown, use it directly
    const hydration = stressHydrationOverride !== null ? stressHydrationOverride : calculatedHydration
    
    // Physical Stress Index (PSI, 0-100) - Correlated to specific user guidelines
    
    // 1. Cockpit Temp correlation (<=20 = good, >28 = alarming, >34 = dangerous)
    let tempLoad = 0
    if (stressTemp > 34) tempLoad = 30 + (stressTemp - 34) * 3
    else if (stressTemp > 28) tempLoad = 10 + (stressTemp - 28) * 3.33
    else if (stressTemp > 20) tempLoad = (stressTemp - 20) * 1.25

    // 2. Track Temp correlation (Radiates heat: >45 = dangerous, >35 = alarming)
    let trackTempLoad = 0
    if (stressTrackTemp > 45) trackTempLoad = 10 + (stressTrackTemp - 45) * 1.5
    else if (stressTrackTemp > 35) trackTempLoad = (stressTrackTemp - 35) * 1.0

    // 3. Hydration vs. Laps Remaining correlation
    const totalLaps = 78
    const remainingLapsPct = Math.max(0, ((totalLaps - stressLap) / totalLaps) * 100)
    let hydrationLoad = 0
    if (remainingLapsPct > 0 && hydration < remainingLapsPct) {
      // Calculate deficit percentage relative to the remaining laps required
      const deficitRatio = (remainingLapsPct - hydration) / remainingLapsPct
      // Scale deficit more aggressively: 50% deficit = ~39 PSI, 80%+ deficit = ~70+ PSI (guaranteed critical)
      hydrationLoad = Math.pow(deficitRatio, 1.2) * 90
    }

    // 4. Physical G-Force effort
    const gForceLoad = stressGForce * 4.5

    const psi = Math.max(0, Math.min(100, Math.round(tempLoad + trackTempLoad + hydrationLoad + gForceLoad)))
    
    // Derived biometrics
    const hr = Math.round(65 + (psi * 1.25))
    const br = Math.round(12 + (psi * 0.5))
    
    // Stress Level category
    let level = 'CALM'
    if (psi >= 70) {
      level = hydration < 15 ? 'CRITICAL HEALTH RISK' : 'PHYSICAL EXHAUSTION'
    } else if (psi >= 45) {
      level = 'ELEVATED LOAD'
    }
    
    return {
      temp: stressTemp,
      trackTemp: stressTrackTemp,
      gforce: stressGForce,
      lap: stressLap,
      hydration,
      psi,
      hr,
      br,
      level
    }
  }, [stressTemp, stressTrackTemp, stressGForce, stressLap, stressHydrationOverride])

  const conversationMeta = () => ({
    createdAt: new Date().toISOString(),
    recordNumber: conversationLog.length + 1,
    lapNumber: replayData?.comparison?.current?.lap_number || null,
    lapProgress: Number(lapProgress.toFixed(4)),
    lapSeconds: Number((lapProgress * (replayData?.comparison?.current?.duration || 90)).toFixed(3)),
    circuit: replayData?.session?.circuit_short_name || replayCircuit,
  })

  const buildHistoryTelemetry = useCallback((capture, progressOverride = lapProgress) => {
    const actualLap = replayData?.comparison?.current
    const duration = actualLap?.duration || 90
    return {
      lapNumber: actualLap?.lap_number || null,
      lapProgress: Number(progressOverride.toFixed(4)),
      lapSeconds: Number((progressOverride * duration).toFixed(3)),
      cockpitTemp: stressMetrics.temp,
      trackTemp: stressMetrics.trackTemp,
      gForce: stressMetrics.gforce,
      hydration: stressMetrics.hydration,
      psi: stressMetrics.psi,
      heartRate: stressMetrics.hr,
      breathingRate: stressMetrics.br,
      source: replayData ? 'historical' : 'demo-derived',
      rawPayload: {
        capture,
        recorded_map: {
          circuit_id: replayCircuit,
          circuit_name: replayData?.session?.circuit_short_name || replayCircuit,
          session_key: replayData?.session?.session_key || null,
          map_source: replayData ? 'openf1-replay-reference' : 'local-fallback',
        },
        lap_comparison: replayData?.comparison || null,
      },
    }
  }, [lapProgress, replayCircuit, replayData, stressMetrics])

  const startHistorySession = useCallback(async () => {
    if (!isHistoryConfigured) throw new Error('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env first.')
    if (historySessionRef.current) return historySessionRef.current
    if (historyStartingRef.current) return historyStartingRef.current

    setUploadState('uploading')
    setUploadMessage('CREATING LAP RECORD…')
    const pending = (async () => {
      const token = await historyAccessToken()
      const { session } = await requestHistory('/api/history/start-session', {
        teamId: team.id,
        circuitName: replayData?.session?.circuit_short_name || replayCircuit,
        circuitYear: replayData?.session?.year || 2023,
        driverName: team.primaryDriver?.name || team.drivers?.[0]?.name || 'Demo driver',
        source: replayData ? 'historical-replay' : 'live-demo',
      }, token)
      historySessionRef.current = session.id
      await requestHistory('/api/history/log-telemetry', {
        sessionId: session.id,
        telemetry: buildHistoryTelemetry('lap-start', 0),
      }, token)
      setUploadState('saved')
      setUploadMessage(`LAP RECORD ACTIVE / ${session.id.slice(0, 8).toUpperCase()}`)
      return session.id
    })()

    historyStartingRef.current = pending
    try {
      return await pending
    } catch (error) {
      setUploadState('error')
      setUploadMessage(error.message || 'UPLOAD COULD NOT START')
      throw error
    } finally {
      historyStartingRef.current = null
    }
  }, [buildHistoryTelemetry, replayCircuit, replayData, team])

  const uploadLapSnapshot = useCallback(async (capture = 'manual-upload') => {
    try {
      setUploadState('uploading')
      setUploadMessage('SAVING LAP STATE…')
      const sessionId = await startHistorySession()
      const token = await historyAccessToken()
      await requestHistory('/api/history/log-telemetry', {
        sessionId,
        telemetry: buildHistoryTelemetry(capture),
      }, token)
      setUploadState('saved')
      setUploadMessage(`MAP + TIME SAVED / ${capture.toUpperCase()}`)
    } catch (error) {
      setUploadState('error')
      setUploadMessage(error.message || 'UPLOAD FAILED')
    }
  }, [buildHistoryTelemetry, startHistorySession])

  const finishHistorySession = useCallback(async (status) => {
    const sessionId = historySessionRef.current
    if (!sessionId || historyFinishingRef.current) return
    historyFinishingRef.current = true
    try {
      setUploadState('uploading')
      setUploadMessage(status === 'stopped' ? 'SAVING INCOMPLETE LAP…' : 'SAVING COMPLETED LAP…')
      const token = await historyAccessToken()
      await requestHistory('/api/history/log-telemetry', {
        sessionId,
        telemetry: buildHistoryTelemetry(status === 'stopped' ? 'lap-stopped-incomplete' : 'lap-finished'),
      }, token)
      await requestHistory('/api/history/end-session', { sessionId, status }, token)
      setUploadState('saved')
      setUploadMessage(status === 'stopped' ? 'INCOMPLETE LAP SAVED' : 'COMPLETED LAP SAVED')
    } catch (error) {
      setUploadState('error')
      setUploadMessage(error.message || 'FINAL UPLOAD FAILED')
    } finally {
      historyFinishingRef.current = false
    }
  }, [buildHistoryTelemetry])

  const recordRadioHistory = useCallback(async ({ role, transcript, mood = null, issue = null, confidence = null, trackContext = null, provider = 'pitwall-ai' }) => {
    if (!transcript?.trim() || (lapState !== 'running' && !historySessionRef.current)) return
    try {
      const sessionId = historySessionRef.current || await startHistorySession()
      const token = await historyAccessToken()
      await requestHistory('/api/history/log-event', {
        sessionId,
        role,
        transcript,
        detectedMood: mood,
        moodConfidence: confidence,
        issue,
        classifierConfidence: confidence,
        provider,
        trackContext,
        telemetry: buildHistoryTelemetry(`${role}-radio`),
      }, token)
      setUploadState('saved')
      setUploadMessage(`${role.toUpperCase()} RADIO SAVED`)
    } catch (error) {
      setUploadState('error')
      setUploadMessage(error.message || 'RADIO LOG NOT SAVED')
    }
  }, [buildHistoryTelemetry, lapState, startHistorySession])

  useEffect(() => {
    const updateProgress = () => {
      const section = sequenceRef.current
      if (!section) return
      const rect = section.getBoundingClientRect()
      const distance = section.offsetHeight - window.innerHeight
      const nextProgress = Math.min(1, Math.max(0, -rect.top / distance))
      const lockThreshold = 0.72

      // The intro is a one-way onboarding transition. Once the wheel is locked
      // and its controls become live, scrolling up keeps the user at that exact
      // control position instead of returning to the non-interactive intro.
      if (nextProgress >= lockThreshold && lockedScrollYRef.current === null) {
        const sectionTop = window.scrollY + rect.top
        lockedScrollYRef.current = sectionTop + distance * lockThreshold
      }

      if (lockedScrollYRef.current !== null && window.scrollY < lockedScrollYRef.current) {
        window.scrollTo({ top: lockedScrollYRef.current, behavior: 'auto' })
        setProgress(lockThreshold)
        return
      }

      setProgress(nextProgress)
    }
    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)
    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setReplayLoading(true)
    setReplayError('')
    fetch(apiUrl(`/api/replay?circuit=${replayCircuit}`))
      .then((response) => {
        if (!response.ok) throw new Error('Selected circuit data is unavailable')
        return response.json()
      })
      .then((payload) => { if (!cancelled) setReplayData(payload) })
      .catch((error) => { if (!cancelled) { setReplayData(null); setReplayError(error.message) } })
      .finally(() => { if (!cancelled) setReplayLoading(false) })
    return () => { cancelled = true }
  }, [replayCircuit, replayRequest])

  // Replay is deliberately paced to the historical lap duration. A 1:35.257
  // Bahrain lap therefore takes 95.257 seconds in the interface, rather than
  // using a shortened demo animation.
  useEffect(() => {
    if (lapState !== 'running') return undefined
    const selectedDuration = replayData?.comparison?.current?.duration
    const durationMs = Number.isFinite(selectedDuration) && selectedDuration > 0
      ? selectedDuration * 1000
      : 90_000
    const startedAt = window.performance.now()
    let frame
    const tick = (now) => {
      const nextProgress = Math.min(1, (now - startedAt) / durationMs)
      setLapProgress(nextProgress)
      if (nextProgress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [lapState, replayData])

  useEffect(() => {
    if (lapProgress >= 1) setLapState('finished')
  }, [lapProgress])

  useEffect(() => {
    if (lapState !== 'finished' || historyFinishingRef.current) return
    void finishHistorySession(lapStoppedEarly ? 'stopped' : 'completed')
  }, [finishHistorySession, lapState, lapStoppedEarly])

  // Auto-hide the 3 panels after 3 seconds when run completes
  useEffect(() => {
    let timeout
    if (lapState === 'finished') {
      timeout = setTimeout(() => {
        setLapState('idle')
      }, 3000)
    }
    return () => clearTimeout(timeout)
  }, [lapState])

  const startLap = () => {
    if (lapState === 'running') return
    // The button remains usable while the historical source reconnects. The
    // run uses the existing on-screen circuit fallback, then upgrades to the
    // selected circuit data whenever the API becomes available.
    if (!replayData) setReplayRequest((request) => request + 1)
    setEngineerMode(false)
    setLapProgress(0)
    setRadioEvents([])
    setDriverTrackContext(null)
    setLapStoppedEarly(false)
    historySessionRef.current = null
    historyFinishingRef.current = false
    setUploadState(isHistoryConfigured ? 'uploading' : 'unavailable')
    setUploadMessage(isHistoryConfigured ? 'OPENING LAP RECORD…' : 'ADD VITE_SUPABASE VALUES TO frontend/.env')
    setLapState('running')
    if (isHistoryConfigured) void startHistorySession()
  }

  const stopLap = () => {
    if (lapState !== 'running') return
    setLapStoppedEarly(true)
    setLapState('finished')
    setEngineerMode(true)
  }

  // ── Engineer hold-to-speak ──
  const handleEngineerDown = useCallback(async () => {
    if (progress < 0.72 || engineerRecorder.recording || driverRecorder.recording) return
    // Manual pit-wall radio is deliberately retained as a later-stage override.
    setAutoEngineerResponse(null)
    await engineerRecorder.start()
  }, [engineerRecorder, driverRecorder, progress])

  const handleEngineerUp = useCallback(async () => {
    if (!engineerRecorder.recording) return
    setEngineerProcessing(true)
    const result = await engineerRecorder.stop()
    if (!result) { setEngineerProcessing(false); return }

    const { transcript, blob } = result
    let text = transcript?.trim()
    
    // Try to get the high-accuracy transcript from Whisper first
    try {
      if (blob) {
        const whisperRes = await requestTranscription(blob, 'engineer', team)
        if (whisperRes.transcription) text = whisperRes.transcription
      }
    } catch {}

    if (text) setEngineerTranscript(text)

    // Append to full conversation history
    setConversationLog(prev => [...prev, {
      ...conversationMeta(),
      id: `${Date.now()}-engineer`,
      role: 'engineer',
      text: text || engineerTranscript || '',
      mood: 'ENGINEER',
      issue: 'ENGINEER RADIO',
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])

    try {
      // Send text to backend for keyword extraction
      const res = await requestRadioAnalysis('/api/analyse/engineer', text || engineerTranscript || '', team, null)
      let kws = res.keywords?.length > 0 ? res.keywords : res.keyword ? [res.keyword] : []
      
      // If backend returned the default fallback, try smart extraction
      if (kws.length === 0 || (kws.length === 1 && kws[0] === 'CHECK RADIO')) {
        const smart = smartExtractKeywords(text || '')
        if (smart.length > 0) kws = smart
      }

      setWheelKeywords(kws)
      setShowWheelKeywords(false)
      setTimeout(() => setShowWheelKeywords(true), 60)
      setTimeout(() => setShowWheelKeywords(false), kws.length * 3000 + 300)
    } catch {
      // Local fallback using the real transcript
      let kws = extractEngineerKeywordsLocal(text || engineerTranscript || '')
      if (kws.length === 0 || (kws.length === 1 && kws[0] === 'CHECK RADIO')) {
        const smart = smartExtractKeywords(text || engineerTranscript || '')
        if (smart.length > 0) kws = smart
      }
      if (kws.length === 0) kws = ['CHECK RADIO']

      setWheelKeywords(kws)
      setShowWheelKeywords(false)
      setTimeout(() => setShowWheelKeywords(true), 60)
      setTimeout(() => setShowWheelKeywords(false), kws.length * 3000 + 300)
    } finally {
      void recordRadioHistory({
        role: 'engineer',
        transcript: text || engineerTranscript || 'Engineer radio received.',
        issue: 'MANUAL ENGINEER RADIO',
        provider: 'manual-override',
      })
      setEngineerProcessing(false)
    }
  }, [engineerRecorder, driverRecorder, team, engineerTranscript, recordRadioHistory])

  // ── Driver hold-to-speak ──
  const handleDriverDown = useCallback(async () => {
    if (progress < 0.72 || driverRecorder.recording || engineerRecorder.recording) return
    onDriverSpeak?.()
    setDriverTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    setDriverConfidence(null)
    setDriverReply('')
    setAutoEngineerResponse(null)
    await driverRecorder.start()
  }, [driverRecorder, engineerRecorder, onDriverSpeak, progress])

  const handleDriverUp = useCallback(async () => {
    if (!driverRecorder.recording) return
    setDriverProcessing(true)
    const result = await driverRecorder.stop()
    if (!result) { setDriverProcessing(false); return }

    const { transcript, audioFeatures, blob, recordingDurationSec } = result
    let text = transcript?.trim()
    
    // ── Speech cadence analysis ──────────────────────────────────────────────────
    // WPM < 70 during a 3s+ recording = slow/laboured speech / taking long pauses
    const wordCount = (text || '').trim().split(/\s+/).filter(Boolean).length
    const wpm = recordingDurationSec > 1 ? Math.round((wordCount / recordingDurationSec) * 60) : 999
    const isSlowSpeech = recordingDurationSec >= 3 && wpm < 70
    const speechCadenceNote = isSlowSpeech
      ? `Slow speech detected (${wpm} WPM / ${recordingDurationSec.toFixed(1)}s recording — taking long pauses)`
      : null
    
    // Try to get the high-accuracy transcript from Whisper first
    try {
      if (blob) {
        const whisperRes = await requestTranscription(blob, 'driver', team)
        if (whisperRes.transcription) text = whisperRes.transcription
      }
    } catch {}

    if (text) setDriverTranscript(text)

    // Determine mood from BOTH text cuss-words AND audio RMS energy
    // RMS > 0.18 = high vocal energy (ANGRY), > 0.08 = medium (FRUSTRATED)
    let rmsBasedMood = 'CALM'
    if (audioFeatures.rms > 0.18) rmsBasedMood = 'ANGRY'
    else if (audioFeatures.rms > 0.08) rmsBasedMood = 'FRUSTRATED'

    // Explicitly check for cuss words or asterisks (censored profanity)
    const CUSS = ['shit', 'damn', 'crap', 'hell', 'fuck', 'bloody', 'bastard', 'rubbish', 'ridiculous', 'useless', 'idiot', 'stupid', 'terrible', 'horrible', 'awful', 'pathetic', 'garbage', 'trash', 'dammit', 'bollocks', 'screw', 'sucks', 'hate', 'worst', 'disaster', 'unbelievable', 'insane']
    const censoredCount = (text?.match(/\*{3,}/g) || []).length
    const cussCount = CUSS.filter(w => text?.toLowerCase().includes(w)).length + censoredCount

    try {
      // Send transcript + audio features to backend for classification
      const res = await requestRadioAnalysis('/api/analyse/driver', text || driverTranscript || '', team, audioFeatures, {
        circuit: replayCircuit,
        lapProgress,
      })
      let textMood = res.mood || res.state || 'CALM'
      
      // Force text mood to ANGRY if explicit profanity is found, overriding backend
      if (cussCount >= 1) textMood = 'ANGRY'

      // Take the more extreme of the two mood signals
      const moodRank = { CALM: 0, FOCUSED: 0, REVIEW: 1, FRUSTRATED: 2, URGENT: 3, ANGRY: 4 }
      const finalMood = (moodRank[rmsBasedMood] || 0) >= (moodRank[textMood] || 0) ? rmsBasedMood : textMood

      // ── Voice + Telemetry + Speech Cadence — fused stress classification ────────
      // Inputs:
      //   stressMetrics.psi  — composite physical stress index (0–100)
      //   stressMetrics.hydration — current hydration %
      //   isSlowSpeech — true when WPM < 70 across a 3s+ recording
      //   finalMood — text + RMS derived emotion
      let fusedMood = finalMood
      let fusedIssue = res.issue || res.keyword || ''

      const criticalCondition = stressMetrics.psi >= 70 && stressMetrics.hydration < 15
      const exhaustedCondition = stressMetrics.psi >= 70

      if (criticalCondition || (isSlowSpeech && stressMetrics.hydration < 15)) {
        // Worst case: critical dehydration + high PSI or slow speech
        // ONLY update the issue text to flag the health risk. 
        // Mood remains exactly what the audio/text analysis found (e.g. CALM).
        fusedIssue = `CRITICAL HEALTH RISK${speechCadenceNote ? ` — ${speechCadenceNote}` : ''}`
      } else if (exhaustedCondition || isSlowSpeech) {
        // Physical exhaustion OR slow/laboured speech pattern detected
        const reasons = [
          exhaustedCondition && `PSI ${stressMetrics.psi}/100`,
          stressMetrics.hydration <= 30 && `Hydration ${stressMetrics.hydration}%`,
          isSlowSpeech && `${wpm} WPM (slow speech)`,
          stressMetrics.lap > 45 && `Lap ${stressMetrics.lap}/78 (race fatigue)`,
        ].filter(Boolean).join(' · ')
        
        fusedIssue = (finalMood === 'ANGRY' || finalMood === 'FRUSTRATED') 
          ? `${res.issue || 'DRIVER DISTRESS'} — ${reasons}`
          : `PHYSICAL EXHAUSTION — ${reasons}`
      }

      setDriverMood(fusedMood)
      setDriverIssue(fusedIssue)
      setDriverConfidence(res.moodConfidence ?? res.confidence ?? null)
      setDriverReply(res.engineerReply || '')
      setDriverTrackContext(res.trackContext || null)
      setAutoEngineerResponse({
        reply: res.engineerReply || 'Copy. State the car issue and the affected corner.',
        display: res.driverDisplay || res.keyword || 'REPORT ISSUE',
        action: res.recommendedAction || 'State the issue and affected corner.',
      })

      // Append driver + AI thread to conversation log
      const nowTs = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setConversationLog(prev => [...prev,
        {
          ...conversationMeta(),
          id: `${Date.now()}-driver`,
          role: 'driver',
          text: text || driverTranscript || '',
          mood: fusedMood,
          issue: fusedIssue,
          confidence: res.moodConfidence ?? res.confidence ?? null,
          trackContext: res.trackContext || null,
          ts: nowTs,
        },
        {
          ...conversationMeta(),
          id: `${Date.now()}-ai`,
          role: 'ai',
          text: res.engineerReply || 'Copy. State the car issue and the affected corner.',
          mood: 'AI',
          issue: res.driverDisplay || 'PITWALL AI',
          trackContext: res.trackContext || null,
          ts: nowTs,
        },
      ])

      if (lapState === 'running') {
        const duration = replayData?.comparison?.current?.duration || 90
        const eventProgress = Math.max(0, Math.min(1, lapProgress))
        setRadioEvents((events) => [...events, {
          progress: eventProgress,
          seconds: duration * eventProgress,
          mood: fusedMood,
          issue: fusedIssue || 'RADIO EVENT',
          label: fusedIssue || 'RADIO EVENT',
          detail: `“${text || driverTranscript || 'Driver radio'}”`,
          transcript: text || driverTranscript || '',
          trackContext: res.trackContext || null,
          source: 'LIVE RADIO',
        }].slice(-4))
      }

      void recordRadioHistory({
        role: 'driver',
        transcript: text || driverTranscript || 'Driver radio received.',
        mood: fusedMood,
        issue: fusedIssue,
        confidence: res.moodConfidence ?? res.confidence ?? null,
        trackContext: res.trackContext || null,
        provider: res.provider || 'pitwall-ai',
      })
      void recordRadioHistory({
        role: 'ai',
        transcript: res.engineerReply || 'Copy. State the car issue and the affected corner.',
        issue: res.driverDisplay || res.keyword || 'PITWALL AI',
        trackContext: res.trackContext || null,
        provider: 'pitwall-ai-auto-reply',
      })

      // Driver radio: wheel screen stays silent — only engineer-side messages display on the wheel.
    } catch {
      // Local fallback: combine text analysis + rms
      const local = analyseDriverMessage(text || driverTranscript || '')
      const moodRank = { CALM: 0, FOCUSED: 0, REVIEW: 1, FRUSTRATED: 2, URGENT: 3, ANGRY: 4 }
      const localMoodStr = local.state || 'CALM'
      const finalMood = (moodRank[rmsBasedMood] || 0) >= (moodRank[localMoodStr] || 0) ? rmsBasedMood : localMoodStr
      setDriverMood(finalMood)
      setDriverIssue(local.issue || '')
      setDriverConfidence(local.confidence ?? null)
      const autoResponse = autoEngineerResponseLocal(local.issue, text || driverTranscript || '', finalMood)
      setDriverReply(autoResponse.reply)
      setAutoEngineerResponse(autoResponse)
      setDriverTrackContext(null)
      if (lapState === 'running') {
        const duration = replayData?.comparison?.current?.duration || 90
        const eventProgress = Math.max(0, Math.min(1, lapProgress))
        setRadioEvents((events) => [...events, {
          progress: eventProgress,
          seconds: duration * eventProgress,
          mood: finalMood,
          issue: local.issue || 'RADIO EVENT',
          label: local.issue || 'RADIO EVENT',
          detail: `“${text || driverTranscript || 'Driver radio'}”`,
          transcript: text || driverTranscript || '',
          source: 'LIVE RADIO / LOCAL FALLBACK',
        }].slice(-4))
      }
      // Append fallback driver + AI thread to conversation log
      const nowTs = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setConversationLog(prev => [...prev,
        { ...conversationMeta(), id: `${Date.now()}-driver`, role: 'driver', text: text || driverTranscript || '', mood: finalMood, issue: local.issue || '', ts: nowTs },
        { ...conversationMeta(), id: `${Date.now()}-ai`, role: 'ai', text: autoResponse.reply || 'Copy.', mood: 'AI', issue: autoResponse.display || 'PITWALL AI', ts: nowTs },
      ])
      void recordRadioHistory({
        role: 'driver',
        transcript: text || driverTranscript || 'Driver radio received.',
        mood: finalMood,
        issue: local.issue || 'RADIO EVENT',
        provider: 'local-fallback',
      })
      void recordRadioHistory({
        role: 'ai',
        transcript: autoResponse.reply || 'Copy.',
        issue: autoResponse.display || 'PITWALL AI',
        provider: 'local-fallback-auto-reply',
      })
    } finally {
      setDriverProcessing(false)
    }
  }, [driverRecorder, engineerRecorder, team, driverTranscript, lapState, lapProgress, replayData, replayCircuit, recordRadioHistory, stressMetrics])

  const panelOpacity = Math.max(0, Math.min(1, (progress - .72) * 3.6))
  const controlsEnabled = progress >= 0.72
  const introOpacity = Math.max(0, 1 - progress * 2.5)
  const wheelStyle = {
    transform: `translate(calc(-50% + ${pointer.x * 12}px), calc(-50% + ${progress * 95 + pointer.y * 6}px)) scale(${1.02 - progress * .14}) rotate(${progress * 1.2 + pointer.x * 1.1}deg)`,
  }
  const moveWheel = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setPointer({ x: (event.clientX - rect.left) / rect.width * 2 - 1, y: (event.clientY - rect.top) / rect.height * 2 - 1 })
  }

  return <section className="cockpit-sequence" ref={sequenceRef}>
    <div className="cockpit-sticky" onPointerMove={moveWheel} onPointerLeave={() => setPointer({ x: 0, y: 0 })}>
      {team.controllerVideo && (
        <>
          <video className="cockpit-background-video" src={team.controllerVideo} autoPlay muted loop playsInline preload="auto" aria-hidden="true" />
          <div className="cockpit-background-shade" aria-hidden="true" />
        </>
      )}
      <StepHeader step={3} title={`${team.name.toUpperCase()} / COCKPIT LINK`} onBack={onBack} />
      <div className="cockpit-topline">
        <span><i /> TEAM PROFILE LOCKED</span>
        <BackendStatus />

        {/* ── Telemetry Condition Selectors ────────────────────────────────── */}
        {!engineerMode && <div className="telemetry-dropdowns" style={{ opacity: panelOpacity, pointerEvents: panelOpacity > 0.5 ? 'auto' : 'none', transition: 'opacity 0.1s ease-out' }}>
          {/* 1 — Remaining Hydration */}
          <label className="telem-picker">
            <span>HYDRATION</span>
            <select
              value={stressHydrationOverride !== null ? stressHydrationOverride : ''}
              onChange={(e) => {
                const v = e.target.value
                setStressHydrationOverride(v === '' ? null : Number(v))
              }}
            >
              <option value="">AUTO</option>
              <option value="5">5%</option>
              <option value="10">10%</option>
              <option value="15">15%</option>
              <option value="20">20%</option>
              <option value="25">25%</option>
              <option value="30">30%</option>
            </select>
            <input
              type="number"
              min="1" max="100" step="1"
              placeholder="—%"
              value={stressHydrationOverride !== null ? stressHydrationOverride : ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setStressHydrationOverride(isNaN(v) ? null : Math.min(100, Math.max(1, v)))
              }}
            />
          </label>

          {/* 2 — Cockpit Temperature */}
          <label className="telem-picker">
            <span>COCKPIT TEMP</span>
            <select
              value={stressTemp}
              onChange={(e) => setStressTemp(Number(e.target.value))}
            >
              {[15, 18, 20, 22, 24, 26, 28, 30, 32, 35, 38, 40, 42, 45].map(t => (
                <option key={t} value={t}>{t}°C</option>
              ))}
            </select>
          </label>

          {/* 3 — Track Temperature */}
          <label className="telem-picker">
            <span>TRACK TEMP</span>
            <select
              value={stressTrackTemp}
              onChange={(e) => setStressTrackTemp(Number(e.target.value))}
            >
              {[20, 23, 25, 28, 30, 32, 35, 38, 40, 43, 45, 48, 50, 55].map(t => (
                <option key={t} value={t}>{t}°C</option>
              ))}
            </select>
          </label>

          {/* 4 — Current Lap (second-half focused) */}
          <label className="telem-picker">
            <span>CURRENT LAP</span>
            <select
              value={stressLap}
              onChange={(e) => setStressLap(Number(e.target.value))}
            >
              {[1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,78].map(l => (
                <option key={l} value={l}>L{l}</option>
              ))}
            </select>
          </label>
        </div>}

        <label className="replay-circuit-picker">REPLAY CIRCUIT <select value={replayCircuit} onChange={(event) => { setReplayCircuit(event.target.value); setLapState('idle'); setLapProgress(0); setEngineerMode(false) }} disabled={lapState === 'running'}><option value="bahrain">BAHRAIN / 2023</option><option value="qatar">QATAR / 2023</option><option value="singapore">SINGAPORE / 2023</option></select></label>
      </div>

      {/* Intro copy fades out as wheel locks */}
      <div className="sequence-copy" style={{ opacity: introOpacity, transform: `translateY(${-progress * 65}px)` }}>
        <div className="soft-label"><span /> PITWALL INTERFACE</div>
        <h1>Your wheel is<br /><em>the signal.</em></h1>
        <p>Hold <strong>ENGINEER RADIO</strong> or <strong>DRIVER RADIO</strong> on the wheel to speak. The AI will transcribe, classify, and relay your message.</p>
      </div>

      {/* Steering wheel */}
      <div className="sequence-wheel" style={wheelStyle}>
        <F1Wheel
          team={team}
          keywords={wheelKeywords}
          showKeywords={showWheelKeywords}
          controlsEnabled={controlsEnabled}
          engineerRecording={engineerRecorder.recording}
          driverRecording={driverRecorder.recording}
          onEngineerDown={handleEngineerDown}
          onEngineerUp={handleEngineerUp}
          onDriverDown={handleDriverDown}
          onDriverUp={handleDriverUp}
          lapState={lapState}
          lapReady={!replayLoading && Boolean(replayData)}
          lapAvailabilityLabel={replayError ? 'DATA UNAVAILABLE' : replayLoading ? 'LOADING REAL DATA' : undefined}
          onStartLap={startLap}
          onStopLap={stopLap}
        />
      </div>

      {/* Hood decoration */}
      <div className="cockpit-hood" style={{ opacity: Math.min(1, progress * 1.7) }}><span className="hood-light hood-left" /><span className="hood-light hood-right" /><b>COCKPIT LINK</b></div>

      {lapState !== 'idle' && !engineerMode && <LapRunConsole
        team={team}
        lapState={lapState}
        lapProgress={lapProgress}
        driverTranscript={driverTranscript}
        engineerTranscript={engineerTranscript}
        driverMood={driverMood}
        driverIssue={driverIssue}
        autoEngineerReply={autoEngineerResponse?.reply}
        replayData={replayData}
        onEngineerMode={() => setEngineerMode(true)}
        uploadState={uploadState}
        uploadMessage={uploadMessage}
        onUploadNow={() => void uploadLapSnapshot('manual-upload')}
      />}

      {/* Persistent blue live-signal panel. It becomes readable once the wheel locks. */}
      <div className="sequence-radio" style={{ opacity: panelOpacity, pointerEvents: panelOpacity > .5 ? 'auto' : 'none', transform: `translateX(${(1 - panelOpacity) * 36}px)` }}>
        <LiveRadioCard team={team} onOpen={() => onStart?.()} onAccessPitwall={() => setEngineerMode(true)} signalMessage={driverProcessing ? 'TRANSCRIBING / ANALYSING…' : driverTranscript ? `DRIVER: ${driverTranscript}` : ''} mood={driverMood} issue={driverIssue} reply={driverReply} processing={driverProcessing} confidence={driverConfidence} timestamp={driverTimestamp} />
      </div>

      {/* Driver-focused auto reply. Manual engineer radio remains an override. */}
      <div className="cockpit-transcript cockpit-transcript-left" style={{ opacity: panelOpacity, pointerEvents: panelOpacity > .5 ? 'auto' : 'none', transform: `translateX(${(1 - panelOpacity) * -28}px)` }}>
        <div className="ct-label"><span className="ct-dot" /> ENGINEER RADIO / MANUAL OVERRIDE</div>
        {engineerProcessing
          ? <p className="ct-processing">PROCESSING…</p>
          : engineerTranscript
          ? <p className="ct-text">"{engineerTranscript}"</p>
          : <p className="ct-idle">Hold ENGINEER RADIO to speak.</p>}
        {wheelKeywords.length > 0 && !engineerProcessing && (
          <div className="ct-keywords">
            {wheelKeywords.map((kw, i) => <span key={i} className="ct-kw">{kw}</span>)}
          </div>
        )}
      </div>

      <div className="scroll-marker" style={{ opacity: introOpacity }}>SCROLL <span>↓</span></div>
      {engineerMode && <EngineerMode 
        team={team} 
        driverTranscript={driverTranscript} 
        driverIssue={driverIssue} 
        driverMood={driverMood} 
        driverTrackContext={driverTrackContext}
        radioEvents={radioEvents} 
        lapProgress={lapProgress}
        autoEngineerResponse={autoEngineerResponse} 
        replayData={replayData} 
        replayError={replayError}
        stoppedEarly={lapStoppedEarly} 
        stoppedAt={lapProgress * (replayData?.comparison?.current?.duration || 0)} 
        onClose={() => setEngineerMode(false)} 
        stressMetrics={stressMetrics}
        setStressTemp={setStressTemp}
        setStressTrackTemp={setStressTrackTemp}
        setStressGForce={setStressGForce}
        setStressLap={setStressLap}
        conversationLog={conversationLog}
      />}
    </div>
  </section>
}


// ─── Sample messages ──────────────────────────────────────────────────────────

const driverSamples = ['The rear is sliding badly through Turn 2.', 'The front tyres are gone.', "I can't hear you properly.", 'Box this lap.', 'Safety car, safety car.']
const engineerSamples = ['Take less curb at Turn 2.', 'Box this lap.', 'Safety car deployed.', 'Blue flag.', 'Take less curb at Turn 4 and use boost on the exit.']

// ─── Local fallback helpers ───────────────────────────────────────────────────

/**
 * Extract the top 2–3 most meaningful words from raw speech,
 * stripping stop-words. Used when no pattern matches.
 */
const STOP_WORDS = new Set([
  'a','an','the','i','we','you','they','he','she','it','my','your','our','their','its',
  'is','am','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','could','should','may','might','must','shall','can',
  'and','but','or','so','yet','for','nor','on','in','at','by','to','of','up',
  'this','that','these','those','what','just','ok','okay','um','uh','like','yeah','yep','no','yes',
  'with','about','from','into','then','than','also','very','quite',
])

function smartExtractKeywords(transcript) {
  if (!transcript?.trim()) return ['CHECK RADIO']
  const words = transcript
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 1 && !STOP_WORDS.has(w.toLowerCase()))
  const unique = [...new Set(words)]
  if (unique.length === 0) return ['CHECK RADIO']
  
  // If 3 words or fewer, keep them all on one screen
  if (unique.length <= 3) {
    return [unique.join(' ')]
  }
  // If exactly 4 words, split evenly into two screens of 2 words
  if (unique.length === 4) {
    return [unique.slice(0, 2).join(' '), unique.slice(2, 4).join(' ')]
  }
  
  // For 5+ words, chunk into groups of 3
  const labels = []
  for (let i = 0; i < unique.length; i += 3) {
    labels.push(unique.slice(i, i + 3).join(' '))
  }
  return labels.slice(0, 3) // Max 3 screens to keep it brief
}

function extractTurn(message) {
  // Handle spelled out numbers and common mishearings (like "to" -> 2)
  const map = {
    one: '1', two: '2', to: '2', too: '2',
    three: '3', tree: '3', four: '4', for: '4',
    five: '5', six: '6', seven: '7', eight: '8', ate: '8',
    nine: '9', ten: '10', eleven: '11', twelve: '12'
  }
  const match = message.match(/turn\s*(\d{1,2}|one|two|to|too|three|tree|four|for|five|six|seven|eight|ate|nine|ten|eleven|twelve)/i)
  if (!match) return ''
  let val = match[1].toLowerCase()
  return `T${map[val] || val}`
}

function analyseDriverMessage(message) {
  const text = message.toLowerCase()
  const turn = extractTurn(message)

  // Extended cuss/frustration word list covering common speech
  const CUSS = [
    'shit', 'damn', 'crap', 'hell', 'fuck', 'bloody', 'bastard', 'rubbish',
    'ridiculous', 'useless', 'idiot', 'stupid', 'terrible', 'horrible',
    'awful', 'pathetic', 'garbage', 'trash', 'dammit', 'bollocks', 'crap',
    'screw', 'sucks', 'hate', 'worst', 'disaster', 'unbelievable', 'insane',
    'broken', 'unacceptable', 'nightmare', 'impossible', 'problem', 'issue',
  ]
  
  // Browser SpeechRecognition automatically censors profanity with asterisks (e.g., ****)
  const censoredCount = (message.match(/\*{3,}/g) || []).length
  const rawCussCount = CUSS.filter((w) => text.includes(w)).length
  const cussCount = rawCussCount + censoredCount

  // Frustration phrases (negative statements even without cuss words)
  const frustrated = /can't|cannot|won't|not working|no grip|no traction|losing|sliding|oversteering|understeering|too (slow|fast|wide|tight)|going (wide|off|off-track)|missing|struggling|problem|issue|wrong|bad|worse|losing it|broken|unacceptable|nightmare|impossible/i.test(text)

  let state = 'CALM'
  if (/\bhelp\b|emergency|urgent|respond|can't hear|radio (failure|broken|down)/i.test(text)) state = 'URGENT'
  else if (cussCount >= 1) state = 'ANGRY'
  else if (frustrated) state = 'FRUSTRATED'
  else if (/rear|slid|throttle|traction|snap/.test(text)) state = 'FRUSTRATED'

  if (/rear|slid|throttle|traction|snap|oversteer/.test(text)) return { state, issue: 'REAR SLIP', keyword: `REAR SLIP${turn ? ` ${turn}` : ''}`, confidence: '92%' }
  if (/front|understeer|front grip/.test(text)) return { state, issue: 'FRONT GRIP', keyword: `FRONT GRIP${turn ? ` ${turn}` : ''}`, confidence: '88%' }
  if (/wheel|tyre|tire/.test(text)) return { state, issue: 'TYRE / WHEEL', keyword: `TYRE CHECK${turn ? ` ${turn}` : ''}`, confidence: '76%' }
  if (/car|balance|handling|unstable/.test(text)) return { state, issue: 'CAR BALANCE', keyword: `BALANCE CHECK${turn ? ` ${turn}` : ''}`, confidence: '66%' }
  if (/hear|radio|mic|microphone|signal|static/.test(text)) return { state: 'URGENT', issue: 'RADIO FAILURE', keyword: 'RADIO FAIL', confidence: '96%' }
  if (/safety car|vsc|yellow/.test(text)) return { state: 'FOCUSED', issue: 'RACE CONTROL', keyword: 'SAFETY CAR', confidence: '97%' }
  if (/box|pit|stop|come in/.test(text)) return { state: 'FOCUSED', issue: 'PIT REQUEST', keyword: 'BOX', confidence: '94%' }
  if (/brake|braking|lock/.test(text)) return { state, issue: 'BRAKING', keyword: `BRAKES${turn ? ` ${turn}` : ''}`, confidence: '85%' }
  if (/engine|power|deploy|ers|mgu|motor/.test(text)) return { state, issue: 'POWER UNIT', keyword: 'ENGINE ISSUE', confidence: '83%' }
  // If cuss words detected but no specific issue, it's an ANGRY/FRUSTRATED unclassified
  if (cussCount >= 1) return { state, issue: 'GENERAL COMPLAINT', keyword: 'DRIVER UNHAPPY', confidence: '70%' }
  return { state, issue: 'UNCLASSIFIED', keyword: 'REVIEW RADIO', confidence: '54%' }
}

// Offline/demo fallback for the same constrained driver-display protocol used by
// the backend. It keeps the interaction usable when the deployed API is asleep.
function autoEngineerResponseLocal(issue, message, mood) {
  const turn = message.match(/turn\s*(\d{1,2})/i)?.[1]
  const atTurn = turn ? ` at T${turn}` : ''
  const displayTurn = turn ? ` T${turn}` : ''
  const responses = {
    'REAR SLIP': { reply: `Copy. Rear slip${atTurn}. Short-shift and reduce exit throttle.`, display: `SHORT SHIFT${displayTurn}`, action: 'Short-shift; smooth the throttle on exit.' },
    'FRONT GRIP': { reply: `Copy. Front grip loss${atTurn}. Avoid the kerb and manage the entry.`, display: `MANAGE ENTRY${displayTurn}`, action: 'Avoid the kerb; protect front grip into the corner.' },
    'TYRE / WHEEL': { reply: `Copy. Tyre or wheel concern${atTurn}. Confirm front or rear, then describe the grip change.`, display: `TYRE CHECK${displayTurn}`, action: 'Confirm whether the issue is at the front or rear before changing setup.' },
    'CAR BALANCE': { reply: `Copy. Balance issue${atTurn}. Confirm whether it is front or rear limited.`, display: `BALANCE CHECK${displayTurn}`, action: 'Confirm the affected axle and corner before a manual engineer response.' },
    'BRAKING': { reply: `Copy. Brake issue${atTurn}. Brake earlier and keep the release smooth.`, display: `BRAKE EARLY${displayTurn}`, action: 'Brake earlier and release progressively.' },
    'GENERAL COMPLAINT': { reply: 'Copy. State the car system, the corner, and whether it is getting worse.', display: 'REPORT ISSUE', action: 'State the system, corner, and severity.' },
    'RADIO FAILURE': { reply: 'Copy. Radio check. Repeat only the critical car issue.', display: 'RADIO CHECK', action: 'Use short repeat-back messages until signal is clear.' },
    'PIT REQUEST': { reply: 'Copy. Pit request received. We are checking the window; stay on the current plan.', display: 'STAY ON PLAN', action: 'Await manual pit-wall confirmation before changing strategy.' },
    'RACE CONTROL': { reply: 'Copy. Follow the delta and wait for the next call.', display: 'HOLD DELTA', action: 'Follow the delta; await the next pit-wall instruction.' },
  }
  if (responses[issue]) return responses[issue]
  if (mood === 'ANGRY') return { reply: 'Copy. That sounds serious. State the car system, the corner, and whether it is getting worse.', display: 'REPORT ISSUE', action: 'State the system, corner, and severity.' }
  if (mood === 'FRUSTRATED') return { reply: 'Copy. Keep it short: issue, corner, and severity.', display: 'ISSUE / CORNER', action: 'Report the issue, corner, and severity.' }
  return { reply: 'Copy. State the car issue and the affected corner.', display: 'REPORT ISSUE', action: 'State the issue and affected corner.' }
}

function extractEngineerKeywordsLocal(message) {
  if (!message || !message.trim()) return []
  const text = message.toLowerCase()
  const turn = extractTurn(message)
  const keywords = []
  // Curb/apex/line instructions
  if (/less curb|less kerb|cut the apex|apex/.test(text)) keywords.push(`LESS CURB${turn ? ` ${turn}` : ''}`)
  if (/more curb|more kerb|use the curb/.test(text)) keywords.push(`USE CURB${turn ? ` ${turn}` : ''}`)
  // Throttle / deployment
  if (/\bboost\b|deploy|throttle up|full power|kers/.test(text)) keywords.push(`BOOST EXIT${turn ? ` ${turn}` : ''}`)
  if (/lift and coast|lift and\s|save fuel|manage fuel/.test(text)) keywords.push('SAVE FUEL')
  // Racing line
  if (/wide|run wide|go wide/.test(text)) keywords.push(`WIDE${turn ? ` ${turn}` : ''}`)
  if (/\btight\b|inside|inside line/.test(text)) keywords.push(`TIGHT${turn ? ` ${turn}` : ''}`)
  // Push / hold
  if (/push hard|push now|attack|go go go/.test(text)) keywords.push('PUSH NOW')
  if (/hold position|stay behind|stay out/.test(text)) keywords.push('HOLD POSITION')
  if (/delta|hold pace|maintain|manage gap/.test(text)) keywords.push('HOLD DELTA')
  // Strategy
  if (/plan\s+([a-z])/i.test(text)) {
    keywords.push(`PLAN ${text.match(/plan\s+([a-z])/i)[1].toUpperCase()}`)
  }
  // Tyres
  if (/manage tyre|tyre care|save tyre|look after/.test(text)) keywords.push('MANAGE TYRES')
  // Race control
  if (/safety car/.test(text)) keywords.push('SAFETY CAR')
  if (/blue flag/.test(text)) keywords.push('BLUE FLAG')
  if (/box|pit stop|come in/.test(text)) keywords.push('BOX THIS LAP')
  // Braking
  if (/brake later|brake early|trail brake/.test(text)) keywords.push(`BRAKE${turn ? ` ${turn}` : ''}`)
  // ERS / Battery
  if (/battery|ers mode|engine mode/.test(text)) keywords.push('ERS MODE')
  return keywords.length > 0 ? keywords : []
}

function confidenceLabel(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value || '—'
  return `${Math.round(numeric <= 1 ? numeric * 100 : numeric)}%`
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function apiUrl(path) {
  return `${API_BASE_URL}${path}`
}

async function requestRadioAnalysis(path, message, team, audioFeatures, context = {}) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, team: team.name, audioFeatures: audioFeatures || undefined, ...context }),
  })
  if (!response.ok) throw new Error('Radio analysis service unavailable')
  return response.json()
}

async function requestHistory(path, body, accessToken) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Supabase upload failed.')
  return payload
}

async function requestHistoryRead(path, accessToken) {
  const response = await fetch(apiUrl(path), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Supabase history could not be loaded.')
  return payload
}

async function requestTranscription(audioBlob, direction, team) {
  const path = `/api/transcribe/${direction}?team=${encodeURIComponent(team.name)}`
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': audioBlob.type || 'audio/webm' },
    body: audioBlob,
  })
  if (!response.ok) throw new Error('Transcription service unavailable')
  return response.json()
}

// ─── Mic button component ─────────────────────────────────────────────────────

function MicButton({ onResult, onTranscribing, disabled }) {
  const { recording, error, start, stop } = useVoiceRecorder()
  const [phase, setPhase] = useState('idle') // idle | recording | processing

  const handleMouseDown = async () => {
    if (disabled || phase !== 'idle') return
    setPhase('recording')
    await start()
  }

  const handleMouseUp = async () => {
    if (phase !== 'recording') return
    setPhase('processing')
    const result = await stop()
    if (result) {
      onTranscribing?.(true)
      onResult?.(result)
    }
    setPhase('idle')
    onTranscribing?.(false)
  }

  // Keyboard support: hold space
  const handleKeyDown = (e) => { if (e.key === ' ' && phase === 'idle') { e.preventDefault(); handleMouseDown() } }
  const handleKeyUp = (e) => { if (e.key === ' ' && phase === 'recording') { e.preventDefault(); handleMouseUp() } }

  return (
    <div className="mic-control">
      <button
        id="mic-record-btn"
        className={`mic-button mic-${phase}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={(e) => { e.preventDefault(); handleMouseDown() }}
        onTouchEnd={(e) => { e.preventDefault(); handleMouseUp() }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        disabled={disabled || phase === 'processing'}
        aria-label={phase === 'recording' ? 'Release to send' : 'Hold to speak'}
      >
        {phase === 'recording' ? <Square size={14} /> : <Mic size={14} />}
        <span>
          {phase === 'recording' ? 'RELEASE TO SEND' : phase === 'processing' ? 'PROCESSING…' : 'HOLD TO SPEAK'}
        </span>
      </button>
      {error && <p className="mic-error">{error}</p>}
    </div>
  )
}

// ─── Radio Desk ───────────────────────────────────────────────────────────────

function RadioDesk({ team, onBack }) {
  const [driverMessage, setDriverMessage] = useState(driverSamples[0])
  const [engineerMessage, setEngineerMessage] = useState(engineerSamples[0])
  const [driverAnalysis, setDriverAnalysis] = useState(() => analyseDriverMessage(driverSamples[0]))
  const [driverDisplay, setDriverDisplay] = useState(() => extractEngineerKeywordsLocal(engineerSamples[0]))
  const [driverProvider, setDriverProvider] = useState('local demo rules')
  const [engineerProvider, setEngineerProvider] = useState('local demo rules')
  const [analysingDriver, setAnalysingDriver] = useState(false)
  const [analysingEngineer, setAnalysingEngineer] = useState(false)

  // Steering wheel keyword sequence
  const [wheelKeywords, setWheelKeywords] = useState([])
  const [showWheelKeywords, setShowWheelKeywords] = useState(false)

  // Trigger the steering wheel keyword animation
  const triggerWheelDisplay = useCallback((keywords) => {
    setWheelKeywords(keywords)
    setShowWheelKeywords(false)
    setTimeout(() => setShowWheelKeywords(true), 80)
    // After all keywords have played (keywords.length × 3s), reset
    setTimeout(() => setShowWheelKeywords(false), keywords.length * 3000 + 200)
  }, [])

  // ── Driver: text send ──
  const sendDriverMessage = async () => {
    setAnalysingDriver(true)
    try {
      const result = await requestRadioAnalysis('/api/analyse/driver', driverMessage, team, null)
      setDriverAnalysis(result)
      setDriverProvider(result.provider || 'radio analysis service')
    } catch {
      setDriverAnalysis(analyseDriverMessage(driverMessage))
      setDriverProvider('local demo fallback')
    } finally {
      setAnalysingDriver(false)
    }
  }

  // ── Driver: voice send ──
  const sendDriverVoice = async ({ blob, audioFeatures }) => {
    setAnalysingDriver(true)
    try {
      // Try server-side Whisper transcription + analysis
      const result = await requestTranscription(blob, 'driver', team)
      if (result.transcription) setDriverMessage(result.transcription)
      setDriverAnalysis(result)
      setDriverProvider(result.provider || 'whisper + analysis')
    } catch {
      // Fallback: analyse text already in textarea using client-side audio features
      const result = await requestRadioAnalysis('/api/analyse/driver', driverMessage, team, audioFeatures).catch(() => null)
      if (result) {
        setDriverAnalysis(result)
        setDriverProvider(result.provider || 'local fallback')
      } else {
        const fallback = analyseDriverMessage(driverMessage)
        // Apply audio-based mood override
        if (audioFeatures?.rms > 0.18) fallback.state = 'ANGRY'
        else if (audioFeatures?.rms > 0.08) fallback.state = 'FRUSTRATED'
        setDriverAnalysis(fallback)
        setDriverProvider('local fallback (no whisper)')
      }
    } finally {
      setAnalysingDriver(false)
    }
  }

  // ── Engineer: text send ──
  const sendEngineerMessage = async () => {
    setAnalysingEngineer(true)
    try {
      const result = await requestRadioAnalysis('/api/analyse/engineer', engineerMessage, team, null)
      const keywords = result.keywords?.length > 0 ? result.keywords : [result.keyword || 'CHECK RADIO']
      setDriverDisplay(keywords)
      setEngineerProvider(result.provider || 'radio analysis service')
      triggerWheelDisplay(keywords)
    } catch {
      const keywords = extractEngineerKeywordsLocal(engineerMessage)
      setDriverDisplay(keywords)
      setEngineerProvider('local demo fallback')
      triggerWheelDisplay(keywords)
    } finally {
      setAnalysingEngineer(false)
    }
  }

  // ── Engineer: voice send ──
  const sendEngineerVoice = async ({ blob }) => {
    setAnalysingEngineer(true)
    try {
      const result = await requestTranscription(blob, 'engineer', team)
      if (result.transcription) setEngineerMessage(result.transcription)
      const keywords = result.keywords?.length > 0 ? result.keywords : [result.keyword || 'CHECK RADIO']
      setDriverDisplay(keywords)
      setEngineerProvider(result.provider || 'whisper + analysis')
      triggerWheelDisplay(keywords)
    } catch {
      const keywords = extractEngineerKeywordsLocal(engineerMessage)
      setDriverDisplay(keywords)
      setEngineerProvider('local fallback (no whisper)')
      triggerWheelDisplay(keywords)
    } finally {
      setAnalysingEngineer(false)
    }
  }

  const mood = driverAnalysis?.mood || driverAnalysis?.state || 'CALM'

  return <section className="radio-desk-page">
    <StepHeader step={3} title={`${team.name.toUpperCase()} / RADIO DESK`} onBack={onBack} />
    <div className="desk-wrap">
      <div className="desk-intro">
        <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> BACK TO COCKPIT LINK</button>
        <div className="soft-label"><span /> COMMUNICATION LOOP</div>
        <h1>Say it.<br /><em>Understand it.</em></h1>
        <p>Hold the mic button and speak, or type and send. The AI transcribes your voice, extracts key issues, and routes them instantly.</p>
      </div>

      <div className="radio-flow">
        {/* ── Driver panel ── */}
        <section className="message-panel" id="driver-panel">
          <div className="panel-title"><Mic size={15} /> DRIVER RADIO <span>01</span></div>
          <select value={driverMessage} onChange={(e) => setDriverMessage(e.target.value)}>
            <option value="">Select a demonstration message</option>
            {driverSamples.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <textarea value={driverMessage} onChange={(e) => setDriverMessage(e.target.value)} aria-label="Driver radio message" />
          <MicButton onResult={sendDriverVoice} disabled={analysingDriver} />
          <button className="send-button" onClick={sendDriverMessage} disabled={analysingDriver}>
            {analysingDriver ? 'ANALYSING…' : 'SEND TO ENGINEER'} <Send size={14} />
          </button>
        </section>

        {/* ── Engineer AI view ── */}
        <section className="engineer-view" id="engineer-ai-view">
          <span className="ai-label">AI INTERPRETATION</span>
          <div>
            <span>DRIVER MOOD</span>
            <b id="driver-mood-display" style={{ color: moodColor(mood) }}>{MOOD_LABEL[mood] || mood}</b>
          </div>
          <div>
            <span>ISSUE</span>
            <b>{driverAnalysis.issue}</b>
          </div>
          <div>
            <span>KEYWORD</span>
            <strong>{driverAnalysis.keyword}</strong>
          </div>
          <p>"{driverMessage}"</p>
          <small>CONFIDENCE {confidenceLabel(driverAnalysis.confidence)} / {driverProvider}</small>
        </section>

        {/* ── Engineer panel ── */}
        <section className="message-panel" id="engineer-panel">
          <div className="panel-title"><Volume2 size={15} /> ENGINEER RADIO <span>02</span></div>
          <select value={engineerMessage} onChange={(e) => setEngineerMessage(e.target.value)}>
            <option value="">Select a demonstration message</option>
            {engineerSamples.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <textarea value={engineerMessage} onChange={(e) => setEngineerMessage(e.target.value)} aria-label="Engineer radio message" />
          <MicButton onResult={sendEngineerVoice} disabled={analysingEngineer} />
          <button className="send-button" onClick={sendEngineerMessage} disabled={analysingEngineer}>
            {analysingEngineer ? 'COMPRESSING…' : 'SEND TO DRIVER'} <Send size={14} />
          </button>
        </section>

        {/* ── Driver steering wheel display ── */}
        <section className="driver-display" id="driver-wheel-display" data-active={showWheelKeywords ? 'true' : undefined}>
          <span>DRIVER DISPLAY / APPROVED MESSAGE</span>
          <div className="driver-display-wheel">
            <F1Wheel team={team} mode="engineer" setMode={() => {}} keywords={wheelKeywords} showKeywords={showWheelKeywords} />
          </div>
          <div className="driver-kw-list">
            {driverDisplay.map((kw, i) => (
              <b key={i} className={showWheelKeywords && wheelKeywords[i] ? 'kw-active' : ''}>{kw}</b>
            ))}
          </div>
          <small>WHITE COMMS MODE / {engineerProvider}</small>
        </section>
      </div>
    </div>
  </section>
}

// ─── Animated stat ─────────────────────────────────────────────────────────────

function AnimatedStat({ value }) {
  const match = String(value).match(/^(\D*)(\d+)(.*)$/)
  const prefix = match?.[1] || ''
  const numeric = match ? Number(match[2]) : null
  const suffix = match?.[3] || ''
  const [display, setDisplay] = useState(Number.isFinite(numeric) ? 0 : value)

  useEffect(() => {
    if (!Number.isFinite(numeric)) { setDisplay(value); return undefined }
    let frame
    const started = window.performance.now()
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 900)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(numeric * eased))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [numeric, value])

  return <b>{Number.isFinite(numeric) ? `${prefix}${display}${suffix}` : display}</b>
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  if (new URLSearchParams(window.location.search).get('demo') === 'strategy') return <StrategyDemo />
  if (new URLSearchParams(window.location.search).get('demo') === 'race3d') return <RaceReplay3D />
  if (new URLSearchParams(window.location.search).get('demo') === 'dashboard') return <StrategyDashboard />
  const [page, setPage] = useState('welcome')
  const [activeTeam, setActiveTeam] = useState(null)
  const selected = teams.find((team) => team.id === activeTeam)
  const audioRef = useRef(null)
  const [radioAudioActive, setRadioAudioActive] = useState(false)
  const startRadioAudio = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().then(() => setRadioAudioActive(true)).catch(() => setRadioAudioActive(false))
  }
  const stopRadioAudio = () => {
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.currentTime = 0 }
    setRadioAudioActive(false)
  }
  const goTo = (nextPage) => {
    if (nextPage === 'radio' || nextPage === 'teams' || nextPage === 'welcome') stopRadioAudio()
    window.scrollTo({ top: 0, behavior: 'auto' })
    setPage(nextPage)
  }
  const selectTeam = (team) => {
    setActiveTeam(team.id)
    startRadioAudio()
    goTo('briefing')
  }

  return <main className={`app-shell page-${page}`} style={{ '--team': selected?.color || '#bffff0', '--accent': selected?.accent || '#ff8000' }}>
    <div className="film-grain" />
    <audio ref={audioRef} src={radioSound} preload="auto" aria-label="Team radio ambience" onEnded={() => setRadioAudioActive(false)} />
    {(page === 'welcome' || page === 'teams') && <>
      <video className="app-background-video" autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
        <source src={openingVideo} type="video/mp4" />
      </video>
      <div className="app-background-video-shade" aria-hidden="true" />
    </>}
    {page === 'welcome' && <section className="welcome-page">
      <StepHeader step={1} onBack={() => setPage('welcome')} />
      <div className="welcome-copy">
        <div className="soft-label"><span /> F1 COMMUNICATION INTELLIGENCE</div>
        <h1>Welcome to<br /><em>the pit wall.</em></h1>
        <p>Welcome to your quiet teammate on the pit wall. Before the noise starts, let's set up your race context.</p>
        <button className="primary-action" onClick={() => goTo('teams')}>CHOOSE YOUR TEAM <ArrowUpRight size={17} /></button>
        <button className="strategy-entry" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, margin: '12px 0 0 12px', padding: '14px 16px', border: '1px solid rgba(191,255,236,.42)', color: '#bffff0', background: 'rgba(7,18,17,.46)', cursor: 'pointer', font: '700 10px DM Mono', letterSpacing: '.08em' }} onClick={() => { window.location.href = `${window.location.pathname}?demo=dashboard` }}>OPEN STRATEGY DASHBOARD <ArrowUpRight size={15} /></button>
      </div>
      <div className="welcome-footer"><span><i /> SECURE RACE SESSION</span><span>THE SILENT CO-DRIVER / 01</span></div>
    </section>}

    {page === 'teams' && <section className="teams-page">
      <StepHeader step={2} onBack={() => setPage('welcome')} />
      <div className="selection-intro"><div className="soft-label"><span /> RACE CONTEXT</div><h1>Choose your<br /><em>team.</em></h1><p>We'll load a focused season briefing before opening the radio desk.</p></div>
      <div className="team-selector">
        {teams.map((team, index) => <button key={team.id} className="team-choice" style={{ '--card': team.color, '--cardAccent': team.accent }} onClick={() => selectTeam(team)}>
          <img src={team.image} alt="" /> <span className="photo-shade" />
          <span className="choice-number">0{index + 1}</span><span className="choice-code">{team.code}</span>
          <span className="choice-name">{team.name}</span><span className="choice-line" />
          <span className="choice-load">LOAD TEAM BRIEFING <ChevronRight size={17} /></span>
        </button>)}
      </div>
      <div className="selection-footer">SELECT ONE TEAM TO CONTINUE <span>⌄</span></div>
    </section>}

    {page === 'briefing' && selected && <section className="briefing-page">
      <StepHeader step={3} onBack={() => goTo('teams')} />
      <div className="briefing-wrap">
        <div className="briefing-title"><button className="back-link" onClick={() => goTo('teams')}><ArrowLeft size={15} /> CHANGE TEAM</button><div className="soft-label"><span /> TEAM BRIEFING / 2026</div><h1>{selected.name}<br /><em>season.</em></h1></div>
        <div className="team-portrait"><img src={selected.image} alt="" /><span /><div><b>{selected.code}</b><small>TEAM PROFILE LOADED</small></div></div>
        {selected.drivers?.length > 0 && <div className="driver-lineup">
          <div className="driver-lineup-heading"><span>DRIVER LINE-UP</span><i /> <small>RADIO CHANNELS READY</small></div>
          <div className="driver-cards">
            {selected.drivers.map((driver) => <article className="driver-card" key={driver.number}>
              <img src={driver.image} alt={driver.name} />
              <div className="driver-card-shade" />
              <div className="driver-card-info"><span className="driver-number">{driver.number}</span><div><b>{driver.name}</b><small>{driver.profile}</small></div></div>
              <div className="driver-signal"><i /><i /><i /><i /><span>RADIO ONLINE</span></div>
            </article>)}
          </div>
        </div>}
        <article className="briefing-data">
          <p className="briefing-summary">{selected.summary}</p>
          <div className="stat-grid"><div><span>CHAMPIONSHIP</span><AnimatedStat value={selected.position} /></div><div><span>POINTS</span><AnimatedStat value={selected.points} /></div><div><span>GP PODIUMS</span><AnimatedStat value={selected.podiums} /></div><div><span>ROUNDS</span><AnimatedStat value={selected.races} /></div></div>
          <div className="briefing-actions"><div><button className="primary-action next-action" onClick={() => goTo('cockpit')}>ENTER COCKPIT LINK <ArrowUpRight size={17} /></button></div><span><i /> RADIO DESK READY / TEAM CHANNEL LOCKED</span></div>
          <div className="copilot-note"><SparkleIcon size={17} /><div><span>COPILOT FOCUS</span><p>{selected.signal}</p></div></div>
          {selected.audioIssues?.length > 0 && <section className="audio-issues"><div className="audio-issues-heading"><div><span>RADIO ISSUES / SIGNAL HISTORY</span><small>WHY THIS TEAM CHANNEL NEEDS A COPILOT</small></div><i /></div><p className="audio-issues-intro">A compact season log of communication friction. Each event becomes a priority for the live radio desk.</p><div className="audio-issue-list">{selected.audioIssues.map((item, index) => <div className="audio-issue" key={item.event}><div className="audio-issue-index"><b>0{index + 1}</b><span>{item.event}</span></div><div className="audio-issue-copy"><strong>{item.label}</strong><p>{item.issue}</p></div><span className="issue-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span></div>)}</div></section>}
          <div className="source-line">SEASON SNAPSHOT: FORMULA1.COM RESULTS / CHECKED 10 AUG 2026</div>
        </article>
      </div>
      <div className="briefing-footer">DATA SHOULD INFORM THE DRIVER. NEVER DISTRACT THEM.</div>
    </section>}

    {page === 'cockpit' && selected && <CockpitLink team={selected} onBack={() => goTo('teams')} onStart={() => goTo('radio')} onDriverSpeak={startRadioAudio} />}
    {page === 'radio' && selected && <RadioDesk team={selected} onBack={() => goTo('cockpit')} />}
  </main>
}

export default App
