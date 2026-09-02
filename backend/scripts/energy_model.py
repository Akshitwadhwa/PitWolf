"""Physics energy model for PitWolf.

Derives instantaneous power demand from real FastF1 telemetry (P = F*v with
F = m*a + drag + rolling resistance), then splits demand between ICE and
electrical power using the 2026 FIA regulation ceilings (fia_2026_regs.py) and
integrates battery state of charge within the 4 MJ ES window.

Every constant that is not from the regulations is listed in ASSUMPTIONS and
must be surfaced in the UI as MODELLED.
"""

import numpy as np

import fia_2026_regs as regs

G = 9.81

# Non-regulation physics constants. All of these are assumptions and are
# surfaced in API output so the frontend can label them MODELLED.
ASSUMPTIONS = {
    'dragAreaCda': {'value': 1.30, 'unit': 'm^2', 'note': 'Cd*A in race trim, low-downforce ~ medium'},
    'rollingResistance': {'value': 0.008, 'unit': '-', 'note': 'Crr for racing slicks on smooth tarmac'},
    'drivetrainEfficiency': {'value': 0.95, 'unit': '-', 'note': 'wheel power / engine+ERS power when propelling'},
    'iceThermalEfficiency': {'value': 0.48, 'unit': '-', 'note': 'fuel energy -> mechanical, modern F1 ICE'},
    'regenEfficiency': {'value': 0.85, 'unit': '-', 'note': 'wheel braking power -> harvested DC energy'},
    'dischargeEfficiency': {'value': 0.92, 'unit': '-', 'note': 'ES DC energy -> ERS-K output'},
    'chargeEfficiency': {'value': 0.88, 'unit': '-', 'note': 'harvested DC energy -> stored ES energy'},
    'airDensityFallback': {'value': 1.15, 'unit': 'kg/m^3', 'note': 'used when no session weather data'},
    'auxiliaryLoadKw': {'value': 30.0, 'unit': 'kW', 'note': 'cooling/hydraulics/electronics carried by the ICE'},
    'fuelStartMassKg': {
        'value': None, 'unit': 'kg',
        'note': 'year-dependent: 2026 ~70 kg (reg target), 2018-2025 110 kg allowance',
    },
}


def fuel_start_mass_kg(year):
    entry = regs.MAX_FUEL_START_KG.get(year) or regs.MAX_FUEL_START_KG['default']
    return entry['value']


def air_density_from_weather(weather):
    """Ideal-gas density with humidity correction; returns None if unusable."""
    if weather is None:
        return None
    try:
        temp_c = float(weather.get('airTempC'))
        pressure_mbar = float(weather.get('pressureMbar'))
    except (TypeError, ValueError):
        return None
    if not (0.0 < temp_c < 50.0 and 800.0 < pressure_mbar < 1100.0):
        return None
    temp_k = temp_c + 273.15
    humidity = float(weather.get('humidityPct') or 0.0) / 100.0
    sat_pressure_pa = 610.94 * np.exp(17.625 * temp_c / (temp_c + 243.04))
    vapor_pa = humidity * sat_pressure_pa
    dry_pa = pressure_mbar * 100.0 - vapor_pa
    return dry_pa / (287.058 * temp_k) + vapor_pa / (461.495 * temp_k)


def _smooth(values, window_samples):
    window_samples = max(1, int(window_samples))
    kernel = np.ones(window_samples) / window_samples
    return np.convolve(values, kernel, mode='same')


def compute_lap_energy(trace, *, year, lap_fraction=0.5, weather=None,
                       soc_start_mj=None, override_windows=None, high_speed_kph=140.0):
    """Compute the energy trace for one lap.

    trace: dict with arrays 'time' (s), 'speed' (kph), 'throttle' (0-100),
           'brake' (bool), 'rpm'.
    lap_fraction: fraction of the race already completed (0-1), used only to
        estimate fuel mass on board.
    override_windows: list of [start_m, end_m] distance ranges where Override
        Mode is assumed active (per-event lines are unpublished; when None the
        envelope is evaluated in normal mode and flagged as an assumption).
    Returns a dict with per-sample arrays (aligned to the input sampling) and
    lap-level totals.
    """
    time = np.asarray(trace['time'], dtype=float)
    speed_kph = np.asarray(trace['speed'], dtype=float)
    throttle = np.asarray(trace['throttle'], dtype=float) / 100.0
    brake = np.asarray(trace['brake'], dtype=bool)
    n = len(time)
    rpm_source = trace.get('rpm')
    rpm = np.asarray(rpm_source if rpm_source is not None else np.full(n, 10500.0), dtype=float)
    distance_source = trace.get('distance')
    distance = np.asarray(distance_source if distance_source is not None else np.zeros(n), dtype=float)
    if n < 5:
        raise ValueError('telemetry trace too short')

    dt = np.diff(time, prepend=time[0] - 0.02)
    dt = np.clip(dt, 0.01, 0.5)

    v = speed_kph / 3.6
    sample_hz = 1.0 / float(np.median(dt[1:]) if n > 1 else 0.02)
    v_smooth = _smooth(v, max(3, round(sample_hz * 0.25)))
    # Strictly increasing coordinates guard against duplicate telemetry stamps.
    t_coord = np.maximum.accumulate(time) + np.arange(n) * 1e-4
    a = np.gradient(v_smooth, t_coord)

    fuel_kg = fuel_start_mass_kg(year) * max(0.0, 1.0 - lap_fraction)
    mass = (regs.CONSTANTS['minimum_mass_race_kg']['value']
            + regs.MINIMUM_TYRE_MASS_KG['value']
            + regs.CONSTANTS['driver_reference_mass_min_kg']['value']
            + fuel_kg)

    rho = air_density_from_weather(weather)
    rho_assumed = rho is None
    if rho is None:
        rho = ASSUMPTIONS['airDensityFallback']['value']

    cda = ASSUMPTIONS['dragAreaCda']['value']
    crr = ASSUMPTIONS['rollingResistance']['value']
    eta_drive = ASSUMPTIONS['drivetrainEfficiency']['value']
    eta_ice = ASSUMPTIONS['iceThermalEfficiency']['value']
    eta_regen = ASSUMPTIONS['regenEfficiency']['value']
    eta_out = ASSUMPTIONS['dischargeEfficiency']['value']
    eta_in = ASSUMPTIONS['chargeEfficiency']['value']

    p_wheel = (mass * a + 0.5 * rho * cda * v ** 2 + crr * mass * G) * v  # W

    ers_cap_kw = regs.CONSTANTS['ers_k_dc_power_max_kw']['value']
    soc_window = regs.CONSTANTS['es_soc_window_mj']['value']
    harvest_cap_mj = regs.CONSTANTS['harvest_max_mj_per_lap']['value']

    soc = soc_window * 0.7 if soc_start_mj is None else float(soc_start_mj)
    soc = float(np.clip(soc, 0.0, soc_window))

    p_elec_kw = np.zeros(n)
    p_ice_kw = np.zeros(n)
    p_harvest_kw = np.zeros(n)
    soc_trace = np.zeros(n)
    clipping = np.zeros(n, dtype=bool)
    harvest_lap_mj = 0.0
    deploy_full_throttle_mj = 0.0
    harvest_high_speed_mj = 0.0

    override_windows = override_windows or []

    for i in range(n):
        in_override = any(start <= distance[i] <= end for start, end in override_windows)
        envelope_kw = regs.propulsion_envelope_kw(speed_kph[i], override=in_override)

        braking = brake[i] and a[i] < -5.0
        if braking:
            p_reg_kw = min(ers_cap_kw, max(0.0, -p_wheel[i]) / 1000.0 * eta_regen)
            if harvest_lap_mj + p_reg_kw * dt[i] / 1000.0 > harvest_cap_mj:
                p_reg_kw = max(0.0, (harvest_cap_mj - harvest_lap_mj) * 1000.0 / dt[i])
            p_harvest_kw[i] = p_reg_kw
            harvest_lap_mj += p_reg_kw * dt[i] / 1000.0
            if speed_kph[i] > high_speed_kph:
                harvest_high_speed_mj += p_reg_kw * dt[i] / 1000.0
            soc = min(soc_window, soc + p_reg_kw * dt[i] / 1000.0 * eta_in)
        else:
            demand_kw = max(0.0, p_wheel[i]) / 1000.0 / eta_drive if p_wheel[i] > 0 else 0.0
            ice_ceiling_kw = regs.ice_power_ceiling_kw(rpm[i], eta_ice) * max(0.2, throttle[i])
            propulsion_kw = min(ice_ceiling_kw, demand_kw)
            p_ice_kw[i] = min(ice_ceiling_kw, propulsion_kw + ASSUMPTIONS['auxiliaryLoadKw']['value'])
            remaining = max(0.0, demand_kw - propulsion_kw)
            deploy_target_kw = min(remaining, ers_cap_kw, envelope_kw)
            # Battery protection: taper deployment below 15% SoC to keep an
            # end-of-straight reserve (avoids unrealistic deep clipping).
            if soc < 0.15 * soc_window:
                deploy_target_kw *= soc / (0.15 * soc_window)
            deploy_kw = min(deploy_target_kw, soc / dt[i] * 1000.0 * eta_out) if dt[i] > 0 else 0.0
            if deploy_kw < deploy_target_kw - 1.0 and throttle[i] > 0.9:
                clipping[i] = True
            p_elec_kw[i] = deploy_kw
            if throttle[i] > 0.9:
                deploy_full_throttle_mj += deploy_kw * dt[i] / 1000.0
            soc = max(0.0, soc - deploy_kw * dt[i] / 1000.0 / eta_out)
        soc_trace[i] = soc

    fuel_mj = np.sum(p_ice_kw * dt) / 1000.0 / eta_ice
    deploy_mj = np.sum(p_elec_kw * dt) / 1000.0
    harvest_mj = np.sum(p_harvest_kw * dt) / 1000.0
    clip_s = float(np.sum(dt[clipping]))

    return {
        'trace': {
            'time': time,
            'distance': distance,
            'speedKph': speed_kph,
            'pElecKw': p_elec_kw,
            'pIceKw': p_ice_kw,
            'pHarvestKw': p_harvest_kw,
            'socMj': soc_trace,
            'clipping': clipping,
        },
        'summary': {
            'carMassKg': round(mass, 1),
            'fuelOnBoardKg': round(fuel_kg, 1),
            'airDensityKgM3': round(rho, 3),
            'airDensityAssumed': rho_assumed,
            'deployMj': round(deploy_mj, 3),
            'harvestMj': round(harvest_mj, 3),
            'fuelEnergyMj': round(fuel_mj, 2),
            'netSocDeltaMj': round(float(soc_trace[-1] - (soc_window * 0.7 if soc_start_mj is None else soc_start_mj)), 3),
            'socStartMj': round(soc_window * 0.7 if soc_start_mj is None else soc_start_mj, 3),
            'socEndMj': round(float(soc_trace[-1]), 3),
            'socWindowMj': soc_window,
            'clipSeconds': round(clip_s, 2),
            'harvestCapMj': harvest_cap_mj,
            'deployFullThrottleMj': round(deploy_full_throttle_mj, 3),
            'harvestHighSpeedMj': round(harvest_high_speed_mj, 3),
        },
        'assumptions': ASSUMPTIONS,
        'citations': {
            'ersCapKw': regs.CONSTANTS['ers_k_dc_power_max_kw']['citation'],
            'socWindowMj': regs.CONSTANTS['es_soc_window_mj']['citation'],
            'harvestCapMj': regs.CONSTANTS['harvest_max_mj_per_lap']['citation'],
            'propulsionEnvelope': regs.CONSTANTS['override_activation']['citation'],
            'minimumMass': regs.CONSTANTS['minimum_mass_race_kg']['citation'],
            'driverMass': regs.CONSTANTS['driver_reference_mass_min_kg']['citation'],
        },
    }
