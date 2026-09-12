# Teammate setup — Simulation + HOLD recommendations

Git does **not** include race data. `backend/data/f1-cache/` is gitignored. On a fresh laptop the Simulation page shows **RECORDED REPLAY NOT AVAILABLE YET** and the HOLD / RandomForest panel is empty until you build the cache **on that machine**.

This is the checklist for the area in the sim HUD (selected driver, modelled ES, HOLD / PUSH).

## What you must have locally

| Path | Why |
|---|---|
| `backend/data/f1-cache/sessions/YEAR/ROUND_race.json` | Race exists |
| `backend/data/f1-cache/events/v3/YEAR.json` | Sim flag `raceDataAvailable` (rebuilt after sessions exist) |
| `backend/data/f1-cache/race-replay/v1/YEAR/ROUND_race.json` | Cars on the map (or first open builds it) |
| `backend/data/f1-cache/models/recommend_rf.joblib` | HOLD / DRS / net-gain text |
| `backend/data/f1-cache/models/recommend_report.json` | Holdout AUC line |

Need **at least 8 race JSONs from 2018–2025** to train `recommend_rf.joblib`. 2026 races are for replay, not for that training set.

---

## 1. Repo, Node, Python

From the repo root (macOS / Linux):

```bash
git pull
npm install

python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements-data.txt
python -c "import fastf1, sklearn, joblib; print(fastf1.__version__)"
```

Windows (PowerShell):

```powershell
git pull
npm install

py -3.13 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements-data.txt
```

The Node server must be able to run **`python`**. Either activate the venv in the same terminal as `npm run server`, or put `backend/.venv/bin` (or `backend\.venv\Scripts`) on `PATH`.

---

## 2. Download races (FastF1)

Still in the venv, from `backend/scripts`:

**Minimum to train + open one 2026 race** (skips files you already have):

```bash
cd backend/scripts

# Enough 2018–2025 Race files to train (this is slow; 500 FastF1 calls/hour)
python prefetch_f1.py --start-year 2018 --end-year 2019

# Completed 2026 weekends (Australia → latest finished GP)
python prefetch_f1.py --start-year 2026 --end-year 2026
```

Windows: use `python` the same way after activating the venv.

To fill more later:

```bash
python prefetch_f1.py --start-year 2018 --end-year 2026
```

Check:

```bash
# macOS / Linux
find ../data/f1-cache/sessions -name '*_race.json' | wc -l
ls ../data/f1-cache/sessions/2026
```

You want several `2018`/`2019` `*_race.json` files **and** `sessions/2026/1_race.json` (Australia).

---

## 3. Train the HOLD / RandomForest model

Needs those 2018–2025 `*_race.json` files (minimum 8):

```bash
cd backend/scripts
python train_driver_recommend.py
```

Writes:

```text
backend/data/f1-cache/models/recommend_rf.joblib
backend/data/f1-cache/models/recommend_report.json
```

If you see `need more 2018-2025 cached races`, prefetch more years (2020–2024) and run train again.

---

## 4. Tell the sim the race is actually there

The events list is cached. If you opened the app **before** prefetch finished, delete it and rebuild:

```bash
rm -f ../data/f1-cache/events/v2/2026.json ../data/f1-cache/events/v3/2026.json
python fetch_f1_events.py --year 2026 > ../data/f1-cache/events/v3/2026.json
```

Windows:

```powershell
Remove-Item -ErrorAction SilentlyContinue ..\data\f1-cache\events\v2\2026.json, ..\data\f1-cache\events\v3\2026.json
New-Item -ItemType Directory -Force -Path ..\data\f1-cache\events\v3 | Out-Null
python fetch_f1_events.py --year 2026 | Set-Content ..\data\f1-cache\events\v3\2026.json
```

`raceDataAvailable` must be `true` for Australia (round 1). If it is still `false`, the UI will keep saying the race has not happened.

---

## 5. Optional — pre-build the Australia replay

First Play in the UI can take several minutes (GPS / timing). To do it ahead of time:

```bash
cd backend/scripts
python fetch_f1_replay_window.py --year 2026 --round 1 --session Race --full-race \
  > ../data/f1-cache/race-replay/v1/2026/1_race.json
```

Create the folder first if needed:

```bash
mkdir -p ../data/f1-cache/race-replay/v1/2026
```

---

## 6. Run the app

Two terminals, repo root:

```bash
# terminal 1 — venv activated so `python` works
source backend/.venv/bin/activate   # Windows: backend\.venv\Scripts\Activate.ps1
npm run server
```

```bash
# terminal 2
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) → **OPEN PITWOLF SIMULATION** → year **2026** → **Australian Grand Prix**.

Hard-refresh the browser if you still see the old “not available” screen.

---

## 7. Quick checks

```bash
curl -s "http://127.0.0.1:8787/api/f1/events?year=2026" | python -c \
  "import sys,json; e=next(x for x in json.load(sys.stdin)['events'] if x['round']==1); print(e['name'], e['raceDataAvailable'])"
```

Should print `Australian Grand Prix True`.

```bash
ls backend/data/f1-cache/models/recommend_rf.joblib
```

If that file is missing, the map may load but HOLD / RandomForest text will not.

---

## FastF1 limits

The API allows about **500 calls/hour**. Prefetch will pause and retry. Leave it running. Do not start two prefetches at once.

## Do not commit the cache

Never add `backend/data/f1-cache/` to git. Each laptop rebuilds it with the commands above (or copy that folder privately on a disk if you share a dump).
