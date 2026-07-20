# Balance notes — simplify-food-economy

## Baseline sweep (2026-07-20, verdantia, 3 runs × 3000 ticks, 40 bots + 25 nations, defaults)

First harness run (fixed housing-bound settlement trigger) exposed a planner
flaw: the logistic asymptotes just under the 0.9·housing trigger while combat
churn shaves it, so bots froze at one Settlement, populations pinned ~2000,
leader share 2.4%, zero eliminations — a peaceful stall.

**Fix adopted:** the binder rule (economy-planner spec, refined) — bots buy
whichever ceiling of `min(foodCapacity, housing)` binds. Purchases alternate
naturally; no trigger thresholds at all.

Result at the same defaults:

| Metric                  | stalled (trigger) | binder rule         |
| ----------------------- | ----------------- | ------------------- |
| alive (of 65)           | 65                | 40                  |
| first elimination       | never             | t1953               |
| mean leader share       | 2.4%              | **10.9%**           |
| mean gini               | 0.18              | 0.56                |
| top population          | 1977              | 171k                |
| top settlements / farms | 1 / 22            | 138 / 51            |
| total starved           | 0                 | 1556                |
| scaling k (A ∝ P^k)     | 1.366 (R² 0.91)   | **1.259 (R² 0.93)** |

Reads healthy: real differentiation without snowball (leader ~11% vs the old
model's ~38–48%), famine exists but is not the default state, and the
area↔perimeter exponent matches the historically measured 1.26.

## Defaults as shipped

FoodConfig defaults in `src/core/configuration/FoodConfig.ts` (design.md D7
table). Notable knobs at this baseline: `farmOutputMilli` 200k (a perfect
7×7 farm feeds 20k), `popGrowthRate/popDeclineRate` 0.005/0.02,
`housingBase/housingPerSettlement` 2k/8k, `farmCost/settlementCost` 1k/2k,
`granaryBase/granaryPerFarm` 5k/2.5k, combat `baseCombatMag/Speed` 90/18,
`kSlope` 1, `kWet` 0.5.

## Open items for the next pass

- Top populations reach ~171k by t3000 — the settlement→housing→pop→food
  chain compounds; if late-game feels runaway, `settlementCost` scaling or a
  higher `housingPerSettlement` price is the lever.
- `totalStarved` is entirely famine-on-conquest (footprints cut, granaries
  drained); watch whether human play finds it legible.
- kSlope/kWet defaults are untested against real play — the shell tuning
  panel exposes both live.

## In-browser playtest (2026-07-20, #shell OpenFront-live, verdantia, 50 bots)

Opening arc: spawn on 0.8-fertility land grew 2000 → ~4800 population in
~300 ticks with the granary banking to its 7500 cap — grow-from-tick-one,
no crash-and-recover. Fertility hover row reads the exact baked byte
(0.44 on mid grassland). The farm placement preview tracks the cursor with
the 7x7 outline, shows the sim's own production fraction, and renders red
on invalid ground (unowned / spacing). Build bar prices in food. The
climate-panel game-mechanics section exposes all 22 knobs live. Zero page
errors.
