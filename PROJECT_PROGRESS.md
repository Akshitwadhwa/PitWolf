# PitWolf — what we have, what changed, how we demo

Snapshot for the team. The **stated product idea** is:

> Build a decision engine that recommends energy-deployment modes and scores the risk–reward of overtake windows. Balance a short speed boost against long-term battery and rule compliance.

We do **not** have a live Saturday/Sunday pit-wall feed. What we have is a **replay + modelled-energy + historical-model** cockpit on completed races.

---

## 1. How much of the main idea is finished

Treat this as honesty for judges / teammates, not a marketing slide.

| Piece of the idea | Status | Roughly |
|---|---|---|
| Interactive strategy dashboard | Done (landing → sim + strategy tabs) | **Yes** |
| Recommend deploy modes (ATTACK / SAVE / DELAY, plus HOLD / PUSH in the sim HUD) | Done as models + rules, not as a proven better policy than “always save” | **~70%** |
| Risk–reward of an overtake window | Done: gap, DRS wait, 6-lap tree, net-gain forests | **~65%** |
| Battery / energy in the decision | **Partial.** Modelled SoC, C5.2 clip, leftover %. The BATTERY.md contract (0–1 randomness moving overtake %) is **specified, not fully wired** | **~40%** |
| “Where is energy being spent?” | Inferred from throttle / speed / brake + physics, not team deploy maps | **~50%** |
| Rule compliance (DRS / 2026 Overtake Mode) | Eligibility + FIA lines when cited; not a live legal command | **~50%** |
| **Real-time** live race | Replay of a finished session only | **Not done** |
| Train on all 2018–2025, evaluate 2026 | Data mostly fetched; not every race has decision-points / replay / trained artifacts | **~60% data, ~40% pipeline** |

**Overall vs the written brief: about half to two-thirds.**  
Strong demo of *explainable strategy on historical state*. Weak if someone expects *live battery telemetry* or *a model that beats always-SAVE*.

---

## 2. What we have actually built

### Product UI
- Landing page → **Simulation Replay** (cars on a real circuit, play / jump / branch).
- **Strategy dashboard**: TRACK, TELEMETRY, STRATEGY, ENERGY, OVERTAKE, VALIDATION.
- One always-on demo race: **2023 Las Vegas, LEC vs PER** (bundled JSON, rule engine, energy trace).
- Sim HUD: selected driver vs car ahead vs a comparison car, **modelled ES %**, HOLD / PUSH copy from the recommend model.

### Backend / models
- FastF1 session prefetch and JSON cache.
- Energy: `energyModel.js`, `energy_model.py`, `energy_transition.py`, `c52_battery.py`.
- Overtake / recommend: decision points, `recommend_rf.joblib` (2018–2025 forests: pushHelps, DRS convert-in-1/2/3, recoverIfLost).
- Replay: `/api/f1/racereplay`, `/api/f1/replay/strategy`, `/api/f1/recommend`.
- Docs: `BATTERY.md` (future battery → overtake %), `TEAMMATE_LOCAL_DATA.md` (how another laptop gets data).

### Data on the machine that ran prefetch (not in git)

| | Count |
|---|---|
| Session JSONs | **~877** |
| Race JSONs | **~177** |
| 2026 completed GPs | **13 / 13** (Australia → Italy) |
| 2024 races | **24 / 24** |
| 2025 races | **18** (prefetch stopped mid-season) |
| Decision-point files | **11 races** |
| Full race replays built | **2026 Australia, 2026 Barcelona** |
| Recommend model | **`recommend_rf.joblib` + report** on that machine |

**Fully designed race:** Las Vegas 2023.  
**Sim you can play today (if cache is local):** 2026 Australia, 2026 Barcelona.  
**Everything else:** downloaded laps/results, or extract-on-demand.

---

## 3. What we changed (this stretch of work)

- Shifted from “Vegas-only prototype” to **FastF1-backed sim + strategy tabs**.
- Prefetch: 2018–2025 corpus, then **2026 completed weekends first**.
- Fixed “race not available” when sessions existed but **`events` cache still said `raceDataAvailable: false`**.
- Sim HUD recommendations from **`score_recommend.py`** (not the old hardcoded radio UI).
- Wrote **`BATTERY.md`**: when battery is finished, selected-driver SoC + a `0…1` draw will raise/lower overtake % and change ATTACK / SAVE.
- Wrote **`TEAMMATE_LOCAL_DATA.md`**: cache is gitignored; teammates must prefetch + train locally or they see empty / “data not available”.

---

## 4. How we are going to demo it (~3 minutes)

**Say this first:**  
“We replay a finished race. Energy is modelled under published rules. We do not read the team’s real battery.”

1. **Landing** (10s) — PitWolf, energy & overtake intelligence. Open simulation.
2. **2026 Australian GP** (or Vegas if their laptop has no cache) — play cars, pick **RUS** (or LEC on Vegas).
3. **This-lap facts** — “LEC is 0.77s ahead, inside DRS. That’s real timing.”
4. **Modelled ES** — “91% is our store estimate, started at 100% of the 4 MJ window. Not team SoC.”
5. **HOLD / PUSH** — “A 2018–2025 forest says historical net-gain from this state is ~29%, so HOLD. Same model family as DRS wait 1/2/3 laps.”
6. **Optional JUMP** — freeze a lap, show ATTACK / SAVE / DELAY branch vs what actually happened.
7. **Close** — “Idea: spend vs save vs wait, with a reason. Next: battery modulation in BATTERY.md, rest of 2025, more replays.”

**Do not say:** live optimizer, real ERS %, we trained on every race, we beat always-SAVE.

**If their machine is empty:** open **Vegas dashboard** from the bundled JSON, then point at `TEAMMATE_LOCAL_DATA.md`.

---

## 5. What is still open

- Prefetch **rest of 2025**; rebuild events after new sessions.
- Decision-points + race-replay for more than Australia / Barcelona / Vegas.
- Wire **BATTERY.md** into `score_recommend` / the tactical tree.
- Teammate laptops: they must run the teammate doc; we cannot push the cache.
- Honest validation: forests are useful explanations, not a certified better race policy.

---

## 6. Related files

| File | Use |
|---|---|
| `README.md` | Product idea |
| `BATTERY.md` | Battery → overtake % (when implemented) |
| `TEAMMATE_LOCAL_DATA.md` | Commands so another laptop sees the sim |
| `VALIDATION.md` | What we may claim |
| `Simulation.md` | Replay lab design |
