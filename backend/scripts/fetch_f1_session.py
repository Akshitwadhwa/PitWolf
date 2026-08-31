import argparse
import json
from pathlib import Path

import fastf1
import pandas as pd

CACHE_DIR = Path(__file__).resolve().parents[1] / 'data' / 'f1-cache' / 'fastf1-raw'
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def clean(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def td_s(value):
    value = clean(value)
    if value is None:
        return None
    return round(value.total_seconds(), 3)


def session_names(event):
    return [name for name in (clean(event.get(f'Session{i}')) for i in range(1, 6)) if name]


def build_session_payload(year, round_number, session_name):
    event = fastf1.get_event(year, round_number)
    session = event.get_session(session_name)
    session.load(laps=True, telemetry=False, weather=False, messages=False)

    drivers = []
    for _, row in session.results.iterrows():
        abbr = clean(row.get('Abbreviation'))
        if not abbr:
            continue
        team_color = clean(row.get('TeamColor'))
        position = clean(row.get('Position'))
        drivers.append({
            'abbr': abbr,
            'driverNumber': clean(str(row.get('DriverNumber'))),
            'name': clean(row.get('FullName')) or clean(row.get('BroadcastName')) or abbr,
            'team': clean(row.get('TeamName')),
            'teamColorHex': f'#{team_color}' if team_color else None,
            'position': int(position) if position is not None else None,
            'classifiedPosition': clean(str(row.get('ClassifiedPosition'))),
        })

    laps = []
    for _, row in session.laps.iterrows():
        compound = clean(row.get('Compound'))
        pit_lap = clean(row.get('PitInTime')) is not None or clean(row.get('PitOutTime')) is not None
        deleted = bool(clean(row.get('Deleted')))
        accurate_raw = clean(row.get('IsAccurate'))
        accurate = True if accurate_raw is None else bool(accurate_raw)
        track_status = clean(row.get('TrackStatus'))
        track_status = None if track_status is None else str(track_status)
        laps.append({
            'driver': clean(row.get('Driver')),
            'lapNumber': int(row['LapNumber']),
            'lapTimeS': td_s(row.get('LapTime')),
            'compound': str(compound) if compound is not None else None,
            'isPitLap': pit_lap,
            'deleted': deleted,
            'isAccurate': accurate,
            'trackStatus': track_status,
            'isOutlier': pit_lap or deleted or not accurate or track_status not in (None, '1'),
        })

    return {
        'event': {
            'year': int(year),
            'round': int(event.RoundNumber),
            'name': event.EventName,
            'officialName': event.OfficialEventName,
            'country': event.Country,
            'location': event.Location,
        },
        'session': session_name,
        'availableSessions': session_names(event),
        'drivers': drivers,
        'laps': laps,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--round', type=int, required=True)
    parser.add_argument('--session', required=True)
    args = parser.parse_args()

    fastf1.set_log_level('ERROR')
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    print(json.dumps(build_session_payload(args.year, args.round, args.session)))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:  # surface structured errors to the Node caller
        print(json.dumps({'error': str(error)}), file=__import__('sys').stderr)
        raise SystemExit(1)
