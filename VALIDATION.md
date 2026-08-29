# OverVolt — Validation Methodology

This document describes what the decision engine is, how its thresholds were set,
and what can and cannot honestly be claimed from the current data. It is written
to be defensible under questioning rather than to maximise a headline number.

## What the model is

The decision engine is a **calibrated rule-based model**, not a trained
classifier. There is no fitted weight vector and no gradient descent. Thresholds
are set from real telemetry, held fixed, and versioned, so any recommendation can
be explained by naming which threshold a given input crossed.

This is a deliberate choice, not a limitation we ran out of time to fix. With a
rule set, the reason for every output is inspectable. That matters more for this
project than a marginally better accuracy figure from a model nobody can
interrogate.

Implementation: `frontend/src/lib/decisionEngine.js` (`DECISION_ENGINE_VERSION`).

## Data provenance

Every value in the product is labelled in one of three classes, and the labels
appear in the UI next to the numbers themselves.

| Class | Meaning | Examples |
| --- | --- | --- |
| REAL | Loaded directly from FastF1 official timing and car telemetry | Speed, throttle, brake, gear, RPM, DRS flap state, tyre compound and age, classified positions |
| DERIVED | Computed from REAL values only | Gap to car ahead, speed delta, closing rate, braking-zone boundaries |
| SIMULATED | Produced by the energy model | Reserve percentage, recovery estimate, deployment cost |

The scenario file `frontend/src/data/scenarios/las-vegas-2023-lec-per.json`
carries its own provenance block and records the FastF1 version and generation
timestamp, so a reviewer can regenerate it and diff the result.

## The energy layer is modelled, and why

Team battery state of charge and proprietary ERS deployment maps are **not
public**. We therefore do not claim to measure them. The energy layer integrates
published regulation limits against real speed, throttle and brake traces.

`frontend/src/lib/energyModel.js` separates two kinds of constant, and the
distinction is load-bearing:

- `REGULATION` — published limits for the 2014–2025 power unit formula that can
  be cited: 120 kW MGU-K, 2 MJ per lap MGU-K recovery, 4 MJ per lap energy-store
  deployment, ~4 MJ usable store.
- `CALIBRATION` — values we fitted ourselves and must not present as regulation
  facts: MGU-H direct supply (80 kW) and the assumed start-of-lap store (65%).

One modelling note worth recording, because getting it wrong produces a
convincing-looking but degenerate model. An earlier revision (`v1.0.0`) modelled
only the MGU-K. Because the energy store holds ~4 MJ and the per-lap deployment
limit is 4 MJ, the store drained to zero at roughly 3,700 m of the lap and
flatlined, so the engine returned SAVE at 189 of 240 sample points regardless of
race conditions. The missing physics is the **MGU-H**, which in this formula had
no per-lap recovery limit and could supply the MGU-K directly, bypassing both the
recovery cap and the store deployment limit. Adding it (`v1.1.0`) puts the
modelled reserve in a live 34–67% band across the lap.

The 65% start-of-lap assumption is the single input that cannot be verified. For
this scenario it is set above neutral because Leclerc stated in the post-race
press conference that he began recharging on the penultimate lap in order to
attack on the last one. That is **driver testimony, not telemetry**, and it is
presented as qualitative corroboration only.

## Identifying decision points

Decision points are taken from observable timing and position data: laps where
the two drivers exchanged classified position.

Raw position swaps are **not** usable as-is. In the reference race, six swaps
occur between Leclerc and Pérez, but two of them (laps 22 and 27) are pit-stop
cycles — an 8.5 s gap beforehand and tyre age resetting to 1 lap. Counting those
as overtakes would inflate the label set with events that involved no on-track
pass at all.

A swap is retained only if all of the following hold:

1. Neither driver has a pit in-time or out-time on that lap or the lap before.
2. Neither driver is on a tyre aged two laps or less.
3. The gap on the preceding lap was 2.0 s or smaller.

Applied to the reference race this yields **four** on-track passes (laps 32, 35,
43, 50) and excludes two pit cycles. The filter and its exclusion reasons are
recorded per-event in the exported JSON, so the exclusions are auditable rather
than silent.

## Scoring

For each retained decision point we record the pre-attempt state from real
telemetry — gap, closing rate, DRS availability, tyre age and compound delta —
and compare the engine's recommendation to the observed outcome, defined as
**track position at the end of the following lap** (or at the chequered flag for
a final-lap event).

Two label classes have observable ground truth:

- An attempt that gained and held position → ATTACK was correct.
- An attempt that lost position or required recovery → SAVE or DELAY was correct.

Accuracy must be reported against two baselines, because a bare percentage is
uninterpretable:

1. Always recommend SAVE.
2. A gap-threshold-only rule, ignoring closing rate, DRS and energy.

Report the sample size and a confidence interval alongside any figure.

### Energy conservation is deliberately not scored

An earlier draft of this methodology listed "conserved energy that paid off" as a
third correctness pattern. It has been removed, because its ground truth is not
observable: if ERS deployment and state of charge are not public — which is
exactly why the energy layer is simulated — then "energy was being held at this
point" cannot be read from public data. Scoring against it would contradict the
provenance rules above.

## Current status, stated plainly

The reference scenario is **calibration data, not validation data**. Thresholds
were set by inspecting this race, and the race contains four on-track decision
points. Reporting an accuracy percentage over four events that were used to set
the thresholds would be meaningless, and reporting it as validation would be
wrong.

What can be claimed today:

- The dashboard runs entirely on one cached, real, reproducible race scenario.
- Speed, throttle, brake, gear, RPM, DRS, tyre and position values are real and
  traceable to FastF1.
- Gap, closing rate and braking zones are derived from those values.
- At 4,880 m on lap 50 — real gap 0.32 s, real closing rate +21.0 km/h, DRS flap
  open in telemetry, Turn 14 braking zone 103 m ahead — the engine recommends
  ATTACK, which matches the decision Leclerc took and the outcome that followed.
- The engine's output changes across the lap in response to real inputs, and
  every factor is displayed with its provenance class.

What cannot yet be claimed:

- Any accuracy figure. That requires held-out races the thresholds were not set
  on.
- Any statement beginning "the model was trained on…". Nothing is trained.

## Next step for a real validation claim

Export three to five races from 2024–2025 using the same pipeline, apply the same
pit-cycle filter, and score the fixed thresholds against those unseen events with
the two baselines above. Only then does an accuracy number mean anything.

A note on season selection: 2026 introduced a new power unit formula with a much
larger electrical component. The energy model's constants are specific to the
2014–2025 rules, so 2026 races must not be pooled with earlier seasons. If they
are used at all, report them separately.

## Reproducing

```bash
python3.12 -m venv analytics/.venv
analytics/.venv/bin/python -m pip install fastf1
analytics/.venv/bin/python analytics/verify_scenario.py    # confirm the events
analytics/.venv/bin/python analytics/export_scenario.py    # regenerate the JSON
```

`verify_scenario.py` prints lap-by-lap positions and telemetry availability so
the claimed events can be checked against the source before anything is exported.
