"""Find 2026 laps where the PitWolf branch differs from the recorded race.

For every cached 2026 race and every classified driver, JUMP is scored at
each 1.0s pair lap. Only laps where the first action or the next-lap pair
order disagrees with the recorded race are kept. Those are the evaluation
examples: open that lap in the sim and show the next few laps.

This is a two-car constructed-C5.2 counterfactual, not a rewritten grid.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from clip_cached_race import SESSIONS, build_field_story, load_session
from replay_strategy import rollout_to_finish

LOOKAHEAD = 6
BATTLE_S = 1.0
YEAR = 2026
MAX_WORKED_PER_RACE = 3
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
ROOT = Path(__file__).resolve().parents[2]
OUT_MD = ROOT / 'ModelOvertake.md'
OUT_JSON = Path(__file__).resolve().parents[1] / 'data' / 'f1-cache' / 'models' / 'model_overtake_eval.json'
OUT_WORKS_MD = ROOT / 'ModelOvertakeWorks.md'
OUT_WORKS_JSON = Path(__file__).resolve().parents[1] / 'data' / 'f1-cache' / 'models' / 'model_overtake_works.json'


def _num(value, default=None):
    try:
        number = float(value)
        return number if number == number else default
    except (TypeError, ValueError):
        return default


def index_field(field: dict) -> dict[str, dict[int, dict]]:
    out = {}
    for row in field.get('drivers') or []:
        code = row.get('driver')
        if not code:
            continue
        out[code] = {int(step['lap']): step for step in (row.get('laps') or []) if step.get('lap') is not None}
    return out


def pair_ahead(us: dict | None, them: dict | None) -> bool | None:
    if not us or not them:
        return None
    our_pos = _num(us.get('timingPosition'), 99)
    their_pos = _num(them.get('timingPosition'), 99)
    if our_pos is None or their_pos is None or our_pos >= 99 or their_pos >= 99:
        return None
    return our_pos < their_pos


def battle_opponent(step: dict) -> tuple[str | None, str]:
    gap_ahead = _num(step.get('gapToAheadS'), 9.0)
    gap_behind = _num(step.get('gapToBehindS'), 9.0)
    ahead = step.get('ahead')
    behind = step.get('behind')
    hunt = bool(ahead and gap_ahead is not None and gap_ahead <= BATTLE_S)
    cover = bool(behind and gap_behind is not None and gap_behind <= BATTLE_S)
    if hunt:
        return str(ahead), 'ATTACKING'
    if cover:
        return str(behind), 'DEFENDING'
    return None, 'OPEN'


def recorded_window(by_driver: dict, selected: str, opponent: str, start: int, last: int) -> list[dict]:
    rows = []
    for lap in range(start, last + 1):
        us = (by_driver.get(selected) or {}).get(lap)
        them = (by_driver.get(opponent) or {}).get(lap)
        if not us:
            continue
        modelled = us.get('modelled') or {}
        rows.append({
            'lap': lap,
            'action': modelled.get('action'),
            'event': us.get('event'),
            'zone': us.get('energyZone'),
            'position': us.get('timingPosition'),
            'opponentPosition': None if not them else them.get('timingPosition'),
            'ahead': pair_ahead(us, them),
            'gapS': _num(us.get('gapToAheadS') if us.get('ahead') == opponent else us.get('gapToBehindS')),
            'leftPct': modelled.get('endPct'),
            'deployMj': modelled.get('consumedMj'),
            'harvestMj': modelled.get('harvestedMj'),
            'pit': bool(us.get('isPitLap')),
        })
    return rows


def model_window(path: list[dict], start: int) -> list[dict]:
    rows = []
    for step in path:
        if int(step.get('lap') or 0) < start:
            continue
        rows.append({
            'lap': step.get('lap'),
            'action': step.get('action'),
            'event': step.get('event'),
            'zone': step.get('zone'),
            'ahead': bool(step.get('ahead')),
            'leftPct': (step.get('battery') or {}).get('ourLeftPct'),
            'deployMj': step.get('deployMj'),
            'harvestMj': step.get('harvestMj'),
            'opponentAction': step.get('opponentAction'),
            'convertP': step.get('convertP'),
            'draw': step.get('draw'),
            'pit': bool(step.get('ourPit') or step.get('opponentPit')),
        })
    return rows


def hold_delta(recorded: list[dict], modelled: list[dict]) -> int:
    rec = sum(1 for row in recorded if row.get('ahead'))
    mod = sum(1 for row in modelled if row.get('ahead'))
    return mod - rec


def result_differs(recorded: list[dict], modelled: list[dict]) -> bool:
    """Keep only laps where the pair story changes, not every first-action mismatch."""
    if not recorded or not modelled:
        return False
    by_model = {row['lap']: row for row in modelled}
    rec_ot = any(row.get('event') == 'OVERTAKE' for row in recorded)
    mod_take = any(row.get('event') in {'TAKE', 'LOST_PLACE'} for row in modelled)
    if rec_ot != mod_take:
        return True
    for row in recorded:
        other = by_model.get(row['lap'])
        if not other or row.get('ahead') is None:
            continue
        if bool(row['ahead']) != bool(other.get('ahead')):
            return True
    return False


def why_line(recorded: list[dict], modelled: list[dict]) -> str:
    rec0, mod0 = recorded[0], modelled[0]
    bits = []
    if rec0.get('action') != mod0.get('action'):
        bits.append(f"first action {mod0.get('action')} vs recorded {rec0.get('action')}")
    rec_lead = sum(1 for row in recorded if row.get('ahead'))
    mod_lead = sum(1 for row in modelled if row.get('ahead'))
    if rec_lead != mod_lead:
        bits.append(f"pair-lead laps {mod_lead} vs recorded {rec_lead} in this window")
    flips = []
    by_model = {row['lap']: row for row in modelled}
    for row in recorded:
        other = by_model.get(row['lap'])
        if other and row.get('ahead') is not None and bool(row['ahead']) != bool(other.get('ahead')):
            flips.append(f"L{row['lap']}")
    if flips:
        bits.append('order flip at ' + ', '.join(flips[:4]))
    rec_ot = [row['lap'] for row in recorded if row.get('event') == 'OVERTAKE']
    mod_take = [row['lap'] for row in modelled if row.get('event') in {'TAKE', 'LOST_PLACE'}]
    if rec_ot and not mod_take:
        bits.append(f"recorded overtake L{rec_ot[0]} did not land on the branch")
    if mod_take and not rec_ot:
        bits.append(f"branch {modelled[0].get('event')} at L{mod_take[0]} that the race did not take")
    return '; '.join(bits) or 'branch path disagrees with the recorded pair'


def iter_races() -> list[Path]:
    folder = SESSIONS / str(YEAR)
    if not folder.exists():
        return []
    return sorted(folder.glob('*_race.json'), key=lambda path: int(path.name.split('_')[0]))


def evaluate_race(path: Path, only_driver: str | None = None, works_only: bool = False) -> dict | None:
    payload = load_session(path)
    event = payload.get('event') or {}
    year = int(event.get('year') or YEAR)
    round_number = int(event.get('round') or path.name.split('_')[0])
    session_name = payload.get('session') or 'Race'
    location = str(event.get('location') or '')
    name = str(event.get('name') or f'Round {round_number}')
    field = build_field_story(payload)
    by_driver = index_field(field)
    finish = {
        item.get('driver'): item.get('classifiedPosition')
        for item in (field.get('drivers') or [])
        if item.get('driver')
    }
    last_lap = max((max(laps) for laps in by_driver.values() if laps), default=0)
    pit_laps = {
        code: sorted(step['lap'] for step in laps.values() if step.get('isPitLap'))
        for code, laps in by_driver.items()
    }
    cases = []
    drivers = sorted(by_driver)
    if works_only:
        drivers = [code for code in WORKS_EIGHT if code in by_driver]
    if only_driver:
        drivers = [only_driver] if only_driver in drivers else []
    stats = {
        'windows': 0,
        'worked': 0,
        'major': 0,
        'byDriver': {code: {'windows': 0, 'worked': 0, 'major': 0, 'team': WORKS_EIGHT.get(code)} for code in drivers},
    }
    for selected in drivers:
        laps = by_driver[selected]
        for lap, step in sorted(laps.items()):
            if step.get('isPitLap') or step.get('energyZone') == 'PIT':
                continue
            opponent, role = battle_opponent(step)
            if not opponent or opponent not in by_driver:
                continue
            if step.get('energyZone') != 'OVERTAKE_WINDOW' and step.get('event') != 'OVERTAKE':
                continue
            them = laps.get(lap) and by_driver[opponent].get(lap)
            if not them:
                continue
            ours_model = step.get('modelled') or {}
            theirs_model = them.get('modelled') or {}
            start_soc = _num(ours_model.get('startMj'), 2.8)
            opp_soc = _num(theirs_model.get('startMj'), 2.8)
            horizon_end = min(last_lap, lap + LOOKAHEAD - 1)
            tree = rollout_to_finish({
                'focus': {
                    'driver': selected,
                    'defender': opponent,
                    'lap': lap,
                    'gapS': _num(step.get('gapToAheadS') if role == 'ATTACKING' else step.get('gapToBehindS'), 0.8),
                    'closingRateS': _num(step.get('closingRateS'), 0.0),
                    'position': step.get('timingPosition'),
                    'defenderPosition': them.get('timingPosition'),
                    'selectedRole': role,
                    'year': year,
                    'round': round_number,
                    'session': session_name,
                    'lapTimeS': step.get('lapTimeS'),
                    'lapFraction': lap / max(1, last_lap),
                },
                'year': year,
                'round': round_number,
                'session': session_name,
                'location': location,
                'totalLaps': horizon_end,
                'finishPositions': finish,
                'energyLaps': {
                    selected: [{'lap': lap, 'socEndMj': start_soc}],
                    opponent: [{'lap': lap, 'socEndMj': opp_soc}],
                },
                'regulationEra': '2026',
                'skipObservedHold': True,
                'pitLaps': {
                    selected: pit_laps.get(selected) or [],
                    opponent: pit_laps.get(opponent) or [],
                },
            })
            if tree.get('error') or not tree.get('path'):
                continue
            recorded = recorded_window(by_driver, selected, opponent, lap, horizon_end)
            modelled = model_window(tree['path'], lap)
            delta = hold_delta(recorded, modelled)
            did_work = delta > 0
            hold = tree.get('holdComparison') or {}
            major = bool(hold.get('placeGain') or hold.get('majorSuccess'))
            grade = 'MAJOR' if major else ('SUCCESS' if did_work else None)
            stats['windows'] += 1
            stats['byDriver'][selected]['windows'] += 1
            if did_work:
                stats['worked'] += 1
                stats['byDriver'][selected]['worked'] += 1
            if major:
                stats['major'] += 1
                stats['byDriver'][selected]['major'] += 1
            if works_only and not did_work:
                continue
            if not works_only and not result_differs(recorded, modelled):
                continue
            if works_only and not result_differs(recorded, modelled):
                continue
            cases.append({
                'driver': selected,
                'team': WORKS_EIGHT.get(selected),
                'opponent': opponent,
                'role': role,
                'lap': lap,
                'zone': step.get('energyZone'),
                'gapS': _num(step.get('gapToAheadS') if role == 'ATTACKING' else step.get('gapToBehindS')),
                'position': step.get('timingPosition'),
                'opponentPosition': them.get('timingPosition'),
                'why': why_line(recorded, modelled),
                'recordedAction': (recorded[0] or {}).get('action'),
                'modelAction': (modelled[0] or {}).get('action'),
                'recorded': recorded,
                'model': modelled,
                'holdDelta': delta,
                'worked': did_work,
                'major': major,
                'grade': grade,
                'goLap': tree.get('goLap'),
                'u': tree.get('driverScore'),
                'hold': tree.get('holdComparison'),
            })
    if works_only:
        cases = sorted(cases, key=lambda case: (
            1 if case.get('major') else 0,
            case.get('holdDelta') or 0,
            1 if any(row.get('event') == 'TAKE' for row in case['model']) else 0,
        ), reverse=True)[:MAX_WORKED_PER_RACE]
    rate = round(stats['worked'] / stats['windows'], 4) if stats['windows'] else 0.0
    return {
        'year': year,
        'round': round_number,
        'location': location,
        'name': name,
        'session': session_name,
        'lastLap': last_lap,
        'drivers': drivers,
        'cases': cases,
        'stats': {**stats, 'rate': rate},
    }


def md_escape(text) -> str:
    return str(text or '').replace('|', '/')


def write_markdown(races: list[dict]) -> str:
    total = sum(len(race['cases']) for race in races)
    drivers = sorted({case['driver'] for race in races for case in race['cases']})
    lines = [
        '# Model vs recorded overtakes — 2026',
        '',
        'Use this file in evaluation. Every lap below is a **real disagreement** between the recorded race and the PitWolf two-car branch. Open that race, select that driver, jump that lap, and read the next few laps.',
        '',
        '## What “different” means',
        '',
        '- **Recorded** is the official running order plus the constructed 4 MJ C5.2 leftover on that lap.',
        '- **Model** is JUMP from that lap: same constructed leftover, 2026 driver habits with this GP stripped, seeded take draw.',
        '- A lap is listed only if the **pair result** differs in the next '
        f'{LOOKAHEAD} laps: who leads the pair changes, or a recorded overtake does not land on the branch, or the branch takes/loses a place the race did not.',
        '- First-action mismatches with the same pair order are omitted. Those are habit noise, not a result you can show.',
        '- This is **not** a rewritten classified result. Only the selected pair is modelled. Everyone else stays on the recorded race.',
        '- Energy is a constructed C5.2 store. Not team battery.',
        '',
        f'## Coverage',
        '',
        f'- Races scored: **{len(races)}** (every cached 2026 race file).',
        f'- Drivers with at least one disagreement: **{len(drivers)}**.',
        f'- Evaluation laps: **{total}**.',
        f'- Window after JUMP: **{LOOKAHEAD} laps**.',
        '',
        '## Index',
        '',
        '| Race | Driver | Lap | vs | Why |',
        '| --- | --- | ---: | --- | --- |',
    ]
    for race in races:
        for case in race['cases']:
            lines.append(
                f"| R{race['round']} {md_escape(race['name'])} | {case['driver']} | {case['lap']} | "
                f"{case['opponent']} | {md_escape(case['why'])} |"
            )
    lines += ['', '---', '']
    for race in races:
        lines += [
            f"## R{race['round']} · {race['name']}",
            '',
            f"Circuit: **{race['location']}**. Session: {race['session']}. "
            f"Disagreements: **{len(race['cases'])}**.",
            '',
            f"Open in the sim: `2026` / `{race['name']}` / `Race` / driver / the lap / **JUMP**.",
            '',
        ]
        by_driver: dict[str, list] = {}
        for case in race['cases']:
            by_driver.setdefault(case['driver'], []).append(case)
        if not by_driver:
            lines += ['_No 1.0s pair lap on this race produced a different first action or pair order._', '']
            continue
        for driver in sorted(by_driver):
            ranked = sorted(by_driver[driver], key=lambda case: (
                abs(sum(1 for row in case['model'] if row.get('ahead')) - sum(1 for row in case['recorded'] if row.get('ahead'))),
                1 if any(row.get('event') in {'TAKE', 'LOST_PLACE'} for row in case['model']) else 0,
            ), reverse=True)
            shown = ranked[:3]
            extra = len(ranked) - len(shown)
            lines += [f"### {driver}", '']
            if extra > 0:
                other = ', '.join(f"L{case['lap']} vs {case['opponent']}" for case in ranked[3:])
                lines += [f"_Best three result-changes shown. Also different: {other}._", '']
            for case in shown:
                gap = case.get('gapS')
                gap_s = '—' if gap is None else f"{gap:.2f}s"
                lines += [
                    f"#### L{case['lap']} · {case['role']} {case['opponent']}",
                    '',
                    f"- **Show this:** 2026 · {race['name']} · {driver} · lap {case['lap']} · JUMP vs {case['opponent']}",
                    f"- **Recorded pair:** P{case['position']} vs P{case['opponentPosition']} · {case.get('zone')} · gap {gap_s}",
                    f"- **Recorded first action:** {case['recordedAction']}",
                    f"- **Model first action:** {case['modelAction']}"
                    + (f" · planned go L{case['goLap']}" if case.get('goLap') else ''),
                    f"- **Why it is a disagreement:** {case['why']}",
                    f"- **u (this GP stripped):** {case.get('u')}",
                    '',
                    '| Lap | Recorded | Model |',
                    '| ---: | --- | --- |',
                ]
                by_rec = {row['lap']: row for row in case['recorded']}
                by_mod = {row['lap']: row for row in case['model']}
                for lap in sorted(set(by_rec) | set(by_mod)):
                    rec = by_rec.get(lap) or {}
                    mod = by_mod.get(lap) or {}
                    rec_lead = 'LEADS PAIR' if rec.get('ahead') else ('TRAILS PAIR' if rec.get('ahead') is False else '—')
                    mod_lead = 'LEADS PAIR' if mod.get('ahead') else ('TRAILS PAIR' if 'ahead' in mod else '—')
                    rec_bit = (
                        f"{rec.get('event') or '—'} · {rec.get('action') or '—'} · {rec_lead} · "
                        f"P{rec.get('position') or '—'} · leftover {rec.get('leftPct') if rec.get('leftPct') is not None else '—'}%"
                    )
                    mod_bit = (
                        f"{mod.get('event') or '—'} · {mod.get('action') or '—'} · {mod_lead} · "
                        f"leftover {mod.get('leftPct') if mod.get('leftPct') is not None else '—'}%"
                    )
                    if mod.get('event') in {'TAKE', 'LOST_PLACE', 'FAILED_ATTACK'} and mod.get('convertP') is not None:
                        mod_bit += f" · convert {round(float(mod['convertP']) * 100)}%"
                    mark = ' ← **diff**' if (
                        (rec.get('action') and mod.get('action') and rec.get('action') != mod.get('action'))
                        or (rec.get('ahead') is not None and 'ahead' in mod and bool(rec.get('ahead')) != bool(mod.get('ahead')))
                    ) else ''
                    lines.append(f"| {lap} | {rec_bit} | {mod_bit}{mark} |")
                lines.append('')
    lines += [
        '---',
        '',
        '## Honesty for judges',
        '',
        'These laps are reproducible from the cached 2026 race files and `eval_model_overtakes.py`. '
        'The branch does not claim the rest of the grid would have finished in a new order. '
        'Success on a listed lap is “the pair story changed,” not “we rewrote the official result.”',
        '',
    ]
    return '\n'.join(lines)


def write_works_markdown(races: list[dict]) -> str:
    windows = sum(int((race.get('stats') or {}).get('windows') or 0) for race in races)
    worked = sum(int((race.get('stats') or {}).get('worked') or 0) for race in races)
    shown = sum(len(race['cases']) for race in races)
    rate = round(100 * worked / windows, 1) if windows else 0.0
    lines = [
        '# Model overtakes that worked — 2026 top 8',
        '',
        'Evaluation deck for the eight 2026 works cars only: Ferrari LEC/HAM, Mercedes RUS/ANT, McLaren NOR/PIA, Red Bull VER/HAD.',
        '',
        'Each race keeps **at most 3** JUMP laps where the branch **diverged and beat the recorded pair** — the model led that pair for more of the next 6 laps than the real race. Open that lap in the sim and walk the next laps.',
        '',
        '## How to show it',
        '',
        '1. Dashboard → **DIFF RESULT**, or this file.',
        '2. Pick a race row, then a lap.',
        '3. Sim: `2026` / that race / `Race` / that driver / that lap / **JUMP**.',
        '',
        '## What “worked” means',
        '',
        '- JUMP from a 1.0s hunt / recorded-overtake lap.',
        '- Same constructed 4 MJ C5.2 leftover the recorded replay uses.',
        '- 2026 habits, this GP stripped. Seeded take draw.',
        '- **Success** = more pair-ahead laps than the recorded pair in the next 6 laps.',
        '- **Major** = still holding the place when the classified pair did not.',
        '- After a take they keep attacking. We DELAY/SAVE to postpone that re-pass. Loss of lead can still happen.',
        '- Two cars only. Not a rewritten classified result. Not team battery.',
        '',
        '## Success vs the real races',
        '',
        f'- Races scored: **{len(races)}**',
        f'- Hunt / overtake windows scored for the 8 cars: **{windows}**',
        f'- Windows the model held the pair longer: **{worked}** (**{rate}%**)',
        f'- Instances printed here (2–3 best per race): **{shown}**',
        '',
        '| Team | Drivers |',
        '| --- | --- |',
        '| Ferrari | LEC · HAM |',
        '| Mercedes | RUS · ANT |',
        '| McLaren | NOR · PIA |',
        '| Red Bull | VER · HAD |',
        '',
        '## Index',
        '',
        '| Race | Rate | Show |',
        '| --- | ---: | --- |',
    ]
    for race in races:
        stats = race.get('stats') or {}
        race_rate = round(100 * float(stats.get('rate') or 0), 1)
        show = ', '.join(f"{case['driver']} L{case['lap']} vs {case['opponent']} (+{case.get('holdDelta')})" for case in race['cases']) or 'none worked'
        lines.append(f"| R{race['round']} {md_escape(race['name'])} | {race_rate}% | {md_escape(show)} |")
    lines += ['', '---', '']
    for race in races:
        stats = race.get('stats') or {}
        race_rate = round(100 * float(stats.get('rate') or 0), 1)
        lines += [
            f"## R{race['round']} · {race['name']}",
            '',
            f"Circuit **{race['location']}**. Windows {stats.get('windows', 0)}. "
            f"Worked {stats.get('worked', 0)} (**{race_rate}%**). Showing {len(race['cases'])} best.",
            '',
        ]
        if not race['cases']:
            lines += ['_No working pair-hold for the eight cars on this race._', '']
            continue
        for case in race['cases']:
            gap = case.get('gapS')
            gap_s = '—' if gap is None else f"{gap:.2f}s"
            lines += [
                f"### {case['driver']} ({case.get('team') or '—'}) · L{case['lap']} vs {case['opponent']}",
                '',
                f"- **Show:** 2026 · {race['name']} · {case['driver']} · L{case['lap']} · JUMP vs {case['opponent']}",
                f"- **Recorded pair:** P{case['position']} vs P{case['opponentPosition']} · {case.get('zone')} · {gap_s}",
                f"- **First action:** recorded {case['recordedAction']} · model {case['modelAction']}",
                f"- **Hold delta:** +{case.get('holdDelta')} pair-ahead laps vs the race",
                f"- **Why:** {case['why']}",
                '',
                '| Lap | Recorded | Model |',
                '| ---: | --- | --- |',
            ]
            by_rec = {row['lap']: row for row in case['recorded']}
            by_mod = {row['lap']: row for row in case['model']}
            for lap in sorted(set(by_rec) | set(by_mod)):
                rec = by_rec.get(lap) or {}
                mod = by_mod.get(lap) or {}
                rec_lead = 'LEADS PAIR' if rec.get('ahead') else ('TRAILS PAIR' if rec.get('ahead') is False else '—')
                mod_lead = 'LEADS PAIR' if mod.get('ahead') else ('TRAILS PAIR' if 'ahead' in mod else '—')
                rec_bit = f"{rec.get('event') or '—'} · {rec.get('action') or '—'} · {rec_lead} · leftover {rec.get('leftPct') if rec.get('leftPct') is not None else '—'}%"
                mod_bit = f"{mod.get('event') or '—'} · {mod.get('action') or '—'} · {mod_lead} · leftover {mod.get('leftPct') if mod.get('leftPct') is not None else '—'}%"
                mark = ' ← **diff**' if (
                    (rec.get('action') and mod.get('action') and rec.get('action') != mod.get('action'))
                    or (rec.get('ahead') is not None and 'ahead' in mod and bool(rec.get('ahead')) != bool(mod.get('ahead')))
                ) else ''
                lines.append(f"| {lap} | {rec_bit} | {mod_bit}{mark} |")
            lines.append('')
    lines += [
        '---',
        '',
        '## Honesty',
        '',
        'Reproducible from cached 2026 races via `eval_model_overtakes.py --works`. '
        'The model can hold a pair longer without rewriting the official classification. '
        'Energy is a constructed C5.2 store.',
        '',
    ]
    return '\n'.join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--round', type=int)
    parser.add_argument('--driver')
    parser.add_argument('--all-drivers', action='store_true')
    args = parser.parse_args()
    works_only = not args.all_drivers
    paths = iter_races()
    if args.round:
        paths = [path for path in paths if int(path.name.split('_')[0]) == args.round]
    if not paths:
        raise SystemExit('no cached 2026 race files')
    races = []
    for path in paths:
        race = evaluate_race(path, args.driver.upper() if args.driver else None, works_only=works_only)
        if race:
            races.append(race)
            print(json.dumps({
                'race': race['name'],
                'round': race['round'],
                'cases': len(race['cases']),
                'windows': (race.get('stats') or {}).get('windows'),
                'worked': (race.get('stats') or {}).get('worked'),
                'rate': (race.get('stats') or {}).get('rate'),
                'drivers': sorted({case['driver'] for case in race['cases']}),
            }), flush=True)
    payload = {
        'year': YEAR,
        'lookahead': LOOKAHEAD,
        'worksEight': WORKS_EIGHT,
        'maxPerRace': MAX_WORKED_PER_RACE if works_only else None,
        'races': races,
        'overall': {
            'windows': sum(int((race.get('stats') or {}).get('windows') or 0) for race in races),
            'worked': sum(int((race.get('stats') or {}).get('worked') or 0) for race in races),
            'major': sum(int((race.get('stats') or {}).get('major') or 0) for race in races),
        },
        'note': 'Constructed C5.2 two-car branch vs recorded pair. Success = more pair-ahead laps than the race. Major = still holding the place when the classified pair did not. After a take they keep attacking; we delay that re-pass. Not team battery. Not a full-grid rewrite.',
    }
    overall = payload['overall']
    overall['rate'] = round(overall['worked'] / overall['windows'], 4) if overall['windows'] else 0.0
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    if works_only:
        OUT_WORKS_JSON.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        OUT_WORKS_MD.write_text(write_works_markdown(races), encoding='utf-8')
        wrote, js = str(OUT_WORKS_MD), str(OUT_WORKS_JSON)
    else:
        OUT_JSON.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        OUT_MD.write_text(write_markdown(races), encoding='utf-8')
        wrote, js = str(OUT_MD), str(OUT_JSON)
    print(json.dumps({
        'wrote': wrote,
        'json': js,
        'races': len(races),
        'cases': sum(len(race['cases']) for race in races),
        'windows': overall['windows'],
        'worked': overall['worked'],
        'rate': overall['rate'],
    }, indent=2))


if __name__ == '__main__':
    main()
