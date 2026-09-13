# Model overtakes that worked — 2026 top 8

Evaluation deck for the eight 2026 works cars only: Ferrari LEC/HAM, Mercedes RUS/ANT, McLaren NOR/PIA, Red Bull VER/HAD.

Each race keeps **at most 3** JUMP laps where the branch **diverged and beat the recorded pair** — the model led that pair for more of the next 6 laps than the real race. Open that lap in the sim and walk the next laps.

## How to show it

1. Dashboard → **DIFF RESULT**, or this file.
2. Pick a race row, then a lap.
3. Sim: `2026` / that race / `Race` / that driver / that lap / **JUMP**.

## What “worked” means

- JUMP from a 1.0s hunt / recorded-overtake lap.
- Same constructed 4 MJ C5.2 leftover the recorded replay uses.
- 2026 habits, this GP stripped. Seeded take draw.
- **Success** = more pair-ahead laps than the recorded pair in the next 6 laps.
- **Major** = still holding the place when the classified pair did not.
- After a take they keep attacking. We DELAY/SAVE to postpone that re-pass. Loss of lead can still happen.
- Two cars only. Not a rewritten classified result. Not team battery.

## Success vs the real races

- Races scored: **13**
- Hunt / overtake windows scored for the 8 cars: **1208**
- Windows the model held the pair longer: **99** (**8.2%**)
- Instances printed here (2–3 best per race): **36**

| Team | Drivers |
| --- | --- |
| Ferrari | LEC · HAM |
| Mercedes | RUS · ANT |
| McLaren | NOR · PIA |
| Red Bull | VER · HAD |

## Index

| Race | Rate | Show |
| --- | ---: | --- |
| R1 Australian Grand Prix | 3.5% | HAM L4 vs RUS (+6), ANT L6 vs HAD (+1) |
| R2 Chinese Grand Prix | 3.0% | LEC L2 vs HAM (+5), LEC L24 vs HAM (+1), HAM L26 vs LEC (+5) |
| R3 Japanese Grand Prix | 9.9% | HAM L1 vs RUS (+6), LEC L16 vs ANT (+5), VER L48 vs GAS (+5) |
| R4 Miami Grand Prix | 8.8% | LEC L15 vs ANT (+6), LEC L16 vs ANT (+6), VER L28 vs ANT (+5) |
| R5 Canadian Grand Prix | 8.8% | HAM L6 vs ANT (+6), VER L3 vs HAM (+6), NOR L36 vs GAS (+3) |
| R6 Monaco Grand Prix | 1.2% | NOR L2 vs GAS (+6) |
| R7 Barcelona Grand Prix | 10.2% | PIA L2 vs VER (+6), PIA L28 vs HAM (+5), NOR L11 vs HAM (+3) |
| R8 Austrian Grand Prix | 10.2% | LEC L1 vs HAM (+6), NOR L2 vs PIA (+6), HAM L21 vs VER (+5) |
| R9 British Grand Prix | 16.2% | HAM L27 vs RUS (+6), HAM L28 vs RUS (+6), HAD L29 vs NOR (+5) |
| R10 Belgian Grand Prix | 4.3% | NOR L21 vs LEC (+4), HAM L17 vs VER (+2), LEC L7 vs VER (+6) |
| R11 Hungarian Grand Prix | 12.0% | HAM L7 vs VER (+6), HAM L6 vs VER (+5), HAD L31 vs HAM (+5) |
| R12 Dutch Grand Prix | 5.5% | RUS L9 vs PIA (+6), RUS L13 vs PIA (+5), HAM L21 vs LEC (+1) |
| R13 Italian Grand Prix | 10.5% | HAM L10 vs PIA (+4), HAM L23 vs PIA (+4), PIA L37 vs ANT (+3) |

---

## R1 · Australian Grand Prix

Circuit **Melbourne**. Windows 57. Worked 2 (**3.5%**). Showing 2 best.

### HAM (Ferrari) · L4 vs RUS

- **Show:** 2026 · Australian Grand Prix · HAM · L4 · JUMP vs RUS
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · 0.89s
- **First action:** recorded SAVE · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded SAVE; pair-lead laps 6 vs recorded 0 in this window; order flip at L4, L5, L6, L7; branch TAKE at L4 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 4 | SLOW · SAVE · TRAILS PAIR · leftover 54.0% | TAKE · ATTACK · LEADS PAIR · leftover 24.0% ← **diff** |
| 5 | SLOW · SAVE · TRAILS PAIR · leftover 58.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 26.2% ← **diff** |
| 6 | HOLD · DELAY · TRAILS PAIR · leftover 51.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 28.5% ← **diff** |
| 7 | SLOW · SAVE · TRAILS PAIR · leftover 55.5% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 30.7% ← **diff** |
| 8 | HOLD · ATTACK · TRAILS PAIR · leftover 34.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 30.4% ← **diff** |
| 9 | SLOW · SAVE · TRAILS PAIR · leftover 38.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 30.1% ← **diff** |

### ANT (Mercedes) · L6 vs HAD

- **Show:** 2026 · Australian Grand Prix · ANT · L6 · JUMP vs HAD
- **Recorded pair:** P4 vs P5 · BATTLE · 0.67s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +1 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 5 in this window; recorded overtake L6 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 6 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 6.3% ← **diff** |
| 7 | HOLD · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 6.0% ← **diff** |
| 8 | HOLD · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 5.7% ← **diff** |
| 9 | HOLD · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 5.3% ← **diff** |
| 10 | HOLD · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 5.0% ← **diff** |
| 11 | HOLD · ATTACK · — · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 4.7% ← **diff** |

## R2 · Chinese Grand Prix

Circuit **Shanghai**. Windows 135. Worked 4 (**3.0%**). Showing 3 best.

### LEC (Ferrari) · L2 vs HAM

- **Show:** 2026 · Chinese Grand Prix · LEC · L2 · JUMP vs HAM
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · 0.61s
- **First action:** recorded ATTACK · model DELAY
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action DELAY vs recorded ATTACK; pair-lead laps 5 vs recorded 0 in this window; order flip at L3, L4, L5, L6; branch HOLD_PLACE at L3 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 2 | HOLD · ATTACK · TRAILS PAIR · leftover 70.9% | HOLD_PLACE · DELAY · TRAILS PAIR · leftover 84.4% ← **diff** |
| 3 | SLOW · SAVE · TRAILS PAIR · leftover 75.5% | TAKE · ATTACK · LEADS PAIR · leftover 62.5% ← **diff** |
| 4 | HOLD · ATTACK · TRAILS PAIR · leftover 54.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 61.7% ← **diff** |
| 5 | SLOW · SAVE · TRAILS PAIR · leftover 58.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 60.8% ← **diff** |
| 6 | SLOW · SAVE · TRAILS PAIR · leftover 63.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 60.0% ← **diff** |
| 7 | HOLD · ATTACK · TRAILS PAIR · leftover 41.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 59.2% ← **diff** |

### LEC (Ferrari) · L24 vs HAM

- **Show:** 2026 · Chinese Grand Prix · LEC · L24 · JUMP vs HAM
- **Recorded pair:** P2 vs P3 · BATTLE · -0.03s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +1 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 5 in this window; order flip at L26; recorded overtake L24 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 24 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 25 | SLOW · SAVE · LEADS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% |
| 26 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 27 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 28 | SLOW · SAVE · LEADS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% |
| 29 | HOLD · DELAY · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |

### HAM (Ferrari) · L26 vs LEC

- **Show:** 2026 · Chinese Grand Prix · HAM · L26 · JUMP vs LEC
- **Recorded pair:** P2 vs P3 · BATTLE · 0.66s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L27, L28, L29, L30; recorded overtake L26 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 26 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 23.1% ← **diff** |
| 27 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 26.1% ← **diff** |
| 28 | HOLD · DELAY · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 29.0% ← **diff** |
| 29 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 31.9% ← **diff** |
| 30 | HOLD · DELAY · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 33.1% ← **diff** |
| 31 | HOLD · DELAY · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 34.2% ← **diff** |

## R3 · Japanese Grand Prix

Circuit **Suzuka**. Windows 152. Worked 15 (**9.9%**). Showing 3 best.

### HAM (Ferrari) · L1 vs RUS

- **Show:** 2026 · Japanese Grand Prix · HAM · L1 · JUMP vs RUS
- **Recorded pair:** P5 vs P4 · OVERTAKE_WINDOW · 0.56s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L1, L2, L3, L4; branch TAKE at L1 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 1 | HOLD · DELAY · TRAILS PAIR · leftover 92.3% | TAKE · ATTACK · LEADS PAIR · leftover 79.3% ← **diff** |
| 2 | SLOW · SAVE · TRAILS PAIR · leftover 96.9% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 79.6% ← **diff** |
| 3 | HOLD · DELAY · TRAILS PAIR · leftover 89.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 79.9% ← **diff** |
| 4 | SLOW · SAVE · TRAILS PAIR · leftover 93.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 80.2% ← **diff** |
| 5 | SLOW · SAVE · TRAILS PAIR · leftover 98.4% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 80.4% ← **diff** |
| 6 | SLOW · SAVE · TRAILS PAIR · leftover 100.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 80.7% ← **diff** |

### LEC (Ferrari) · L16 vs ANT

- **Show:** 2026 · Japanese Grand Prix · LEC · L16 · JUMP vs ANT
- **Recorded pair:** P3 vs P4 · BATTLE · 0.66s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L17, L18, L19, L20; recorded overtake L16 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 16 | OVERTAKE · ATTACK · LEADS PAIR · leftover 8.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 32.6% ← **diff** |
| 17 | PIT · SAVE · TRAILS PAIR · leftover 12.5% | PIT · SAVE · LEADS PAIR · leftover 36.9% ← **diff** |
| 18 | PIT · SAVE · TRAILS PAIR · leftover 17.1% | PIT · SAVE · LEADS PAIR · leftover 41.0% ← **diff** |
| 19 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 45.2% ← **diff** |
| 20 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 49.5% ← **diff** |
| 21 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 53.6% ← **diff** |

### VER (Red Bull) · L48 vs GAS

- **Show:** 2026 · Japanese Grand Prix · VER · L48 · JUMP vs GAS
- **Recorded pair:** P7 vs P8 · BATTLE · -0.14s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L49, L50, L51, L52; recorded overtake L48 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 48 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 49 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 50 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 51 | HOLD · DELAY · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 52 | HOLD · DELAY · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 53 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |

## R4 · Miami Grand Prix

Circuit **Miami Gardens**. Windows 125. Worked 11 (**8.8%**). Showing 3 best.

### LEC (Ferrari) · L15 vs ANT

- **Show:** 2026 · Miami Grand Prix · LEC · L15 · JUMP vs ANT
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · -0.80s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L15, L16, L17, L18; branch TAKE at L15 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 15 | HOLD · DELAY · TRAILS PAIR · leftover 56.9% | TAKE · ATTACK · LEADS PAIR · leftover 42.3% ← **diff** |
| 16 | HOLD · DELAY · TRAILS PAIR · leftover 49.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 44.4% ← **diff** |
| 17 | SLOW · SAVE · TRAILS PAIR · leftover 53.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 46.5% ← **diff** |
| 18 | SLOW · SAVE · TRAILS PAIR · leftover 58.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 48.6% ← **diff** |
| 19 | HOLD · DELAY · TRAILS PAIR · leftover 50.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 50.7% ← **diff** |
| 20 | SLOW · SAVE · TRAILS PAIR · leftover 55.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 52.8% ← **diff** |

### LEC (Ferrari) · L16 vs ANT

- **Show:** 2026 · Miami Grand Prix · LEC · L16 · JUMP vs ANT
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · -0.93s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L16, L17, L18, L19; branch TAKE at L16 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 16 | HOLD · DELAY · TRAILS PAIR · leftover 49.2% | TAKE · ATTACK · LEADS PAIR · leftover 37.5% ← **diff** |
| 17 | SLOW · SAVE · TRAILS PAIR · leftover 53.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 41.1% ← **diff** |
| 18 | SLOW · SAVE · TRAILS PAIR · leftover 58.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 44.7% ← **diff** |
| 19 | HOLD · DELAY · TRAILS PAIR · leftover 50.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 48.3% ← **diff** |
| 20 | SLOW · SAVE · TRAILS PAIR · leftover 55.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 51.9% ← **diff** |
| 21 | PIT · SAVE · TRAILS PAIR · leftover 59.8% | PIT · SAVE · LEADS PAIR · leftover 55.5% ← **diff** |

### VER (Red Bull) · L28 vs ANT

- **Show:** 2026 · Miami Grand Prix · VER · L28 · JUMP vs ANT
- **Recorded pair:** P1 vs P2 · BATTLE · -149.75s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L29, L30, L31, L32; recorded overtake L28 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 28 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 3.6% ← **diff** |
| 29 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 7.3% ← **diff** |
| 30 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 10.9% ← **diff** |
| 31 | SLOW · SAVE · TRAILS PAIR · leftover 13.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 14.6% ← **diff** |
| 32 | SLOW · SAVE · TRAILS PAIR · leftover 18.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 18.2% ← **diff** |
| 33 | SLOW · SAVE · TRAILS PAIR · leftover 22.9% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 21.9% ← **diff** |

## R5 · Canadian Grand Prix

Circuit **Montréal**. Windows 102. Worked 9 (**8.8%**). Showing 3 best.

### HAM (Ferrari) · L6 vs ANT

- **Show:** 2026 · Canadian Grand Prix · HAM · L6 · JUMP vs ANT
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · 0.86s
- **First action:** recorded ATTACK · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** pair-lead laps 6 vs recorded 0 in this window; order flip at L6, L7, L8, L9; branch TAKE at L6 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 6 | HOLD · ATTACK · TRAILS PAIR · leftover 50.9% | TAKE · ATTACK · LEADS PAIR · leftover 52.3% ← **diff** |
| 7 | HOLD · DELAY · TRAILS PAIR · leftover 43.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 49.4% ← **diff** |
| 8 | SLOW · SAVE · TRAILS PAIR · leftover 47.9% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 46.4% ← **diff** |
| 9 | SLOW · SAVE · TRAILS PAIR · leftover 52.4% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 43.5% ← **diff** |
| 10 | HOLD · DELAY · TRAILS PAIR · leftover 44.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 40.5% ← **diff** |
| 11 | HOLD · DELAY · TRAILS PAIR · leftover 37.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 37.5% ← **diff** |

### VER (Red Bull) · L3 vs HAM

- **Show:** 2026 · Canadian Grand Prix · VER · L3 · JUMP vs HAM
- **Recorded pair:** P4 vs P3 · OVERTAKE_WINDOW · 0.92s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L3, L4, L5, L6; branch TAKE at L3 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 3 | HOLD · DELAY · TRAILS PAIR · leftover 63.2% | TAKE · ATTACK · LEADS PAIR · leftover 46.9% ← **diff** |
| 4 | HOLD · ATTACK · TRAILS PAIR · leftover 41.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 50.7% ← **diff** |
| 5 | HOLD · ATTACK · TRAILS PAIR · leftover 20.4% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 54.5% ← **diff** |
| 6 | HOLD · DELAY · TRAILS PAIR · leftover 12.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 58.4% ← **diff** |
| 7 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 62.2% ← **diff** |
| 8 | HOLD · DELAY · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 63.9% ← **diff** |

### NOR (McLaren) · L36 vs GAS

- **Show:** 2026 · Canadian Grand Prix · NOR · L36 · JUMP vs GAS
- **Recorded pair:** P8 vs P9 · BATTLE · 0.53s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +3 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 3 in this window; recorded overtake L36 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 36 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 37 | SLOW · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 38 | HOLD · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 39 | — · — · — · leftover —% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% |
| 40 | — · — · — · leftover —% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% |
| 41 | — · — · — · leftover —% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% |

## R6 · Monaco Grand Prix

Circuit **Monte Carlo**. Windows 82. Worked 1 (**1.2%**). Showing 1 best.

### NOR (McLaren) · L2 vs GAS

- **Show:** 2026 · Monaco Grand Prix · NOR · L2 · JUMP vs GAS
- **Recorded pair:** P8 vs P7 · OVERTAKE_WINDOW · 0.49s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L2, L3, L4, L5; branch TAKE at L2 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 2 | HOLD · DELAY · TRAILS PAIR · leftover 84.7% | TAKE · ATTACK · LEADS PAIR · leftover 68.5% ← **diff** |
| 3 | HOLD · DELAY · TRAILS PAIR · leftover 77.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 70.4% ← **diff** |
| 4 | SLOW · SAVE · TRAILS PAIR · leftover 81.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 72.4% ← **diff** |
| 5 | HOLD · DELAY · TRAILS PAIR · leftover 73.9% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 74.4% ← **diff** |
| 6 | HOLD · DELAY · TRAILS PAIR · leftover 66.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 76.3% ← **diff** |
| 7 | HOLD · ATTACK · TRAILS PAIR · leftover 44.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 78.3% ← **diff** |

## R7 · Barcelona Grand Prix

Circuit **Barcelona**. Windows 49. Worked 5 (**10.2%**). Showing 3 best.

### PIA (McLaren) · L2 vs VER

- **Show:** 2026 · Barcelona Grand Prix · PIA · L2 · JUMP vs VER
- **Recorded pair:** P6 vs P5 · OVERTAKE_WINDOW · 0.69s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L2, L3, L4, L5; branch TAKE at L2 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 2 | HOLD · DELAY · TRAILS PAIR · leftover 84.7% | TAKE · ATTACK · LEADS PAIR · leftover 71.0% ← **diff** |
| 3 | SLOW · SAVE · TRAILS PAIR · leftover 89.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 74.4% ← **diff** |
| 4 | HOLD · DELAY · TRAILS PAIR · leftover 81.5% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 77.7% ← **diff** |
| 5 | SLOW · SAVE · TRAILS PAIR · leftover 86.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 81.1% ← **diff** |
| 6 | HOLD · DELAY · TRAILS PAIR · leftover 78.5% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 84.4% ← **diff** |
| 7 | SLOW · SAVE · TRAILS PAIR · leftover 83.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 87.8% ← **diff** |

### PIA (McLaren) · L28 vs HAM

- **Show:** 2026 · Barcelona Grand Prix · PIA · L28 · JUMP vs HAM
- **Recorded pair:** P6 vs P7 · BATTLE · 0.28s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L29, L30, L31, L32; recorded overtake L28 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 28 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | PIT · SAVE · LEADS PAIR · leftover 10.2% ← **diff** |
| 29 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 12.6% ← **diff** |
| 30 | OVERTAKE · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 15.0% ← **diff** |
| 31 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 17.4% ← **diff** |
| 32 | SLOW · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 19.8% ← **diff** |
| 33 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 22.2% ← **diff** |

### NOR (McLaren) · L11 vs HAM

- **Show:** 2026 · Barcelona Grand Prix · NOR · L11 · JUMP vs HAM
- **Recorded pair:** P3 vs P4 · BATTLE · 0.22s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +3 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 3 in this window; order flip at L14, L15, L16; recorded overtake L11 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 11 | OVERTAKE · ATTACK · LEADS PAIR · leftover 28.1% | PIT · SAVE · LEADS PAIR · leftover 47.3% ← **diff** |
| 12 | SLOW · SAVE · LEADS PAIR · leftover 32.6% | PIT · SAVE · LEADS PAIR · leftover 45.2% |
| 13 | PIT · SAVE · LEADS PAIR · leftover 37.2% | PIT · SAVE · LEADS PAIR · leftover 43.1% |
| 14 | PIT · SAVE · TRAILS PAIR · leftover 41.8% | PIT · SAVE · LEADS PAIR · leftover 41.0% ← **diff** |
| 15 | OVERTAKE · ATTACK · TRAILS PAIR · leftover 20.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 38.9% ← **diff** |
| 16 | HOLD · DELAY · TRAILS PAIR · leftover 12.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 36.7% ← **diff** |

## R8 · Austrian Grand Prix

Circuit **Spielberg**. Windows 88. Worked 9 (**10.2%**). Showing 3 best.

### LEC (Ferrari) · L1 vs HAM

- **Show:** 2026 · Austrian Grand Prix · LEC · L1 · JUMP vs HAM
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · 0.72s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L1, L2, L3, L4; branch TAKE at L1 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 1 | HOLD · DELAY · TRAILS PAIR · leftover 92.3% | TAKE · ATTACK · LEADS PAIR · leftover 77.6% ← **diff** |
| 2 | SLOW · SAVE · TRAILS PAIR · leftover 96.9% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 76.8% ← **diff** |
| 3 | SLOW · SAVE · TRAILS PAIR · leftover 100.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 76.0% ← **diff** |
| 4 | SLOW · SAVE · TRAILS PAIR · leftover 100.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 75.1% ← **diff** |
| 5 | SLOW · SAVE · TRAILS PAIR · leftover 100.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 74.3% ← **diff** |
| 6 | SLOW · SAVE · TRAILS PAIR · leftover 100.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 73.5% ← **diff** |

### NOR (McLaren) · L2 vs PIA

- **Show:** 2026 · Austrian Grand Prix · NOR · L2 · JUMP vs PIA
- **Recorded pair:** P7 vs P6 · OVERTAKE_WINDOW · 0.29s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L2, L3, L4, L5; branch TAKE at L2 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 2 | HOLD · DELAY · TRAILS PAIR · leftover 84.7% | TAKE · ATTACK · LEADS PAIR · leftover 68.1% ← **diff** |
| 3 | SLOW · SAVE · TRAILS PAIR · leftover 89.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 69.3% ← **diff** |
| 4 | SLOW · SAVE · TRAILS PAIR · leftover 93.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 70.5% ← **diff** |
| 5 | SLOW · SAVE · TRAILS PAIR · leftover 98.4% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 71.8% ← **diff** |
| 6 | HOLD · DELAY · TRAILS PAIR · leftover 90.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 73.0% ← **diff** |
| 7 | SLOW · SAVE · TRAILS PAIR · leftover 95.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 74.2% ← **diff** |

### HAM (Ferrari) · L21 vs VER

- **Show:** 2026 · Austrian Grand Prix · HAM · L21 · JUMP vs VER
- **Recorded pair:** P3 vs P4 · BATTLE · 0.51s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L22, L23, L24, L25; recorded overtake L21 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 21 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 3.9% ← **diff** |
| 22 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 7.8% ← **diff** |
| 23 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 11.6% ← **diff** |
| 24 | SLOW · SAVE · TRAILS PAIR · leftover 13.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 15.5% ← **diff** |
| 25 | PIT · SAVE · TRAILS PAIR · leftover 18.3% | PIT · SAVE · LEADS PAIR · leftover 19.4% ← **diff** |
| 26 | PIT · SAVE · TRAILS PAIR · leftover 22.9% | PIT · SAVE · LEADS PAIR · leftover 23.2% ← **diff** |

## R9 · British Grand Prix

Circuit **Silverstone**. Windows 80. Worked 13 (**16.2%**). Showing 3 best.

### HAM (Ferrari) · L27 vs RUS

- **Show:** 2026 · British Grand Prix · HAM · L27 · JUMP vs RUS
- **Recorded pair:** P6 vs P5 · OVERTAKE_WINDOW · 0.73s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L27, L28, L29, L30

| Lap | Recorded | Model |
| ---: | --- | --- |
| 27 | HOLD · DELAY · TRAILS PAIR · leftover 75.5% | TAKE · ATTACK · LEADS PAIR · leftover 61.8% ← **diff** |
| 28 | HOLD · ATTACK · TRAILS PAIR · leftover 54.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 65.0% ← **diff** |
| 29 | OVERTAKE · ATTACK · TRAILS PAIR · leftover 32.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 68.2% ← **diff** |
| 30 | HOLD · ATTACK · TRAILS PAIR · leftover 11.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 71.4% ← **diff** |
| 31 | SLOW · SAVE · TRAILS PAIR · leftover 15.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 74.7% ← **diff** |
| 32 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 77.9% ← **diff** |

### HAM (Ferrari) · L28 vs RUS

- **Show:** 2026 · British Grand Prix · HAM · L28 · JUMP vs RUS
- **Recorded pair:** P6 vs P5 · OVERTAKE_WINDOW · 0.55s
- **First action:** recorded ATTACK · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** pair-lead laps 6 vs recorded 0 in this window; order flip at L28, L29, L30, L31

| Lap | Recorded | Model |
| ---: | --- | --- |
| 28 | HOLD · ATTACK · TRAILS PAIR · leftover 54.0% | TAKE · ATTACK · LEADS PAIR · leftover 54.1% ← **diff** |
| 29 | OVERTAKE · ATTACK · TRAILS PAIR · leftover 32.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 54.9% ← **diff** |
| 30 | HOLD · ATTACK · TRAILS PAIR · leftover 11.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 55.7% ← **diff** |
| 31 | SLOW · SAVE · TRAILS PAIR · leftover 15.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 56.5% ← **diff** |
| 32 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 57.4% ← **diff** |
| 33 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 58.2% ← **diff** |

### HAD (Red Bull) · L29 vs NOR

- **Show:** 2026 · British Grand Prix · HAD · L29 · JUMP vs NOR
- **Recorded pair:** P6 vs P7 · BATTLE · 0.62s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L30, L31, L32, L33; recorded overtake L29 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 29 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | PIT · SAVE · LEADS PAIR · leftover 13.7% ← **diff** |
| 30 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 13.7% ← **diff** |
| 31 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 13.7% ← **diff** |
| 32 | SLOW · SAVE · TRAILS PAIR · leftover 13.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 13.7% ← **diff** |
| 33 | SLOW · SAVE · TRAILS PAIR · leftover 18.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 13.7% ← **diff** |
| 34 | SLOW · SAVE · TRAILS PAIR · leftover 22.9% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 13.7% ← **diff** |

## R10 · Belgian Grand Prix

Circuit **Spa-Francorchamps**. Windows 69. Worked 3 (**4.3%**). Showing 3 best.

### NOR (McLaren) · L21 vs LEC

- **Show:** 2026 · Belgian Grand Prix · NOR · L21 · JUMP vs LEC
- **Recorded pair:** P1 vs P2 · BATTLE · -10.68s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +4 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 2 in this window; order flip at L23, L24, L25, L26; recorded overtake L21 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 21 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | PIT · SAVE · LEADS PAIR · leftover 3.6% ← **diff** |
| 22 | HOLD · DELAY · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 7.3% ← **diff** |
| 23 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 10.9% ← **diff** |
| 24 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 14.6% ← **diff** |
| 25 | SLOW · SAVE · TRAILS PAIR · leftover 13.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 18.2% ← **diff** |
| 26 | SLOW · SAVE · TRAILS PAIR · leftover 18.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 21.9% ← **diff** |

### HAM (Ferrari) · L17 vs VER

- **Show:** 2026 · Belgian Grand Prix · HAM · L17 · JUMP vs VER
- **Recorded pair:** P3 vs P4 · BATTLE · -3.12s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +2 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 4 in this window; order flip at L21, L22; recorded overtake L17 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 17 | OVERTAKE · ATTACK · LEADS PAIR · leftover 26.3% | PIT · SAVE · LEADS PAIR · leftover 46.2% ← **diff** |
| 18 | SLOW · ATTACK · LEADS PAIR · leftover 4.8% | PIT · SAVE · LEADS PAIR · leftover 44.8% ← **diff** |
| 19 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 43.3% ← **diff** |
| 20 | PIT · SAVE · LEADS PAIR · leftover 4.6% | PIT · SAVE · LEADS PAIR · leftover 41.8% |
| 21 | PIT · SAVE · TRAILS PAIR · leftover 9.2% | PIT · SAVE · LEADS PAIR · leftover 40.3% ← **diff** |
| 22 | HOLD · DELAY · TRAILS PAIR · leftover 1.5% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 38.9% ← **diff** |

### LEC (Ferrari) · L7 vs VER

- **Show:** 2026 · Belgian Grand Prix · LEC · L7 · JUMP vs VER
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · 0.09s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L7, L8, L9, L10; branch TAKE at L7 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 7 | HOLD · DELAY · TRAILS PAIR · leftover 58.5% | TAKE · ATTACK · LEADS PAIR · leftover 44.1% ← **diff** |
| 8 | SLOW · SAVE · TRAILS PAIR · leftover 63.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 48.4% ← **diff** |
| 9 | HOLD · ATTACK · TRAILS PAIR · leftover 41.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 52.8% ← **diff** |
| 10 | HOLD · ATTACK · TRAILS PAIR · leftover 20.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 57.2% ← **diff** |
| 11 | SLOW · SAVE · TRAILS PAIR · leftover 24.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 61.6% ← **diff** |
| 12 | HOLD · DELAY · TRAILS PAIR · leftover 17.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 64.7% ← **diff** |

## R11 · Hungarian Grand Prix

Circuit **Budapest**. Windows 100. Worked 12 (**12.0%**). Showing 3 best.

### HAM (Ferrari) · L7 vs VER

- **Show:** 2026 · Hungarian Grand Prix · HAM · L7 · JUMP vs VER
- **Recorded pair:** P4 vs P3 · OVERTAKE_WINDOW · 0.58s
- **First action:** recorded DELAY · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** first action ATTACK vs recorded DELAY; pair-lead laps 6 vs recorded 0 in this window; order flip at L7, L8, L9, L10; branch TAKE at L7 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 7 | HOLD · DELAY · TRAILS PAIR · leftover 44.8% | TAKE · ATTACK · LEADS PAIR · leftover 27.6% ← **diff** |
| 8 | HOLD · DELAY · TRAILS PAIR · leftover 37.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 31.0% ← **diff** |
| 9 | SLOW · SAVE · TRAILS PAIR · leftover 41.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 32.5% ← **diff** |
| 10 | HOLD · ATTACK · TRAILS PAIR · leftover 20.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 34.0% ← **diff** |
| 11 | SLOW · SAVE · TRAILS PAIR · leftover 24.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 35.4% ← **diff** |
| 12 | HOLD · DELAY · TRAILS PAIR · leftover 17.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 36.9% ← **diff** |

### HAM (Ferrari) · L6 vs VER

- **Show:** 2026 · Hungarian Grand Prix · HAM · L6 · JUMP vs VER
- **Recorded pair:** P4 vs P3 · OVERTAKE_WINDOW · 0.50s
- **First action:** recorded ATTACK · model DELAY
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action DELAY vs recorded ATTACK; pair-lead laps 5 vs recorded 0 in this window; order flip at L7, L8, L9, L10; branch HOLD_PLACE at L7 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 6 | HOLD · ATTACK · TRAILS PAIR · leftover 52.4% | HOLD_PLACE · DELAY · TRAILS PAIR · leftover 66.9% ← **diff** |
| 7 | HOLD · DELAY · TRAILS PAIR · leftover 44.8% | TAKE · ATTACK · LEADS PAIR · leftover 46.7% ← **diff** |
| 8 | HOLD · DELAY · TRAILS PAIR · leftover 37.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 47.6% ← **diff** |
| 9 | SLOW · SAVE · TRAILS PAIR · leftover 41.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 48.4% ← **diff** |
| 10 | HOLD · ATTACK · TRAILS PAIR · leftover 20.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 49.3% ← **diff** |
| 11 | SLOW · SAVE · TRAILS PAIR · leftover 24.8% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 50.2% ← **diff** |

### HAD (Red Bull) · L31 vs HAM

- **Show:** 2026 · Hungarian Grand Prix · HAD · L31 · JUMP vs HAM
- **Recorded pair:** P6 vs P7 · BATTLE · 0.09s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 1 in this window; order flip at L32, L33, L34, L35; recorded overtake L31 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 31 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | PIT · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 32 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 33 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 34 | SLOW · SAVE · TRAILS PAIR · leftover 13.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 35 | SLOW · SAVE · TRAILS PAIR · leftover 18.3% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |
| 36 | SLOW · SAVE · TRAILS PAIR · leftover 22.9% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.0% ← **diff** |

## R12 · Dutch Grand Prix

Circuit **Zandvoort**. Windows 55. Worked 3 (**5.5%**). Showing 3 best.

### RUS (Mercedes) · L9 vs PIA

- **Show:** 2026 · Dutch Grand Prix · RUS · L9 · JUMP vs PIA
- **Recorded pair:** P4 vs P3 · OVERTAKE_WINDOW · 0.20s
- **First action:** recorded ATTACK · model ATTACK
- **Hold delta:** +6 pair-ahead laps vs the race
- **Why:** pair-lead laps 6 vs recorded 0 in this window; order flip at L9, L10, L11, L12; branch TAKE at L9 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 9 | HOLD · ATTACK · TRAILS PAIR · leftover 77.0% | TAKE · ATTACK · LEADS PAIR · leftover 74.9% ← **diff** |
| 10 | SLOW · SAVE · TRAILS PAIR · leftover 81.5% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 75.8% ← **diff** |
| 11 | SLOW · SAVE · TRAILS PAIR · leftover 86.1% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 76.8% ← **diff** |
| 12 | HOLD · DELAY · TRAILS PAIR · leftover 78.4% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 77.8% ← **diff** |
| 13 | SLOW · SAVE · TRAILS PAIR · leftover 83.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 78.7% ← **diff** |
| 14 | SLOW · SAVE · TRAILS PAIR · leftover 87.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 79.7% ← **diff** |

### RUS (Mercedes) · L13 vs PIA

- **Show:** 2026 · Dutch Grand Prix · RUS · L13 · JUMP vs PIA
- **Recorded pair:** P4 vs P3 · OVERTAKE_WINDOW · 0.77s
- **First action:** recorded SAVE · model DELAY
- **Hold delta:** +5 pair-ahead laps vs the race
- **Why:** first action DELAY vs recorded SAVE; pair-lead laps 5 vs recorded 0 in this window; order flip at L14, L15, L16, L17; branch HOLD_PLACE at L14 that the race did not take

| Lap | Recorded | Model |
| ---: | --- | --- |
| 13 | SLOW · SAVE · TRAILS PAIR · leftover 83.0% | HOLD_PLACE · DELAY · TRAILS PAIR · leftover 69.6% ← **diff** |
| 14 | SLOW · SAVE · TRAILS PAIR · leftover 87.6% | TAKE · ATTACK · LEADS PAIR · leftover 46.2% ← **diff** |
| 15 | SLOW · SAVE · TRAILS PAIR · leftover 92.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 48.1% ← **diff** |
| 16 | HOLD · DELAY · TRAILS PAIR · leftover 84.5% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 50.1% ← **diff** |
| 17 | PIT · SAVE · TRAILS PAIR · leftover 89.1% | PIT · SAVE · LEADS PAIR · leftover 52.1% ← **diff** |
| 18 | PIT · SAVE · TRAILS PAIR · leftover 93.6% | PIT · SAVE · LEADS PAIR · leftover 54.0% ← **diff** |

### HAM (Ferrari) · L21 vs LEC

- **Show:** 2026 · Dutch Grand Prix · HAM · L21 · JUMP vs LEC
- **Recorded pair:** P3 vs P4 · BATTLE · 0.61s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +1 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 5 in this window; order flip at L26; recorded overtake L21 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 21 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | PIT · SAVE · LEADS PAIR · leftover 4.6% ← **diff** |
| 22 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | PIT · SAVE · LEADS PAIR · leftover 4.6% ← **diff** |
| 23 | SLOW · SAVE · LEADS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 4.6% |
| 24 | HOLD · DELAY · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 4.6% ← **diff** |
| 25 | PIT · SAVE · LEADS PAIR · leftover 4.6% | PIT · SAVE · LEADS PAIR · leftover 4.6% |
| 26 | PIT · SAVE · TRAILS PAIR · leftover 9.2% | PIT · SAVE · LEADS PAIR · leftover 4.6% ← **diff** |

## R13 · Italian Grand Prix

Circuit **Monza**. Windows 114. Worked 12 (**10.5%**). Showing 3 best.

### HAM (Ferrari) · L10 vs PIA

- **Show:** 2026 · Italian Grand Prix · HAM · L10 · JUMP vs PIA
- **Recorded pair:** P3 vs P4 · BATTLE · -6.35s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +4 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 2 in this window; order flip at L12, L13, L14, L15; recorded overtake L10 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 10 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 0.9% ← **diff** |
| 11 | SLOW · SAVE · LEADS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 1.9% |
| 12 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 2.9% ← **diff** |
| 13 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 3.8% ← **diff** |
| 14 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 4.8% ← **diff** |
| 15 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 5.7% ← **diff** |

### HAM (Ferrari) · L23 vs PIA

- **Show:** 2026 · Italian Grand Prix · HAM · L23 · JUMP vs PIA
- **Recorded pair:** P4 vs P5 · BATTLE · -6.48s
- **First action:** recorded ATTACK · model SAVE
- **Hold delta:** +4 pair-ahead laps vs the race
- **Why:** first action SAVE vs recorded ATTACK; pair-lead laps 6 vs recorded 2 in this window; order flip at L25, L26, L27, L28; recorded overtake L23 did not land on the branch

| Lap | Recorded | Model |
| ---: | --- | --- |
| 23 | OVERTAKE · ATTACK · LEADS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 3.5% ← **diff** |
| 24 | SLOW · SAVE · LEADS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 4.0% |
| 25 | SLOW · SAVE · TRAILS PAIR · leftover 9.2% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 4.5% ← **diff** |
| 26 | SLOW · SAVE · TRAILS PAIR · leftover 13.7% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 5.0% ← **diff** |
| 27 | HOLD · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 5.5% ← **diff** |
| 28 | SLOW · SAVE · TRAILS PAIR · leftover 4.6% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 5.9% ← **diff** |

### PIA (McLaren) · L37 vs ANT

- **Show:** 2026 · Italian Grand Prix · PIA · L37 · JUMP vs ANT
- **Recorded pair:** P3 vs P2 · OVERTAKE_WINDOW · -155.11s
- **First action:** recorded SAVE · model SAVE
- **Hold delta:** +3 pair-ahead laps vs the race
- **Why:** pair-lead laps 3 vs recorded 0 in this window; order flip at L40, L41, L42

| Lap | Recorded | Model |
| ---: | --- | --- |
| 37 | SLOW · SAVE · TRAILS PAIR · leftover 36.6% | HOLD_PLACE · SAVE · TRAILS PAIR · leftover 37.4% |
| 38 | HOLD · DELAY · TRAILS PAIR · leftover 28.9% | HOLD_PLACE · SAVE · TRAILS PAIR · leftover 42.7% ← **diff** |
| 39 | SLOW · SAVE · TRAILS PAIR · leftover 33.5% | HOLD_PLACE · SAVE · TRAILS PAIR · leftover 48.1% |
| 40 | HOLD · ATTACK · TRAILS PAIR · leftover 12.1% | TAKE · ATTACK · LEADS PAIR · leftover 27.8% ← **diff** |
| 41 | OVERTAKE · ATTACK · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 27.6% ← **diff** |
| 42 | HOLD · DELAY · TRAILS PAIR · leftover 0.0% | HOLD_PLACE · SAVE · LEADS PAIR · leftover 27.4% ← **diff** |

---

## Honesty

Reproducible from cached 2026 races via `eval_model_overtakes.py --works`. The model can hold a pair longer without rewriting the official classification. Energy is a constructed C5.2 store.
