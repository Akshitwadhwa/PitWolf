import argparse
import json
import urllib.request

import fastf1
import numpy as np

from fetch_f1_session import CACHE_DIR, clean

GP_TEMPO_CIRCUIT_URL = 'https://www.gp-tempo.com/api/circuit?year={year}&event={round}'


def fetch_corners(year, round_number, distances, xs, ys):
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


def pick_lap_with_position(session):
    laps = session.laps
    if laps is None or laps.empty:
        return None, None
    candidates = laps[laps['PitInTime'].isna() & laps['PitOutTime'].isna()]
    if 'IsAccurate' in candidates.columns:
        candidates = candidates[candidates['IsAccurate'].isna() | candidates['IsAccurate'].astype(bool)]
    candidates = candidates[candidates['LapTime'].notna()].sort_values('LapTime')
    for _, row in candidates.head(10).iterrows():
        match = session.laps[(session.laps['Driver'] == row['Driver']) & (session.laps['LapNumber'] == row['LapNumber'])]
        if match.empty:
            continue
        try:
            tel = match.iloc[0].get_telemetry()
        except Exception:
            continue
        if tel is None or 'X' not in tel.columns or 'Y' not in tel.columns:
            continue
        tel = tel[tel['X'].notna() & tel['Y'].notna() & tel['Speed'].notna() & tel['Distance'].notna()]
        if len(tel) < 50:
            continue
        return row, tel
    return None, None


def build_trackmap_payload(year, round_number, session_name):
    event = fastf1.get_event(year, round_number)
    session = event.get_session(session_name)
    try:
        session.load(laps=True, telemetry=True, weather=False, messages=False)
    except Exception:
        return {'error': 'no_position_data', 'points': [], 'corners': []}

    row, tel = pick_lap_with_position(session)
    if row is None:
        return {'error': 'no_position_data', 'points': [], 'corners': []}

    if len(tel) > 500:
        keep = np.unique(np.linspace(0, len(tel) - 1, 500).round().astype(int))
        tel = tel.iloc[keep]

    distances = tel['Distance'].to_numpy(dtype=float)
    xs = tel['X'].to_numpy(dtype=float)
    ys = tel['Y'].to_numpy(dtype=float)
    speeds = tel['Speed'].to_numpy(dtype=float)
    track_length = float(distances[-1])

    corners, corner_source = fetch_corners(year, round_number, distances, xs, ys)

    return {
        'trackLength': round(track_length, 1),
        'points': [
            {
                'd': round(float(d), 1),
                'x': round(float(x), 2),
                'y': round(float(y), 2),
                's': round(float(s), 1),
            }
            for d, x, y, s in zip(distances, xs, ys, speeds)
        ],
        'corners': corners,
        'cornerSource': corner_source,
        'source': f"{clean(row['Driver'])} L{int(row['LapNumber'])}",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--round', type=int, required=True)
    parser.add_argument('--session', required=True)
    args = parser.parse_args()

    fastf1.set_log_level('ERROR')
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    print(json.dumps(build_trackmap_payload(args.year, args.round, args.session)))


if __name__ == '__main__':
    import sys
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        raise SystemExit(1)
