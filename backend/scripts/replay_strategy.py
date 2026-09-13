"""Backend tactical replay for the ATTACK/SAVE/DELAY decision tree.

This is intentionally a small, deterministic state-transition engine.  It does
not claim to reconstruct private team battery telemetry.  It consumes observed
race rows plus model probabilities, carries a modelled SoC for both cars, and
evaluates a selected driver's three available actions at every lap in a short
look-ahead horizon.

The external tree has three children per lap.  The opponent is represented by a
calibrated best-response policy inside each child, so a pass changes the roles:
the selected driver becomes the defender and the former defender can spend its
remaining energy to retake the position.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any

try:
    from battery_overtake import driver_score, modulate_overtake, seeded_draw
    from energy_transition import (CAPACITY_MJ, ENERGY_MODEL_VERSION,
                                   era_for_year, get_era_config, transition_soc)
except ImportError:  # allow package-style unit tests as well as direct scripts
    from .battery_overtake import driver_score, modulate_overtake, seeded_draw
    from .energy_transition import (CAPACITY_MJ, ENERGY_MODEL_VERSION,
                                    era_for_year, get_era_config, transition_soc)


TREE_VERSION = "tactical-tree.v7"
SCHEMA_VERSION = "replay-state.v7"
START_SOC_MJ = 2.8
MAX_HORIZON = 6
ACTIONS = ("ATTACK", "SAVE", "DELAY")
MIN_ATTACK_SOC_MJ = 0.25
MIN_DELAY_SOC_MJ = 0.08
RESERVE_WEIGHT = 25.0
_RECOMMEND_ARTIFACT = None


def _recommend_artifact():
    global _RECOMMEND_ARTIFACT
    if _RECOMMEND_ARTIFACT is not None:
        return _RECOMMEND_ARTIFACT
    try:
        import joblib
        from score_recommend import MODELS
        if MODELS.exists():
            _RECOMMEND_ARTIFACT = joblib.load(MODELS)
    except Exception:
        _RECOMMEND_ARTIFACT = {}
    return _RECOMMEND_ARTIFACT or {}


def overtake_rate_u(driver: str, year, location: str) -> float:
    """0–1 take-rate aggressiveness from 2018–2026, excluding this GP."""
    try:
        from driver_energy_habits import aggression_u
        rate = aggression_u(driver, year, location)
        if rate is not None:
            return rate
    except Exception:
        pass
    try:
        from score_recommend import exclude_current_race
    except ImportError:
        from .score_recommend import exclude_current_race
    artifact = _recommend_artifact()
    priors = artifact.get('priors') or {}
    global_rates = artifact.get('global') or {}
    prior = exclude_current_race((priors.get('drivers') or {}).get(driver) or {}, year, location)
    rate = prior.get('overtakeSoonRate')
    if rate is None:
        rate = global_rates.get('overtakeSoonRate', 0.15)
    return max(0.05, min(0.85, float(rate)))


def pit_laps_from_session(year, round_number, session_name, drivers: list[str]) -> dict[str, set[int]]:
    """The only later-race fact the branch may read: who boxed, which lap."""
    pits = {code: set() for code in drivers if code}
    try:
        from clip_cached_race import load_session, session_path
    except ImportError:
        from .clip_cached_race import load_session, session_path
    path = session_path(int(year), int(round_number), session_name or 'Race')
    if not path.exists():
        return pits
    payload = load_session(path)
    wanted = set(pits)
    for lap in payload.get('laps') or []:
        code = lap.get('driver')
        if code not in wanted or not lap.get('isPitLap'):
            continue
        number_lap = int(number(lap.get('lapNumber'), 0))
        if number_lap > 0:
            pits[code].add(number_lap)
    return pits


def observed_pair_ahead_laps(year, round_number, session_name, selected: str,
                             opponent: str, start_lap: int, finish_lap: int) -> dict[str, int] | None:
    """How many recorded laps the selected car was ahead of this opponent."""
    try:
        from clip_cached_race import build_field_story, load_session, session_path
    except ImportError:
        from .clip_cached_race import build_field_story, load_session, session_path
    path = session_path(int(year), int(round_number), session_name or 'Race')
    if not path.exists():
        return None
    try:
        field = build_field_story(load_session(path))
    except Exception:
        return None
    by_code = {
        item.get('driver'): {int(number(step.get('lap'), 0)): step for step in (item.get('laps') or [])}
        for item in (field.get('drivers') or [])
        if item.get('driver')
    }
    ours = by_code.get(selected) or {}
    theirs = by_code.get(opponent) or {}
    ahead_laps = 0
    compared = 0
    for lap in range(int(start_lap), int(finish_lap) + 1):
        us = ours.get(lap)
        them = theirs.get(lap)
        if not us or not them:
            continue
        our_pos = number(us.get('timingPosition'), 99)
        their_pos = number(them.get('timingPosition'), 99)
        if our_pos >= 99 or their_pos >= 99:
            continue
        compared += 1
        if our_pos < their_pos:
            ahead_laps += 1
    if not compared:
        return None
    return {'aheadLaps': ahead_laps, 'comparedLaps': compared}


def session_location(year, round_number, session_name) -> str:
    try:
        from clip_cached_race import load_session, session_path
    except ImportError:
        from .clip_cached_race import load_session, session_path
    path = session_path(int(year), int(round_number), session_name or 'Race')
    if not path.exists():
        return ''
    event = (load_session(path).get('event') or {})
    return str(event.get('location') or '')

def number(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def clamp(value: float, low: float = 0.0, high: float = CAPACITY_MJ) -> float:
    return max(low, min(high, number(value)))


def probability(value: Any, default: float = 0.0) -> float:
    return max(0.0, min(1.0, number(value, default)))


def row_for(rows: list[dict[str, Any]], lap: int, driver: str, defender: str) -> dict[str, Any] | None:
    for row in rows:
        if (number(row.get("lap")) == lap and row.get("driver") == driver
                and row.get("defender") == defender):
            return row
    return None


def soc_from_laps(energy_laps: Any, driver: str, lap: int) -> float:
    """Read the last observed pre-decision SoC for a driver when available."""
    if isinstance(energy_laps, dict):
        values = energy_laps.get(driver, [])
    else:
        values = energy_laps if isinstance(energy_laps, list) else []
    best = None
    for item in values:
        if not isinstance(item, dict) or number(item.get("lap"), -1) > lap:
            continue
        candidate = item.get("socEndMj")
        if candidate is not None:
            best = number(candidate, best if best is not None else START_SOC_MJ)
    return clamp(best if best is not None else START_SOC_MJ)


def model_signal(row: dict[str, Any] | None, label: str, default: float) -> float:
    probabilities = (row or {}).get("pred", {}).get("probabilities", {})
    if not isinstance(probabilities, dict):
        probabilities = {}
    return probability(probabilities.get(label), default)


def context(row: dict[str, Any] | None) -> dict[str, float]:
    row = row or {}
    weather = row.get("weather") if isinstance(row.get("weather"), dict) else {}
    rainfall = weather.get("rainfall", 0.0)
    wet = 1.0 if str(rainfall).lower() in ("true", "on", "yes", "rain") else number(rainfall)
    return {
        "gap": max(0.0, number(row.get("gapS"), 1.2)),
        "closing": number(row.get("closingRateS")),
        "speed": number(row.get("speedDeltaKph")),
        "tyre": number(row.get("tyreAgeDiff")),
        "slipstream": probability(row.get("slipstreamProxy")),
        "dirty_air": probability(row.get("dirtyAirRisk")),
        "traffic_ahead": max(0.0, number(row.get("trafficAheadCount"))),
        "traffic_behind": max(0.0, number(row.get("trafficBehindCount"))),
        "our_tyre_deg": probability(row.get("attackerTyreDegProxy")),
        "opponent_tyre_deg": probability(row.get("defenderTyreDegProxy")),
        "wet": probability(wet),
        "track_clear": row.get("attackerTrackStatus") in (None, "1") and row.get("defenderTrackStatus") in (None, "1"),
        "pit_distorted": bool(row.get("pitDistorted")),
    }


def observed_pit_tyre_context(rows: list[dict[str, Any]], focus: dict[str, Any],
                               selected: str, defender: str, start_lap: int,
                               horizon: int) -> dict[str, Any]:
    """Describe observed pit/tyre context without inventing a BOX simulation.

    The tactical tree has exactly ATTACK/SAVE/DELAY branches. Public timing can
    tell us that a real pit cycle occurred, but cannot identify the
    counterfactual pit timing, rejoin traffic, or tyre warm-up of a different
    strategy. Those events are therefore disclosed and held fixed, not scored
    as a hidden fourth tactical choice.
    """
    end_lap = start_lap + max(0, horizon - 1)
    events = []
    seen = set()
    for row in [focus, *rows]:
        lap = int(number(row.get("lap"), -1))
        if lap < start_lap or lap > end_lap:
            continue
        for driver, role in ((selected, "SELECTED"), (defender, "OPPONENT")):
            if row.get("driver") == driver:
                prefix = "attacker"
            elif row.get("defender") == driver:
                prefix = "defender"
            else:
                continue
            pit_in = bool(row.get(f"{prefix}PitIn"))
            pit_out = bool(row.get(f"{prefix}PitOut"))
            if not pit_in and not pit_out:
                continue
            key = (driver, lap, pit_in, pit_out)
            if key in seen:
                continue
            seen.add(key)
            event = "PIT IN/OUT" if pit_in and pit_out else ("PIT IN" if pit_in else "PIT OUT")
            events.append({"lap": lap, "driver": driver, "role": role, "event": event})

    def tyre_state(prefix: str) -> dict[str, Any]:
        return {
            "compound": focus.get(f"{prefix}Compound"),
            "ageDifferenceLaps": number(focus.get("tyreAgeDiff")) if prefix == "attacker" else -number(focus.get("tyreAgeDiff")),
            "degradationProxy": round(probability(focus.get(f"{prefix}TyreDegProxy")), 3),
        }

    return {
        "mode": "OBSERVED_CONTEXT_HELD_FIXED",
        "boxActionSimulated": False,
        "horizonLaps": horizon,
        "observedPitEvents": sorted(events, key=lambda item: (item["lap"], item["driver"])),
        "futurePitCycleWithinHorizon": bool(events),
        "initialTyres": {
            "selected": tyre_state("attacker"),
            "opponent": tyre_state("defender"),
        },
        "handling": (
            "Observed pit cycles gate normal overtake claims. Alternative BOX timing, rejoin traffic, "
            "tyre warm-up and undercut/overcut outcomes are not simulated in this three-action tree."
        ),
    }


def attack_chance(row: dict[str, Any] | None, action: str, our_soc: float,
                  opponent_soc: float, defending: bool, u: float | None = None) -> float:
    """Estimate the chance that the attacking side changes position this lap."""
    values = context(row)
    # A yellow/SC/VSC/red-flag or pit-cycle state is not a normal overtake
    # window. Keep the branch in the tree for auditability, but prevent it from
    # claiming a pass opportunity from that state.
    if not values["track_clear"] or values["pit_distorted"]:
        return 0.0
    gap = values["gap"]
    closing = values["closing"]
    speed_delta = values["speed"]
    tyre_delta = values["tyre"]
    attack_signal = model_signal(row, "ATTACK", 0.25)
    delay_signal = model_signal(row, "DELAY", 0.25)
    reserve_edge = (our_soc - opponent_soc) / CAPACITY_MJ
    window = max(0.0, min(1.0, (1.25 - gap) / 1.25))
    closing_signal = max(0.0, min(1.0, closing / 0.35))
    speed_signal = max(0.0, min(1.0, (speed_delta + 8.0) / 16.0))
    tyre_signal = max(0.0, min(1.0, tyre_delta / 10.0))
    raw = (0.10 + (0.22 * attack_signal) + (0.22 * window)
           + (0.16 * closing_signal) + (0.10 * speed_signal)
           + (0.08 * tyre_signal) + (0.12 * reserve_edge))
    if defending:
        our_tyre_deg = values["opponent_tyre_deg"]
        opponent_tyre_deg = values["our_tyre_deg"]
    else:
        our_tyre_deg = values["our_tyre_deg"]
        opponent_tyre_deg = values["opponent_tyre_deg"]
    raw += (0.12 * values["slipstream"])
    raw -= (0.10 * values["dirty_air"])
    raw -= (0.10 * our_tyre_deg)
    raw += (0.06 * opponent_tyre_deg)
    raw -= (0.04 * min(1.0, values["traffic_ahead"] / 3.0))
    raw -= (0.03 * values["wet"])
    action_factor = {"ATTACK": 1.00, "DELAY": 0.42, "SAVE": 0.12}[action]
    if defending:
        # When the selected car is ahead, this function measures the
        # opponent's repass threat.  A defensive action reduces exposure.
        action_factor = {"ATTACK": 0.48, "DELAY": 0.70, "SAVE": 0.92}[action]
        raw = (0.08 + (0.32 * attack_signal) + (0.22 * window)
               + (0.16 * closing_signal) + (0.10 * speed_signal)
               - (0.10 * reserve_edge))
        raw *= action_factor
    elif action == "DELAY":
        raw += 0.05 * delay_signal
    # A car with no remaining modelled SoC cannot receive the same pass
    # probability as a charged car.  Keep a small residual for tyre/pace
    # effects, but make energy exhaustion materially affect ATTACK/DELAY.
    energy_factor = max(0.0, min(1.0, our_soc / 0.8))
    if action == "ATTACK":
        if our_soc < MIN_ATTACK_SOC_MJ:
            return 0.0
        raw *= energy_factor
    elif action == "DELAY":
        if our_soc < MIN_DELAY_SOC_MJ:
            return 0.0
        raw *= 0.35 + (0.65 * energy_factor)
    base = max(0.01, min(0.97, raw * action_factor))
    hunter = row.get("driver") if not defending else row.get("defender")
    if u is None:
        u = driver_score(row.get("year"), row.get("round"), row.get("lap"), hunter)
    return modulate_overtake(base, our_soc, opponent_soc, u)["overtakeP"]


def best_response(row: dict[str, Any] | None, opponent_soc: float, our_soc: float,
                  opponent_is_attacker: bool, era: str, deploy_scale: float = 1.0,
                  harvest_scale: float = 1.0) -> tuple[str, float]:
    scores = {}
    for action in ACTIONS:
        next_soc, _, _ = transition_soc(
            opponent_soc, action, row, not opponent_is_attacker, era=era,
            deploy_scale=deploy_scale, harvest_scale=harvest_scale)
        chance = attack_chance(row, action, next_soc, our_soc, not opponent_is_attacker)
        # An attacker values a pass; a defender values survival.
        score = chance if opponent_is_attacker else (1.0 - chance)
        score += 0.05 * (next_soc / CAPACITY_MJ)
        scores[action] = score
    selected = max(ACTIONS, key=lambda action: scores[action])
    return selected, round(scores[selected], 4)


def leftover_pct(soc: float) -> float:
    return round(100.0 * clamp(soc) / CAPACITY_MJ, 2)


def habit_move(driver: str, soc: float, focus: dict[str, Any], defending: bool,
               in_battle: bool, era: str, year, location: str,
               force: str | None = None, allow_attack: bool = True,
               use_model: bool = True) -> dict[str, Any]:
    try:
        from c52_battery import apply_legal_lap
        from driver_energy_habits import energy_scales, pick_action
    except ImportError:
        from .c52_battery import apply_legal_lap
        from .driver_energy_habits import energy_scales, pick_action
    hunt = in_battle and number(focus.get("gapS"), 9.0) <= 1.0 and not defending
    left = leftover_pct(soc)
    law = focus.get("harvestLaw") if isinstance(focus.get("harvestLaw"), dict) else {}
    deploy_scale, harvest_scale = energy_scales(
        driver, in_battle, year, location, in_overtake=hunt, leftover_pct=left,
    )
    action, proba = pick_action(
        driver, in_battle, left,
        number(focus.get("gapS"), 1.2), number(focus.get("closingRateS")),
        year, location, allow_attack=allow_attack, leftover_mj=soc,
        use_model=use_model, in_overtake=hunt,
        lap_fraction=number(focus.get("lapFraction"), 0.5),
        track_brakes=number(law.get("brakes") or focus.get("trackBrakes"), 10.0),
    )
    if force in ACTIONS:
        action = force
    legal = apply_legal_lap(
        soc, action, {
            **dict(focus or {}),
            "year": year,
            "round": focus.get("round"),
            "session": focus.get("session") or "Race",
        }, defending=defending, era=era,
        overtake_active=hunt or (not defending and force == "ATTACK"),
        harvest_used_mj=0.0,
        deploy_scale=deploy_scale, harvest_scale=harvest_scale,
    )
    law = legal.get("harvestLaw") or {}
    return {
        "action": action,
        "soc": legal["socEndMj"],
        "deploy": legal["consumedMj"],
        "harvest": legal["harvestedMj"],
        "proba": proba,
        "deployScale": deploy_scale,
        "harvestScale": harvest_scale,
        "clipReason": legal.get("clipReason"),
        "zone": "OVERTAKE_MODE_ZONE" if hunt else ("BATTLE" if in_battle else "OPEN"),
        "harvestLaw": law,
    }


def plan_go_lap(selected: str, opponent: str, start_lap: int, total_laps: int,
                start_our: float, start_opp: float, initial_ahead: bool,
                focus: dict[str, Any], era: str, year, location: str,
                pits: dict[str, set[int]], our_u: float, forced: str | None) -> tuple[int | None, float]:
    """One forward pass: score ATTACK at each racing lap, then rebuild to the next."""
    if initial_ahead:
        return None, 0.0
    our_soc, opp_soc = start_our, start_opp
    scores: list[tuple[int, float]] = []
    for lap in range(start_lap, total_laps + 1):
        our_pit = lap in pits.get(selected, set())
        opp_pit = lap in pits.get(opponent, set())
        first_force = forced if lap == start_lap else None
        if not our_pit and not opp_pit and not (lap == start_lap and forced and forced != "ATTACK"):
            attack = habit_move(
                selected, our_soc, focus, False, True, era, year, location, force="ATTACK")
            opp_now = habit_move(
                opponent, opp_soc, focus, True, True, era, year, location,
                force="SAVE" if opp_pit else None,
            )
            overtake_p = attack_chance(focus, "ATTACK", attack["soc"], opp_now["soc"], False, u=our_u)
            scores.append((lap, overtake_p * (0.35 + 0.65 * our_u)))
        rebuild = habit_move(
            selected, our_soc, focus, False, True, era, year, location,
            force="SAVE" if our_pit else first_force,
            allow_attack=first_force == "ATTACK",
        )
        opp_move = habit_move(
            opponent, opp_soc, focus, True, True, era, year, location,
            force="SAVE" if opp_pit else None,
        )
        our_soc, opp_soc = rebuild["soc"], opp_move["soc"]
    if not scores:
        return None, 0.0
    best = max(item[1] for item in scores)
    go_lap = next(lap for lap, score in scores if score >= 0.95 * best)
    return go_lap, round(best, 4)


def rollout_to_finish(payload: dict[str, Any]) -> dict[str, Any]:
    """Model-owned race branch from JUMP.

    After the freeze-frame the selected driver is simulated. The only later
    fact taken from the recorded race is who boxed, and on which lap.
    Energy actions come from each driver's 2026 battle/open habit. Overtakes
    are discrete: ATTACK plus a seeded draw against overtakeP × u, where u
    is that driver's 2018–2026 take rate (not this GP).
    """
    focus = dict(payload.get("focus") or {})
    selected = str(focus.get("driver") or "")
    opponent = str(focus.get("defender") or "")
    start_lap = int(number(focus.get("lap"), 1))
    total_laps = max(start_lap, int(number(payload.get("totalLaps"), start_lap)))
    year = payload.get("year") or focus.get("year")
    round_number = payload.get("round") or focus.get("round")
    session_name = payload.get("session") or focus.get("session") or "Race"
    focus.update({
        "year": year,
        "round": round_number,
        "session": session_name,
    })
    location = str(payload.get("location") or session_location(year, round_number, session_name))
    regulation_era = str(payload.get("regulationEra") or era_for_year(year))
    energy_config = get_era_config(regulation_era)
    energy_laps = payload.get("energyLaps", {})
    raw_pits = payload.get("pitLaps")
    if isinstance(raw_pits, dict):
        pits = {
            selected: set(raw_pits.get(selected) or []),
            opponent: set(raw_pits.get(opponent) or []),
        }
    else:
        pits = pit_laps_from_session(year, round_number, session_name, [selected, opponent])
    our_u = overtake_rate_u(selected, year, location)
    opp_u = overtake_rate_u(opponent, year, location)
    state = {
        "lap": start_lap,
        "ahead": number(focus.get("position"), 99) < number(focus.get("defenderPosition"), 99),
        "ourSoc": soc_from_laps(energy_laps, selected, start_lap),
        "defenderSoc": soc_from_laps(energy_laps, opponent, start_lap),
    }
    initial_ahead = state["ahead"]
    start_position = int(number(focus.get("position"), 99))
    path: list[dict[str, Any]] = []
    action_changes: list[dict[str, Any]] = []
    takes: list[dict[str, Any]] = []
    last_action = None

    forced_label = payload.get("forcedFirstAction") or payload.get("forcedAction")
    forced = forced_label
    if forced == "DEFEND":
        # DEFEND is the leader-facing label for an energy-spending cover lap.
        # The battery transition uses ATTACK with defending=True.
        forced = "ATTACK"
    elif forced == "HOLD":
        forced = "DELAY"
    if forced not in ACTIONS:
        forced = None

    forced_opponent_label = payload.get("forcedOpponentAction")
    forced_opponent = forced_opponent_label
    if forced_opponent == "DEFEND":
        forced_opponent = "ATTACK"
    elif forced_opponent == "HOLD":
        forced_opponent = "DELAY"
    if forced_opponent not in ACTIONS:
        forced_opponent = None

    try:
        from driver_energy_habits import personality_card
    except ImportError:
        from .driver_energy_habits import personality_card
    our_personality = personality_card(selected, year, location)
    opp_personality = personality_card(opponent, year, location)
    go_lap, planned_convert = plan_go_lap(
        selected, opponent, start_lap, total_laps,
        state["ourSoc"], state["defenderSoc"], initial_ahead,
        focus, regulation_era, year, location, pits, our_u, forced,
    )
    start_our_soc = state["ourSoc"]
    retried_go = False

    while state["lap"] <= total_laps:
        our_pit = state["lap"] in pits.get(selected, set())
        opp_pit = state["lap"] in pits.get(opponent, set())
        first_lap = not path
        in_battle = True
        if our_pit:
            our_force = "SAVE"
            allow_attack = False
        elif first_lap and forced:
            our_force = forced
            allow_attack = forced == "ATTACK"
        elif state["ahead"]:
            # We have the place. SAVE covers and rebuilds — DELAY still dumps
            # leftover and then nobody can attack, so the lead freezes.
            our_force = "SAVE"
            allow_attack = False
        elif go_lap is not None and state["lap"] < go_lap:
            our_force = None
            allow_attack = False
        elif go_lap is not None and state["lap"] == go_lap:
            our_force = "ATTACK"
            allow_attack = True
        elif (not retried_go) and state["ourSoc"] >= (start_our_soc * 0.95) and not our_pit and not opp_pit:
            our_force = "ATTACK"
            allow_attack = True
            retried_go = True
        else:
            our_force = None
            allow_attack = False
        if opp_pit:
            opp_force = "SAVE"
            opp_allow_attack = False
        elif first_lap and forced_opponent:
            opp_force = forced_opponent
            opp_allow_attack = forced_opponent == "ATTACK"
        elif state["ahead"]:
            # They just lost the place, or they are the car that passed us in
            # the real race. They keep attacking. We only try to delay it.
            opp_force = "ATTACK" if state["defenderSoc"] >= MIN_ATTACK_SOC_MJ else "SAVE"
            opp_allow_attack = opp_force == "ATTACK"
        else:
            opp_force = None
            opp_allow_attack = False
        our_move = habit_move(
            selected, state["ourSoc"], focus, state["ahead"], in_battle,
            regulation_era, year, location, force=our_force, allow_attack=allow_attack,
        )
        opp_move = habit_move(
            opponent, state["defenderSoc"], focus, not state["ahead"], in_battle,
            regulation_era, year, location,
            force=opp_force, allow_attack=opp_allow_attack,
        )
        hunter = selected if not state["ahead"] else opponent
        hunter_u = our_u if hunter == selected else opp_u
        hunter_soc = our_move["soc"] if hunter == selected else opp_move["soc"]
        other_soc = opp_move["soc"] if hunter == selected else our_move["soc"]
        hunter_action = our_move["action"] if hunter == selected else opp_move["action"]
        overtake_p = attack_chance(
            focus, hunter_action, hunter_soc, other_soc, False, u=hunter_u)
        if state["ahead"]:
            event_probability = 1.0 - overtake_p
        else:
            event_probability = overtake_p
        convert_p = overtake_p * (0.35 + 0.65 * hunter_u)
        draw = seeded_draw(year, round_number, state["lap"], hunter)
        took = False
        if our_pit or opp_pit:
            event = "PIT"
        elif not state["ahead"] and our_move["action"] == "ATTACK" and draw < convert_p:
            took = True
            event = "TAKE"
        elif state["ahead"] and opp_move["action"] == "ATTACK" and draw < convert_p:
            took = True
            event = "LOST_PLACE"
        elif not state["ahead"] and our_move["action"] == "ATTACK":
            event = "FAILED_ATTACK"
        else:
            event = "HOLD_PLACE"

        next_ahead = (not state["ahead"]) if took else state["ahead"]
        if took:
            takes.append({
                "lap": state["lap"],
                "kind": event,
                "ahead": opponent if event == "TAKE" else selected,
                "note": f'L{state["lap"]} {"take" if event == "TAKE" else "lost to"} {opponent}',
                "pPass": round(convert_p, 3),
                "u": hunter_u,
                "draw": round(draw, 4),
            })

        display_proba = dict(our_move["proba"] or {})
        if our_move["action"] != "ATTACK":
            display_proba["ATTACK"] = min(display_proba.get("ATTACK", 0.0), 0.25)
            total = sum(display_proba.values()) or 1.0
            display_proba = {key: round(value / total, 4) for key, value in display_proba.items()}
        chosen = {
            "action": our_move["action"],
            "probability": round(max(0.0, min(1.0, event_probability)), 4),
            "ourSoc": round(our_move["soc"], 3),
            "defenderSoc": round(opp_move["soc"], 3),
            "deployMj": our_move["deploy"],
            "harvestMj": our_move["harvest"],
            "opponentAction": opp_move["action"],
            "opponentDeployMj": opp_move["deploy"],
            "opponentHarvestMj": opp_move["harvest"],
            "opponentResponseScore": round(max(opp_move["proba"].values()), 4) if opp_move["proba"] else 0.0,
            "habitProbabilities": display_proba,
            "opponentHabitProbabilities": opp_move["proba"],
        }
        entry = {key: chosen[key] for key in (
            "action", "probability", "ourSoc", "defenderSoc",
            "deployMj", "harvestMj", "opponentAction", "opponentDeployMj",
            "opponentHarvestMj", "opponentResponseScore",
            "habitProbabilities", "opponentHabitProbabilities")}
        entry.update({
            "decisionLabel": forced_label if (first_lap and forced_label and forced) else chosen["action"],
            "opponentDecisionLabel": forced_opponent_label if (first_lap and forced_opponent_label and forced_opponent) else chosen["opponentAction"],
            "lap": state["lap"],
            "role": "DEFENDING" if state["ahead"] else "ATTACKING",
            "ahead": next_ahead,
            "aheadProbability": 1.0 if next_ahead else 0.0,
            "event": event,
            "took": took,
            "convertP": round(convert_p, 4),
            "draw": round(draw, 4),
            "goLap": go_lap,
            "planned": bool(go_lap is not None and state["lap"] == go_lap),
            "contextSource": "REAL_PIT" if (our_pit or opp_pit) else (
                "FORCED_TWO_CAR_FIRST_LAP" if (first_lap and (forced or forced_opponent)) else "MODEL_BRANCH"
            ),
            "forced": bool(first_lap and (forced or forced_opponent)),
            "ourPit": our_pit,
            "opponentPit": opp_pit,
            "pitPlan": "REAL RACE PITS ONLY",
            "driverScore": hunter_u,
            "zone": our_move.get("zone"),
            "clipReason": our_move.get("clipReason"),
            "harvestLaw": our_move.get("harvestLaw"),
            "battery": {
                "u": hunter_u,
                "hunter": hunter,
                "ourSocMj": chosen["ourSoc"] if hunter == selected else chosen["defenderSoc"],
                "opponentSocMj": chosen["defenderSoc"] if hunter == selected else chosen["ourSoc"],
                "ourLeftPct": round((chosen["ourSoc"] / 4.0) * 100.0, 1),
                "opponentLeftPct": round((chosen["defenderSoc"] / 4.0) * 100.0, 1),
                "overtakeP": chosen["probability"] if not state["ahead"] else overtake_p,
                "convertP": round(convert_p, 4),
                "draw": round(draw, 4),
                "harvestLaw": our_move.get("harvestLaw"),
                "note": "u is 2018–2026 take rate, this GP stripped. A seeded draw vs overtakeP × u decides if the pass lands. Constructed C5.2 store, not team battery.",
            },
        })
        path.append(entry)
        if chosen["action"] != last_action or took:
            action_changes.append({
                "lap": state["lap"],
                "action": chosen["action"],
                "opponentAction": chosen["opponentAction"],
                "event": event,
                "ourSoc": chosen["ourSoc"],
                "defenderSoc": chosen["defenderSoc"],
                "aheadProbability": entry["aheadProbability"],
            })
            last_action = chosen["action"]
        state = {
            "lap": state["lap"] + 1,
            "ahead": next_ahead,
            "ourSoc": chosen["ourSoc"],
            "defenderSoc": chosen["defenderSoc"],
        }

    finish_positions = payload.get("finishPositions") or {}
    actual_finish = finish_positions.get(selected)
    opponent_finish = finish_positions.get(opponent)
    actual_pair_ahead = (
        isinstance(actual_finish, (int, float)) and isinstance(opponent_finish, (int, float))
        and actual_finish < opponent_finish
    )
    modelled_pair_ahead = bool(path and path[-1].get("ahead"))
    modelled_ahead_laps = sum(1 for step in path if step.get("ahead"))
    if payload.get("skipObservedHold"):
        observed = None
    else:
        observed = observed_pair_ahead_laps(
            year, round_number, session_name, selected, opponent, start_lap, total_laps)
    observed_ahead_laps = None if observed is None else int(observed['aheadLaps'])
    hold_delta = None if observed_ahead_laps is None else modelled_ahead_laps - observed_ahead_laps
    place_gain = modelled_pair_ahead and not actual_pair_ahead
    hold_success = hold_delta is not None and hold_delta > 0
    major_success = bool(place_gain)
    places = sum(1 for item in takes if item.get("kind") == "TAKE") - sum(1 for item in takes if item.get("kind") == "LOST_PLACE")
    branch_finish = None if start_position >= 99 else max(1, min(20, start_position - places))
    pass_steps = [step for step in path if step.get("event") in {"TAKE", "LOST_PLACE"}]
    first_pass = pass_steps[0] if pass_steps else None
    first_attack = None
    first_attacker = None
    for step in path:
        if step.get("role") == "ATTACKING" and step.get("action") == "ATTACK":
            first_attack = step
            first_attacker = selected
            break
        if step.get("role") == "DEFENDING" and step.get("opponentAction") == "ATTACK":
            first_attack = step
            first_attacker = opponent
            break
    cumulative_pass_probability = 0.0
    forecast_pass_by_lap = None
    if first_attack and first_attacker:
        no_pass_yet = 1.0
        for step in path:
            step_attacker = None
            if step.get("role") == "ATTACKING" and step.get("action") == "ATTACK":
                step_attacker = selected
            elif step.get("role") == "DEFENDING" and step.get("opponentAction") == "ATTACK":
                step_attacker = opponent
            if step_attacker != first_attacker:
                continue
            chance = max(0.0, min(1.0, number(step.get("convertP"), 0.0)))
            if chance <= 0.0:
                continue
            no_pass_yet *= 1.0 - chance
            cumulative_pass_probability = 1.0 - no_pass_yet
            forecast_pass_by_lap = step.get("lap")
            if cumulative_pass_probability >= 0.5:
                break
    if first_pass:
        pass_driver = selected if first_pass.get("event") == "TAKE" else opponent
        passed_driver = opponent if pass_driver == selected else selected
        pass_forecast = {
            "status": "PASS_COMPLETED",
            "projectedPassLap": first_pass.get("lap"),
            "attemptLap": first_pass.get("lap"),
            "attacker": pass_driver,
            "defender": passed_driver,
            "conversionProbability": first_pass.get("convertP"),
            "cumulativePassProbability": round(cumulative_pass_probability, 4),
            "forecastPassByLap": forecast_pass_by_lap or first_pass.get("lap"),
            "event": first_pass.get("event"),
            "message": f"Modelled pass: {pass_driver} passes {passed_driver} on lap {first_pass.get('lap')}.",
        }
    elif first_attack:
        pass_forecast = {
            "status": "NO_PASS_BY_FLAG",
            "projectedPassLap": None,
            "attemptLap": first_attack.get("lap"),
            "attacker": first_attacker,
            "defender": opponent if first_attacker == selected else selected,
            "conversionProbability": first_attack.get("convertP"),
            "cumulativePassProbability": round(cumulative_pass_probability, 4),
            "forecastPassByLap": forecast_pass_by_lap or first_attack.get("lap"),
            "event": None,
            "message": f"{first_attacker} has a {round(cumulative_pass_probability * 100)}% modelled chance to pass by lap {forecast_pass_by_lap or first_attack.get('lap')}; this seeded replay branch does not convert a pass.",
        }
    else:
        pass_forecast = {
            "status": "NO_ATTACK_OPPORTUNITY",
            "projectedPassLap": None,
            "attemptLap": None,
            "attacker": None,
            "defender": None,
            "conversionProbability": None,
            "cumulativePassProbability": 0.0,
            "forecastPassByLap": None,
            "event": None,
            "message": "No modelled attack opportunity remains before the flag.",
        }
    root_context = context(focus)
    rule_context = payload.get("ruleContext") if isinstance(payload.get("ruleContext"), dict) else {}
    rule_application = (
        "TRACK_DISTANCE_ALIGNMENT_REQUIRED"
        if rule_context.get("eventSpecificDataLoaded")
        else "DISCLOSURE_ONLY_UNTIL_EVENT_APPENDIX_LOADED"
    )
    return {
        "schemaVersion": "race-branch.v2",
        "treeVersion": "model-race-branch.v2",
        "mode": "MODEL_RACE_BRANCH",
        "forcedFirstAction": forced_label if forced else None,
        "forcedOpponentAction": forced_opponent_label if forced_opponent else None,
        "battlePlan": payload.get("battlePlan") if isinstance(payload.get("battlePlan"), dict) else None,
        "whatIf": payload.get("whatIf") if isinstance(payload.get("whatIf"), dict) else None,
        "tree": {
            "lap": start_lap,
            "ourSoc": round(soc_from_laps(energy_laps, selected, start_lap), 3),
            "defenderSoc": round(soc_from_laps(energy_laps, opponent, start_lap), 3),
            "bestAction": path[0]["action"] if path else None,
            "children": [],
        },
        "path": path,
        "horizon": len(path),
        "startLap": start_lap,
        "finishLap": total_laps,
        "selectedRoleAtJump": str(focus.get("selectedRole") or ("DEFENDING" if initial_ahead else "ATTACKING")),
        "actionChanges": action_changes,
        "modelledPairAheadAtFlag": modelled_pair_ahead,
        "modelledPairAheadProbabilityAtFlag": 1.0 if modelled_pair_ahead else 0.0,
        "takes": takes,
        "goLap": go_lap,
        "plannedConvertP": planned_convert,
        "passForecast": pass_forecast,
        "habitProbabilities": (path[0].get("habitProbabilities") if path else None),
        "energyPersonality": our_personality,
        "opponentEnergyPersonality": opp_personality,
        "driverScore": our_u,
        "opponentScore": opp_u,
        "branchFinishPosition": branch_finish,
        "pitLaps": {
            selected: sorted(pits.get(selected, set())),
            opponent: sorted(pits.get(opponent, set())),
        },
        "actualPairAheadAtFlag": actual_pair_ahead,
        "actualFinishPosition": actual_finish,
        "opponentFinishPosition": opponent_finish,
        "fullGridFinishForecast": None,
        "holdComparison": {
            "modelledAheadLaps": modelled_ahead_laps,
            "observedAheadLaps": observed_ahead_laps,
            "comparedLaps": None if observed is None else int(observed['comparedLaps']),
            "holdDelta": hold_delta,
            "placeGain": place_gain,
            "success": hold_success,
            "majorSuccess": major_success,
            "grade": "MAJOR" if major_success else ("SUCCESS" if hold_success else None),
            "note": (
                "Attack: take earlier than the race, then delay their re-pass. "
                "Defence: delay the lap they passed us. "
                "Success is more pair-ahead laps than the recorded race. "
                "Major success is still holding the place when the classified pair did not. "
                "The car we pass can take it back."
            ),
        },
        "finishComparison": {
            "pairOrderMatchesObserved": modelled_pair_ahead == actual_pair_ahead,
            "fullGridComparable": False,
            "reason": "Only the selected pair is modelled. Pace, traffic, and the rest of the grid stay on the recorded race. Pits are the only later recorded fact.",
        },
        "stateProvenance": {
            "horizonLaps": len(path),
            "observedContextLaps": 1 if path else 0,
            "carriedContextLaps": max(0, len(path) - 1),
            "sourceCounts": {"MODEL_BRANCH": len(path), "REAL_PIT": sum(1 for step in path if step.get("ourPit") or step.get("opponentPit"))},
            "note": "From JUMP the selected driver is simulated. Later recorded laps are ignored except pit in/out. Energy habits are 2026-only; u is 2018–2026 take rate, not this GP.",
        },
        "decisionContext": {
            "raceControl": "CLEAR" if root_context["track_clear"] else "GATED",
            "pitDistorted": root_context["pit_distorted"],
            "attackerTrackStatus": focus.get("attackerTrackStatus"),
            "defenderTrackStatus": focus.get("defenderTrackStatus"),
            "overtakeActionsEnabled": root_context["track_clear"] and not root_context["pit_distorted"],
            "ruleContext": {**rule_context, "application": rule_application},
        },
        "opponentPolicy": {
            "id": "DRIVER_ENERGY_HABIT_V1",
            "type": "TRAINED_2026_BATTLE_OPEN_HABIT",
            "description": "Each car spends from its 2026 battle vs open-air deploy habit. The hunter’s 2018–2026 take rate u decides whether an ATTACK lands. This GP is stripped from both.",
        },
        "energyModelVersion": ENERGY_MODEL_VERSION,
        "regulationEra": regulation_era,
        "energyConfig": {
            "id": energy_config["id"],
            "capacityMj": energy_config["capacityMj"],
            "calibrationStatus": energy_config["calibrationStatus"],
            "source": energy_config["source"],
        },
        "assumptions": [
            "From JUMP the model owns both cars' first-lap tactical choices and whether a pass lands.",
            "The only later recorded fact used is pit in/out laps for this pair.",
            "Energy personality is 2026 modelled deploy in battle vs open air, this GP stripped. Not team battery.",
            "u is that driver's 2018–2026 place-take rate, excluding this GP.",
            "When behind, the model picks the earliest remaining lap whose ATTACK convert% is near the planned maximum, then goes.",
            "A seeded draw vs overtakeP × u decides if the overtake is performed on this branch.",
            "After a TAKE the overtaken car becomes the hunter and keeps attacking while they have store. We SAVE to cover and rebuild so leftover does not dump to zero and freeze the lead. Loss of lead can still happen.",
            "Defence does the same: they keep attacking, we SAVE to delay the lap they passed us in the real race.",
            "Success is more pair-ahead laps than the recorded race. Major success is a better pair result than the classified race. Not a rewritten grid.",
            "SoC is a public-data model surrogate, not private battery telemetry.",
            "Cars on the map stay on recorded GPS; pair order on the branch can still swap.",
        ],
    }


def build_tree(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("mode") == "FUTURE_BLIND_RACE_ROLLOUT":
        return rollout_to_finish(payload)
    focus = payload.get("focus") or {}
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    selected = str(focus.get("driver") or "")
    initial_defender = str(focus.get("defender") or "")
    start_lap = int(number(focus.get("lap"), 1))
    total_laps = max(start_lap, int(number(payload.get("totalLaps"), start_lap)))
    horizon = max(0, min(MAX_HORIZON, int(number(payload.get("holdLaps"), MAX_HORIZON)),
                         total_laps - start_lap))
    energy_laps = payload.get("energyLaps", {})
    regulation_era = str(payload.get("regulationEra") or era_for_year(payload.get("year")))
    energy_config = get_era_config(regulation_era)
    initial_our_soc = soc_from_laps(energy_laps, selected, start_lap)
    initial_defender_soc = soc_from_laps(energy_laps, initial_defender, start_lap)
    def simulate(our_start: float, defender_start: float, deploy_scale: float = 1.0,
                 harvest_scale: float = 1.0) -> tuple[dict[str, Any], list[dict[str, Any]], int, int]:
        """Evaluate one deterministic tree from an explicit pair of SoC states."""
        node_count = 0
        leaf_count = 0

        def expand(state: dict[str, Any], depth: int) -> tuple[float, dict[str, Any]]:
            nonlocal node_count, leaf_count
            node_count += 1
            if depth >= horizon or state["lap"] >= total_laps:
                leaf_count += 1
                value = (state["leadLaps"] * 100.0
                         + (state["aheadProbability"] * 20.0)
                         + (state["ourSoc"] * RESERVE_WEIGHT))
                return value, {
                    "lap": state["lap"], "role": "DEFENDING" if state["ahead"] else "ATTACKING",
                    "leadLaps": round(state["leadLaps"], 3),
                    "aheadProbability": round(state["aheadProbability"], 4),
                    "ourSoc": round(state["ourSoc"], 3),
                    "defenderSoc": round(state["defenderSoc"], 3),
                    "children": [],
                }

            lap = state["lap"]
            forward = row_for(rows, lap, selected, initial_defender)
            reverse = row_for(rows, lap, initial_defender, selected) or {}
            role_aligned = reverse if state["ahead"] else forward
            if role_aligned:
                observed = role_aligned
                context_source = "OBSERVED_ROLE_ALIGNED"
            elif forward:
                # The observed pair still exists at this lap but the selected
                # car's counterfactual role differs from the real ordering.
                observed = forward
                context_source = "OBSERVED_MATCHUP_ROLE_CARRIED"
            else:
                # Do not fabricate an unobserved future battle row.  Carry
                # the decision-time state explicitly and disclose the limit.
                observed = focus
                context_source = "FOCUS_CONTEXT_CARRIED"
            children = []
            for action in ACTIONS:
                our_soc, deploy, harvest = transition_soc(
                    state["ourSoc"], action, observed, state["ahead"], era=regulation_era,
                    deploy_scale=deploy_scale, harvest_scale=harvest_scale)
                opponent_action, response_score = best_response(
                    reverse if state["ahead"] else forward,
                    state["defenderSoc"], state["ourSoc"], state["ahead"], regulation_era,
                    deploy_scale, harvest_scale,
                )
                opponent_soc, opponent_deploy, opponent_harvest = transition_soc(
                    state["defenderSoc"], opponent_action, observed, not state["ahead"],
                    era=regulation_era, deploy_scale=deploy_scale, harvest_scale=harvest_scale,
                )
                if state["ahead"]:
                    repass = attack_chance(reverse or forward, opponent_action,
                                           opponent_soc, our_soc, True)
                    survival = max(0.02, min(0.99, 1.0 - repass))
                    next_ahead = state["aheadProbability"] * survival
                    event_probability = survival
                else:
                    pass_probability = attack_chance(forward, action, our_soc,
                                                     opponent_soc, False)
                    next_ahead = state["aheadProbability"] + ((1.0 - state["aheadProbability"])
                                                                * pass_probability)
                    event_probability = pass_probability
                lead_laps = state["leadLaps"] + next_ahead
                next_state = {
                    "lap": lap + 1,
                    "ahead": next_ahead >= 0.5,
                    "aheadProbability": next_ahead,
                    "leadLaps": lead_laps,
                    "ourSoc": our_soc,
                    "defenderSoc": opponent_soc,
                }
                value, next_node = expand(next_state, depth + 1)
                children.append({
                    "action": action,
                    "probability": round(event_probability, 4),
                    "aheadProbability": round(next_ahead, 4),
                    "ourSoc": round(our_soc, 3),
                    "defenderSoc": round(opponent_soc, 3),
                    "deployMj": deploy,
                    "harvestMj": harvest,
                    "opponentAction": opponent_action,
                    "opponentDeployMj": opponent_deploy,
                    "opponentHarvestMj": opponent_harvest,
                    "opponentResponseScore": response_score,
                    "contextSource": context_source,
                    "pitPlan": "OBSERVED PIT WINDOW; NO BATTERY RESET" if bool(observed.get("pitDistorted")) else "STAY OUT",
                    "leadLaps": round(lead_laps, 3),
                    "value": value,
                    "next": next_node,
                })
            best = max(children, key=lambda child: child["value"])
            for child in children:
                child["best"] = child is best
            return best["value"], {
                "lap": lap, "role": "DEFENDING" if state["ahead"] else "ATTACKING",
                "leadLaps": round(state["leadLaps"], 3),
                "aheadProbability": round(state["aheadProbability"], 4),
                "ourSoc": round(state["ourSoc"], 3),
                "defenderSoc": round(state["defenderSoc"], 3),
                "bestAction": best["action"],
                "children": children,
            }

        _, scenario_tree = expand({
            "lap": start_lap,
            "ahead": False,
            "aheadProbability": 0.0,
            "leadLaps": 0.0,
            "ourSoc": clamp(our_start),
            "defenderSoc": clamp(defender_start),
        }, 0)
        scenario_path = []
        cursor = scenario_tree
        while cursor.get("children"):
            child = next((item for item in cursor["children"] if item.get("best")), cursor["children"][0])
            scenario_path.append({key: child[key] for key in (
                "action", "probability", "ourSoc", "defenderSoc", "opponentAction",
                "deployMj", "harvestMj", "opponentDeployMj", "opponentHarvestMj",
                    "pitPlan", "leadLaps", "aheadProbability")})
            scenario_path[-1]["contextSource"] = child.get("contextSource")
            scenario_path[-1]["lap"] = cursor["lap"]
            scenario_path[-1]["role"] = cursor["role"]
            cursor = child["next"]
        return scenario_tree, scenario_path, node_count, leaf_count

    tree, path, node_count, leaf_count = simulate(initial_our_soc, initial_defender_soc)
    sensitivity_summary = None
    if payload.get("includeSensitivity", True):
        sensitivity_cases = (
            ("ATTACKER_LOW", "ATTACKER −0.50 MJ", initial_our_soc - 0.5, initial_defender_soc),
            ("BASE", "BASE ESTIMATE", initial_our_soc, initial_defender_soc),
            ("DEFENDER_HIGH", "DEFENDER +0.50 MJ", initial_our_soc, initial_defender_soc + 0.5),
        )
        soc_sensitivity = []
        for scenario_id, label, our_start, defender_start in sensitivity_cases:
            scenario_tree, scenario_path, _, _ = simulate(our_start, defender_start)
            first_step = scenario_path[0] if scenario_path else {}
            soc_sensitivity.append({
                "id": scenario_id,
                "label": label,
                "attackerStartSocMj": round(clamp(our_start), 3),
                "defenderStartSocMj": round(clamp(defender_start), 3),
                "recommendedAction": first_step.get("action", scenario_tree.get("bestAction")),
                "expectedLeadLaps": round(number(scenario_path[-1].get("leadLaps") if scenario_path else 0.0), 3),
            })
        base_action = soc_sensitivity[1]["recommendedAction"]
        sensitivity_summary = {
            "perturbationMj": 0.5,
            "stableRecommendation": all(item["recommendedAction"] == base_action for item in soc_sensitivity),
            "baseAction": base_action,
            "cases": soc_sensitivity,
            "note": "Sensitivity scenarios perturb modelled SoC only; they are not measurements of either car's battery.",
        }

    # Starting SoC is only one uncertainty in the public-data surrogate.  Run
    # a second, deliberately small stress test against the energy transition
    # calibration itself.  The values are not regulatory limits and do not
    # imply that a real car deployed or harvested at these rates.
    calibration_sensitivity = None
    if payload.get("includeSensitivity", True):
        calibration_cases = (
            ("CONSERVATIVE", "HIGH DEPLOY / LOW HARVEST", 1.15, 0.85),
            ("BASE", "BASE CALIBRATION", 1.00, 1.00),
            ("FAVOURABLE", "LOW DEPLOY / HIGH HARVEST", 0.85, 1.15),
        )
        calibration_results = []
        for scenario_id, label, deploy_scale, harvest_scale in calibration_cases:
            scenario_tree, scenario_path, _, _ = simulate(
                initial_our_soc,
                initial_defender_soc,
                deploy_scale=deploy_scale,
                harvest_scale=harvest_scale,
            )
            first_step = scenario_path[0] if scenario_path else {}
            calibration_results.append({
                "id": scenario_id,
                "label": label,
                "deployScale": deploy_scale,
                "harvestScale": harvest_scale,
                "recommendedAction": first_step.get("action", scenario_tree.get("bestAction")),
                "expectedLeadLaps": round(number(scenario_path[-1].get("leadLaps") if scenario_path else 0.0), 3),
            })
        base_action = calibration_results[1]["recommendedAction"]
        calibration_sensitivity = {
            "variationPercent": 15,
            "stableRecommendation": all(item["recommendedAction"] == base_action for item in calibration_results),
            "baseAction": base_action,
            "cases": calibration_results,
            "note": (
                "This is a ±15% surrogate-calibration stress test for modelled deployment and harvest. "
                "It is not measured team telemetry, an FIA power limit, or an FIA recharge limit."
            ),
        }

    observed_lead_laps = int(number(focus.get("observedLeadLaps"), -1))
    if observed_lead_laps < 0:
        observed_lead_laps = int(number(focus.get("holdLaps"), 0)) if focus.get("held") else (1 if focus.get("passedNow") else 0)
    # The replay is intentionally a bounded tactical horizon.  Keep the raw
    # observed duration for auditability, but compare it with the estimate only
    # inside the same horizon; otherwise a pass held to the chequered flag would
    # be compared unfairly with a six-lap counterfactual.
    actual_lead_laps = min(observed_lead_laps, horizon)
    expected = path[-1]["leadLaps"] if path else 0.0
    root_context = context(focus)
    pit_tyre_context = observed_pit_tyre_context(
        rows, focus, selected, initial_defender, start_lap, horizon)
    context_source_counts: dict[str, int] = {}
    for step in path:
        source = str(step.get("contextSource") or "FOCUS_CONTEXT_CARRIED")
        context_source_counts[source] = context_source_counts.get(source, 0) + 1
    observed_context_laps = sum(
        count for source, count in context_source_counts.items()
        if source.startswith("OBSERVED_")
    )
    state_provenance = {
        "horizonLaps": horizon,
        "observedContextLaps": observed_context_laps,
        "carriedContextLaps": context_source_counts.get("FOCUS_CONTEXT_CARRIED", 0),
        "sourceCounts": context_source_counts,
        "note": (
            "Each tree step uses a same-lap observed matchup row when available. If a later "
            "counterfactual role has no matching public row, the tree carries the initial "
            "decision context forward and labels it as modelled rather than fabricating telemetry."
        ),
    }
    persistence_by_horizon = []
    for horizon_laps in (1, 2, 3, 5, 6):
        step = path[horizon_laps - 1] if len(path) >= horizon_laps else None
        persistence_by_horizon.append({
            "horizon": horizon_laps,
            "estimatedProbability": step["aheadProbability"] if step else None,
            "observed": actual_lead_laps >= horizon_laps,
        })
    finish_positions = payload.get("finishPositions") or {}
    raw_rule_context = payload.get("ruleContext")
    rule_context = raw_rule_context if isinstance(raw_rule_context, dict) else {}
    # A line position cannot affect the tactical tree until the decision rows
    # carry compatible track-distance coordinates.  Preserve the official
    # context for auditability without treating it as applied race physics.
    rule_application = (
        "TRACK_DISTANCE_ALIGNMENT_REQUIRED"
        if rule_context.get("eventSpecificDataLoaded")
        else "DISCLOSURE_ONLY_UNTIL_EVENT_APPENDIX_LOADED"
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "treeVersion": TREE_VERSION,
        "tree": tree,
        "path": path,
        "nodeCount": node_count,
        "leafCount": leaf_count,
        "horizon": horizon,
        "actualLeadLaps": actual_lead_laps,
        "observedLeadLaps": observed_lead_laps,
        "comparisonHorizonLaps": horizon,
        "expectedLeadLaps": expected,
        "actualFinishPosition": finish_positions.get(selected),
        "success": bool(path) and expected > actual_lead_laps,
        "persistenceByHorizon": persistence_by_horizon,
        "socSensitivity": sensitivity_summary,
        "energyCalibrationSensitivity": calibration_sensitivity,
        "opponentPolicy": {
            "id": "CONSERVATIVE_BEST_RESPONSE_HEURISTIC_V1",
            "type": "DETERMINISTIC_CONSERVATIVE_BEST_RESPONSE",
            "description": (
                "At every branch, the opponent selects ATTACK, SAVE, or DELAY that maximises its "
                "immediate pass chance when behind, or its survival chance when ahead, with a small "
                "remaining-SoC preference. This is a model assumption, not the real driver's radio command."
            ),
        },
        "stateProvenance": state_provenance,
        "decisionContext": {
            "raceControl": "CLEAR" if root_context["track_clear"] else "GATED",
            "pitDistorted": root_context["pit_distorted"],
            "attackerTrackStatus": focus.get("attackerTrackStatus"),
            "defenderTrackStatus": focus.get("defenderTrackStatus"),
            "overtakeActionsEnabled": root_context["track_clear"] and not root_context["pit_distorted"],
            "ruleContext": {**rule_context, "application": rule_application},
        },
        "pitTyreContext": pit_tyre_context,
        "selected": selected,
        "defender": initial_defender,
        "energyModelVersion": ENERGY_MODEL_VERSION,
        "regulationEra": regulation_era,
        "energyConfig": {
            "id": energy_config["id"],
            "capacityMj": energy_config["capacityMj"],
            "calibrationStatus": energy_config["calibrationStatus"],
            "source": energy_config["source"],
        },
        "assumptions": [
            "SoC is a modelled surrogate because team battery telemetry is not public.",
            "The selected driver branches into ATTACK, SAVE and DELAY at every lap.",
            "The opponent selects a best response from the same three actions using its remaining SoC.",
            "A pass reverses attacking and defending roles; pit stops change tyre/time context only and never recharge the battery.",
            "Observed pit cycles and tyre state are held fixed as context; this three-action tree does not simulate an alternative BOX strategy.",
            "The tactical horizon is capped at six laps to avoid an unbounded 3^N tree.",
            "Non-green race-control states and pit-distorted exchanges are gated as non-overtake windows.",
            "Success compares estimated persistence with observed consecutive laps ahead, not finish position alone.",
            "The SoC sensitivity panel varies modelled starting energy by 0.50 MJ; it is a robustness check, not private battery telemetry.",
            "The energy-calibration sensitivity panel varies surrogate deployment and harvest by 15%; it is not an FIA limit or measured team energy data.",
            "Later tree laps disclose whether their battle context is observed at that lap or carried from the initial observed decision state.",
        ],
    }


def main() -> None:
    payload = json.load(sys.stdin)
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    print(json.dumps(build_tree(payload), allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
