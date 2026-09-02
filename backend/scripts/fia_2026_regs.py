"""FIA 2026 regulation constants used by the PitWolf energy engine.

Every number carries its source document and article. Values the regulations
delegate to per-event appendices (which competitions harvest at 8 MJ, detection
gaps/lines) are NOT published in the PDFs, so this module uses the regulation
defaults and flags such values as assumption-prone.

Source documents live in backend/data/fia-docs/.
"""

REGULATION_VERSION = {
    'pu_technical': 'PU Technical Regulations, Issue 7, 2024-06-11',
    'sporting_b': 'Sporting Regulations Section B, Issue 2, 2024-12-11',
    'car_technical_c': 'Car Technical Regulations Section C, Issue 10, 2024-12-11',
    'pu_sporting': 'PU Sporting Regulations, Issue 7, 2024-10-17',
}

PU_TR = 'PU Technical Regulations Issue 7 (2024-06-11)'
CAR_TR_C = 'Car Technical Regulations Section C Issue 10 (2024-12-11)'
SPORTING_B = 'Sporting Regulations Section B Issue 2 (2024-12-11)'


def reg(value, unit, citation, note=None):
    return {'value': value, 'unit': unit, 'citation': citation, 'note': note}


CONSTANTS = {
    'fuel_energy_flow_max_mj_h': reg(
        3000.0, 'MJ/h', f'{PU_TR} Art. 5.4.3',
        'Fuel energy flow must not exceed 3000 MJ/h.'),
    'fuel_energy_flow_rpm_ramp_limit': reg(
        10500.0, 'rpm', f'{PU_TR} Art. 5.4.4',
        'Below this rpm the fuel energy flow limit is EF = 0.27*N + 165 MJ/h.'),
    'ers_k_dc_power_max_kw': reg(
        350.0, 'kW', f'{PU_TR} Art. 5.4.7',
        'Absolute electrical DC power of the ERS-K may not exceed 350 kW.'),
    'es_soc_window_mj': reg(
        4.0, 'MJ', f'{PU_TR} Art. 5.4.9',
        'Max minus min state of charge of the ES may not exceed 4 MJ on track.'),
    'harvest_max_mj_per_lap': reg(
        8.5, 'MJ/lap', f'{PU_TR} Art. 5.4.10',
        'Energy harvested by ERS-K at the CU-K HV DC bus, per lap.'),
    'harvest_max_mj_per_lap_designated': reg(
        8.0, 'MJ/lap', f'{PU_TR} Art. 5.4.10 i',
        'Reduced cap at FIA-designated competitions; the list is in the unpublished Appendix.'),
    'override_extra_harvest_mj_per_lap': reg(
        0.5, 'MJ/lap', f'{PU_TR} Art. 5.4.10 ii',
        'Extra harvest allowed when Override mode conditions (Sporting Regs) are met.'),
    'mgu_k_torque_max_nm': reg(
        500.0, 'Nm', f'{PU_TR} Art. 5.4.11',
        'MGU-K mechanical torque magnitude, efficiency-corrected by 0.97.'),
    'mgu_k_standing_start_speed_kph': reg(
        50.0, 'kph', f'{PU_TR} Art. 5.4.12',
        'MGU-K usable during a standing start only once the car reaches 50 km/h.'),
    'pit_charge_max_kj': reg(
        100.0, 'kJ', f'{PU_TR} Art. 5.4.13',
        'Max energy that may be added to any ES while stationary in pit lane/garage.'),
    'launch_min_ers_k_kw': reg(
        200.0, 'kW', f'{PU_TR} Art. 5.14.6',
        'ERS-K must deliver at least this DC power for 1 s at full-throttle start.'),
    'minimum_mass_race_kg': reg(
        724.0, 'kg', f'{CAR_TR_C} Art. C4.1',
        'Race minimum mass excluding Nominal Tyre Mass; qualifying is 726 kg.'),
    'minimum_mass_qualifying_kg': reg(
        726.0, 'kg', f'{CAR_TR_C} Art. C4.1',
        'Sprint Qualifying and Qualifying minimum mass excluding Nominal Tyre Mass.'),
    'heat_hazard_mass_increase_kg': reg(
        4.0, 'kg', f'{CAR_TR_C} Art. C4.1',
        'Minimum Mass increase when a Heat Hazard is declared.'),
    'driver_reference_mass_min_kg': reg(
        82.0, 'kg', f'{CAR_TR_C} Art. C4.5.2',
        'Driver reference mass plus driver ballast must not be less than 82 kg.'),
    'override_activation': reg(
        None, None, f'{SPORTING_B} Art. B7.2',
        'Per event the FIA publishes the Detection Gap (time), Detection Line and '
        'Activation Line; Override is available to a car within the Detection Gap of '
        'another car at the Detection Line, and always in practice sessions.'),
}

MINIMUM_TYRE_MASS_KG = {
    'value': 44.0,
    'unit': 'kg',
    'citation': 'ASSUMPTION — Car TR C Appendix defines Nominal Tyre Mass as a set of '
                'new dry-weather tyres measured by the tyre provider; the published 2026 '
                'figure is not available in the regulations, so a nominal set mass is '
                'assumed (labelled MODELLED).',
    'note': 'Per-set mass of four 18-inch slicks; update if the FIA publishes the value.',
}

MAX_FUEL_START_KG = {
    2026: {'value': 70.0, 'citation': 'ASSUMPTION — 2026 regs target ~70 kg race fuel '
                                       'start (regulation figure to be confirmed; labelled MODELLED).'},
    'default': {'value': 110.0, 'citation': 'ASSUMPTION — 110 kg max fuel allowance was '
                                            'the 2019-2025 limit (historical regs; labelled MODELLED).'},
}


def propulsion_envelope_kw(speed_kph, override=False):
    """ERS-K propulsion power ceiling vs car speed — PU TR Art. 5.4.8."""
    v = max(0.0, speed_kph)
    if override:
        return max(0.0, 7100.0 - 20.0 * v) if v < 355.0 else 0.0
    if v < 340.0:
        return 1800.0 - 5.0 * v
    if v < 345.0:
        return 6900.0 - 20.0 * v
    return 0.0


def fuel_energy_flow_mj_h(rpm):
    """Fuel energy flow ceiling — PU TR Art. 5.4.3 / 5.4.4."""
    if rpm >= CONSTANTS['fuel_energy_flow_rpm_ramp_limit']['value']:
        return CONSTANTS['fuel_energy_flow_max_mj_h']['value']
    return min(CONSTANTS['fuel_energy_flow_max_mj_h']['value'], 0.27 * rpm + 165.0)


def ice_power_ceiling_kw(rpm, ice_efficiency):
    """Maximum ICE power implied by the fuel-flow ceiling.

    The efficiency is an assumption (typical modern F1 thermal efficiency);
    the fuel-flow limit itself is Art. 5.4.3/5.4.4.
    """
    return fuel_energy_flow_mj_h(rpm) / 3.6 * ice_efficiency
