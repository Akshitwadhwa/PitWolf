import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, PerspectiveCamera, Text } from '@react-three/drei'
import * as THREE from 'three'
import radioSound from '../assets/F1 Radio - Sound effect (HD).mp3'

const strategies = {
  ATTACK: { color: '#ff6b35', label: 'Deploy energy now', reserve: -4.2 },
  SAVE: { color: '#63e6be', label: 'Protect battery reserve', reserve: 1.1 },
  DELAY: { color: '#9db7ff', label: 'Wait for the next window', reserve: -1.3 },
}

const circuitPoints = [
  [-7, 0, -4], [-3, 0, -7], [3, 0, -6], [7, 0, -3],
  [6, 0, 2], [3, 0, 5], [-1, 0, 6], [-6, 0, 4], [-7, 0, -4],
]

function createCircuitCurve() {
  return new THREE.CatmullRomCurve3(circuitPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'catmullrom', .12)
}

function CircuitTrack() {
  const curve = useMemo(createCircuitCurve, [])
  const points = useMemo(() => curve.getPoints(240).map((point) => [point.x, .02, point.z]), [curve])
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]}><planeGeometry args={[30, 30]} /><meshStandardMaterial color="#070b0d" roughness={1} /></mesh>
    <Line points={points} color="#203a35" lineWidth={26} />
    <Line points={points} color="#68e5ca" lineWidth={1.5} dashed dashSize={.35} gapSize={.28} />
    <Text position={[-11, .05, -9]} rotation={[-Math.PI / 2, 0, 0]} fontSize={.38} color="#668079" anchorX="left">BAHRAIN / SAKHIR</Text>
  </>
}

function RaceCar({ curve, progress, color, player = false, scale = 1 }) {
  const point = curve.getPointAt((progress + 1) % 1)
  const tangent = curve.getTangentAt((progress + 1) % 1)
  const angle = Math.atan2(tangent.x, tangent.z)
  return <group position={[point.x, .72, point.z]} rotation={[0, angle, 0]} scale={scale}>
    <mesh castShadow><boxGeometry args={[.7, .34, 1.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={player ? .75 : .2} /></mesh>
    <mesh position={[0, .25, -.05]}><boxGeometry args={[.48, .16, .52]} /><meshStandardMaterial color="#172126" metalness={.7} roughness={.24} /></mesh>
    <mesh position={[0, .04, .8]}><boxGeometry args={[.84, .1, .15]} /><meshStandardMaterial color={player ? '#fff1e8' : '#0e1416'} /></mesh>
    {player && <pointLight color="#ff6b35" intensity={1.4} distance={2.7} />}
  </group>
}

function CameraTarget() {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

function RaceScene({ running, strategy, throttle, onTelemetry }) {
  const curve = useMemo(createCircuitCurve, [])
  const progressRef = useRef(.04)
  const frameRef = useRef(0)
  const [progress, setProgress] = useState(.04)
  const carProgress = useMemo(() => Array.from({ length: 14 }, (_, i) => (i * .071 + .11) % 1), [])
  useFrame((_, delta) => {
    if (!running) return
    const modeFactor = strategy === 'ATTACK' ? 1.22 : strategy === 'SAVE' ? .78 : 1
    progressRef.current = (progressRef.current + delta * .0068 * (0.55 + throttle / 100 * .5) * modeFactor) % 1
    frameRef.current += 1
    if (frameRef.current % 6 === 0) {
      setProgress(progressRef.current)
      const sector = Math.min(3, Math.floor(progressRef.current * 4) + 1)
      const gap = Math.max(.32, .92 + Math.sin(progressRef.current * 18) * .16 - (strategy === 'ATTACK' ? .12 : 0))
      onTelemetry({ progress: progressRef.current, lap: Math.floor(progressRef.current * 3) + 1, sector, speed: Math.round(188 + throttle * .86), gap, battery: Math.max(18, 68 - progressRef.current * 12 + (strategy === 'SAVE' ? 3 : 0)) })
    }
  })
  return <>
    <CircuitTrack />
    {carProgress.map((p, i) => <RaceCar key={i} curve={curve} progress={p + (running ? progress * (i % 3 ? .01 : -.01) : 0)} color={['#e10600', '#9db7ff', '#63e6be', '#f5f5f5'][i % 4]} scale={i === 0 ? 1.05 : .78} />)}
    <RaceCar curve={curve} progress={progress + .055} color="#e10600" scale={1.12} />
    <RaceCar curve={curve} progress={progress} color="#ff6b35" player scale={1.16} />
  </>
}

function DriverCamera({ progress, viewMode }) {
  const { camera } = useThree()
  const curve = useMemo(createCircuitCurve, [])
  useFrame(() => {
    if (viewMode !== 'driver') return
    const point = curve.getPointAt(progress)
    const tangent = curve.getTangentAt(progress).normalize()
    const cameraPosition = point.clone().addScaledVector(tangent, -2.15)
    cameraPosition.y = 1.05
    const lookTarget = point.clone().addScaledVector(tangent, 5)
    lookTarget.y = .75
    camera.position.lerp(cameraPosition, .16)
    camera.lookAt(lookTarget)
  })
  return null
}

export function RaceReplay3D() {
  const [running, setRunning] = useState(false)
  const [strategy, setStrategy] = useState('DELAY')
  const [throttle, setThrottle] = useState(65)
  const [drs, setDrs] = useState(true)
  const [gapOverride, setGapOverride] = useState(null)
  const [viewMode, setViewMode] = useState('overview')
  const audioRef = useRef(null)
  const [telemetry, setTelemetry] = useState({ lap: 1, sector: 1, speed: 244, gap: .92, battery: 68, progress: .04 })
  const onTelemetry = useCallback((next) => setTelemetry(next), [])
  const effectiveGap = gapOverride ?? telemetry.gap
  const feasibility = Math.round(Math.max(18, Math.min(96, 88 - effectiveGap * 22 + (drs ? 12 : -15) + (throttle > 80 ? 5 : 0))))
  const risk = feasibility > 74 && telemetry.battery > 35 ? 'CONTROLLED' : feasibility > 52 ? 'WATCH' : 'HIGH'
  const riskColor = risk === 'CONTROLLED' ? '#63e6be' : risk === 'WATCH' ? '#ffbf69' : '#ff5c65'
  const recommendedStrategy = effectiveGap <= .55 && drs ? 'ATTACK' : effectiveGap > 1.1 || !drs ? 'SAVE' : 'DELAY'

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (running) {
      audio.currentTime = 0
      audio.play().catch(() => {})
    } else {
      audio.pause()
      audio.currentTime = 0
    }
  }, [running])

  useEffect(() => {
    const onKey = (event) => {
      if (event.code === 'Space') { event.preventDefault(); setRunning((value) => !value) }
      if (event.key.toLowerCase() === 'r') setRunning(true)
      if (event.key.toLowerCase() === 'p') setRunning(false)
      if (event.key.toLowerCase() === 'a') setStrategy('ATTACK')
      if (event.key.toLowerCase() === 's') setStrategy('SAVE')
      if (event.key.toLowerCase() === 'd') setStrategy('DELAY')
      if (event.key === 'ArrowUp') setThrottle((value) => Math.min(100, value + 5))
      if (event.key === 'ArrowDown') setThrottle((value) => Math.max(0, value - 5))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return <main className="race-demo" style={{ '--race-accent': strategies[strategy].color }}>
    <header className="race-demo-header"><div className="strategy-brand"><span>✦</span><strong>PITWALL <em>COPILOT</em></strong></div><div className="race-title"><i /> 3D RACE REPLAY / STRATEGY LAB</div><div className="race-header-meta">BAHRAIN GP <b>·</b> LAP {telemetry.lap} / 57</div></header>
    <section className="race-layout">
      <div className={`race-view ${viewMode === 'driver' ? 'driver-view' : ''}`}><div className="view-status"><span className={running ? 'live-dot' : ''} /> {running ? 'LIVE REPLAY' : 'REPLAY PAUSED'} <b>15 CARS</b><button className="view-toggle" onClick={() => setViewMode((value) => value === 'overview' ? 'driver' : 'overview')}>{viewMode === 'overview' ? 'DRIVER VIEW' : 'OVERHEAD VIEW'}</button></div><Canvas shadows dpr={[1, 1.5]}><PerspectiveCamera makeDefault position={[0, 16, 15]} fov={viewMode === 'driver' ? 72 : 42} /><CameraTarget /><DriverCamera progress={telemetry.progress} viewMode={viewMode} /><ambientLight intensity={.7} /><directionalLight position={[5, 12, 8]} intensity={2.3} castShadow /><RaceScene running={running} strategy={strategy} throttle={throttle} onTelemetry={onTelemetry} /><OrbitControls target={[0, 0, 0]} enabled={viewMode === 'overview'} enablePan={false} minDistance={9} maxDistance={25} maxPolarAngle={Math.PI / 2.15} /></Canvas>{viewMode === 'driver' && <div className="driver-hud"><div><span>CAR AHEAD</span><strong>{effectiveGap.toFixed(2)}s</strong></div><div className="driver-hud-center"><b>{drs ? 'DRS ZONE' : 'DRS UNAVAILABLE'}</b><small>{drs ? 'DEPLOYMENT WINDOW OPEN' : 'HOLD ENERGY FOR NEXT STRAIGHT'}</small></div><div><span>MODE</span><strong style={{ color: strategies[strategy].color }}>{strategy}</strong></div></div>}<div className="race-view-help"><span>SPACE <b>pause / resume</b></span><span>↑ ↓ <b>throttle</b></span><span>A / S / D <b>strategy</b></span></div></div>
      <aside className="race-sidebar"><div className="sidebar-block"><div className="side-heading"><span>LIVE TELEMETRY</span><b>SIMULATED REPLAY</b></div><div className="telemetry-grid"><div><span>SPEED</span><strong>{telemetry.speed}</strong><small>km/h</small></div><div><span>GAP AHEAD</span><strong>{effectiveGap.toFixed(2)}</strong><small>sec</small></div><div><span>BATTERY</span><strong>{Math.round(telemetry.battery)}</strong><small>% est.</small></div><div><span>DRS</span><strong className={drs ? 'good' : ''}>{drs ? 'ON' : 'OFF'}</strong><small>turn {telemetry.sector}</small></div></div></div>
        <div className="sidebar-block"><div className="side-heading"><span>OVERTAKE WINDOW</span><b style={{ color: riskColor }}>{risk}</b></div><div className="feasibility"><strong>{feasibility}%</strong><span>PASS FEASIBILITY</span><div><i style={{ width: `${feasibility}%`, background: riskColor }} /></div></div><p className="risk-copy">{risk === 'CONTROLLED' ? 'DRS and closing speed support an attack. Battery reserve remains healthy.' : risk === 'WATCH' ? 'A pass is possible, but the energy cost needs a clear return.' : 'The gap is too large or reserve is too low. Protect the next window.'}</p></div>
        <div className="sidebar-block"><div className="side-heading"><span>MANUAL SCENARIO</span><b>INPUT</b></div><label className="input-label">GAP TO CAR AHEAD <input type="range" min=".3" max="1.8" step=".05" value={gapOverride ?? telemetry.gap} onChange={(event) => setGapOverride(Number(event.target.value))} /><b>{effectiveGap.toFixed(2)}s</b></label><button className={`drs-button ${drs ? 'active' : ''}`} onClick={() => setDrs((value) => !value)}><i /> DRS {drs ? 'AVAILABLE' : 'UNAVAILABLE'}</button></div>
        <div className="sidebar-block strategy-block"><div className="side-heading"><span>DECISION ENGINE</span><b>COUNTERFACTUAL</b></div><div className="strategy-buttons">{Object.keys(strategies).map((name) => <button key={name} className={`${strategy === name ? 'active' : ''} ${recommendedStrategy === name ? 'recommended' : ''}`} style={{ '--button-color': strategies[name].color }} onClick={() => setStrategy(name)}><strong>{name}</strong><small>{recommendedStrategy === name ? 'BEST FIT NOW' : strategies[name].label}</small></button>)}</div><div className="strategy-result"><span>SELECTED MODE</span><strong style={{ color: strategies[strategy].color }}>{strategy}</strong><p>Estimated reserve impact <b>{strategies[strategy].reserve > 0 ? '+' : ''}{strategies[strategy].reserve}%</b></p></div></div>
        <button className={`race-start ${running ? 'stop' : ''}`} onClick={() => setRunning((value) => !value)}><span>{running ? '■' : '▶'}</span>{running ? 'PAUSE REPLAY' : 'START RACE REPLAY'}</button>
      </aside>
    </section>
    <audio ref={audioRef} src={radioSound} preload="auto" aria-label="Radio ambience" onEnded={() => { if (audioRef.current) audioRef.current.currentTime = 0 }} />
    <footer className="race-footer"><span>UPDATED DESIGN / PLAYABLE DEMO</span><span>REAL TRACK CONTEXT · DERIVED RISK · SIMULATED ENERGY</span></footer>
  </main>
}
