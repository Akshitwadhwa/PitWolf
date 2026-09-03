"""Cheap, race-level battery-state surrogate for overtake decisions.

FastF1 exposes the inputs needed to estimate energy use, but not the team's
actual battery state or deployment map.  This module deliberately uses only
lap-level battle features, so it is cheap enough to attach to every historical
decision point and honest enough to be labelled MODELLED.
"""

import numpy as np
import pandas as pd


SOC_CAPACITY_MJ = 4.0
SOC_START_MJ = 2.8


def _clip(value, low=0.0, high=SOC_CAPACITY_MJ):
    return float(np.clip(value, low, high))


def add_surrogate_energy(df):
    """Add attackerSoCMj, defenderSoCMj and energyDeltaMj to a row frame.

    State is carried once per race/lap/driver.  The update uses pace pressure,
    closing rate, tyre age differential and pit distortion, none of which are
    outcome labels.  Repeated battle rows on the same lap therefore see the
    same pre-lap state rather than draining the battery multiple times.
    """
    if df.empty:
        return df
    df = df.copy()
    for column in ('attackerSoCMj', 'defenderSoCMj', 'energyDeltaMj'):
        df[column] = np.nan

    def numeric_column(frame, column):
        return pd.to_numeric(frame[column], errors='coerce') if column in frame else pd.Series(dtype=float)

    def bounded_mean(frame, column, scale, default):
        values = numeric_column(frame, column).dropna().abs()
        if values.empty:
            return default
        return float(np.clip(float(values.mean()) / scale, 0.0, 1.0))

    race_columns = [column for column in ('year', 'round', 'session') if column in df]
    for _, race in df.groupby(race_columns, sort=False):
        states = {}
        race_lap_times = pd.concat([
            numeric_column(race, 'attackerLapTimeS'),
            numeric_column(race, 'defenderLapTimeS'),
        ]).dropna()
        reference_lap_time = float(race_lap_times.median()) if not race_lap_times.empty else 95.0
        for lap, lap_rows in race.groupby('lap', sort=True):
            drivers = set(lap_rows['driver'].dropna()) | set(lap_rows['defender'].dropna())
            before = {driver: states.get(driver, SOC_START_MJ) for driver in drivers}
            for index, row in lap_rows.iterrows():
                attacker = row.get('driver')
                defender = row.get('defender')
                attacker_soc = before.get(attacker, states.get(attacker, SOC_START_MJ))
                defender_soc = before.get(defender, states.get(defender, SOC_START_MJ))
                df.at[index, 'attackerSoCMj'] = round(attacker_soc, 3)
                df.at[index, 'defenderSoCMj'] = round(defender_soc, 3)
                df.at[index, 'energyDeltaMj'] = round(attacker_soc - defender_soc, 3)

            for driver in drivers:
                driver_rows = lap_rows[(lap_rows['driver'] == driver) | (lap_rows['defender'] == driver)]
                pressure = bounded_mean(driver_rows, 'speedDeltaKph', 30.0, 0.35)
                closing = bounded_mean(driver_rows, 'closingRateS', 3.0, 0.25)
                tyre_load = min(0.4, bounded_mean(driver_rows, 'tyreAgeDiff', 20.0, 0.0))
                lap_time = pd.concat([
                    numeric_column(driver_rows, 'attackerLapTimeS'),
                    numeric_column(driver_rows, 'defenderLapTimeS'),
                ]).dropna()
                pace = 0.5
                if not lap_time.empty:
                    pace = float(np.clip(0.5 + ((reference_lap_time - float(lap_time.mean())) / 10.0), 0.1, 0.9))
                deploy = 0.18 + (0.25 * pressure) + (0.12 * closing) + (0.22 * pace) + tyre_load
                harvest = 0.30 + (0.18 * (1.0 - pressure))
                next_soc = _clip(before.get(driver, states.get(driver, SOC_START_MJ)) - deploy + harvest)
                if bool(driver_rows['pitDistorted'].fillna(False).any()):
                    next_soc = _clip(next_soc + 1.0)
                states[driver] = next_soc

    return df
