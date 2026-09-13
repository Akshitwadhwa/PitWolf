"""Battery-conditioned overtake layer (BATTERY.md).

SoC is MODELLED. u in [0, 1] is a per-driver score for this window, not race luck
from the real event. Replay draws are seeded so the same lap is reproducible.
"""

from __future__ import annotations

import hashlib
from typing import Any

CHARGE_WEIGHT = 0.18
REPASS_WEIGHT = 0.14
CAPACITY_MJ = 4.0
VERSION = 'battery-overtake.v1'


def _num(value, default=None):
    try:
        number = float(value)
        return number if number == number else default
    except (TypeError, ValueError):
        return default


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def driver_score(year, round_number, lap, driver, override=None) -> float:
    """u in [0, 1] for one decision window.

    Override is for a live what-if probe only. Historical replay must stay seeded.
    """
    forced = _num(override)
    if forced is not None:
        return round(clamp01(forced), 4)
    key = f'{year}|{round_number}|{lap}|{str(driver or "").upper()}|{VERSION}'.encode()
    n = int(hashlib.sha256(key).hexdigest()[:8], 16)
    return round((n % 10000) / 9999.0, 4)


def modulate_overtake(base_p, our_soc_mj, opponent_soc_mj, u, capacity_mj=CAPACITY_MJ) -> dict[str, Any]:
    """Raise or lower overtake % from modelled stores and u. Does not pick ATTACK/SAVE."""
    base = clamp01(_num(base_p, 0.0) or 0.0)
    capacity = max(0.01, _num(capacity_mj, CAPACITY_MJ) or CAPACITY_MJ)
    our = max(0.0, _num(our_soc_mj, 0.0) or 0.0)
    opp = max(0.0, _num(opponent_soc_mj, 0.0) or 0.0)
    draw = clamp01(_num(u, 0.0) or 0.0)
    charge = our / capacity
    opp_charge = opp / capacity
    charge_boost = (charge - 0.5) * CHARGE_WEIGHT
    opponent_penalty = max(0.0, opp_charge - charge) * REPASS_WEIGHT
    raw_delta = charge_boost - opponent_penalty
    delta = raw_delta * draw
    adjusted = clamp01(base + delta)
    return {
        'version': VERSION,
        'u': round(draw, 4),
        'ourSocMj': round(our, 3),
        'opponentSocMj': round(opp, 3),
        'ourCharge': round(charge, 3),
        'opponentCharge': round(opp_charge, 3),
        'baseOvertakeP': round(base, 4),
        'deltaOvertakeP': round(delta, 4),
        'overtakeP': round(adjusted, 4),
        'chargeBoost': round(charge_boost, 4),
        'opponentPenalty': round(opponent_penalty, 4),
    }


def seeded_draw(year, round_number, lap, driver, salt='take') -> float:
    """Reproducible Uniform(0, 1) for one branch event. Not real-race luck."""
    return driver_score(year, round_number, f'{lap}:{salt}', driver)


def leftover_to_soc(left_pct, capacity_mj=CAPACITY_MJ) -> float | None:
    pct = _num(left_pct)
    if pct is None:
        return None
    return max(0.0, min(capacity_mj, (pct / 100.0) * capacity_mj))
