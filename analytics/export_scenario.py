"""Export the 2023 Las Vegas GP final-lap scenario as a compact JSON file.

Everything written here is either loaded from FastF1 (marked "real") or computed
from those loaded values (marked "derived"). The energy layer is deliberately
absent: ERS deployment and battery state of charge are not public, so that layer
stays in the frontend where it is labelled SIMULATED.

Usage:
    analytics/.venv/bin/python analytics/export_scenario.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd

CACHE = Path("analytics/cache")
OUT = Path("frontend/src/data/scenarios/las-vegas-2023-lec-per.json")

YEAR, EVENT, SESSION = 2023, "Las Vegas", "R"
ATTACKER, DEFENDER = "LEC", "PER"
FOCUS_LAP = 50
GRID_POINTS = 240

# FastF1 encodes DRS as a status code; 10/12/14 mean the flap is open.
DRS_ACTIVE = {10, 12, 14}
DRS_ELIGIBLE = {8}


def channel_on_grid(tel, column, grid):
    """Interpolate one telemetry channel onto a shared distance grid."""
    values = tel[column].to_numpy()
    if np.issubdtype(values.dtype, np.timedelta64):
        values = values.astype("timedelta64[ns]").astype("float64") / 1e9
    return np.interp(grid, tel["Distance"].to_numpy(), values.astype("float64"))


def lap_telemetry(laps, code, lap_number):
    lap = laps.pick_drivers(code).pick_laps(lap_number).iloc[0]
    tel = lap.get_telemetry().add_distance()
    tel = tel[tel["Distance"] >= 0].reset_index(drop=True)
    return lap, tel


def braking_zones(distance, brake, min_length_m=25):
    """Contiguous spans where the brake pedal is applied."""
    zones, start = [], None
    for i, applied in enumerate(brake > 0):
        if applied and start is None:
            start = i
        elif not applied and start is not None:
            if distance[i - 1] - distance[start] >= min_length_m:
                zones.append((start, i - 1))
            start = None
    if start is not None and distance[-1] - distance[start] >= min_length_m:
        zones.append((start, len(distance) - 1))
    return [
        {
            "start_m": round(float(distance[a]), 1),
            "end_m": round(float(distance[b]), 1),
            "length_m": round(float(distance[b] - distance[a]), 1),
            "peak_brake": round(float(np.max(brake[a : b + 1])), 1),
            "entry_speed_kph": None,
        }
        for a, b in zones
    ]


def main():
    fastf1.Cache.enable_cache(str(CACHE))
    session = fastf1.get_session(YEAR, EVENT, SESSION)
    session.load(telemetry=True, laps=True, weather=True)
    laps = session.laps
    total_laps = int(laps["LapNumber"].max())

    atk_lap, atk_tel = lap_telemetry(laps, ATTACKER, FOCUS_LAP)
    def_lap, def_tel = lap_telemetry(laps, DEFENDER, FOCUS_LAP)

    lap_length = float(min(atk_tel["Distance"].max(), def_tel["Distance"].max()))
    grid = np.linspace(0.0, lap_length, GRID_POINTS)

    # Gap is derived, not measured: for each point on the lap we compare the
    # session time at which each car reached that same distance. A positive
    # value means the attacker is that many seconds behind.
    gap = channel_on_grid(atk_tel, "SessionTime", grid) - channel_on_grid(def_tel, "SessionTime", grid)

    def elapsed_on_grid(tel, lap):
        session_t = channel_on_grid(tel, "SessionTime", grid)
        start = float(lap["LapStartTime"].total_seconds()) if pd.notna(lap["LapStartTime"]) else float(session_t[0])
        return session_t - start

    def seconds(value):
        return None if pd.isna(value) else round(float(value.total_seconds()), 3)

    series = {}
    elapsed = {}
    for label, tel, lap in (("attacker", atk_tel, atk_lap), ("defender", def_tel, def_lap)):
        drs_raw = channel_on_grid(tel, "DRS", grid)
        elapsed[label] = elapsed_on_grid(tel, lap)
        series[label] = {
            "speed_kph": [round(float(v), 1) for v in channel_on_grid(tel, "Speed", grid)],
            "throttle_pct": [round(float(v), 1) for v in channel_on_grid(tel, "Throttle", grid)],
            "brake_pct": [round(float(v) * 100.0, 1) for v in channel_on_grid(tel, "Brake", grid)],
            "gear": [int(round(float(v))) for v in channel_on_grid(tel, "nGear", grid)],
            "rpm": [int(round(float(v))) for v in channel_on_grid(tel, "RPM", grid)],
            "drs_active": [bool(int(round(v)) in DRS_ACTIVE) for v in drs_raw],
            "x": [round(float(v), 1) for v in channel_on_grid(tel, "X", grid)],
            "y": [round(float(v), 1) for v in channel_on_grid(tel, "Y", grid)],
            "elapsed_s": [round(float(v), 3) for v in elapsed[label]],
        }

    atk_speed = np.array(series["attacker"]["speed_kph"])
    def_speed = np.array(series["defender"]["speed_kph"])
    atk_brake = np.array(series["attacker"]["brake_pct"])

    zones = braking_zones(grid, atk_brake)
    for zone in zones:
        idx = int(np.argmin(np.abs(grid - zone["start_m"])))
        zone["entry_speed_kph"] = round(float(atk_speed[idx]), 1)

    # Real position changes between these two drivers, straight from the
    # classified position column. These are the observable decision points.
    changes = []
    prev = None
    for lap_no in range(1, total_laps + 1):
        rows = laps[laps["LapNumber"] == lap_no]
        a = rows[rows["Driver"] == ATTACKER]
        d = rows[rows["Driver"] == DEFENDER]
        if a.empty or d.empty or pd.isna(a["Position"].iloc[0]) or pd.isna(d["Position"].iloc[0]):
            continue
        a_pos, d_pos = float(a["Position"].iloc[0]), float(d["Position"].iloc[0])
        leader = ATTACKER if a_pos < d_pos else DEFENDER
        if prev is not None and leader != prev:
            before = laps[(laps["LapNumber"] == lap_no - 1)]
            ba = before[before["Driver"] == ATTACKER]
            bd = before[before["Driver"] == DEFENDER]
            prior_gap = None
            if not ba.empty and not bd.empty:
                ta, td = ba["Time"].iloc[0], bd["Time"].iloc[0]
                if pd.notna(ta) and pd.notna(td):
                    prior_gap = round(abs((ta - td).total_seconds()), 3)

            # A position swap is only an on-track pass if neither car was in the
            # pit cycle and they were actually close beforehand. Without this
            # filter, pit stops register as overtakes and inflate the label set.
            pitting = any(
                pd.notna(row[col].iloc[0])
                for row in (a, d, ba, bd)
                if not row.empty
                for col in ("PitInTime", "PitOutTime")
            )
            fresh_tyre = any(
                pd.notna(row["TyreLife"].iloc[0]) and int(row["TyreLife"].iloc[0]) <= 2
                for row in (a, d)
                if not row.empty
            )
            on_track = bool(
                not pitting
                and not fresh_tyre
                and prior_gap is not None
                and prior_gap <= 2.0
            )

            changes.append(
                {
                    "lap": lap_no,
                    "gained_position": leader,
                    "lost_position": prev,
                    "gap_before_s": prior_gap,
                    "on_track_pass": on_track,
                    "excluded_reason": None
                    if on_track
                    else ("pit cycle" if pitting or fresh_tyre else "gap too large"),
                    "attacker_tyre": {
                        "compound": (a["Compound"].iloc[0] if pd.notna(a["Compound"].iloc[0]) else None),
                        "age_laps": (int(a["TyreLife"].iloc[0]) if pd.notna(a["TyreLife"].iloc[0]) else None),
                    },
                    "defender_tyre": {
                        "compound": (d["Compound"].iloc[0] if pd.notna(d["Compound"].iloc[0]) else None),
                        "age_laps": (int(d["TyreLife"].iloc[0]) if pd.notna(d["TyreLife"].iloc[0]) else None),
                    },
                }
            )
        prev = leader

    def timing_for(lap):
        s1, s2, s3 = seconds(lap["Sector1Time"]), seconds(lap["Sector2Time"]), seconds(lap["Sector3Time"])
        return {
            "lap_time_s": seconds(lap["LapTime"]),
            "sector_1_s": s1,
            "sector_2_s": s2,
            "sector_3_s": s3,
        }

    def sector_markers(elapsed_s, timing):
        markers = [{"label": "GRID EXIT", "at_s": 0.0, "index": 0}]
        cumulative = 0.0
        for label, duration in (
            ("S1", timing["sector_1_s"]),
            ("S2", timing["sector_2_s"]),
            ("S3", timing["sector_3_s"]),
        ):
            if duration is None:
                continue
            cumulative += duration
            idx = int(np.argmin(np.abs(elapsed_s - cumulative)))
            markers.append({"label": label, "at_s": round(cumulative, 3), "index": idx})
        return markers

    def pit_extras(code):
        rows = laps.pick_drivers(code)
        extras = []
        pending_in = None
        for _, row in rows.iterrows():
            if pd.notna(row["PitInTime"]):
                pending_in = row
            if pd.notna(row["PitOutTime"]) and pending_in is not None:
                extras.append(
                    {
                        "driver": code,
                        "in_lap": int(pending_in["LapNumber"]),
                        "out_lap": int(row["LapNumber"]),
                        "stationary_s": round(
                            float((row["PitOutTime"] - pending_in["PitInTime"]).total_seconds()),
                            3,
                        ),
                        "compound_in": pending_in["Compound"] if pd.notna(pending_in["Compound"]) else None,
                        "compound_out": row["Compound"] if pd.notna(row["Compound"]) else None,
                    }
                )
                pending_in = None
        return extras

    atk_timing = timing_for(atk_lap)
    def_timing = timing_for(def_lap)

    results = session.results
    def classified(code):
        row = results[results["Abbreviation"] == code].iloc[0]
        return {
            "code": code,
            "name": f"{row['FirstName']} {row['LastName']}",
            "team": row["TeamName"],
            "finish_position": int(row["Position"]),
        }

    payload = {
        "meta": {
            "scenario_id": "las-vegas-2023-lec-per",
            "title": "Leclerc final-lap pass on Perez",
            "event": session.event["EventName"],
            "event_date": str(session.event["EventDate"].date()),
            "session": "Race",
            "circuit": session.event["Location"],
            "total_laps": total_laps,
            "focus_lap": FOCUS_LAP,
            "lap_length_m": round(lap_length, 1),
            "grid_points": GRID_POINTS,
            "source": "FastF1 official timing and car telemetry",
            "fastf1_version": fastf1.__version__,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "provenance": {
                "real": [
                    "speed_kph", "throttle_pct", "brake_pct", "gear", "rpm",
                    "drs_active", "gps x/y", "sector times", "pit in/out times",
                    "tyre compound and age", "classified positions",
                ],
                "derived": [
                    "gap_s", "speed_delta_kph (used as closing rate)", "braking_zones",
                ],
                "simulated": [
                    "energy reserve, recovery, deployment cost - computed in the "
                    "frontend energy model, not present in this file",
                ],
            },
        },
        "attacker": classified(ATTACKER),
        "defender": classified(DEFENDER),
        "distance_m": [round(float(v), 1) for v in grid],
        "attacker_telemetry": series["attacker"],
        "defender_telemetry": series["defender"],
        "derived": {
            "gap_s": [round(float(v), 3) for v in gap],
            "speed_delta_kph": [round(float(a - b), 1) for a, b in zip(atk_speed, def_speed)],
            "braking_zones": zones,
            "attacker_top_speed_kph": round(float(atk_speed.max()), 1),
            "defender_top_speed_kph": round(float(def_speed.max()), 1),
            "attacker_drs_available": bool(any(series["attacker"]["drs_active"])),
            "defender_drs_available": bool(any(series["defender"]["drs_active"])),
        },
        "decision_points": changes,
        "timing": {
            "attacker": atk_timing,
            "defender": def_timing,
            "markers": sector_markers(elapsed["attacker"], atk_timing),
        },
        "pit_extras": pit_extras(ATTACKER) + pit_extras(DEFENDER),
        "outcome": {
            "final_margin_s": round(
                float(
                    results[results["Abbreviation"] == DEFENDER]["Time"].iloc[0].total_seconds()
                    - results[results["Abbreviation"] == ATTACKER]["Time"].iloc[0].total_seconds()
                ),
                3,
            ),
            "position_gained_by": ATTACKER,
            "held_to_finish": True,
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1))

    print(f"wrote {OUT}  ({OUT.stat().st_size / 1024:.1f} KB)")
    print(f"lap length      {lap_length:.0f} m over {GRID_POINTS} points")
    print(f"gap range       {gap.min():.3f}s to {gap.max():.3f}s")
    print(f"top speed       {ATTACKER} {atk_speed.max():.0f} / {DEFENDER} {def_speed.max():.0f} km/h")
    print(f"DRS active      {ATTACKER} {any(series['attacker']['drs_active'])} / {DEFENDER} {any(series['defender']['drs_active'])}")
    print(f"braking zones   {len(zones)}")
    on_track = [c for c in changes if c["on_track_pass"]]
    excluded = [c for c in changes if not c["on_track_pass"]]
    print(f"position swaps  {len(changes)} -> laps {[c['lap'] for c in changes]}")
    print(f"  on-track      {len(on_track)} -> laps {[c['lap'] for c in on_track]}")
    print(f"  excluded      {len(excluded)} -> {[(c['lap'], c['excluded_reason']) for c in excluded]}")
    print(f"lap time        {ATTACKER} {atk_timing['lap_time_s']}s / {DEFENDER} {def_timing['lap_time_s']}s")
    print(f"pit extras      {payload['pit_extras']}")


if __name__ == "__main__":
    main()
