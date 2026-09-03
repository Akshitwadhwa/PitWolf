# PitWolf - Requirements and Reproducible Setup

This document describes the complete local setup used by PitWolf. The frontend,
backend, Python environment, FastF1 cache, generated decision-point data, and
trained model must all be prepared consistently on every developer machine.

## 1. What the project contains

PitWolf has two application layers:

- `frontend/` - React and Vite strategy cockpit.
- `backend/` - Node.js API that serves the frontend and starts Python data/model
  scripts.

The current strategy workflow uses:

- FastF1 race laps, telemetry, tyres, positions, results, and track data.
- A Random Forest overtake classifier.
- A modelled dual-driver battery state estimate.
- ATTACK, SAVE, and DELAY recommendations.
- A recursive tactical tree that evaluates three actions per lap.
- Opponent energy as a repass-risk feature.
- A six-lap persistence objective, shortened automatically near the finish.

Energy values are modelled estimates, not publicly measured team battery data.

## 2. Required software

Use the following setup on Windows:

- Git
- Node.js with npm
- Python 3.13.x, matching the current development environment
- Internet access for FastF1/OpenF1 data downloads
- At least 30 GB of free disk space for the local FastF1 cache and generated
  artifacts

Do not commit the FastF1 cache to Git. It is intentionally ignored because it is
large, machine-generated, and reproducible.

## 3. Get the correct source branch

The latest source changes must first be committed and pushed by the developer
who made them. A teammate cannot receive uncommitted working-tree changes.

After the branch exists on GitHub, the teammate should run:

```powershell
git fetch origin
git switch <exact-branch-name>
git pull --ff-only origin <exact-branch-name>
```

If the work has been merged into `main`, use:

```powershell
git switch main
git pull --ff-only origin main
```

The frontend recursive strategy tree and `backend/scripts/energy_surrogate.py`
must be present in the pulled source before continuing.

## 4. Install JavaScript dependencies

From the repository root:

```powershell
npm install
```

This installs React, Vite, Three.js, Supabase, and the other JavaScript
dependencies. It does not install FastF1 or any Python packages.

## 5. Create the Python environment

From the repository root:

```powershell
py -3.13 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements-data.txt
```

The tracked Python dependency file is:

```text
backend/requirements-data.txt
```

It installs the required data and modelling packages:

- `fastf1>=3.8,<4`
- `pandas>=2.2,<3`
- `numpy>=1.26,<3`
- `scikit-learn>=1.5,<2`
- `duckdb==1.5.5`

Verify that the active Python is the virtual environment:

```powershell
Get-Command python
python -c "import fastf1, pandas, numpy, sklearn; print(fastf1.__version__)"
```

The command should resolve Python from `backend\.venv\Scripts\python.exe`.
Always activate this environment before starting the backend, because the Node
server launches Python using the `python` command on its PATH.

## 6. Environment variables

The core FastF1 dashboard works without API keys. Optional environment files
are available as templates:

```text
.env.example
backend/.env.example
frontend/.env.example
```

For the local frontend/backend connection, the default values are:

```text
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:8787
```

Optional Supabase variables support application history features. Optional
Hugging Face variables support radio/transcription features. Never commit real
tokens or passwords.

## 7. Recreate the local FastF1 data

The following directory is ignored by Git:

```text
backend/data/f1-cache/
```

It may contain:

- FastF1 raw API cache
- session and lap JSON
- telemetry JSON
- track-map JSON
- decision-point JSON
- trained model files
- model reports

Each developer must recreate it locally.

### Complete training dataset

To extract race decision points for the historical training window:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\batch_extract_decision_points.py `
  --start-year 2018 `
  --end-year 2025 `
  --hold-laps 6
```

This is a long-running, resumable process. It downloads data through FastF1,
uses local caching, and may be limited by upstream API availability.

The intended temporal split is:

```text
Training: 2018-2025
Final evaluation: completed 2026 races
```

Do not use 2026 rows to train the final model that is evaluated on those same
2026 races.

### Las Vegas demonstration data only

For the 2023 Las Vegas demo:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\extract_decision_points.py `
  --year 2023 `
  --round 21 `
  --session R `
  --hold-laps 6
```

Other telemetry, session, energy, and track-map data is fetched on demand by
the backend and then cached locally.

## 8. Train the local model

After the 2018-2025 decision-point extraction has completed:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\train_overtake_model.py `
  --test-from 2026 `
  --n-jobs 1
```

This generates ignored files under:

```text
backend/data/f1-cache/models/overtake_rf.joblib
backend/data/f1-cache/models/overtake_report.json
```

The model uses the historical battle features plus modelled energy features:

- gap and closing rate
- speed delta
- tyre age and compound
- lap fraction and position
- race pace
- Overtake/DRS eligibility feature
- estimated car mass
- attacker SoC
- defender SoC
- energy difference

The `.joblib` model is generated locally and is not supplied by `npm install`.

## 9. Start the application

Use two terminals.

### Terminal 1 - backend

```powershell
cd C:\path\to\PitWolf
backend\.venv\Scripts\Activate.ps1
npm run server
```

The backend should report:

```text
Pitwall API listening on http://localhost:8787
```

### Terminal 2 - frontend

```powershell
cd C:\path\to\PitWolf
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/
```

## 10. Verify the installation

Run these checks from the repository root:

```powershell
npm run build
node --check backend/server.mjs
Invoke-WebRequest http://127.0.0.1:8787/api/health -UseBasicParsing
```

For the model-backed dashboard, also verify that these files exist locally:

```text
backend/data/f1-cache/decision-points/
backend/data/f1-cache/models/overtake_rf.joblib
backend/data/f1-cache/models/overtake_report.json
```

## 11. Common errors

### `spawn python ENOENT`

Python is not on PATH. Activate `backend\.venv`, or run the backend from a
terminal where `Get-Command python` points to the virtual environment.

### `ModuleNotFoundError: No module named 'fastf1'`

FastF1 was installed into a different Python environment. Activate the venv
and reinstall with:

```powershell
python -m pip install -r backend\requirements-data.txt
```

### `ENOENT` for a cache or model file

The ignored FastF1 cache or trained model has not been generated on that
machine. Run the extraction and training commands in this document.

### `model not trained yet`

The decision-point JSON may exist, but
`backend/data/f1-cache/models/overtake_rf.joblib` does not. Train the model
locally.

### `ENOTFOUND`, timeout, or proxy errors

FastF1 is trying to reach an upstream data source and the network/DNS/proxy is
unavailable. Retry when the connection is available; cached sessions can still
be used once downloaded.

### `ECONNREFUSED`

The frontend cannot reach the backend. Confirm that `npm run server` is running
on port `8787`.

## 12. Important reproducibility rules

- Use the same Python dependency file on every machine.
- Activate the same virtual environment before starting the backend.
- Do not copy or commit `backend/data/f1-cache/` through normal Git.
- Rebuild the cache from the same FastF1 extraction commands.
- Use the same `--hold-laps 6` value when comparing datasets.
- Keep 2026 evaluation races separate from final training.
- Label battery state as `MODELLED`; FastF1 does not expose the teams’ actual
  battery state of charge.
- Treat the recursive tree as a tactical counterfactual estimate, not proof of
  what a driver definitely would have achieved.

## 13. Files that must be tracked in Git

The repository should include the source and dependency files, including:

```text
package.json
package-lock.json
backend/package.json
backend/requirements-data.txt
backend/scripts/*.py
backend/server.mjs
frontend/package.json
frontend/src/
```

The repository should not require a checked-in local Python environment,
FastF1 raw cache, generated telemetry cache, or machine-specific `.env` file.
