import argparse
import json
import math
import re
import urllib.request
from pathlib import Path

import fastf1
import numpy as np
from fastf1.mvapi.api import get_circuit

from fetch_f1_session import CACHE_DIR, clean

GP_TEMPO_CIRCUIT_URL = 'https://www.gp-tempo.com/api/circuit?year={year}&event={round}'
VISUAL_EVIDENCE_PATH = Path(__file__).resolve().parents[1] / 'data' / 'straight-mode-visual-evidence.json'


def visual_reference(year, round_number, session_name):
    """Read the user's turn-range maps without promoting them to FIA data."""
    try:
        evidence = json.loads(VISUAL_EVIDENCE_PATH.read_text(encoding='utf8'))
        events = evidence.get('events', {})
        # The supplied maps are circuit ranges entered under race keys. The
        # user applies those same ranges to qualifying battery use; this
        # remains a user scenario policy, not a FIA session-specific map.
        return (events.get(f'{year}:{round_number}:{session_name.lower()}')
                or events.get(f'{year}:{round_number}:r'))
    except Exception:
        return None


def geometry_corners(distances, xs, ys, count):
    """Find turn apices directly on the recorded circuit geometry.

    The supplied 2026 maps establish the numbered turn count and order. This
    derives the visible marker locations from the actual recorded centre line,
    rather than borrowing an unrelated third-party circuit layout.
    """
    if not count or len(distances) < 30:
        return []
    radius = max(3, min(12, len(distances) // 90))
    scores = []
    for index in range(radius, len(distances) - radius):
        before = np.array([xs[index] - xs[index - radius], ys[index] - ys[index - radius]])
        after = np.array([xs[index + radius] - xs[index], ys[index + radius] - ys[index]])
        before_norm = np.linalg.norm(before)
        after_norm = np.linalg.norm(after)
        if before_norm < 1 or after_norm < 1:
            continue
        cross = before[0] * after[1] - before[1] * after[0]
        dot = before[0] * after[0] + before[1] * after[1]
        scores.append((abs(math.atan2(cross, dot)), index))
    if not scores:
        return []
    track_length = float(distances[-1])
    min_separation = max(28.0, track_length / max(1, count * 7))
    selected = []
    for _, index in sorted(scores, reverse=True):
        distance = float(distances[index])
        if any(min(abs(distance - float(distances[other])), track_length - abs(distance - float(distances[other]))) < min_separation for other in selected):
            continue
        selected.append(index)
        if len(selected) == count:
            break
    if len(selected) != count:
        return []
    selected.sort(key=lambda index: distances[index])
    return [
        {
            'n': str(number),
            'd': round(float(distances[index]), 1),
            'x': round(float(xs[index]), 2),
            'y': round(float(ys[index]), 2),
        }
        for number, index in enumerate(selected, start=1)
    ]


def corner_distance(reference, corners, track_length):
    text = str(reference or '').upper()
    if 'START' in text or 'FINISH' in text:
        return 0.0
    numbers = [int(number) for number in re.findall(r'T(\d+)', text)]
    by_number = {int(corner['n']): float(corner['d']) for corner in corners if str(corner.get('n', '')).isdigit()}
    values = [by_number[number] for number in numbers if number in by_number]
    if not values:
        return None
    if 'BETWEEN' in text and len(values) > 1:
        return round(sum(values[:2]) / 2, 1)
    return values[0]


def visual_overlay(reference, corners, track_length):
    if not reference:
        return {'status': 'NO_VISUAL_REFERENCE', 'zones': [], 'markers': []}
    zones = []
    for zone in reference.get('zones') or []:
        start = corner_distance(zone.get('from'), corners, track_length)
        end = corner_distance(zone.get('to'), corners, track_length)
        if start is None or end is None:
            continue
        zones.append({
            'id': zone.get('zoneId'), 'startD': start, 'endD': end,
            'description': zone.get('description') or f"{zone.get('from')} → {zone.get('to')}",
        })
    marker_reference = reference.get('overtakeMarkerReference') or {}
    markers = []
    for marker_type in ('detection', 'activation'):
        distance = corner_distance(marker_reference.get(marker_type), corners, track_length)
        if distance is not None:
            markers.append({'type': marker_type.upper(), 'd': distance, 'reference': marker_reference.get(marker_type)})
    return {
        'status': reference.get('coordinateStatus', 'TURN_RANGE_ONLY_NOT_TRACK_DISTANCE_MAPPED'),
        'mode': reference.get('status'),
        'source': 'USER_VISUAL_TURN_REFERENCE',
        'zones': zones,
        'markers': markers,
        'note': 'Turn-range overlay from user-supplied track reference. It is visual analysis only, not an FIA distance-aligned command line.',
    }


def fetch_fallback_corners(year, round_number, distances, xs, ys):
    request = urllib.request.Request(
        GP_TEMPO_CIRCUIT_URL.format(year=year, round=round_number),
        headers={'User-Agent': 'Mozilla/5.0 (PitWolf track map)'},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.load(response)
    except Exception:
        return [], 'none'
    corners = []
    for corner in payload.get('Corners') or []:
        number = corner.get('Number')
        distance = corner.get('Distance')
        if number is None or distance is None:
            continue
        index = int(np.searchsorted(distances, float(distance)))
        index = max(0, min(index, len(distances) - 1))
        corners.append({
            'n': f"{int(number)}{corner.get('Letter') or ''}",
            'd': round(float(distances[index]), 1),
            'x': round(float(xs[index]), 2),
            'y': round(float(ys[index]), 2),
        })
    return corners, 'gp-tempo' if corners else 'none'


def fetch_circuit_info_corners(session, distances, xs, ys):
    """Use FastF1/MultiViewer's numbered circuit markers.

    Corner *numbers* cannot be safely reconstructed from curvature alone: a
    complex, low-speed section can contain several sharp geometry points that
    are not individual FIA turn markers. CircuitInfo supplies the published
    turn sequence and maps every marker to a telemetry distance on this exact
    circuit. We then place it on the recorded centre line used by the player.
    """
    try:
        circuit_info = session.get_circuit_info()
        source_corners = circuit_info.corners if circuit_info is not None else None
    except Exception:
        source_corners = None
    if source_corners is None or source_corners.empty:
        return [], 'none'

    corners = []
    for _, corner in source_corners.iterrows():
        number = corner.get('Number')
        if number is None:
            continue
        letter = clean(corner.get('Letter')) or ''
        marker_x = corner.get('X')
        marker_y = corner.get('Y')
        distance = corner.get('Distance')
        if marker_x is not None and marker_y is not None and np.isfinite(float(marker_x)) and np.isfinite(float(marker_y)):
            index = int(np.argmin((xs - float(marker_x)) ** 2 + (ys - float(marker_y)) ** 2)) if len(xs) else 0
        elif distance is not None and np.isfinite(float(distance)):
            index = int(np.searchsorted(distances, float(distance)))
            index = max(0, min(index, len(distances) - 1))
        else:
            continue
        corners.append({
            'n': f"{int(number)}{letter}",
            'd': round(float(distances[index]), 1),
            'x': round(float(xs[index]), 2),
            'y': round(float(ys[index]), 2),
        })
    corners.sort(key=lambda corner: (int(re.match(r'\d+', corner['n']).group()), corner['n']))
    return corners, 'fastf1-circuit-info / multiviewer-numbered-corners' if corners else 'none'


SESSION_FALLBACKS = (
    'Race', 'Qualifying', 'Sprint', 'Sprint Qualifying',
    'Practice 3', 'Practice 2', 'Practice 1',
)


def telemetry_xy(row):
    try:
        tel = row.get_telemetry()
    except Exception:
        return None
    if tel is None or 'X' not in tel.columns or 'Y' not in tel.columns:
        return None
    needed = ['X', 'Y', 'Speed', 'Distance']
    tel = tel[tel[needed].notna().all(axis=1)]
    if len(tel) < 50:
        return None
    return tel


def geometry_quality(xs, ys, distances=None):
    xs = np.asarray(xs, dtype=float)
    ys = np.asarray(ys, dtype=float)
    if len(xs) < 80 or len(xs) != len(ys):
        return 0.0
    unique = len({(round(float(x)), round(float(y))) for x, y in zip(xs, ys)})
    unique_ratio = unique / len(xs)
    jumps = np.hypot(np.diff(xs), np.diff(ys))
    path = float(jumps.sum()) if len(jumps) else 0.0
    if distances is not None and len(distances):
        length = float(abs(distances[-1] - distances[0]))
    else:
        length = path
    if unique_ratio < 0.45 or path < 2000:
        return 0.0
    if length > 0 and (path / length > 2.8 or path / length < 0.65):
        return 0.0
    if len(jumps) and float(jumps.max()) > 1600:
        return 0.0
    return unique_ratio


def polyline_distances(xs, ys):
    jumps = np.hypot(np.diff(xs), np.diff(ys))
    return np.concatenate(([0.0], np.cumsum(jumps)))


def session_circuit_key(session):
    try:
        return (session.session_info.get('Meeting') or {}).get('Circuit', {}).get('Key')
    except Exception:
        return None


def fetch_multiviewer_outline(year, session):
    """Official MultiViewer centre line — same frame as FastF1 position data."""
    key = session_circuit_key(session)
    if key is None:
        return None
    try:
        data = get_circuit(year=int(year), circuit_key=int(key))
    except Exception:
        data = None
    if not data:
        return None
    xs = np.asarray(data.get('x') or [], dtype=float)
    ys = np.asarray(data.get('y') or [], dtype=float)
    if len(xs) < 80 or len(xs) != len(ys):
        return None
    distances = polyline_distances(xs, ys)
    if geometry_quality(xs, ys, distances) <= 0:
        return None
    return {
        'xs': xs,
        'ys': ys,
        'distances': distances,
        'speeds': np.full(len(xs), np.nan),
        'rotation': float(data.get('rotation') or 0.0),
        'source': f"multiviewer {clean(data.get('circuitName')) or 'circuit'}",
        'circuitName': clean(data.get('circuitName')),
        'corners': data.get('corners') or [],
    }


def corners_from_multiviewer(entries, distances, xs, ys):
    rows = []
    for entry in entries or []:
        number = entry.get('number')
        position = entry.get('trackPosition') or {}
        if number is None or position.get('x') is None or position.get('y') is None:
            continue
        letter = clean(entry.get('letter')) or ''
        rows.append({
            'n': f"{int(number)}{letter}",
            'x': float(position['x']),
            'y': float(position['y']),
        })
    if not rows:
        return [], 'none'
    return snap_corners_to_outline(rows, distances, xs, ys), 'multiviewer-numbered-corners'


def snap_corners_to_outline(corners, distances, xs, ys):
    if not corners or len(distances) < 2:
        return corners
    outline = np.column_stack((xs, ys))
    snapped = []
    for corner in corners:
        target = np.array([float(corner['x']), float(corner['y'])], dtype=float)
        index = int(np.argmin(np.sum((outline - target) ** 2, axis=1)))
        snapped.append({
            **corner,
            'd': round(float(distances[index]), 1),
            'x': round(float(xs[index]), 2),
            'y': round(float(ys[index]), 2),
        })
    return snapped


def pick_lap_with_position(session):
    laps = session.laps
    if laps is None or laps.empty:
        return None, None
    candidates = laps[laps['PitInTime'].isna() & laps['PitOutTime'].isna()]
    if 'IsAccurate' in candidates.columns:
        candidates = candidates[candidates['IsAccurate'].isna() | candidates['IsAccurate'].astype(bool)]
    candidates = candidates[candidates['LapTime'].notna()].sort_values('LapTime')
    usable = []
    for _, row in candidates.head(40).iterrows():
        tel = telemetry_xy(row)
        if tel is None:
            continue
        xs = tel['X'].to_numpy(dtype=float)
        ys = tel['Y'].to_numpy(dtype=float)
        distances = tel['Distance'].to_numpy(dtype=float)
        score = geometry_quality(xs, ys, distances)
        if score <= 0:
            continue
        usable.append((score, row, tel, float(distances[-1])))
    if not usable:
        return None, None
    lengths = np.array([item[3] for item in usable], dtype=float)
    target = float(np.median(lengths))
    _, row, tel, _ = min(usable, key=lambda item: (abs(item[3] - target), -item[0]))
    return row, tel


def load_mapped_session(year, round_number, session_name):
    event = fastf1.get_event(year, round_number)
    wanted = [session_name] + [name for name in SESSION_FALLBACKS if name != session_name]
    loaded = (event, None, None, None, None)
    for name in wanted:
        try:
            session = event.get_session(name)
            session.load(laps=True, telemetry=True, weather=False, messages=False)
        except Exception:
            continue
        loaded = (event, session, None, None, name)
        row, tel = pick_lap_with_position(session)
        if row is not None:
            return event, session, row, tel, name
    return loaded


def previous_year_same_circuit(year, location):
    for previous in range(int(year) - 1, 2017, -1):
        try:
            schedule = fastf1.get_event_schedule(previous, include_testing=False)
        except Exception:
            continue
        for _, row in schedule.iterrows():
            if str(row.get('Location') or '') != str(location or ''):
                continue
            mapped = load_mapped_session(previous, int(row['RoundNumber']), 'Race')
            if mapped[2] is not None:
                return mapped
    return None, None, None, None, None


def session_rotation(session, fallback=0.0):
    try:
        info = session.get_circuit_info()
        if info is not None and info.rotation is not None:
            return float(info.rotation)
    except Exception:
        pass
    return float(fallback)


def load_session_for_circuit(year, round_number, session_name):
    event = fastf1.get_event(year, round_number)
    wanted = [session_name] + [name for name in SESSION_FALLBACKS if name != session_name]
    for name in wanted:
        try:
            session = event.get_session(name)
            session.load(laps=False, telemetry=False, weather=False, messages=False)
            return event, session, name
        except Exception:
            continue
    return event, None, None


def build_trackmap_payload(year, round_number, session_name):
    requested = fastf1.get_event(year, round_number)
    event, session, used_session = load_session_for_circuit(year, round_number, session_name)
    row, tel = None, None
    borrowed = False
    outline = fetch_multiviewer_outline(year, session) if session is not None else None

    if outline is None:
        event, session, row, tel, used_session = load_mapped_session(year, round_number, session_name)
        outline = fetch_multiviewer_outline(year, session) if session is not None else None

    if outline is None and tel is None:
        event_fb, session, row, tel, used_session = previous_year_same_circuit(
            year, getattr(requested, 'Location', None))
        if session is not None:
            event = event_fb
            borrowed = True
            outline = fetch_multiviewer_outline(year, session)

    if outline is None and tel is None:
        return {
            'error': 'no_position_data',
            'points': [],
            'corners': [],
            'event': {
                'year': int(year),
                'round': int(round_number),
                'name': clean(getattr(requested, 'EventName', None)),
                'location': clean(getattr(requested, 'Location', None)),
            },
        }

    if outline is not None:
        distances = outline['distances']
        xs = outline['xs']
        ys = outline['ys']
        speeds = outline['speeds']
        rotation = outline['rotation']
        source = outline['source']
        geometry_session = 'multiviewer'
    else:
        if len(tel) > 500:
            keep = np.unique(np.linspace(0, len(tel) - 1, 500).round().astype(int))
            tel = tel.iloc[keep]
        distances = tel['Distance'].to_numpy(dtype=float)
        xs = tel['X'].to_numpy(dtype=float)
        ys = tel['Y'].to_numpy(dtype=float)
        speeds = tel['Speed'].to_numpy(dtype=float)
        rotation = session_rotation(session)
        source = f"{clean(row['Driver'])} L{int(row['LapNumber'])}"
        geometry_session = used_session

    track_length = float(distances[-1] - distances[0]) if len(distances) else 0.0
    if outline is not None:
        # MultiViewer / FastF1 XY is stored in tenths of a metre.
        track_length = track_length / 10.0

    reference = visual_reference(year, round_number, session_name)
    corners, corner_source = ([], 'none')
    if outline is not None:
        corners, corner_source = corners_from_multiviewer(outline.get('corners'), distances, xs, ys)
    if not corners:
        corners, corner_source = fetch_circuit_info_corners(session, distances, xs, ys)
    if not corners:
        corners, corner_source = fetch_fallback_corners(year, round_number, distances, xs, ys)
    if corners:
        corners = snap_corners_to_outline(corners, distances, xs, ys)
    overlay = visual_overlay(reference, corners, track_length)
    source_year = year
    if borrowed:
        try:
            source_year = int(event.EventDate.year)
        except Exception:
            source_year = year

    return {
        'trackLength': round(track_length, 1),
        'rotation': round(float(rotation), 1),
        'points': [
            {
                'd': round(float(d), 1),
                'x': round(float(x), 2),
                'y': round(float(y), 2),
                's': None if not np.isfinite(float(s)) else round(float(s), 1),
            }
            for d, x, y, s in zip(distances, xs, ys, speeds)
        ],
        'corners': corners,
        'cornerSource': corner_source,
        'visualOverlay': overlay,
        'source': source,
        'geometrySession': geometry_session,
        'geometryYear': source_year,
        'event': {
            'year': int(year),
            'round': int(round_number),
            'name': clean(getattr(requested, 'EventName', None)),
            'location': clean(getattr(requested, 'Location', None)),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--round', type=int, required=True)
    parser.add_argument('--session', required=True)
    args = parser.parse_args()

    fastf1.set_log_level('ERROR')
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    fastf1.Cache.offline_mode(False)
    print(json.dumps(build_trackmap_payload(args.year, args.round, args.session)))


if __name__ == '__main__':
    import sys
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        raise SystemExit(1)
