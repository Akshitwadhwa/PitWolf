"""C5.2-constrained constructed battery.

FastF1 does not publish team ES state of charge. This module builds a shared
0–4 MJ store for the recorded race and the PitWolf branch: driver deploy /
harvest habits are scaled onto legal C5.2 slices. One braking zone cannot
refill the window.

Citations are 2026 FIA F1 Regulations Section C [Technical], Issue 20:
C5.2.7  ERS-K DC power <= 350 kW
C5.2.8  propulsion power vs speed (Overtake on/off)
C5.2.9  ES max-min SoC <= 4 MJ on track
C5.2.10 Recharge <= 8.5 MJ per lap
C5.2.11 MGU-K torque <= 500 Nm
C5.2.21 0.97 ECU correction
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

from energy_transition import CAPACITY_MJ, clamp_soc, transition_soc
from fia_2026_regs import CONSTANTS, TECHNICAL_C, propulsion_envelope_kw

BATTERY_ENGINE_VERSION = 'c52-battery.v2'
ERS_K_MAX_KW = float(CONSTANTS['ers_k_dc_power_max_kw']['value'])
RECHARGE_CAP_MJ = float(CONSTANTS['harvest_max_mj_per_lap']['value'])
SOC_WINDOW_MJ = float(CONSTANTS['es_soc_window_mj']['value'])
TORQUE_MAX_NM = float(CONSTANTS['mgu_k_torque_max_nm']['value'])
ECU_ETA = float(CONSTANTS['standard_ecu_efficiency_correction']['value'])
# Modelled car mass and regen path — not FIA published figures.
CAR_MASS_KG = 798.0
REGEN_ETA = 0.85
BRAKE_DURATION_S = 2.4
BRAKE_EXIT_KPH = 95.0
DEFAULT_BRAKES = 10
DEFAULT_LENGTH_M = 5200.0
TRACKMAP_ROOT = Path(__file__).resolve().parents[1] / 'data' / 'f1-cache' / 'trackmap' / 'v4'

CITATIONS = [
    {'article': 'C5.2.7', 'document': TECHNICAL_C, 'rule': 'ERS-K DC power <= 350 kW'},
    {'article': 'C5.2.8', 'document': TECHNICAL_C, 'rule': 'Propulsion power falls with speed; 0 kW at/above 345 km/h (355 with Overtake)'},
    {'article': 'C5.2.9', 'document': TECHNICAL_C, 'rule': 'ES max minus min SoC <= 4 MJ on track'},
    {'article': 'C5.2.10', 'document': TECHNICAL_C, 'rule': 'Recharge <= 8.5 MJ per lap at the CU-K HV DC bus'},
    {'article': 'C5.2.11', 'document': TECHNICAL_C, 'rule': 'MGU-K torque <= 500 Nm'},
]


def _num(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return number if number == number and abs(number) != float('inf') else default
    except (TypeError, ValueError):
        return default


@lru_cache(maxsize=64)
def circuit_brakes(year: Any, round_number: Any, session_name: str = 'Race') -> dict[str, Any]:
    try:
        year_i = int(year)
        round_i = int(round_number)
    except (TypeError, ValueError):
        return {'brakes': DEFAULT_BRAKES, 'lengthM': DEFAULT_LENGTH_M, 'source': 'DEFAULT_CIRCUIT'}
    slug = str(session_name or 'Race').lower().replace(' ', '_')
    if slug in {'r', 'race'}:
        slug = 'race'
    path = TRACKMAP_ROOT / str(year_i) / f'{round_i}_{slug}.json'
    if not path.exists():
        return {'brakes': DEFAULT_BRAKES, 'lengthM': DEFAULT_LENGTH_M, 'source': 'DEFAULT_CIRCUIT'}
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {'brakes': DEFAULT_BRAKES, 'lengthM': DEFAULT_LENGTH_M, 'source': 'DEFAULT_CIRCUIT'}
    corners = payload.get('corners') or []
    length = _num(payload.get('length') or payload.get('lengthM'), DEFAULT_LENGTH_M)
    brakes = max(6, min(18, len(corners) or DEFAULT_BRAKES))
    return {
        'brakes': brakes,
        'lengthM': length if length > 1000 else DEFAULT_LENGTH_M,
        'source': 'TRACKMAP_CORNERS',
    }


def brake_slice_mj(entry_kph: Any, duration_s: float = BRAKE_DURATION_S) -> dict[str, Any]:
    """Legal harvest from one braking zone. Not a full-window refill."""
    entry = max(80.0, min(340.0, _num(entry_kph, 260.0)))
    duration = max(0.8, min(4.0, _num(duration_s, BRAKE_DURATION_S)))
    v_in = entry / 3.6
    v_out = BRAKE_EXIT_KPH / 3.6
    kinetic_mj = max(0.0, 0.5 * CAR_MASS_KG * (v_in * v_in - v_out * v_out)) / 1_000_000.0 * REGEN_ETA
    rpm = max(3500.0, min(12000.0, entry * 38.0))
    omega = rpm * 2.0 * math.pi / 60.0
    torque_kw = TORQUE_MAX_NM * omega / 1000.0 * ECU_ETA
    legal_kw = min(ERS_K_MAX_KW, torque_kw)
    electrical_mj = legal_kw * duration / 1000.0
    slice_mj = min(kinetic_mj, electrical_mj)
    return {
        'entryKph': round(entry, 1),
        'durationS': round(duration, 2),
        'legalKw': round(legal_kw, 1),
        'kineticMj': round(kinetic_mj, 3),
        'electricalMj': round(electrical_mj, 3),
        'sliceMj': round(slice_mj, 3),
        'citation': 'C5.2.7 + C5.2.11 + C5.2.21',
    }


def lap_harvest_ceiling(row: dict[str, Any] | None = None) -> dict[str, Any]:
    row = dict(row or {})
    circuit = row.get('circuit') if isinstance(row.get('circuit'), dict) else None
    if circuit is None:
        circuit = circuit_brakes(row.get('year'), row.get('round'), row.get('session') or 'Race')
    brakes = max(1, int(circuit.get('brakes') or DEFAULT_BRAKES))
    length = _num(circuit.get('lengthM'), DEFAULT_LENGTH_M)
    lap_s = _num(row.get('lapTimeS') or row.get('ourLapTimeS'), 90.0)
    mean_kph = (length / max(40.0, lap_s)) * 3.6
    entry = min(330.0, max(160.0, mean_kph * 1.42))
    one = brake_slice_mj(entry)
    lap_mj = min(RECHARGE_CAP_MJ, brakes * one['sliceMj'])
    return {
        **one,
        'brakes': brakes,
        'lengthM': round(length, 1),
        'meanKph': round(mean_kph, 1),
        'lapHarvestMj': round(lap_mj, 3),
        'lapCapMj': RECHARGE_CAP_MJ,
        'circuitSource': circuit.get('source') or 'DEFAULT_CIRCUIT',
        'note': (
            f'One brake ≤ {one["sliceMj"]:.2f} MJ. '
            f'{brakes} stops this lap ≤ {lap_mj:.2f} MJ before the C5.2.10 {RECHARGE_CAP_MJ:.1f} MJ bus cap. '
            'Not a 4 MJ refill at each pedal.'
        ),
    }


def assign_constructed_lap(
    soc_mj: float,
    action: str,
    row: dict[str, Any] | None = None,
    *,
    overtake_active: bool = False,
    harvest_used_mj: float = 0.0,
    defending: bool = False,
    era: str = '2026',
    deploy_scale: float = 1.0,
    harvest_scale: float = 1.0,
) -> dict[str, Any]:
    """Scale driver deploy/harvest onto the constructed C5.2 store."""
    row = dict(row or {})
    ceiling = lap_harvest_ceiling(row)
    start = clamp_soc(soc_mj, SOC_WINDOW_MJ)
    legal = legal_propulsion_kw(row.get('speedKph') or row.get('raceMeanSpeedKph') or ceiling['meanKph'], overtake_active)
    _, want_deploy, want_harvest = transition_soc(
        start, action, row, defending=defending, era=era,
        deploy_scale=deploy_scale, harvest_scale=harvest_scale,
    )
    bus_left = max(0.0, RECHARGE_CAP_MJ - max(0.0, harvest_used_mj))
    room = max(0.0, SOC_WINDOW_MJ - start)
    # One brake is a slice. A lap may take every legal stop, then the 8.5 MJ bus.
    harvest = min(want_harvest, ceiling['lapHarvestMj'], bus_left, room + want_deploy)
    if legal['speedCut']:
        deploy = 0.0
        clip_reason = 'C5.2.8 speed cut — deploy forced to 0 kW'
    else:
        scale = legal['legalDeployKw'] / ERS_K_MAX_KW if ERS_K_MAX_KW else 0.0
        deploy = min(want_deploy, start + harvest, want_deploy * scale if 0 < scale < 1 else want_deploy)
        clip_reason = 'C5.2.7/C5.2.8 power envelope reduced requested deploy' if deploy + 1e-6 < want_deploy else None
    if harvest + 1e-6 < want_harvest:
        clip_reason = (clip_reason + ' · ' if clip_reason else '') + (
            f'C5.2 harvest clipped to {ceiling["lapHarvestMj"]:.2f} MJ this lap '
            f'(one brake ≤ {ceiling["sliceMj"]:.2f} MJ, not a 4 MJ refill)'
        )
    end = clamp_soc(start - deploy + harvest, SOC_WINDOW_MJ)
    return {
        'action': action,
        'socStartMj': round(start, 3),
        'consumedMj': round(deploy, 3),
        'harvestedMj': round(harvest, 3),
        'wantedDeployMj': round(want_deploy, 3),
        'wantedHarvestMj': round(want_harvest, 3),
        'socEndMj': round(end, 3),
        'socLeftPct': round((end / SOC_WINDOW_MJ) * 100.0, 1),
        'harvestUsedAfterLapMj': round(harvest_used_mj + harvest, 3),
        'legal': legal,
        'harvestLaw': ceiling,
        'clipReason': clip_reason,
        'capacityMj': SOC_WINDOW_MJ,
        'provenance': 'CONSTRUCTED_C52',
        'note': (
            'Constructed 4 MJ store. Driver spend is scaled onto C5.2 brake slices. '
            'Not team battery. Recorded and PitWolf share this store.'
        ),
    }


def legal_propulsion_kw(speed_kph: Any, overtake_active: bool = False) -> dict[str, Any]:
    speed = max(0.0, _num(speed_kph))
    envelope = propulsion_envelope_kw(speed, override=bool(overtake_active))
    allowed = min(ERS_K_MAX_KW, envelope)
    cut = allowed <= 0.0
    return {
        'speedKph': round(speed, 1),
        'overtakeActive': bool(overtake_active),
        'ersKCapKw': ERS_K_MAX_KW,
        'speedEnvelopeKw': round(envelope, 1),
        'legalDeployKw': round(allowed, 1),
        'speedCut': cut,
        'citation': 'C5.2.7 + C5.2.8',
        'note': (
            'Electric propulsion is legally zero at this speed.'
            if cut else
            f'Legal ERS-K propulsion ceiling is {allowed:.0f} kW at {speed:.0f} km/h.'
        ),
    }


def apply_legal_lap(
    soc_mj: float,
    action: str,
    row: dict[str, Any] | None = None,
    *,
    overtake_active: bool = False,
    harvest_used_mj: float = 0.0,
    defending: bool = False,
    era: str = '2026',
    deploy_scale: float = 1.0,
    harvest_scale: float = 1.0,
) -> dict[str, Any]:
    """One constructed lap: driver request, then C5.2 brake-slice harvest."""
    return assign_constructed_lap(
        soc_mj, action, row,
        overtake_active=overtake_active,
        harvest_used_mj=harvest_used_mj,
        defending=defending,
        era=era,
        deploy_scale=deploy_scale,
        harvest_scale=harvest_scale,
    )


def battery_box(start_mj: float, end_mj: float, consumed_mj: float, harvested_mj: float) -> dict[str, Any]:
    return {
        'label': 'MODELLED ES WINDOW',
        'capacityMj': SOC_WINDOW_MJ,
        'startMj': round(_num(start_mj), 3),
        'endMj': round(_num(end_mj), 3),
        'consumedMj': round(_num(consumed_mj), 3),
        'harvestedMj': round(_num(harvested_mj), 3),
        'leftMj': round(clamp_soc(end_mj, SOC_WINDOW_MJ), 3),
        'leftPct': round((clamp_soc(end_mj, SOC_WINDOW_MJ) / SOC_WINDOW_MJ) * 100.0, 1),
        'citation': 'C5.2.9 usable window 4 MJ · C5.2.10 recharge 8.5 MJ/lap',
        'notTeamTelemetry': True,
    }
