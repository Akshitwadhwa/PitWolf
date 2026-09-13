"""Train per-driver energy habits (2026) and take-rate aggressiveness (2018–2026).

For every cached 2026 race the trainer builds the constructed 4 MJ C5.2
store for every classified driver, then records how they spent that store
in each circumstance: overtake window, battle, open air, and leftover bin.
Those tables stay race-separate (HAM at Melbourne is not mixed into HAM at
Monza). The forest is trained on all 2026 races, with this-GP rates stripped
from the features so Australia never trains on Australia's own dump rate.

Labels are the same modelled ATTACK/SAVE/DELAY the rest of the app uses on
public timing — not team battery.

Aggressiveness u is how often they actually took a place, 2018 through 2026.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import log_loss

from clip_cached_race import SESSIONS, build_field_story

ROOT = Path(__file__).resolve().parents[1] / 'data' / 'f1-cache'
MODELS = ROOT / 'models'
ARTIFACT = MODELS / 'driver_energy_habits.joblib'
REPORT = MODELS / 'driver_energy_habits_report.json'

ENERGY_YEAR = 2026
AGGRESSION_YEARS = range(2018, 2027)
BATTLE_GAP_S = 1.2
ACTIONS = ('ATTACK', 'SAVE', 'DELAY')
MODES = ('overtake', 'battle', 'open')
LEFTOVER_BINS = ('high', 'mid', 'low')
FEATURES = [
    'inBattle',
    'inOvertakeWindow',
    'leftPct',
    'gapS',
    'closingRateS',
    'lapFraction',
    'trackBrakes',
    'driverBattleAttackRate',
    'driverOvertakeAttackRate',
    'driverOpenSaveRate',
    'driverHighLeftAttackRate',
    'driverLowLeftSaveRate',
]
SEED = 42
TEST_RACE_FRACTION = 0.23


def race_id(event: dict, path: Path) -> str:
    year = int(event.get('year') or path.parent.name)
    location = str(event.get('location') or event.get('name') or path.stem)
    return f'{year}|{location}'


def race_key(event: dict, path: Path) -> tuple[int, int]:
    year = int(event.get('year') or path.parent.name)
    round_number = int(event.get('round') or path.name.split('_')[0])
    return year, round_number


def iter_races(years) -> list[tuple[Path, dict]]:
    wanted = {int(year) for year in years}
    out = []
    for path in sorted(SESSIONS.glob('*/*_race.json'), key=lambda item: (item.parent.name, int(item.name.split('_')[0]))):
        try:
            year = int(path.parent.name)
        except ValueError:
            continue
        if year not in wanted:
            continue
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            continue
        if not payload.get('laps'):
            continue
        out.append((path, payload))
    return out


def empty_bucket() -> dict:
    return {
        'n': 0,
        'attacks': 0,
        'saves': 0,
        'delays': 0,
        'sumDeploy': 0.0,
        'sumHarvest': 0.0,
        'sumLeftPct': 0.0,
    }


def add_sample(bucket: dict, action: str, deploy: float, harvest: float, left_pct: float) -> None:
    bucket['n'] += 1
    if action == 'ATTACK':
        bucket['attacks'] += 1
    elif action == 'SAVE':
        bucket['saves'] += 1
    else:
        bucket['delays'] += 1
    bucket['sumDeploy'] += float(deploy)
    bucket['sumHarvest'] += float(harvest)
    bucket['sumLeftPct'] += float(left_pct)


def finalize_bucket(bucket: dict, global_means: dict | None = None) -> dict:
    n = max(0, int(bucket.get('n') or 0))
    attacks = int(bucket.get('attacks') or 0)
    saves = int(bucket.get('saves') or 0)
    delays = int(bucket.get('delays') or 0)
    mean_deploy = (bucket.get('sumDeploy') or 0.0) / n if n else 0.0
    mean_harvest = (bucket.get('sumHarvest') or 0.0) / n if n else 0.0
    mean_left = (bucket.get('sumLeftPct') or 0.0) / n if n else 100.0
    g_deploy = float((global_means or {}).get('meanDeployMj') or mean_deploy or 0.4)
    g_harvest = float((global_means or {}).get('meanHarvestMj') or mean_harvest or 0.16)
    out = {
        'n': n,
        'attacks': attacks,
        'saves': saves,
        'delays': delays,
        'sumDeploy': round(float(bucket.get('sumDeploy') or 0.0), 3),
        'sumHarvest': round(float(bucket.get('sumHarvest') or 0.0), 3),
        'sumLeftPct': round(float(bucket.get('sumLeftPct') or 0.0), 3),
        'attackRate': round(attacks / n, 4) if n else 0.0,
        'saveRate': round(saves / n, 4) if n else 0.0,
        'delayRate': round(delays / n, 4) if n else 0.0,
        'meanDeployMj': round(mean_deploy, 4),
        'meanHarvestMj': round(mean_harvest, 4),
        'meanLeftPct': round(mean_left, 2),
        'deployScale': round(float(np.clip(mean_deploy / g_deploy, 0.7, 1.35)), 3) if g_deploy else 1.0,
        'harvestScale': round(float(np.clip(mean_harvest / g_harvest, 0.7, 1.35)), 3) if g_harvest else 1.0,
    }
    return out


def subtract_bucket(base: dict, removed: dict | None) -> dict:
    if not removed:
        return dict(base)
    out = dict(base)
    for key in ('n', 'attacks', 'saves', 'delays'):
        out[key] = max(0, int(base.get(key) or 0) - int(removed.get(key) or 0))
    for key in ('sumDeploy', 'sumHarvest', 'sumLeftPct'):
        out[key] = max(0.0, float(base.get(key) or 0.0) - float(removed.get(key) or 0.0))
    return out


def in_battle(step: dict) -> bool:
    if step.get('isPitLap'):
        return False
    gap = float(step.get('gapToAheadS') or 9.0)
    behind = float(step.get('gapToBehindS') or 9.0)
    if step.get('ahead') is None:
        gap = 9.0
    return min(gap, behind) <= BATTLE_GAP_S


def sample_mode(step: dict) -> str:
    zone = str(step.get('energyZone') or (step.get('modelled') or {}).get('zone') or '')
    if zone == 'OVERTAKE_WINDOW':
        return 'overtake'
    if zone == 'BATTLE' or in_battle(step):
        return 'battle'
    return 'open'


def energy_samples_from_story(field: dict, event: dict, path: Path) -> tuple[list[dict], dict]:
    race = race_id(event, path)
    year = int(event.get('year') or path.parent.name)
    location = str(event.get('location') or event.get('name') or '')
    rows = []
    batteries = {}
    for driver_row in field.get('drivers') or []:
        code = driver_row.get('driver')
        racing = [step for step in (driver_row.get('laps') or []) if not step.get('isPitLap') and step.get('energyZone') != 'PIT']
        last_lap = max((int(step.get('lap') or 0) for step in racing), default=1) or 1
        leftover = []
        actions = []
        zones = []
        law = {}
        for step in racing:
            modelled = step.get('modelled') or {}
            action = modelled.get('action')
            if action not in ACTIONS:
                continue
            mode = sample_mode(step)
            if modelled.get('endPct') is not None:
                left = float(modelled['endPct'])
            elif modelled.get('startPct') is not None:
                left = float(modelled['startPct'])
            else:
                left = 100.0
            law = {
                'brakes': modelled.get('brakeSlices'),
                'sliceMj': modelled.get('maxSliceMj'),
                'lapHarvestCapMj': modelled.get('lapHarvestCapMj'),
            }
            leftover.append(round(left, 1))
            actions.append(action)
            zones.append(mode)
            rows.append({
                'year': year,
                'location': location,
                'race': race,
                'driver': code,
                'lap': step.get('lap'),
                'inBattle': 1.0 if mode != 'open' else 0.0,
                'inOvertakeWindow': 1.0 if mode == 'overtake' else 0.0,
                'mode': mode,
                'leftoverBin': leftover_bin(left),
                'gapS': float(step.get('gapToAheadS') or 0.0),
                'closingRateS': float(step.get('closingRateS') or 0.0),
                'leftPct': left,
                'lapFraction': round(float(step.get('lap') or 1) / last_lap, 4),
                'trackBrakes': float(modelled.get('brakeSlices') or 10),
                'deployMj': float(modelled.get('consumedMj') or 0.0),
                'harvestMj': float(modelled.get('harvestedMj') or 0.0),
                'action': action,
            })
        if leftover:
            batteries[code] = {
                'race': race,
                'location': location,
                'laps': len(leftover),
                'startPct': 100.0,
                'endPct': leftover[-1],
                'leftoverPct': leftover,
                'actions': actions,
                'zones': zones,
                'harvestLaw': law,
            }
    return rows, batteries


def overtake_counts_from_payload(payload: dict, path: Path) -> dict[str, dict]:
    """Count actual place-takes from running order. No energy model."""
    by_driver: dict[str, dict[int, dict]] = {}
    for row in payload.get('laps') or []:
        driver = row.get('driver')
        lap = row.get('lapNumber')
        if not driver or lap is None or row.get('lapTimeS') is None:
            continue
        by_driver.setdefault(driver, {})[int(lap)] = row
    race_time = {driver: 0.0 for driver in by_driver}
    prev_pos: dict[str, int] = {}
    counts: dict[str, dict] = {driver: {'laps': 0, 'overtakes': 0} for driver in by_driver}
    all_laps = sorted({lap for laps in by_driver.values() for lap in laps})
    for lap in all_laps:
        present = [driver for driver in by_driver if lap in by_driver[driver]]
        if not present:
            continue
        for driver in present:
            race_time[driver] += float(by_driver[driver][lap]['lapTimeS'])
        order = sorted((driver for driver in race_time if race_time[driver] > 0), key=lambda driver: race_time[driver])
        for index, driver in enumerate(order):
            row = by_driver[driver].get(lap)
            if not row:
                continue
            if row.get('isPitLap'):
                prev_pos[driver] = index + 1
                continue
            counts[driver]['laps'] += 1
            if driver in prev_pos and prev_pos[driver] > index + 1:
                counts[driver]['overtakes'] += 1
            prev_pos[driver] = index + 1
    event = payload.get('event') or {}
    race = race_id(event, path)
    return {driver: {**value, 'race': race} for driver, value in counts.items() if value['laps']}


def accumulate_aggression(races: list[tuple[Path, dict]]) -> dict:
    drivers = defaultdict(lambda: {'laps': 0, 'overtakes': 0, 'races': 0, 'byRace': {}})
    for path, payload in races:
        event = payload.get('event') or {}
        race = race_id(event, path)
        for driver, counts in overtake_counts_from_payload(payload, path).items():
            row = drivers[driver]
            row['laps'] += counts['laps']
            row['overtakes'] += counts['overtakes']
            row['races'] += 1
            row['byRace'][race] = {'laps': counts['laps'], 'overtakes': counts['overtakes']}
    global_laps = sum(row['laps'] for row in drivers.values())
    global_ot = sum(row['overtakes'] for row in drivers.values())
    out = {}
    for driver, row in drivers.items():
        laps = row['laps']
        out[driver] = {
            'laps': laps,
            'overtakes': row['overtakes'],
            'races': row['races'],
            'overtakeSoonRate': round(row['overtakes'] / laps, 4) if laps else 0.0,
            'byRace': row['byRace'],
        }
    return {
        'global': {
            'laps': global_laps,
            'overtakes': global_ot,
            'overtakeSoonRate': round(global_ot / global_laps, 4) if global_laps else 0.15,
        },
        'drivers': out,
    }


def leftover_bin(left_pct: float) -> str:
    if left_pct >= 60:
        return 'high'
    if left_pct >= 30:
        return 'mid'
    return 'low'


def empty_modes() -> dict:
    return {mode: empty_bucket() for mode in MODES}


def empty_leftover() -> dict:
    return {bin_name: empty_bucket() for bin_name in LEFTOVER_BINS}


def empty_track() -> dict:
    return {**empty_modes(), 'leftover': empty_leftover()}


def empty_driver() -> dict:
    return {**empty_track(), 'byRace': defaultdict(empty_track)}


def finalize_track(raw: dict, global_means: dict) -> dict:
    return {
        **{mode: finalize_bucket(raw[mode], global_means[mode]) for mode in MODES},
        'leftover': {
            bin_name: finalize_bucket((raw.get('leftover') or {}).get(bin_name) or empty_bucket(), global_means.get('all') or global_means['open'])
            for bin_name in LEFTOVER_BINS
        },
    }


def accumulate_energy(rows: list[dict]) -> tuple[dict, dict]:
    global_raw = empty_track()
    driver_raw = defaultdict(empty_driver)
    for row in rows:
        mode = row['mode']
        lbin = row.get('leftoverBin') or leftover_bin(row['leftPct'])
        add_sample(global_raw[mode], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])
        add_sample(global_raw['leftover'][lbin], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])
        add_sample(driver_raw[row['driver']][mode], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])
        add_sample(driver_raw[row['driver']]['leftover'][lbin], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])
        add_sample(driver_raw[row['driver']]['byRace'][row['race']][mode], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])
        add_sample(driver_raw[row['driver']]['byRace'][row['race']]['leftover'][lbin], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])

    defaults = {'overtake': (0.55, 0.10), 'battle': (0.5, 0.16), 'open': (0.4, 0.2)}
    global_means = {}
    for mode in MODES:
        n = global_raw[mode]['n']
        global_means[mode] = {
            'meanDeployMj': (global_raw[mode]['sumDeploy'] / n) if n else defaults[mode][0],
            'meanHarvestMj': (global_raw[mode]['sumHarvest'] / n) if n else defaults[mode][1],
        }
    all_n = sum(global_raw[mode]['n'] for mode in MODES)
    all_deploy = sum(global_raw[mode]['sumDeploy'] for mode in MODES)
    all_harvest = sum(global_raw[mode]['sumHarvest'] for mode in MODES)
    global_means['all'] = {
        'meanDeployMj': (all_deploy / all_n) if all_n else 0.4,
        'meanHarvestMj': (all_harvest / all_n) if all_n else 0.16,
    }
    global_out = finalize_track(global_raw, global_means)
    global_out['byRace'] = {}
    race_globals = defaultdict(empty_track)
    for row in rows:
        lbin = row.get('leftoverBin') or leftover_bin(row['leftPct'])
        add_sample(race_globals[row['race']][row['mode']], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])
        add_sample(race_globals[row['race']]['leftover'][lbin], row['action'], row['deployMj'], row['harvestMj'], row['leftPct'])
    for race, raw in race_globals.items():
        global_out['byRace'][race] = finalize_track(raw, global_means)

    drivers = {}
    for code, raw in driver_raw.items():
        drivers[code] = {
            **finalize_track(raw, global_means),
            'byRace': {
                race: finalize_track(track, global_means)
                for race, track in raw['byRace'].items()
            },
        }
    return global_out, drivers


def attach_leave_one_race_rates(rows: list[dict], drivers: dict, global_out: dict) -> None:
    g_battle = float(global_out['battle'].get('attackRate') or 0.35)
    g_overtake = float((global_out.get('overtake') or {}).get('attackRate') or g_battle)
    g_open = float(global_out['open'].get('saveRate') or 0.35)
    g_high = float(((global_out.get('leftover') or {}).get('high') or {}).get('attackRate') or 0.40)
    g_low = float(((global_out.get('leftover') or {}).get('low') or {}).get('saveRate') or 0.45)
    for row in rows:
        prior = drivers.get(row['driver']) or {}
        race = (prior.get('byRace') or {}).get(row['race']) or {}
        battle = finalize_bucket(subtract_bucket(prior.get('battle') or empty_bucket(), (race.get('battle'))))
        overtake = finalize_bucket(subtract_bucket(prior.get('overtake') or empty_bucket(), (race.get('overtake'))))
        opened = finalize_bucket(subtract_bucket(prior.get('open') or empty_bucket(), (race.get('open'))))
        high = finalize_bucket(subtract_bucket(
            (prior.get('leftover') or {}).get('high') or empty_bucket(),
            (race.get('leftover') or {}).get('high'),
        ))
        low = finalize_bucket(subtract_bucket(
            (prior.get('leftover') or {}).get('low') or empty_bucket(),
            (race.get('leftover') or {}).get('low'),
        ))
        row['driverBattleAttackRate'] = float(battle['attackRate'] if battle['n'] else g_battle)
        row['driverOvertakeAttackRate'] = float(overtake['attackRate'] if overtake['n'] else g_overtake)
        row['driverOpenSaveRate'] = float(opened['saveRate'] if opened['n'] else g_open)
        row['driverHighLeftAttackRate'] = float(high['attackRate'] if high['n'] else g_high)
        row['driverLowLeftSaveRate'] = float(low['saveRate'] if low['n'] else g_low)


def matrix(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    x = np.array([[float(row[name]) for name in FEATURES] for row in rows], dtype=float)
    y = np.array([row['action'] for row in rows], dtype=object)
    return x, y


def fit_action_model(train: list[dict], test: list[dict]) -> tuple[RandomForestClassifier | None, dict]:
    if len(train) < 80:
        return None, {'error': 'not enough 2026 energy samples'}
    x_train, y_train = matrix(train)
    model = RandomForestClassifier(
        n_estimators=180,
        min_samples_leaf=10,
        max_depth=8,
        class_weight='balanced',
        random_state=SEED,
        n_jobs=-1,
    )
    model.fit(x_train, y_train)
    report = {
        'samplesTrain': int(len(y_train)),
        'samplesTest': int(len(test)),
        'classes': list(model.classes_),
        'importances': dict(zip(FEATURES, [round(float(value), 4) for value in model.feature_importances_])),
        'trainActionRate': {action: round(float(np.mean(y_train == action)), 4) for action in ACTIONS},
    }
    if test:
        x_test, y_test = matrix(test)
        proba = model.predict_proba(x_test)
        report['testAccuracy'] = round(float(np.mean(model.predict(x_test) == y_test)), 4)
        try:
            report['testLogLoss'] = round(float(log_loss(y_test, proba, labels=model.classes_)), 4)
        except Exception:
            report['testLogLoss'] = None
        report['testActionRate'] = {action: round(float(np.mean(y_test == action)), 4) for action in ACTIONS}
    return model, report


def main() -> None:
    energy_races = iter_races([ENERGY_YEAR])
    if not energy_races:
        raise SystemExit('no cached 2026 race files')
    energy_rows = []
    energy_meta = []
    batteries = {}
    for path, payload in energy_races:
        event = payload.get('event') or {}
        field = build_field_story(payload)
        rows, race_batteries = energy_samples_from_story(field, event, path)
        energy_rows.extend(rows)
        race = race_id(event, path)
        batteries[race] = race_batteries
        energy_meta.append({
            'year': int(event.get('year') or ENERGY_YEAR),
            'round': int(event.get('round') or path.name.split('_')[0]),
            'location': event.get('location'),
            'name': event.get('name'),
            'race': race,
            'drivers': sorted(race_batteries),
            'driverCount': len(race_batteries),
        })

    global_out, drivers = accumulate_energy(energy_rows)
    attach_leave_one_race_rates(energy_rows, drivers, global_out)

    race_ids = sorted({row['race'] for row in energy_rows})
    rng = np.random.default_rng(SEED)
    holdout_n = max(2, int(round(len(race_ids) * TEST_RACE_FRACTION)))
    test_races = set(rng.choice(race_ids, size=min(holdout_n, len(race_ids) - 1), replace=False).tolist())
    train = [row for row in energy_rows if row['race'] not in test_races]
    test = [row for row in energy_rows if row['race'] in test_races]
    model, model_report = fit_action_model(train, test)

    aggression_races = iter_races(AGGRESSION_YEARS)
    aggression = accumulate_aggression(aggression_races)

    artifact = {
        'schemaVersion': 'driver-energy-habits.v3',
        'energyYear': ENERGY_YEAR,
        'energyRaces': energy_meta,
        'energyRaceCount': len(energy_meta),
        'aggressionYears': [year for year in AGGRESSION_YEARS],
        'aggressionRaceCount': len(aggression_races),
        'battleGapS': BATTLE_GAP_S,
        'features': FEATURES,
        'modes': list(MODES),
        'leftoverBins': list(LEFTOVER_BINS),
        'model': model,
        'classes': list(model.classes_) if model is not None else list(ACTIONS),
        'global': global_out,
        'drivers': drivers,
        'batteries': batteries,
        'aggression': aggression,
        'note': (
            'Constructed 4 MJ C5.2 leftover for every driver on every 2026 race. '
            'Habits are per-driver, per-track, per-circumstance (hunt / battle / open / leftover). '
            'This GP is stripped at inference. u is 2018–2026 take rate. Not team battery.'
        ),
    }
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, ARTIFACT)

    snapshot = []
    for code in sorted(drivers):
        row = drivers[code]
        agr = (aggression.get('drivers') or {}).get(code)
        leftover = row.get('leftover') or {}
        snapshot.append({
            'driver': code,
            'races': len(row.get('byRace') or {}),
            'overtakeAttackRate': (row.get('overtake') or {}).get('attackRate'),
            'overtakeDeployMj': (row.get('overtake') or {}).get('meanDeployMj'),
            'battleAttackRate': row['battle']['attackRate'],
            'battleSaveRate': row['battle']['saveRate'],
            'openSaveRate': row['open']['saveRate'],
            'highLeftAttackRate': (leftover.get('high') or {}).get('attackRate'),
            'lowLeftSaveRate': (leftover.get('low') or {}).get('saveRate'),
            'battleDeployMj': row['battle']['meanDeployMj'],
            'openDeployMj': row['open']['meanDeployMj'],
            'u': agr.get('overtakeSoonRate') if agr else None,
            'uLaps': agr.get('laps') if agr else None,
        })
    report = {
        'energyRaceCount': len(energy_meta),
        'energyRaces': energy_meta,
        'energySamples': len(energy_rows),
        'testRaces': sorted(test_races),
        'model': model_report,
        'aggressionRaceCount': len(aggression_races),
        'aggressionGlobalRate': (aggression.get('global') or {}).get('overtakeSoonRate'),
        'snapshot': snapshot,
        'note': artifact['note'],
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({
        'wrote': str(ARTIFACT),
        'energyRaces': len(energy_meta),
        'energySamples': len(energy_rows),
        'aggressionRaces': len(aggression_races),
        'snapshot': snapshot,
        'model': {key: model_report.get(key) for key in ('samplesTrain', 'samplesTest', 'testAccuracy', 'testLogLoss')},
    }, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        raise SystemExit(1)
