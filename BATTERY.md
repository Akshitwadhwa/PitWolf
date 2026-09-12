# PitWolf battery → overtake contract

This file is the specification for the **battery-conditioned overtake layer**.

Use it when the remaining battery parts are wired into scoring and replay. Until then, ATTACK / SAVE / DELAY may run without this modulation. **Once the battery engine is implemented, every overtake and save decision must go through this contract.**

Battery values are **MODELLED**. Public FastF1 / OpenF1 data does not include team state of charge. Never present this battery as measured ERS telemetry.

## What this layer does

Given:

1. the **modelled battery** (SoC, leftover deploy, harvest room), and
2. the **selected driver** (and the car they are attacking or defending),

the engine **raises or lowers the overtake percentage** for that window.

A draw **`u` in `[0, 1]`** is the randomness term. It does not pick ATTACK or SAVE by itself. It scales how strongly this battery state is allowed to move the model result.

That adjusted overtake percentage then changes the **ATTACK vs SAVE** (and DELAY) call for that lap.

```text
selected driver + modelled battery + u ~ Uniform(0, 1)
        → Δ overtake%
        → new P(ATTACK) / P(SAVE)
        → recommendation for this window
```

## Inputs

| Input | Meaning |
|---|---|
| `driver` | Selected driver only. Do not apply another car’s battery to their call. |
| `defender` | Immediate opponent in this window. |
| `socMj` / leftover % | Modelled store for the selected driver (4 MJ window unless the era config says otherwise). |
| `opponentSocMj` | Modelled store for the opponent (repass / hold risk). |
| `baseOvertakeP` | Model probability **before** battery modulation (gap, pace, tyres, zone). |
| `u` | Randomness in **0 to 1**, drawn once per decision window. |

`u = 0` → battery barely moves the overtake %.  
`u = 1` → battery is allowed its full designed effect.  
Values in between scale the effect linearly.

Fix `u` (or seed it from year / round / lap / driver) in replay so the same historical window is reproducible. Draw a fresh `u` only for live “what-if” probes.

## How battery moves overtake %

Let `b` be selected-driver charge as a fraction of usable capacity (`0` empty → `1` full).

Intended direction:

- **Higher battery** → more energy to spend → **increase** overtake %.
- **Lower battery** → cannot afford a full deploy → **decrease** overtake %.
- **Opponent much fuller** → higher repass / hold risk → pull overtake % back down.

Suggested shape (implement to this, then calibrate):

```text
chargeBoost     = (b - 0.5) * CHARGE_WEIGHT          # full battery helps; empty hurts
opponentPenalty = max(0, opponentB - b) * REPASS_WEIGHT
rawDelta        = chargeBoost - opponentPenalty
deltaOvertakeP  = rawDelta * u                       # randomness 0..1
overtakeP       = clamp(baseOvertakeP + deltaOvertakeP, 0, 1)
```

`CHARGE_WEIGHT` and `REPASS_WEIGHT` stay versioned constants. They are calibration, not FIA facts.

Hard floors (already used in replay — keep them):

- SoC below the ATTACK floor (~0.25 MJ) → do **not** recommend ATTACK, even if `overtakeP` is high.
- SAVE remains the harvest action when the store needs rebuilding.

## Impact on ATTACK and SAVE

After `overtakeP` is updated:

| Window | Battery effect | Decision impact |
|---|---|---|
| Close fight, high SoC, high `u` | Overtake % **up** | More likely **ATTACK** (spend) |
| Close fight, low SoC | Overtake % **down** | More likely **SAVE** (harvest) |
| Weak fight, any SoC | Overtake % stays low | **SAVE** or **DELAY**; do not invent a pass |
| High SoC but low `u` | Small move | Battery must not dominate gap/tyres |

SAVE is not “never spend.” It is “this battery and this `u` say the extra overtake chance is not worth the store.”

The UI should show, on the selected driver:

- modelled battery before / after the action
- base overtake % vs battery-adjusted overtake %
- the `u` that was used
- why ATTACK or SAVE won

## When this gets used

Implement in this order so the README is not decorative:

1. Selected-driver SoC is available at the decision point (surrogate or C5.2 engine).
2. `baseOvertakeP` exists from the overtake model.
3. Apply `deltaOvertakeP = f(battery, opponent, u)`.
4. Re-rank ATTACK / SAVE / DELAY from the adjusted probabilities.
5. Feed the same adjusted probabilities into the six-lap / race-to-flag tree.

Until step 3 exists, do not claim the model “learned from the battery.” Current SoC features and energy traces are precursors only.

## Honesty

- SoC is **SIMULATED / MODELLED**.
- `u` is **stochastic control**, not race luck from the real event.
- A higher overtake % is **not** a guaranteed pass.
- This layer does not create legal 2026 Overtake Mode commands by itself.

## Related code (current precursors)

- `backend/scripts/c52_battery.py` — 2026 C5.2 store / harvest box
- `backend/scripts/energy_transition.py` — ATTACK / SAVE / DELAY SoC step
- `backend/scripts/energy_surrogate.py` — cheap SoC features on decision rows
- `backend/scripts/replay_strategy.py` — tree already clips ATTACK on low SoC
- `backend/scripts/score_energy_trend.py` — leftover-store vs ATTACK/SAVE notes

When the battery parts land, **this file is the behaviour to implement**, not those scripts by themselves.
