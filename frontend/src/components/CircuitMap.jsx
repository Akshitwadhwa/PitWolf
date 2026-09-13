import React, { useMemo } from 'react'

const WIDTH = 640
const HEIGHT = 280
const PAD = 28

export function circuitBasis(points, rotationDeg = 0) {
  const degrees = Number(rotationDeg)
  return {
    rotate: Number.isFinite(degrees) ? degrees * Math.PI / 180 : 0,
    flipX: false,
  }
}

export function applyCircuitBasis(x, y, basis) {
  const rotate = basis?.rotate ?? 0
  const cos = Math.cos(rotate)
  const sin = Math.sin(rotate)
  let nextX = (Number(x) * cos) - (Number(y) * sin)
  let nextY = (Number(x) * sin) + (Number(y) * cos)
  if (basis?.flipX) nextX = -nextX
  return { x: nextX, y: nextY }
}

export function fitCircuitView(points, width = WIDTH, height = HEIGHT, padding = PAD, basis) {
  const used = basis ?? circuitBasis(points)
  const oriented = points.map((point) => applyCircuitBasis(point.x, point.y, used))
  const xs = oriented.map((point) => point.x)
  const ys = oriented.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, maxX - minX),
    (height - padding * 2) / Math.max(1, maxY - minY),
  )
  const ox = (width - (maxX - minX) * scale) / 2
  const oy = (height - (maxY - minY) * scale) / 2
  const project = (x, y) => {
    const point = applyCircuitBasis(x, y, used)
    return {
      x: ox + (point.x - minX) * scale,
      y: height - oy - (point.y - minY) * scale,
    }
  }
  return {
    width,
    height,
    basis: used,
    project,
    outline: points.map((point) => project(point.x, point.y)),
  }
}

export function project(xs, ys) {
  const points = xs.map((x, index) => ({ x, y: ys[index], d: index }))
  return fitCircuitView(points).outline
}

function projectWithBounds(xs, ys, bounds) {
  const scale = Math.min(
    (WIDTH - PAD * 2) / Math.max(1, bounds.maxX - bounds.minX),
    (HEIGHT - PAD * 2) / Math.max(1, bounds.maxY - bounds.minY),
  )
  const ox = (WIDTH - (bounds.maxX - bounds.minX) * scale) / 2
  const oy = (HEIGHT - (bounds.maxY - bounds.minY) * scale) / 2
  return xs.map((x, i) => ({
    x: ox + (x - bounds.minX) * scale,
    y: HEIGHT - oy - (ys[i] - bounds.minY) * scale,
  }))
}

/**
 * Linearly interpolate position and heading from a projected point array.
 * `frac` is a float index, e.g. 3.7 means 70% of the way from point 3 to 4.
 */
export function lerpPoint(pts, frac) {
  const i   = Math.max(0, Math.min(Math.floor(frac), pts.length - 2))
  const t   = Math.max(0, Math.min(frac - i, 1))
  const a   = pts[i]
  const b   = pts[i + 1]
  return {
    x:     a.x + (b.x - a.x) * t,
    y:     a.y + (b.y - a.y) * t,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  }
}

export function CarMarker({ point, angle, color, label }) {
  if (!point) return null
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  return (
    <g transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}>
      <circle r="11" fill={color} stroke="#effff9" strokeWidth="2.5" />
      <polygon
        points={`${dx * 8},${dy * 8} ${dx * -5 + dy * 5},${dy * -5 - dx * 5} ${dx * -5 - dy * 5},${dy * -5 + dx * 5}`}
        fill="#07100e"
      />
      <text x="0" y="-16" textAnchor="middle" fill={color} fontSize="9" fontFamily="DM Mono">
        {label}
      </text>
    </g>
  )
}

// Corner indices approximately mapped to the user's 10 red dots
const CORNERS = [
  { label: '1', idx: 12, ox: 14, oy: 4 },
  { label: '2', idx: 24, ox: -14, oy: 14 },
  { label: '3', idx: 68, ox: -14, oy: -10 },
  { label: '4', idx: 76, ox: 14, oy: 4 },
  { label: '5', idx: 82, ox: -14, oy: 10 },
  { label: '6', idx: 86, ox: 14, oy: 4 },
  { label: '7', idx: 123, ox: -14, oy: -14 },
  { label: '8', idx: 199, ox: -14, oy: 14 },
  { label: '9', idx: 203, ox: 0, oy: 18 },
  { label: '10', idx: 233, ox: 0, oy: 18 },
]

/**
 * Props:
 *   attacker, defender — telemetry objects
 *   focus             — discrete index (used by dashboard)
 *   lecFrac, perFrac  — independent smooth positions for sim
 *   circuitName
 */
export function CircuitMap({ attacker, defender, focus, lecFrac, perFrac, circuitName }) {
  const tracks = useMemo(() => {
    const xs = [...attacker.x, ...(defender.x ?? [])]
    const ys = [...attacker.y, ...(defender.y ?? [])]
    const bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
    return {
      attacker: projectWithBounds(attacker.x, attacker.y, bounds),
      defender: defender.x?.length > 1 ? projectWithBounds(defender.x, defender.y, bounds) : null,
    }
  }, [attacker.x, attacker.y, defender.x, defender.y])
  const track = tracks.attacker
  const defenderTrack = tracks.defender ?? track
  const outline = track.map((p) => `${p.x},${p.y}`).join(' ')

  // Backward compat for Dashboard which only provides `focus`
  const fLec = lecFrac !== undefined ? lecFrac : focus
  const fPer = perFrac !== undefined ? perFrac : focus

  // Draw both cars using the *same* track geometry, just different positions
  const lecPos = lerpPoint(track, fLec)
  const perPos = lerpPoint(defenderTrack, fPer)

  return (
    <svg
      className="ov-circuit-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${circuitName} circuit map`}
    >
      {/* Base Track outline */}
      <polyline
        points={outline}
        fill="none"
        stroke="#344b46"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dashed racing line */}
      <polyline
        points={outline}
        fill="none"
        stroke="#8b9d99"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="6 9"
        opacity=".6"
      />

      {/* Corner numbers */}
      {CORNERS.map((c, i) => {
        const pt = track[c.idx]
        if (!pt) return null
        return (
          <g key={`t${i}`} transform={`translate(${pt.x + c.ox}, ${pt.y + c.oy})`}>
            <circle r="4.5" fill="#ef4444" />
            <text x="0" y="3" fill="#eaf7f1" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="DM Mono">
              {c.label}
            </text>
          </g>
        )
      })}

      {/* Cars. Draw whoever is "behind" on the track first, so the leader is on top. */}
      {/* But for now just draw PER then LEC */}
      <CarMarker point={perPos} angle={perPos.angle} color="#3b82f6" label="PER" />
      <CarMarker point={lecPos} angle={lecPos.angle} color="#ef4444" label="LEC" />
    </svg>
  )
}

export function formatLapTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`
}
