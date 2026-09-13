"""Compact per-race cards for the MODELS RESULT dashboard.

Reads the trained habits joblib plus the 2026 JUMP eval/works dumps.
Does not retrain. Does not rewrite classified results.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib

ROOT = Path(__file__).resolve().parents[1] / 'data' / 'f1-cache' / 'models'
WORKS_EIGHT = {
    'LEC': 'Ferrari',
    'HAM': 'Ferrari',
    'RUS': 'Mercedes',
    'ANT': 'Mercedes',
    'NOR': 'McLaren',
    'PIA': 'McLaren',
    'VER': 'Red Bull',
    'HAD': 'Red Bull',
}
OUT = ROOT / 'models_result_races.json'


def _rate(bucket: dict | None, key: str):
    if not bucket:
        return None
    value = bucket.get(key)
    return round(float(value), 4) if value is not None else None


def hold_delta(recorded: list, modelled: list) -> int:
    rec = sum(1 for row in recorded or [] if row.get('ahead') is True)
    mod = sum(1 for row in modelled or [] if row.get('ahead') is True)
    return int(mod - rec)


def slim_case(case: dict) -> dict:
    recorded = case.get('recorded') or []
    modelled = case.get('model') or []
    delta = case.get('holdDelta')
    if delta is None and (recorded or modelled):
        delta = hold_delta(recorded, modelled)
    worked = case.get('worked')
    if worked is None and delta is not None:
        worked = bool(delta > 0)
    return {
        'driver': case.get('driver'),
        'team': case.get('team') or WORKS_EIGHT.get(case.get('driver')),
        'opponent': case.get('opponent'),
        'role': case.get('role'),
        'lap': case.get('lap'),
        'zone': case.get('zone'),
        'gapS': case.get('gapS'),
        'position': case.get('position'),
        'opponentPosition': case.get('opponentPosition'),
        'recordedAction': case.get('recordedAction'),
        'modelAction': case.get('modelAction'),
        'holdDelta': delta,
        'worked': worked,
        'major': bool(case.get('major')),
        'grade': case.get('grade') or ('MAJOR' if case.get('major') else ('SUCCESS' if worked else None)),
        'why': case.get('why'),
        'recorded': recorded,
        'model': modelled,
    }


def main() -> None:
    artifact = joblib.load(ROOT / 'driver_energy_habits.joblib')
    habits_report = json.loads((ROOT / 'driver_energy_habits_report.json').read_text(encoding='utf8'))
    works = json.loads((ROOT / 'model_overtake_works.json').read_text(encoding='utf8'))
    eval_all = json.loads((ROOT / 'model_overtake_eval.json').read_text(encoding='utf8'))
    test_races = set(habits_report.get('testRaces') or [])
    snapshot = {row['driver']: row for row in (habits_report.get('snapshot') or [])}
    works_by_round = {int(race['round']): race for race in works.get('races') or []}
    eval_by_round = {int(race['round']): race for race in eval_all.get('races') or []}
    drivers_art = artifact.get('drivers') or {}

    races = []
    for meta in artifact.get('energyRaces') or []:
        round_number = int(meta['round'])
        race_id = meta.get('race') or f"{meta.get('year')}|{meta.get('location')}"
        jump = works_by_round.get(round_number) or {}
        eval_race = eval_by_round.get(round_number) or {}
        stats = jump.get('stats') or {}
        by_driver_stats = stats.get('byDriver') or {}
        predictions = []
        seen = set()
        for case in jump.get('cases') or []:
            key = (case.get('driver'), case.get('lap'), case.get('opponent'))
            seen.add(key)
            predictions.append(slim_case(case))
        extras = []
        for case in eval_race.get('cases') or []:
            if case.get('driver') not in WORKS_EIGHT:
                continue
            key = (case.get('driver'), case.get('lap'), case.get('opponent'))
            if key in seen:
                continue
            extras.append(slim_case(case))
        extras.sort(key=lambda row: (0 if row.get('worked') else 1, -(row.get('holdDelta') or 0), row.get('lap') or 0))
        predictions.extend(extras[:12])

        drivers = []
        for code, team in WORKS_EIGHT.items():
            track = ((drivers_art.get(code) or {}).get('byRace') or {}).get(race_id) or {}
            prior = snapshot.get(code) or {}
            jump_row = by_driver_stats.get(code) or {}
            overtake = track.get('overtake') or {}
            battle = track.get('battle') or {}
            opened = track.get('open') or {}
            drivers.append({
                'driver': code,
                'team': team,
                'huntN': overtake.get('n'),
                'huntAttackRate': _rate(overtake, 'attackRate'),
                'huntSaveRate': _rate(overtake, 'saveRate'),
                'battleAttackRate': _rate(battle, 'attackRate'),
                'openSaveRate': _rate(opened, 'saveRate'),
                'seasonHuntAttackRate': prior.get('overtakeAttackRate'),
                'u': prior.get('u'),
                'jumpWindows': jump_row.get('windows'),
                'jumpWorked': jump_row.get('worked'),
                'jumpMajor': jump_row.get('major'),
            })

        action_rows = [row for row in predictions if row.get('recordedAction') and row.get('modelAction')]
        agree = sum(1 for row in action_rows if row['recordedAction'] == row['modelAction'])
        races.append({
            'year': int(meta.get('year') or 2026),
            'round': round_number,
            'location': meta.get('location'),
            'name': meta.get('name'),
            'race': race_id,
            'heldOutHabits': race_id in test_races,
            'jump': {
                'windows': stats.get('windows'),
                'worked': stats.get('worked'),
                'major': stats.get('major'),
                'rate': stats.get('rate'),
            },
            'agreement': round(agree / len(action_rows), 4) if action_rows else None,
            'predictionCount': len(predictions),
            'drivers': drivers,
            'predictions': predictions,
        })

    payload = {
        'schema': 'models-result-races.v1',
        'year': 2026,
        'worksEight': WORKS_EIGHT,
        'note': (
            'Per-race JUMP first actions vs the recorded pair, plus this-GP energy habits. '
            'After a take they keep attacking; we SAVE to delay that re-pass. '
            'Success is more hold laps. Major is a better classified pair result. '
            'Habits forest strips this GP at inference. Two cars only. Not team battery.'
        ),
        'races': races,
    }
    OUT.write_text(json.dumps(payload, separators=(',', ':')), encoding='utf8')
    print(json.dumps({
        'wrote': str(OUT),
        'races': len(races),
        'predictions': sum(len(race['predictions']) for race in races),
    }))


if __name__ == '__main__':
    main()
