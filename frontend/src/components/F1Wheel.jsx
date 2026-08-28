import React, { useEffect, useState } from 'react'


function F1Wheel({ team, keywords, showKeywords, controlsEnabled = true, engineerRecording, driverRecording, onEngineerDown, onEngineerUp, onDriverDown, onDriverUp, lapState = 'idle', lapReady = true, lapAvailabilityLabel = '', onStartLap, onStopLap }) {
  const accent = team.color
  const secondary = team.accent
  const wheelBody = team.wheelBody || '#202c2d'
  const wheelTrim = team.wheelTrim || secondary

  const [kwIndex, setKwIndex] = useState(0)
  const [kwVisible, setKwVisible] = useState(false)

  useEffect(() => {
    if (!showKeywords || !keywords?.length) { setKwVisible(false); setKwIndex(0); return }
    setKwIndex(0)
    setKwVisible(true)
  }, [showKeywords, keywords])

  useEffect(() => {
    if (!kwVisible || !keywords?.length) return
    if (kwIndex >= keywords.length) { setKwVisible(false); return }
    const timer = setTimeout(() => setKwIndex((i) => i + 1), 3000)
    return () => clearTimeout(timer)
  }, [kwVisible, kwIndex, keywords])

  const currentKw = kwVisible && keywords?.[kwIndex] ? keywords[kwIndex] : null
  const mode = engineerRecording ? 'engineer' : driverRecording ? 'driver' : 'idle'
  const engineerModeReady = controlsEnabled && (lapState === 'idle' || lapState === 'running') && !engineerRecording && !driverRecording
  const engineerModeButtonLabel = lapState === 'running'
    ? 'STOP LAP'
    : engineerModeReady ? 'START LAP'
    : !controlsEnabled ? 'LOCK WHEEL'
    : 'RUN COMPLETE'

  // Live F1 telemetry dashboard state declared unconditionally at the top level
  const [telemetry, setTelemetry] = useState({
    speed: 284,
    gear: 7,
    diff: 0.042,
    ers: 82.4,
    wave: Array.from({ length: 30 }, () => 50)
  })

  useEffect(() => {
    // Speed updates every 120ms (fluctuates between 272 and 294)
    const speedInterval = setInterval(() => {
      setTelemetry(prev => {
        const delta = Math.floor(Math.random() * 5) - 2
        let nextSpeed = prev.speed + delta
        if (nextSpeed > 305) nextSpeed = 305
        if (nextSpeed < 265) nextSpeed = 265
        return { ...prev, speed: nextSpeed }
      })
    }, 120)

    // Gear changes occasionally (every 3s)
    const gearInterval = setInterval(() => {
      setTelemetry(prev => {
        const roll = Math.random()
        let nextGear = prev.gear
        if (roll < 0.15 && prev.gear > 5) nextGear = prev.gear - 1
        if (roll > 0.85 && prev.gear < 8) nextGear = prev.gear + 1
        return { ...prev, gear: nextGear }
      })
    }, 3000)

    // Delta/diff updates every 200ms
    const diffInterval = setInterval(() => {
      setTelemetry(prev => {
        const delta = (Math.random() * 0.016) - 0.008
        return { ...prev, diff: Number((prev.diff + delta).toFixed(3)) }
      })
    }, 200)

    // ERS slowly decreases (every 2s)
    const ersInterval = setInterval(() => {
      setTelemetry(prev => {
        let nextErs = prev.ers - 0.1
        if (nextErs < 20) nextErs = 95.0
        return { ...prev, ers: Number(nextErs.toFixed(1)) }
      })
    }, 2000)

    // Live wave updates every 90ms (going up and down continuously)
    const waveInterval = setInterval(() => {
      setTelemetry(prev => {
        const nextWave = [...prev.wave.slice(1)]
        const lastVal = prev.wave[prev.wave.length - 1]
        let nextVal = lastVal + (Math.random() * 16 - 8)
        if (nextVal > 90) nextVal = 75
        if (nextVal < 10) nextVal = 25
        nextWave.push(nextVal)
        return { ...prev, wave: nextWave }
      })
    }, 90)

    return () => {
      clearInterval(speedInterval)
      clearInterval(gearInterval)
      clearInterval(diffInterval)
      clearInterval(ersInterval)
      clearInterval(waveInterval)
    }
  }, [])

  // Render a hold-to-speak button as an SVG group
  const holdButton = (x, y, label, isRecording, onDown, onUp) => {
    const active = isRecording
    const disabled = !controlsEnabled
    const fill = active ? accent : '#10181a'
    const stroke = active ? accent : '#5d746f'
    const textFill = active ? '#06100e' : '#d7eee7'
    return (
      <g
        className={`wheel-hit ${active ? 'is-active wheel-mic-active' : ''} ${disabled ? 'is-disabled' : ''}`}
        role="button"
        tabIndex={disabled ? '-1' : '0'}
        aria-disabled={disabled}
        aria-label={disabled ? `${label} locked until wheel is engaged` : isRecording ? `Release to send ${label}` : `Hold ${label} to speak`}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        onMouseDown={() => !disabled && onDown()}
        onMouseUp={() => !disabled && onUp()}
        onMouseLeave={() => !disabled && onUp()}
        onTouchStart={(e) => { if (!disabled) { e.preventDefault(); onDown() } }}
        onTouchEnd={(e) => { if (!disabled) { e.preventDefault(); onUp() } }}
        onKeyDown={(e) => !disabled && e.key === ' ' && onDown()}
        onKeyUp={(e) => !disabled && e.key === ' ' && onUp()}
      >
        <rect x={x} y={y} width="112" height="42" rx="9" fill={fill} stroke={stroke} strokeWidth={active ? 3 : 2} />
        {active && <rect x={x} y={y} width="112" height="42" rx="9" fill="none" stroke={accent} strokeWidth="6" opacity=".3">
          <animate attributeName="opacity" values=".3;.8;.3" dur=".8s" repeatCount="indefinite" />
        </rect>}
        <text x={x + 56} y={y + 17} fill={textFill} textAnchor="middle" fontSize="10" fontFamily="DM Mono, monospace" letterSpacing="1">{label}</text>
        <text x={x + 56} y={y + 32} fill={active ? '#06100e' : '#8da19a'} textAnchor="middle" fontSize="8" fontFamily="DM Mono, monospace" letterSpacing="1">{active ? '● REC' : disabled ? 'LOCKED' : 'HOLD TO SPEAK'}</text>
      </g>
    )
  }

  return <svg className="vector-wheel" viewBox="0 0 1000 690" role="img" aria-label={`${team.name} F1 steering wheel — hold a button to speak`}>
    <defs>
      <linearGradient id="wheelBody" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor={wheelBody} /><stop offset=".32" stopColor={accent} stopOpacity=".32" /><stop offset=".56" stopColor="#080b0d" /><stop offset="1" stopColor={secondary} stopOpacity=".28" /></linearGradient>
      <linearGradient id="screenGlow" x1="0" x2="1"><stop stopColor={accent} stopOpacity=".9" /><stop offset="1" stopColor={secondary} stopOpacity=".8" /></linearGradient>
      <filter id="wheelShadow"><feDropShadow dx="0" dy="22" stdDeviation="18" floodColor="#000" floodOpacity=".55" /></filter>
    </defs>
    <ellipse cx="500" cy="625" rx="350" ry="24" fill={accent} opacity=".13" />
    <g filter="url(#wheelShadow)">
      <path d="M118 187 C142 109 238 68 327 110 L394 150 L606 150 L673 110 C762 68 858 109 882 187 L821 231 L792 436 C780 523 704 568 622 539 L554 507 L446 507 L378 539 C296 568 220 523 208 436 L179 231 Z" fill="url(#wheelBody)" stroke={wheelTrim} strokeOpacity=".72" strokeWidth="5" />
      <path d="M166 207 C193 135 255 112 318 139 L383 176 L617 176 L682 139 C745 112 807 135 834 207 L792 224 L764 405 C753 476 691 506 631 486 L558 457 L442 457 L369 486 C309 506 247 476 236 405 L208 224 Z" fill="#0d1517" stroke={accent} strokeOpacity=".3" strokeWidth="3" />
      <path d="M176 196 C124 198 93 247 100 326 C106 400 135 463 177 493 L222 459 L207 252 Z" fill={wheelBody} stroke={wheelTrim} strokeOpacity=".6" strokeWidth="5" />
      <path d="M824 196 C876 198 907 247 900 326 C894 400 865 463 823 493 L778 459 L793 252 Z" fill={wheelBody} stroke={wheelTrim} strokeOpacity=".6" strokeWidth="5" />
      <path d="M390 194 L610 194 L655 232 L655 402 L610 438 L390 438 L345 402 L345 232 Z" fill="#091012" stroke={wheelTrim} strokeOpacity=".7" strokeWidth="4" />

      {/* Center screen */}
      <rect x="371" y="220" width="258" height="145" rx="10" fill={currentKw ? '#ffffff' : '#081012'} stroke={currentKw ? '#ffffff' : accent} strokeOpacity={currentKw ? '1' : '.65'} strokeWidth="3" style={{ transition: 'fill .3s, stroke .3s' }} />
      <rect x="389" y="239" width="222" height="10" rx="5" fill={currentKw ? '#cccccc' : 'url(#screenGlow)'} opacity=".78" style={{ transition: 'fill .3s' }} />

      {currentKw ? (() => {
        const words = currentKw.split(' ')
        if (words.length === 3) {
          return (
            <>
              <text x="500" y="280" fill="#07110e" textAnchor="middle" fontSize="24" fontWeight="700" fontFamily="Space Grotesk, sans-serif" letterSpacing="-1" className="wheel-kw-text">{words[0]} {words[1]}</text>
              <text x="500" y="304" fill="#07110e" textAnchor="middle" fontSize="24" fontWeight="700" fontFamily="Space Grotesk, sans-serif" letterSpacing="-1" className="wheel-kw-text">{words[2]}</text>
              <text x="500" y="328" fill="#4d5a56" textAnchor="middle" fontSize="9" fontFamily="DM Mono, monospace" letterSpacing="2">ENGINEER MESSAGE</text>
              {keywords.length > 1 && <text x="500" y="348" fill="#888" textAnchor="middle" fontSize="8" fontFamily="DM Mono, monospace">{kwIndex + 1} / {keywords.length}</text>}
            </>
          )
        }
        return (
          <>
            <text x="500" y="295" fill="#07110e" textAnchor="middle" fontSize="26" fontWeight="700" fontFamily="Space Grotesk, sans-serif" letterSpacing="-1" className="wheel-kw-text">{currentKw}</text>
            <text x="500" y="318" fill="#4d5a56" textAnchor="middle" fontSize="9" fontFamily="DM Mono, monospace" letterSpacing="2">ENGINEER MESSAGE</text>
            {keywords.length > 1 && <text x="500" y="348" fill="#888" textAnchor="middle" fontSize="8" fontFamily="DM Mono, monospace">{kwIndex + 1} / {keywords.length}</text>}
          </>
        )
      })() : engineerRecording ? (
        <>
          <text x="500" y="291" fill={accent} textAnchor="middle" fontSize="13" fontFamily="DM Mono, monospace" letterSpacing="1">ENGINEER SPEAKING</text>
          <text x="500" y="312" fill="#8da19a" textAnchor="middle" fontSize="10" fontFamily="DM Mono, monospace">LISTENING…</text>
        </>
      ) : driverRecording ? (
        <>
          <text x="500" y="291" fill={accent} textAnchor="middle" fontSize="13" fontFamily="DM Mono, monospace" letterSpacing="1">DRIVER SPEAKING</text>
          <text x="500" y="312" fill="#8da19a" textAnchor="middle" fontSize="10" fontFamily="DM Mono, monospace">LISTENING…</text>
        </>
      ) : (() => {
        const wavePath = telemetry.wave.map((val, i) => {
          const wx = 389 + i * (222 / (telemetry.wave.length - 1))
          const wy = 352 + (val - 50) * 0.16
          return `${i === 0 ? 'M' : 'L'} ${wx} ${wy}`
        }).join(' ')

        return (
          <>
            {/* Speed & Lap */}
            <text x="389" y="268" fill="#8da19a" fontSize="8" fontFamily="DM Mono, monospace">SPD</text>
            <text x="389" y="290" fill="#ffffff" fontSize="18" fontWeight="700" fontFamily="DM Mono, monospace">{telemetry.speed}</text>
            <text x="389" y="306" fill="#8da19a" fontSize="7" fontFamily="DM Mono, monospace">KM/H</text>
            
            <text x="389" y="325" fill="#8da19a" fontSize="8" fontFamily="DM Mono, monospace">LAP</text>
            <text x="389" y="340" fill="#ffffff" fontSize="11" fontFamily="DM Mono, monospace">42/78</text>

            {/* Gear Indicator Box */}
            <rect x="474" y="258" width="52" height="58" rx="6" fill="#111b1c" stroke="#394b4b" strokeWidth="1.5" />
            <text x="500" y="301" fill={accent} fontSize="34" fontWeight="800" fontFamily="Space Grotesk, sans-serif" textAnchor="middle">{telemetry.gear}</text>
            <text x="500" y="328" fill="#8da19a" fontSize="8" fontFamily="DM Mono, monospace" textAnchor="middle">GEAR</text>

            {/* Diff & ERS */}
            <text x="611" y="268" fill="#8da19a" fontSize="8" fontFamily="DM Mono, monospace" textAnchor="end">DIFF</text>
            <text x="611" y="290" fill={telemetry.diff >= 0 ? '#ff5252' : '#4dff4d'} fontSize="14" fontWeight="700" fontFamily="DM Mono, monospace" textAnchor="end">
              {(telemetry.diff >= 0 ? '+' : '') + telemetry.diff.toFixed(3)}
            </text>
            
            <text x="611" y="325" fill="#8da19a" fontSize="8" fontFamily="DM Mono, monospace" textAnchor="end">ERS</text>
            <text x="611" y="340" fill="#ffffff" fontSize="11" fontFamily="DM Mono, monospace" textAnchor="end">{telemetry.ers}%</text>

            {/* Telemetry wave path (Image1) */}
            <path d={wavePath} fill="none" stroke="#5d746f" strokeWidth="1.5" opacity="0.75" />
          </>
        )
      })()}

      {Array.from({ length: 15 }).map((_, index) => <rect key={index} x={389 + index * 14.4} y="256" width="8" height={8 + (index % 4) * 4} rx="3" fill={index % 4 === 0 ? secondary : accent} opacity=".75" />)}
      {Array.from({ length: 12 }).map((_, index) => <circle key={`led-${index}`} cx={401 + index * 18} cy="187" r="5" fill={index < 4 ? accent : index < 8 ? secondary : '#77d8ba'} opacity=".85" />)}
      <circle cx="271" cy="255" r="48" fill="#121d1e" stroke={accent} strokeWidth="4" /><text x="271" y="261" textAnchor="middle" fill={accent} fontSize="22" fontFamily="DM Mono">BRK</text>
      <circle cx="729" cy="255" r="48" fill="#121d1e" stroke={secondary} strokeWidth="4" /><text x="729" y="261" textAnchor="middle" fill={secondary} fontSize="22" fontFamily="DM Mono">THR</text>
      <circle cx="278" cy="379" r="42" fill="#151f20" stroke="#d85d5a" strokeWidth="5" /><text x="278" y="386" textAnchor="middle" fill="#f4aca0" fontSize="17" fontFamily="DM Mono">DIFF</text>
      <circle cx="722" cy="379" r="42" fill="#151f20" stroke="#5fc6aa" strokeWidth="5" /><text x="722" y="386" textAnchor="middle" fill="#a9f5df" fontSize="17" fontFamily="DM Mono">GRP</text>
      <g
        className={`wheel-hit ${engineerModeReady ? 'wheel-engineer-mode' : 'is-disabled'}`}
        role="button"
        tabIndex={engineerModeReady ? '0' : '-1'}
        aria-disabled={!engineerModeReady}
        aria-label={lapState === 'running' ? 'Stop lap replay and open Engineer Mode' : lapState === 'finished' ? 'Open Engineer Mode from the completed lap panel' : !lapReady ? `${lapAvailabilityLabel || 'Replay data loading'}. Start the built-in lap animation.` : controlsEnabled ? 'Start lap replay in Engineer Mode' : 'Engineer Mode locked until wheel is engaged'}
        style={{ cursor: engineerModeReady ? 'pointer' : 'not-allowed' }}
        onClick={() => engineerModeReady && (lapState === 'running' ? onStopLap?.() : onStartLap?.())}
        onKeyDown={(event) => engineerModeReady && (event.key === 'Enter' || event.key === ' ') && (lapState === 'running' ? onStopLap?.() : onStartLap?.())}
      >
        <circle cx="500" cy="415" r="34" fill={engineerModeReady ? accent : '#111b1c'} stroke={engineerModeReady ? '#f4fff9' : '#83a79b'} strokeWidth={engineerModeReady ? '3.5' : '3'} />
        {engineerModeReady && <circle cx="500" cy="415" r="40" fill="none" stroke={accent} strokeWidth="2" opacity=".3"><animate attributeName="r" values="34;43;34" dur="1.4s" repeatCount="indefinite" /><animate attributeName="opacity" values=".45;.05;.45" dur="1.4s" repeatCount="indefinite" /></circle>}
        <text x="500" y="409" textAnchor="middle" fill={engineerModeReady ? '#06100e' : '#dcfff4'} fontSize="10" fontWeight="700" fontFamily="DM Mono">ENG</text>
        <text x="500" y="425" textAnchor="middle" fill={engineerModeReady ? '#06100e' : '#91aaa1'} fontSize="6.8" fontWeight="700" fontFamily="DM Mono" letterSpacing=".6">{engineerModeButtonLabel}</text>
      </g>
      <text x="500" y="462" textAnchor="middle" fill={engineerModeReady ? accent : '#718780'} fontSize="7" fontFamily="DM Mono" letterSpacing="1.3">ENGINEER MODE</text>

      {/* LEFT = ENGINEER RADIO, RIGHT = DRIVER RADIO (swapped per spec) */}
      {holdButton(128, 139, 'ENGINEER RADIO', engineerRecording, onEngineerDown, onEngineerUp)}
      {holdButton(760, 139, 'DRIVER RADIO', driverRecording, onDriverDown, onDriverUp)}

      <text x="184" y="530" fill="#7d9990" fontSize="11" fontFamily="DM Mono" letterSpacing="2">ENGINEER</text>
      <text x="741" y="530" fill="#7d9990" fontSize="11" fontFamily="DM Mono" letterSpacing="2">DRIVER</text>
    </g>
  </svg>
}


export { F1Wheel }

