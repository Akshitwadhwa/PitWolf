import argparse
import json

import fastf1
import numpy as np

from fetch_f1_session import CACHE_DIR, clean


def smooth(values, window):
    if len(values) < window:
        return values
    kernel = np.ones(window) / window
    padded = np.pad(values, (window // 2, window // 2), mode='edge')
    return np.convolve(padded, kernel, mode='valid')


def detect_corners(distances, xs, ys, speeds, track_length):
    smoothed = smooth(speeds, 15)
    max_s = float(np.max(smoothed))
    min_s = float(np.min(smoothed))
    span = max_s - min_s
    if span <= 0:
        return []
    win = max(3, len(smoothed) // 60)
    min_gap = 0.025 * track_length

    picked = []
    for prominence in (0.12, 0.08):
        threshold = max_s - prominence * span
        picked = []
        for i in range(win, len(smoothed) - win):
            if smoothed[i] <= threshold and smoothed[i] <= np.min(smoothed[i - win:i + win + 1]):
                if picked and distances[i] - distances[picked[-1]] < min_gap:
                    if smoothed[i] < smoothed[picked[-1]]:
                        picked[-1] = i
                else:
                    picked.append(i)
        if len(picked) > 1 and (distances[picked[0]] + track_length) - distances[picked[-1]] < min_gap:
            if smoothed[picked[-1]] < smoothed[picked[0]]:
                picked.pop()
            else:
                picked.pop(0)
        if len(picked) >= 7:
            break

    if len(picked) < 3:
        return []
    return [
        {
            'n': number,
            'd': round(float(distances[i]), 1),
            'x': round(float(xs[i]), 2),
            'y': round(float(ys[i]), 2),
        }
        for number, i in enumerate(picked, 1)
    ]


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
        'corners': detect_corners(distances, xs, ys, speeds, track_length),
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
