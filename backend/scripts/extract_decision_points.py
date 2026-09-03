"""Decision-point extraction for the PitWolf overtake model.

For one race session, finds every moment a driver ran inside the detection gap
(~1.2 s, approximating the 2026 Override Detection Gap / DRS window) of the
car ahead at a lap crossing, then labels the outcome-optimal decision:

- ATTACK: the pass happened on the next lap and held for `--hold-laps`
  (user-confirmed durability cutoff ~5-6 laps; a pass that was given back
  inside the window is NOT outcome-optimal and lands in SAVE);
- DELAY:  no immediate pass but a durable pass within the next 5 laps;
- SAVE:   no durable pass at all.

Features per row: gap, closing rate, straight-line speed delta (max speed of
the lap), tyre-age differential, compounds, lap fraction, pit distortion flag.

Output is cached as JSON under data/f1-cache/decision-points/.
"""

import argparse
import json
import os
import pathlib

import fastf1
import numpy as np
import pandas as pd

from energy_surrogate import add_surrogate_energy
from fetch_f1_session import CACHE_DIR

OUT_ROOT = pathlib.Path(CACHE_DIR).parent / 'decision-points'

COMPOUND_ORDINAL = {
    'SOFT': 0, 'MEDIUM': 1, 'HARD': 2, 'INTERMEDIATE': 3, 'WET': 4,
    'TEST_UNKNOWN': 1,
}


def num(value):
    try:
        f = float(value)
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def build_timelines(session):
    """Per driver: {lap: {pos, startS, lapTimeS, compound, tyreLife, pit}}."""
    laps = session.laps
    timelines = {}
    for driver, rows in laps.groupby('Driver'):
        tl = {}
        for _, lap in rows.iterrows():
            lap_number = num(lap.get('LapNumber'))
            pos = num(lap.get('Position'))
            start = lap.get('LapStartTime')
            if lap_number is None:
                continue
            tl[int(lap_number)] = {
                'pos': int(pos) if pos is not None else None,
                'startS': start.total_seconds() if start is not None and not (isinstance(start, float) and np.isnan(start)) else None,
                'lapTimeS': lap.get('LapTime').total_seconds() if lap.get('LapTime') is not None and hasattr(lap.get('LapTime'), 'total_seconds') else None,
                'compound': str(c) if (c := lap.get('Compound')) is not None and not (isinstance(c, float) and np.isnan(c)) else None,
                'tyreLife': num(lap.get('TyreLife')),
                'pit': bool(lap.get('PitInLane', False)) or bool(lap.get('PitOutLane', False)),
            }
        timelines[driver] = tl
    return timelines


def build_max_speeds(session):
    """(driver, lap) -> max speed kph, from the session-wide car_data block.

    One sorted pass per car; per-lap get_telemetry() merges are ~1000x slower.
    """
    car_data = session.car_data
    speeds = {}
    if car_data is None or len(car_data) == 0:
        return speeds
    for _, res in session.results.iterrows():
        abbr = res.get('Abbreviation')
        car_number = res.get('DriverNumber')
        cd = car_data.get(car_number)
        if abbr is None or cd is None or cd.empty:
            continue
        t = cd['Time'].dt.total_seconds().to_numpy()
        v = cd['Speed'].to_numpy(dtype=float)
        order = np.argsort(t)
        t, v = t[order], v[order]
        for _, lap in session.laps[session.laps['Driver'] == abbr].iterrows():
            lap_number = num(lap.get('LapNumber'))
            start = lap.get('LapStartTime')
            lap_time = lap.get('LapTime')
            if lap_number is None or start is None or lap_time is None:
                continue
            t0 = start.total_seconds()
            t1 = t0 + lap_time.total_seconds()
            if not (np.isfinite(t0) and np.isfinite(t1)):
                continue
            mask = (t >= t0) & (t < t1)
            if mask.any():
                speeds[(abbr, int(lap_number))] = float(v[mask].max())
    return speeds


def gap_at(timelines, driver, defender, lap):
    d = timelines.get(driver, {}).get(lap)
    a = timelines.get(defender, {}).get(lap)
    if not d or not a or d['startS'] is None or a['startS'] is None:
        return None
    return d['startS'] - a['startS']


def driver_at_position(timelines, lap, pos):
    for driver, tl in timelines.items():
        row = tl.get(lap)
        if row and row['pos'] == pos:
            return driver
    return None


def label_outcome(timelines, driver, defender, lap, hold_laps, max_lap):
    """Returns (label, passed_now, held)."""
    def pos_of(d, k):
        row = timelines.get(d, {}).get(k)
        return row['pos'] if row else None

    d_next = pos_of(driver, lap + 1)
    a_next = pos_of(defender, lap + 1)
    if d_next is None:
        return None, False, False
    passed_now = a_next is not None and d_next < a_next

    if passed_now:
        held = True
        for k in range(lap + 1, min(lap + hold_laps, max_lap) + 1):
            dk, ak = pos_of(driver, k), pos_of(defender, k)
            if dk is None:
                held = False
                break
            if ak is not None and not dk < ak:
                held = False
                break
        return ('ATTACK' if held else 'SAVE'), True, held

    for k in range(lap + 2, min(lap + hold_laps, max_lap) + 1):
        dk, ak = pos_of(driver, k), pos_of(defender, k)
        if dk is not None and ak is not None and dk < ak:
            return 'DELAY', False, False
    return 'SAVE', False, False


def extract_race(year, round_number, session_name='R', max_gap=1.2, hold_laps=6):
    event = fastf1.get_event(year, round_number)
    session = event.get_session(session_name)
    session.load(laps=True, telemetry=True, weather=False, messages=False)

    timelines = build_timelines(session)
    finish_positions = {}
    for _, result in session.results.iterrows():
        abbreviation = result.get('Abbreviation')
        position = num(result.get('Position'))
        if abbreviation is not None and position is not None:
            finish_positions[str(abbreviation)] = int(position)

    total_laps = session.total_laps or max(
        (max(tl) for tl in timelines.values() if tl), default=0)
    speeds = build_max_speeds(session)

    speed_values = list(speeds.values())
    race_mean_speed = float(np.mean(speed_values)) if speed_values else None

    rows = []
    for lap in range(2, int(total_laps) + 1):
        for driver, tl in timelines.items():
            row = tl.get(lap)
            if not row or row['pos'] is None or row['pos'] < 2:
                continue
            defender = driver_at_position(timelines, lap, row['pos'] - 1)
            if defender is None or defender == driver:
                continue
            gap = gap_at(timelines, driver, defender, lap)
            if gap is None or not (0.0 < gap <= max_gap):
                continue

            label, passed_now, held = label_outcome(
                timelines, driver, defender, lap, hold_laps, int(total_laps))
            if label is None:
                continue

            prev_gap = gap_at(timelines, driver, defender, lap - 1)
            d_row = timelines.get(defender, {}).get(lap) or {}
            pit_lap = row['pit'] or d_row.get('pit', False)
            pit_next = (timelines.get(driver, {}).get(lap + 1) or {}).get('pit', False) or \
                       (timelines.get(defender, {}).get(lap + 1) or {}).get('pit', False)

            d_speed = speeds.get((driver, lap))
            a_speed = speeds.get((defender, lap))

            rows.append({
                'year': year,
                'round': round_number,
                'session': session_name,
                'lap': lap,
                'driver': driver,
                'defender': defender,
                'position': row['pos'],
                'gapS': round(gap, 3),
                'closingRateS': round(prev_gap - gap, 3) if prev_gap is not None else None,
                'speedDeltaKph': round(d_speed - a_speed, 1) if d_speed is not None and a_speed is not None else None,
                'attackerLapTimeS': row['lapTimeS'],
                'defenderLapTimeS': d_row.get('lapTimeS'),
                'tyreAgeDiff': round(row['tyreLife'] - d_row['tyreLife'], 1) if row['tyreLife'] is not None and d_row.get('tyreLife') is not None else None,
                'attackerCompound': row['compound'],
                'defenderCompound': d_row.get('compound'),
                'lapFraction': round(lap / float(total_laps), 3),
                'raceMeanSpeedKph': round(race_mean_speed, 1) if race_mean_speed else None,
                'pitDistorted': pit_lap or pit_next,
                'defenderActive': (timelines.get(defender, {}).get(lap + 1) or {}).get('pos') is not None,
                'passedNow': passed_now,
                'held': held,
                'label': label,
            })

    if rows:
        row_frame = add_surrogate_energy(pd.DataFrame(rows))
        # Cast to object first: pandas otherwise keeps NaN in float columns,
        # which would leak non-standard NaN values into the JSON cache.
        rows = row_frame.astype(object).where(pd.notna(row_frame), None).to_dict(orient='records')

    counts = {}
    for r in rows:
        counts[r['label']] = counts.get(r['label'], 0) + 1

    return {
        'year': year,
        'round': round_number,
        'session': session_name,
        'eventName': str(event.get('EventName', '')),
        'totalLaps': int(total_laps),
        'maxGapThresholdS': max_gap,
        'holdLaps': hold_laps,
        'finishPositions': finish_positions,
        'raceMeanSpeedKph': round(race_mean_speed, 1) if race_mean_speed else None,
        'labelCounts': counts,
        'rows': rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--round', type=int, required=True)
    parser.add_argument('--session', default='R')
    parser.add_argument('--max-gap', type=float, default=1.2)
    parser.add_argument('--hold-laps', type=int, default=6)
    args = parser.parse_args()

    out = OUT_ROOT / str(args.year) / f'{args.round}_{args.session.lower()}.json'
    if out.exists() and not os.environ.get('FORCE_REBUILD'):
        print(out.read_text(encoding='utf-8'))
        return

    fastf1.set_log_level('ERROR')
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    payload = extract_race(args.year, args.round, args.session, args.max_gap, args.hold_laps)
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, allow_nan=False)
    out.write_text(text, encoding='utf-8')
    print(text)


if __name__ == '__main__':
    import sys
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        raise SystemExit(1)
