"""Load the 2023 Las Vegas GP race and verify the documented decision points.

Run this before building the scenario export. It confirms that the overtakes we
claim in the validation write-up are actually present in the position data,
rather than taking press reports at face value.
"""

import fastf1
import pandas as pd

import os
CACHE = "analytics/cache"
ATTACKER = "LEC"
DEFENDER = "PER"

os.makedirs(CACHE, exist_ok=True)
fastf1.Cache.enable_cache(CACHE)

session = fastf1.get_session(2023, "Las Vegas", "R")
session.load(telemetry=True, laps=True, weather=True)

print("=" * 70)
print("EVENT:", session.event["EventName"], session.event["EventDate"].date())
print("SESSION:", session.name, "| total laps:", int(session.laps["LapNumber"].max()))
print("=" * 70)

laps = session.laps

# Lap-by-lap classified position for the two drivers of interest, so we can see
# exactly where position changed hands instead of trusting a race report.
print("\nPOSITION BY LAP (last 20 laps)")
print(f"{'Lap':>4} {ATTACKER:>6} {DEFENDER:>6}  {'gap_s':>8}  note")
prev = None
for lap_no in range(31, int(laps["LapNumber"].max()) + 1):
    rows = laps[laps["LapNumber"] == lap_no]
    a = rows[rows["Driver"] == ATTACKER]
    d = rows[rows["Driver"] == DEFENDER]
    if a.empty or d.empty:
        continue
    a_pos = a["Position"].iloc[0]
    d_pos = d["Position"].iloc[0]
    a_t = a["Time"].iloc[0]
    d_t = d["Time"].iloc[0]
    gap = (a_t - d_t).total_seconds() if pd.notna(a_t) and pd.notna(d_t) else float("nan")
    order = f"{ATTACKER} ahead" if a_pos < d_pos else f"{DEFENDER} ahead"
    note = ""
    if prev is not None and prev != order:
        note = f"<<< POSITION CHANGE -> {order}"
    prev = order
    print(f"{lap_no:>4} {a_pos:>6.0f} {d_pos:>6.0f}  {gap:>8.3f}  {note}")

print("\nFINAL CLASSIFICATION (top 5)")
res = session.results[["Abbreviation", "Position", "Time", "Status"]].head(5)
print(res.to_string(index=False))

# Confirm telemetry channels actually exist on the final lap for both drivers.
final_lap = int(laps["LapNumber"].max())
print(f"\nTELEMETRY AVAILABILITY ON LAP {final_lap}")
for code in (ATTACKER, DEFENDER):
    lap = laps.pick_drivers(code).pick_laps(final_lap).iloc[0]
    tel = lap.get_telemetry().add_distance()
    have = [c for c in ("Speed", "Throttle", "Brake", "nGear", "RPM", "DRS", "X", "Y") if c in tel]
    print(f"  {code}: {len(tel):>5} samples | distance {tel['Distance'].max():.0f} m | channels: {', '.join(have)}")
    print(f"      speed {tel['Speed'].min():.0f}-{tel['Speed'].max():.0f} km/h | DRS values seen: {sorted(tel['DRS'].unique().tolist())}")
