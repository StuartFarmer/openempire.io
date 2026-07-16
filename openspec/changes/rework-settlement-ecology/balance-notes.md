# Balance notes — rework-settlement-ecology

All runs: verdantia, 3000 ticks, 25 nations / 40 bots, BalanceRun defaults
unless noted. History runs top to bottom — each row reflects the code state
at that point in the build, so rows are NOT knob-only A/Bs against each
other unless grouped.

## Scaling law (spec: measured, not assumed)

| Date       | Code state                | k (pooled) | R²    | n    |
| ---------- | ------------------------- | ---------- | ----- | ---- |
| 2026-07-14 | seed awards (task 3)      | 1.263      | 0.941 | 5830 |
| 2026-07-15 | field CA (task 5)         | 1.298      | 0.979 | 1909 |
| 2026-07-15 | local economy (tasks 4/6) | 1.341      | 0.980 | 3875 |

Ragged real borders hold well below the circle bound of 2 across every
economy iteration; `scalingExponent: 1.26` stays adopted (the drift to ~1.3
is within map/phase noise — revisit if a future sweep moves it past ~1.4).

## Build-milestone health (same harness, evolving code)

| Milestone                   | Alive | Leader | Starved | Top pop |
| --------------------------- | ----- | ------ | ------- | ------- |
| 4.1 labor multiplier        | 25/26 | 12.8%  | —       | —       |
| task 3 seed regime          | 16/26 | —      | —       | —       |
| task 5 field CA (bots still | 4/25  | 44.2%  | 16k     | 861k    |
| trying to BUY plots)        |       |        |         |         |
| tasks 4+6 local econ + seed | 10/25 | 37.6%  | 95k     | 80k     |
| bots (knobs 6/12)           |       |        |         |         |

The 861k → 80k top-population drop is the local economy working as
designed: a nation grows only what its REGIONS can feed, not what a global
pool can. The 95k starvation total said the default region reach was too
tight — see the sweep.

## Knob sweep 2026-07-15 (1 run each, local-economy code state)

| Config                                      | Leader | Starved |
| ------------------------------------------- | ------ | ------- |
| defaults (spread 6, shed 12, yield 20k)     | 37.6%  | 95k     |
| fieldTileYieldMilli 35k                     | 48.5%  | 156k    |
| fieldSpreadRateMilli 12 + foodShedRadius 18 | 37.9%  | 35k     |

Findings:

- **More yield is snowball fuel, not relief** — raising per-tile yield fed
  the leader (48.5%) and INCREASED starvation churn (bigger booms, same
  regional ceilings). Confirms the geometric-law intuition (design §6):
  flat per-tile generosity compounds for whoever holds the most tiles.
- **Reach, not richness, looked like the binding constraint**: faster field
  spread plus wider sheds (fewer people stranded beyond every shed →
  smaller camp cohort, bigger feeding regions) cut total starvation ~63% at
  flat leader share in the single sweep run. ADOPTED:
  `fieldSpreadRateMilli: 12`, `foodShedRadius: 18` — but see the caveat.
- **Caveat (confirming 2-run pass at the adopted knobs)**: alive 12 & 6,
  leader 37.9% & 52.1%, starved ~52k/run vs baseline ~48k/run — seed
  variance dominates single-run comparisons and the starvation win did NOT
  robustly reproduce. The knobs are kept on MECHANICAL grounds (a kit field
  must outrun the birth curve; wider sheds shrink the starving camp
  cohort), not statistical proof. The next sweep needs ≥5 seeds per config
  before trusting any delta under ~2×.

## District planner A/B 2026-07-15 (task 9)

Paired legs: same seeds (bal-0/1/2), verdantia t3000, 25 nations / 40 bots,
`--override settlementLadderBasePop=3000` on BOTH sides (see the finding
below — at the default 10k first rung no seeds flow at all, so the planners
are indistinguishable at defaults). Baseline = task-6.1 planner
(suitability-sum farm score, deficit-only settlement trigger); new =
task-9 district planner.

| Metric                   | Baseline      | District planner |
| ------------------------ | ------------- | ---------------- |
| TopSettlements (per run) | 0 / 0 / 0     | 2 / 1 / 1        |
| TopFarms (per run)       | 2 / 2 / 2     | 3 / 2 / 2        |
| TopCapacity (per run)    | 5.2k/7.0k/11k | 10.3k/8.2k/11.1k |
| Alive (per run)          | 21 / 25 / 25  | 21 / 25 / 25     |
| Mean leader share        | 21.3%         | 20.9%            |
| Mean gini                | 0.680         | 0.676            |
| Total starved            | 2 095         | 3 452            |
| "cannot build" overdraws | 24            | 0                |

Findings:

- **Settlement seeds finally place** — the headline TopSettlements 0 → 1–2.
  The deficit-only trigger never fired (as flagged in the last sweep);
  seed-pressure pair founding does, and top capacity rises ~28% at FLAT
  leader share and identical alive counts — growth without snowball fuel.
- **Starved rose 2.1k → 3.5k** — more people existing to starve when a
  region collapses. Under the ≥5-seed rule this < 2× delta is not yet
  trustworthy; watch it next sweep.
- The old planner ALSO overdraws its seed bank once seeds flow (24 warns);
  the commitment ledger in the new planner removes the class.

**Finding — defaults award nothing at t3000**: at `settlementLadderBasePop`
10k no nation crossed the first rung in any run (TopCapacity 8–10k, ceiling-
bound) → zero founding pairs the whole game, TopFarms 1 (the kit),
TopSettlements 0 regardless of planner. Worse, `UrbanAreaMax = 1` in every
run: no bot CITY ever grows past its core tile in the harness (the 8.4
browser arc shows humans growing fine). Until the bot growth stall is
diagnosed (demand gate? camp cohort? shed potential at spawn sites?) or the
first rung is lowered, the seed economy is inert for bots at default knobs
— this is the next balance pass's top item, ahead of any knob sweep.

## Bot ignition 2026-07-15 (task 10 — the growth stall, diagnosed and fixed)

GrowthProbe (tests/perf/balance/GrowthProbe.ts) traced the stall to a chain,
each link confirmed in-probe: kit-field ceiling (~4–9k capacity, room and
frontier NOT binding — labor and war were) < 10k first rung → no pairs ever
→ hollow Settlements (urban target 0 below 20k pop) → planner splitting one
labor pool across adjacent nuclei → nations attacking their farmers away
(fields tilled by the IDLE pool; unbounded attacks → fallow → famine).
Fixes: rung 4k (10.1), nucleus-anchored urban target (10.2), attack
staffing reserve (10.3), planner labor dedupe (10.4).

Defaults, verdantia t3000, 25 nations / 40 bots, 3 seeded runs, before
(task-9 code) → after (task-10):

| Metric                   | Before (task 9) | After (task 10)  |
| ------------------------ | --------------- | ---------------- |
| TopPopulation (per run)  | 7.5k/6.1k/3.1k  | 9.7k/31.3k/22.4k |
| TopSettlements (per run) | 0 / 0 / 0       | 2 / 2 / 1        |
| TopFarms (per run)       | 1 / 1 / 1       | 3 / 3 / 2        |
| UrbanAreaMax (per run)   | 1 / 1 / 1       | 3 / 3 / 4        |
| Alive (per run)          | 22 / 25 / 25    | 21 / 24 / 19     |
| Mean leader share        | 22.1%           | 21.7%            |
| Total starved            | 6.0k            | 28.6k            |
| Pooled k                 | 1.445           | 1.385            |

The seed economy now RUNS at defaults: multi-rung awards, founded towns
with real city tiles, multi-district fields — at flat leader share (no new
snowball). Watch items for the next sweep: total starvation scaled with the
much larger living populations (28.6k — churn, not collapse: alive counts
held); alive dipped in one seed (19) — bigger nations, bigger wars; k
drifted to 1.385 (still < 1.4, `scalingExponent: 1.26` stays adopted but is
nearing the revisit line).

## Open levers for the next sweep

- `farmersPerFieldTile` (50): labor never bound in these runs — field size
  was land/suitability-bound. Verify it bites after long peace.
- `fieldClaimMilli` (300) and the water weights: untouched; the river-race
  pacing is eyeballed, not swept.
- ~~`settlementLadderBasePop` (10k)~~ RESOLVED by task 10: placement fixed
  by the task-9 district planner, the rung dropped to 4k (inside the kit's
  reach, now a spec invariant in seed-awards), and the growth stall's other
  three links fixed — see the ignition section.
- Starvation churn at the new scale (28.6k/3 runs): re-examine granary
  knobs (`fieldTileStorageMilli`, decay) once ≥5-seed sweeps are running.
- Blitz-vs-turtle audit (tenure/damage constants) still to run — now with
  the attack staffing reserve in play (does "farmers stay home" over-turtle
  Hard/Impossible nations?).
