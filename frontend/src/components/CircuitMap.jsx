import React, { useMemo } from 'react'

const WIDTH = 640
const HEIGHT = 280
const PAD = 28

function project(xs, ys) {
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = Math.min(
    (WIDTH - PAD * 2) / Math.max(1, maxX - minX),
    (HEIGHT - PAD * 2) / Math.max(1, maxY - minY),
  )
  const ox = (WIDTH - (maxX - minX) * scale) / 2
  const oy = (HEIGHT - (maxY - minY) * scale) / 2
  return xs.map((x, i) => ({
    x: ox + (x - minX) * scale,
    y: HEIGHT - oy - (ys[i] - minY) * scale,
  }))
}

function heading(points, index) {
  const a = points[Math.max(0, index - 1)]
  const b = points[Math.min(points.length - 1, index + 1)]
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function CarMarker({ point, angle, color, label }) {
  if (!point) return null
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  return <g transform={`translate(${point.x} ${point.y})`}>
    <circle r="11" fill={color} stroke="#effff9" strokeWidth="2.5" />
    <polygon
      points={`${dx * 8},${dy * 8} ${dx * -5 + dy * 5},${dy * -5 - dx * 5} ${dx * -5 - dy * 5},${dy * -5 + dx * 5}`}
      fill="#07100e"
    />
    <text x="0" y="-16" textAnchor="middle" fill={color} fontSize="9" fontFamily="DM Mono">{label}</text>
  </g>
}

export function CircuitMap({ attacker, defender, focus, circuitName, passIndex }) {
  const track = useMemo(() => project(attacker.x, attacker.y), [attacker.x, attacker.y])
  const rival = useMemo(() => project(defender.x, defender.y), [defender.x, defender.y])
  const outline = track.map((p) => `${p.x},${p.y}`).join(' ')
  const pass = track[passIndex] || null

  return <svg className="ov-circuit-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${circuitName} circuit map`}>
    <polyline points={outline} fill="none" stroke="#344b46" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points={outline} fill="none" stroke="#ff7043" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 9" opacity=".9" />
    {pass && <circle cx={pass.x} cy={pass.y} r="7" fill="none" stroke="#63e6be" strokeWidth="1.5" strokeDasharray="3 3" />}
    {pass && <text x={pass.x + 12} y={pass.y - 10} fill="#63e6be" fontSize="8" fontFamily="DM Mono">T14</text>}
    <CarMarker point={rival[focus]} angle={heading(rival, focus)} color="#9db7ff" label="PER" />
    <CarMarker point={track[focus]} angle={heading(track, focus)} color="#ff7043" label="LEC" />
  </svg>
}

export function formatLapTime(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`
}
