import React, { useMemo } from 'react'
import { project, lerpPoint } from './CircuitMap'

export function lowerBound(arr, value) {
  let lo = 0
  let hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function timeAtDistance(trace, d) {
  const { distance, time } = trace
  if (d <= distance[0]) return time[0]
  const last = distance.length - 1
  if (d >= distance[last]) return time[last]
  const i = lowerBound(distance, d)
  const f = (d - distance[i - 1]) / Math.max(1e-9, distance[i] - distance[i - 1])
  return time[i - 1] + f * (time[i] - time[i - 1])
}

export function speedAtDistance(trace, d) {
  const { distance, speed } = trace
  if (d <= distance[0]) return speed[0]
  const last = distance.length - 1
  if (d >= distance[last]) return speed[last]
  const i = lowerBound(distance, d)
  const f = (d - distance[i - 1]) / Math.max(1e-9, distance[i] - distance[i - 1])
  return speed[i - 1] + f * (speed[i] - speed[i - 1])
}

export function distanceAtTime(trace, t) {
  const { distance, time } = trace
  if (t <= time[0]) return distance[0]
  const last = time.length - 1
  if (t >= time[last]) return distance[last]
  const i = lowerBound(time, t)
  const f = (t - time[i - 1]) / Math.max(1e-9, time[i] - time[i - 1])
  return distance[i - 1] + f * (distance[i] - distance[i - 1])
}

function pointAtDistance(projected, distances, d) {
  if (d <= distances[0]) return projected[0]
  const last = distances.length - 1
  if (d >= distances[last]) return projected[last]
  const i = lowerBound(distances, d)
  const f = (d - distances[i - 1]) / Math.max(1e-9, distances[i] - distances[i - 1])
  return lerpPoint(projected, i - 1 + f)
}

export function TrackRaceMap({ trackmap, loadedLaps, cursorT }) {
  const { projected, distances, speeds, corners } = useMemo(() => {
    const pts = trackmap?.points ?? []
    if (!pts.length) return {}
    return {
      projected: project(pts.map((p) => p.x), pts.map((p) => p.y)),
      distances: pts.map((p) => p.d),
      speeds: pts.map((p) => p.s),
      corners: trackmap.corners ?? [],
    }
  }, [trackmap])

  const segmentColors = useMemo(() => {
    if (!projected) return null
    const minS = Math.min(...speeds)
    const span = Math.max(1e-9, Math.max(...speeds) - minS)
    const heat = (i) => ((speeds[i] - minS) / span < 0.5 ? '#e10600' : '#ff8000')
    const racers = loadedLaps.filter(({ data }) =>
      data?.trace?.speed?.length && data?.trace?.distance?.length)
    if (!racers.length) return projected.slice(1).map((_, i) => heat(i + 1))

    const winners = distances.map((d) => {
      let best = null
      let bestSpeed = -Infinity
      for (const entry of racers) {
        const trace = entry.data.trace
        if (d > trace.distance[trace.distance.length - 1]) continue
        const speed = speedAtDistance(trace, d)
        if (speed > bestSpeed) {
          bestSpeed = speed
          best = entry
        }
      }
      return best
    })

    // Ownership only flips after two consecutive samples agree (gp-tempo JV).
    const pointColors = []
    let committed = winners.find((winner) => winner) ?? null
    let prev = null
    let streak = 0
    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i]
      streak = winner && winner === prev && winner !== committed ? streak + 1 : 0
      prev = winner
      if (streak > 0) {
        committed = winner
        streak = 0
        if (i > 0) pointColors[i - 1] = committed.sel.color
      }
      pointColors[i] = committed ? committed.sel.color : heat(i)
    }
    return projected.slice(1).map((_, i) => pointColors[i + 1])
  }, [projected, distances, speeds, loadedLaps])

  const staticLayer = useMemo(() => {
    if (!projected || !segmentColors) return null
    const outline = projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    return <>
      <polyline points={outline} fill="none" stroke="#e8e8e8" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      {projected.slice(1).map((p, i) => {
        const a = projected[i]
        return <line
          key={i}
          x1={a.x.toFixed(1)} y1={a.y.toFixed(1)}
          x2={p.x.toFixed(1)} y2={p.y.toFixed(1)}
          stroke={segmentColors[i]}
          strokeWidth="9"
          strokeLinecap="round"
        />
      })}
      {corners.map((c) => {
        const p = pointAtDistance(projected, distances, c.d)
        return <g key={c.n} className="tm-corner">
          <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="6.5" />
          <text x={p.x.toFixed(1)} y={(p.y + 2.6).toFixed(1)} textAnchor="middle">{c.n}</text>
        </g>
      })}
    </>
  }, [projected, distances, segmentColors, corners])

  if (!projected) return null

  return <div className="tm-map-wrap">
    <svg viewBox="0 0 640 280" role="img" aria-label="circuit map">
      {staticLayer}
      {loadedLaps.map(({ sel, data }) => {
        const d = distanceAtTime(data.trace, Math.min(cursorT, data.lapTimeS ?? Infinity))
        const p = pointAtDistance(projected, distances, d)
        return <circle
          key={sel.driver}
          cx={p.x.toFixed(1)}
          cy={p.y.toFixed(1)}
          r="6.5"
          fill={sel.color}
          stroke="#f1fff9"
          strokeWidth="2.5"
        />
      })}
    </svg>
  </div>
}
