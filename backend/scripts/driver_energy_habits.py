"""Load 2026 energy personalities and 2018–2026 take-rate u.

All leftover / deploy figures stay modelled. This module never claims team
battery. Current-race laps are subtracted from both the energy profile and u.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

ARTIFACT_PATH = Path(__file__).resolve().parents[1] / 'data' / 'f1-cache' / 'models' / 'driver_energy_habits.joblib'
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
_ARTIFACT = None


def _num(value, default=0.0) -> float:
    try:
        number = float(value)
        return number if number == number else default
    except (TypeError, ValueError):
        return default


def load_habits():
    global _ARTIFACT
    if _ARTIFACT is not None:
        return _ARTIFACT
    try:
        import joblib
        if ARTIFACT_PATH.exists():
            _ARTIFACT = joblib.load(ARTIFACT_PATH)
            model = _ARTIFACT.get('model') if isinstance(_ARTIFACT, dict) else None
            if model is not None and hasattr(model, 'n_jobs'):
                model.n_jobs = 1
    except Exception:
        _ARTIFACT = {}
    return _ARTIFACT or {}


def race_key(year, location: str) -> str:
    try:
        return f'{int(year)}|{location}'
    except (TypeError, ValueError):
        return f'{year}|{location}'


def _subtract_mode(base: dict | None, removed: dict | None) -> dict:
    base = base or {}
    removed = removed or {}
    n = max(0, int(base.get('n') or 0) - int(removed.get('n') or 0))
    attacks = max(0, int(base.get('attacks') or 0) - int(removed.get('attacks') or 0))
    saves = max(0, int(base.get('saves') or 0) - int(removed.get('saves') or 0))
    delays = max(0, int(base.get('delays') or 0) - int(removed.get('delays') or 0))
    sum_deploy = max(0.0, _num(base.get('sumDeploy')) - _num(removed.get('sumDeploy')))
    sum_harvest = max(0.0, _num(base.get('sumHarvest')) - _num(removed.get('sumHarvest')))
    sum_left = max(0.0, _num(base.get('sumLeftPct')) - _num(removed.get('sumLeftPct')))
    mean_deploy = sum_deploy / n if n else _num(base.get('meanDeployMj'), 0.4)
    mean_harvest = sum_harvest / n if n else _num(base.get('meanHarvestMj'), 0.16)
    g_deploy = _num(base.get('meanDeployMj'), mean_deploy) or 0.4
    g_harvest = _num(base.get('meanHarvestMj'), mean_harvest) or 0.16
    return {
        'n': n,
        'attacks': attacks,
        'saves': saves,
        'delays': delays,
        'attackRate': round(attacks / n, 4) if n else _num(base.get('attackRate')),
        'saveRate': round(saves / n, 4) if n else _num(base.get('saveRate')),
        'delayRate': round(delays / n, 4) if n else _num(base.get('delayRate')),
        'meanDeployMj': round(mean_deploy, 4),
        'meanHarvestMj': round(mean_harvest, 4),
        'meanLeftPct': round(sum_left / n, 2) if n else _num(base.get('meanLeftPct'), 70.0),
        'deployScale': round(float(np.clip(mean_deploy / g_deploy, 0.7, 1.35)), 3) if g_deploy else 1.0,
        'harvestScale': round(float(np.clip(mean_harvest / g_harvest, 0.7, 1.35)), 3) if g_harvest else 1.0,
    }


def leftover_bin(left_pct) -> str:
    pct = _num(left_pct, 70.0)
    if pct >= 60:
        return 'high'
    if pct >= 30:
        return 'mid'
    return 'low'


def exclude_energy_profile(profile: dict | None, year, location: str) -> dict:
    profile = profile or {}
    current = (profile.get('byRace') or {}).get(race_key(year, location)) or {}
    leftover = profile.get('leftover') or {}
    current_left = current.get('leftover') or {}
    return {
        **{mode: _subtract_mode(profile.get(mode), current.get(mode)) for mode in MODES},
        'leftover': {
            bin_name: _subtract_mode(leftover.get(bin_name), current_left.get(bin_name))
            for bin_name in LEFTOVER_BINS
        },
        'thisRace': current or None,
    }


def exclude_aggression(prior: dict | None, year, location: str, fallback: float = 0.15) -> dict:
    prior = prior or {}
    cleaned = {key: value for key, value in prior.items() if key != 'byRace'}
    race = (prior.get('byRace') or {}).get(race_key(year, location))
    if not race:
        if 'overtakeSoonRate' not in cleaned and prior.get('laps'):
            cleaned['overtakeSoonRate'] = round(_num(prior.get('overtakes')) / max(1, int(prior.get('laps') or 1)), 4)
        return cleaned
    laps = max(0, int(prior.get('laps') or 0) - int(race.get('laps') or 0))
    overtakes = max(0, int(prior.get('overtakes') or 0) - int(race.get('overtakes') or 0))
    cleaned['laps'] = laps
    cleaned['overtakes'] = overtakes
    cleaned['races'] = max(0, int(prior.get('races') or 0) - 1)
    cleaned['overtakeSoonRate'] = round(overtakes / laps, 4) if laps else fallback
    return cleaned


def driver_profile(driver: str, year=None, location: str = '') -> dict:
    artifact = load_habits()
    raw = ((artifact.get('drivers') or {}).get(str(driver or '').upper()) or {})
    return exclude_energy_profile(raw, year, location)


def global_profile(year=None, location: str = '') -> dict:
    artifact = load_habits()
    return exclude_energy_profile(artifact.get('global') or {}, year, location)


def aggression_u(driver: str, year=None, location: str = '') -> float | None:
    artifact = load_habits()
    aggression = artifact.get('aggression') or {}
    if not aggression:
        return None
    prior = exclude_aggression((aggression.get('drivers') or {}).get(str(driver or '').upper()) or {}, year, location)
    rate = prior.get('overtakeSoonRate')
    if rate is None:
        rate = (aggression.get('global') or {}).get('overtakeSoonRate', 0.09)
    global_rate = _num((aggression.get('global') or {}).get('overtakeSoonRate'), 0.09) or 0.09
    # Raw take/lap is ~0.08–0.12. Stretch so the field mean sits near 0.35,
    # which is the operating range the convert draw was built for.
    stretched = (float(rate) / max(global_rate, 0.02)) * 0.35
    return round(max(0.05, min(0.85, stretched)), 4)


def mode_of(in_battle: bool, in_overtake: bool = False) -> str:
    if in_overtake:
        return 'overtake'
    return 'battle' if in_battle else 'open'


def _empirical_rates(profile: dict, in_battle: bool, in_overtake: bool = False) -> dict[str, float]:
    bucket = profile.get(mode_of(in_battle, in_overtake)) or {}
    if not bucket.get('n'):
        bucket = profile.get('battle' if (in_battle or in_overtake) else 'open') or {}
    return {
        'ATTACK': _num(bucket.get('attackRate'), 0.33),
        'SAVE': _num(bucket.get('saveRate'), 0.33),
        'DELAY': _num(bucket.get('delayRate'), 0.34),
    }


def action_probabilities(
    driver: str,
    in_battle: bool,
    leftover_pct: float,
    gap_s: float,
    closing_s: float,
    year=None,
    location: str = '',
    use_model: bool = True,
    in_overtake: bool = False,
    lap_fraction: float = 0.5,
    track_brakes: float = 10.0,
) -> dict[str, float]:
    artifact = load_habits()
    profile = driver_profile(driver, year, location)
    hunt = bool(in_overtake or (in_battle and _num(gap_s, 9.0) <= 1.0))
    empirical = _empirical_rates(profile, in_battle, hunt)
    leftover = (profile.get('leftover') or {})
    high = leftover.get('high') or {}
    low = leftover.get('low') or {}
    blended = dict(empirical)
    model = artifact.get('model') if use_model else None
    classes = list(artifact.get('classes') or ACTIONS)
    if model is not None:
        features = artifact.get('features') or FEATURES
        vector = {
            'inBattle': 1.0 if in_battle or hunt else 0.0,
            'inOvertakeWindow': 1.0 if hunt else 0.0,
            'leftPct': _num(leftover_pct, 70.0),
            'gapS': _num(gap_s, 1.2),
            'closingRateS': _num(closing_s),
            'lapFraction': _num(lap_fraction, 0.5),
            'trackBrakes': _num(track_brakes, 10.0),
            'driverBattleAttackRate': _num((profile.get('battle') or {}).get('attackRate'), 0.35),
            'driverOvertakeAttackRate': _num((profile.get('overtake') or profile.get('battle') or {}).get('attackRate'), 0.35),
            'driverOpenSaveRate': _num((profile.get('open') or {}).get('saveRate'), 0.35),
            'driverHighLeftAttackRate': _num(high.get('attackRate'), 0.40),
            'driverLowLeftSaveRate': _num(low.get('saveRate'), 0.45),
        }
        x = np.array([[_num(vector.get(name)) for name in features]], dtype=float)
        try:
            proba = model.predict_proba(x)[0]
            forest = {str(label): float(score) for label, score in zip(classes, proba)}
            blended = {
                action: 0.30 * forest.get(action, 0.0) + 0.70 * empirical.get(action, 0.0)
                for action in ACTIONS
            }
        except Exception:
            blended = empirical
    total = sum(blended.values()) or 1.0
    return {action: round(blended[action] / total, 4) for action in ACTIONS}


def pick_action(
    driver: str,
    in_battle: bool,
    leftover_pct: float,
    gap_s: float,
    closing_s: float,
    year=None,
    location: str = '',
    allow_attack: bool = True,
    leftover_mj: float | None = None,
    use_model: bool = True,
    in_overtake: bool = False,
    lap_fraction: float = 0.5,
    track_brakes: float = 10.0,
) -> tuple[str, dict[str, float]]:
    proba = action_probabilities(
        driver, in_battle, leftover_pct, gap_s, closing_s, year, location,
        use_model=use_model, in_overtake=in_overtake,
        lap_fraction=lap_fraction, track_brakes=track_brakes)
    usable = dict(proba)
    if not allow_attack or (leftover_mj is not None and leftover_mj < 0.25):
        usable['ATTACK'] = 0.0
    action = max(ACTIONS, key=lambda name: usable[name])
    return action, proba


def energy_scales(driver: str, in_battle: bool, year=None, location: str = '', in_overtake: bool = False, leftover_pct: float | None = None) -> tuple[float, float]:
    profile = driver_profile(driver, year, location)
    globe = global_profile(year, location)
    mode = mode_of(in_battle, in_overtake)
    bucket = profile.get(mode) or profile.get('battle' if (in_battle or in_overtake) else 'open') or {}
    world = globe.get(mode) or globe.get('battle' if (in_battle or in_overtake) else 'open') or {}
    if leftover_pct is not None:
        lbin = leftover_bin(leftover_pct)
        leftover_bucket = ((profile.get('leftover') or {}).get(lbin) or {})
        if leftover_bucket.get('n'):
            bucket = leftover_bucket
            world = ((globe.get('leftover') or {}).get(lbin) or world)
    mean_deploy = _num(bucket.get('meanDeployMj'), _num(world.get('meanDeployMj'), 0.4))
    mean_harvest = _num(bucket.get('meanHarvestMj'), _num(world.get('meanHarvestMj'), 0.16))
    g_deploy = _num(world.get('meanDeployMj'), mean_deploy) or 0.4
    g_harvest = _num(world.get('meanHarvestMj'), mean_harvest) or 0.16
    return (
        max(0.7, min(1.35, mean_deploy / g_deploy if g_deploy else 1.0)),
        max(0.7, min(1.35, mean_harvest / g_harvest if g_harvest else 1.0)),
    )


def personality_card(driver: str, year=None, location: str = '') -> dict[str, Any]:
    profile = driver_profile(driver, year, location)
    battle = profile.get('battle') or {}
    overtake = profile.get('overtake') or {}
    opened = profile.get('open') or {}
    leftover = profile.get('leftover') or {}
    u = aggression_u(driver, year, location)
    artifact = load_habits()
    agr = exclude_aggression(
        ((artifact.get('aggression') or {}).get('drivers') or {}).get(str(driver or '').upper()) or {},
        year, location,
    )
    return {
        'driver': str(driver or '').upper(),
        'energyYear': artifact.get('energyYear', 2026),
        'energyRaceCount': artifact.get('energyRaceCount'),
        'aggressionYears': artifact.get('aggressionYears') or list(range(2018, 2027)),
        'takeRate': agr.get('overtakeSoonRate'),
        'u': u,
        'overtake': {
            'n': overtake.get('n'),
            'attackRate': overtake.get('attackRate'),
            'saveRate': overtake.get('saveRate'),
            'delayRate': overtake.get('delayRate'),
            'meanDeployMj': overtake.get('meanDeployMj'),
            'meanHarvestMj': overtake.get('meanHarvestMj'),
        },
        'battle': {
            'n': battle.get('n'),
            'attackRate': battle.get('attackRate'),
            'saveRate': battle.get('saveRate'),
            'delayRate': battle.get('delayRate'),
            'meanDeployMj': battle.get('meanDeployMj'),
        },
        'open': {
            'n': opened.get('n'),
            'attackRate': opened.get('attackRate'),
            'saveRate': opened.get('saveRate'),
            'delayRate': opened.get('delayRate'),
            'meanDeployMj': opened.get('meanDeployMj'),
        },
        'leftover': {
            'highAttackRate': (leftover.get('high') or {}).get('attackRate'),
            'midAttackRate': (leftover.get('mid') or {}).get('attackRate'),
            'lowSaveRate': (leftover.get('low') or {}).get('saveRate'),
        },
        'tracksSeen': artifact.get('energyRaceCount'),
        'note': (
            '2026 constructed C5.2 leftover for this driver on every cached race, this GP stripped. '
            'Hunt / battle / open / leftover bins. u is 2018–2026 take rate, this GP stripped. Not team battery.'
        ),
    }


def best_go_hint(driver: str, leftover_pct: float, gap_s: float, zone: str, year=None, location: str = '') -> dict[str, Any]:
    card = personality_card(driver, year, location)
    left = _num(leftover_pct, 70.0)
    gap = _num(gap_s, 9.0)
    hunt = zone in {'OVERTAKE_WINDOW', 'OVERTAKE_MODE_ZONE'} or gap <= 1.0
    hunt_rate = _num((card.get('overtake') or card.get('battle') or {}).get('attackRate'), 0.35)
    if left < 22:
        return {
            'call': 'REBUILD',
            'place': 'OPEN / BRAKE HARVEST',
            'note': f'{driver} has {left:.0f}% of the 4 MJ C5.2 window. Harvest first; a dump here would clip.',
        }
    if hunt and left >= 40 and hunt_rate >= 0.28:
        return {
            'call': 'GO',
            'place': 'OVERTAKE MODE ZONE',
            'note': f'This 1.0s zone is the better place to spend. {driver} dumps on {round(hunt_rate * 100)}% of hunt laps and has {left:.0f}% left.',
        }
    if hunt and left >= 28:
        return {
            'call': 'HOLD POSITION',
            'place': 'OVERTAKE MODE ZONE',
            'note': f'{driver} is inside 1.0s with {left:.0f}% left. Hold position unless they are already closing.',
        }
    if zone == 'BATTLE':
        return {
            'call': 'COVER',
            'place': 'BATTLE',
            'note': f'{driver} is in a fight with {left:.0f}% left. Cover first; the overtake-mode zone is the car ahead inside 1.0s.',
        }
    return {
        'call': 'REBUILD',
        'place': 'OPEN',
        'note': f'{driver} is in open air with {left:.0f}% left. Rebuild until the next 1.0s overtake-mode zone.',
    }
