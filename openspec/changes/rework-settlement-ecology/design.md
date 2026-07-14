# Design: rework-settlement-ecology

The living document for the ecology model. Modify freely — specs follow this.

## The model in one picture

```
 CONQUER LAND ──award──▶ FARM SEEDS ──place──▶ farms ripen (climate, exists)
      │                                            │ tenure grows (new)
      │                                            ▼
      │                                   local food + local storage
      │                                            │
      ▼                                            ▼
 tiles start at                          neighborhoods feed people
 tenure ZERO,                            births/deaths (lifespans, exists)
 possibly DAMAGED                                  │
 (conquest = investment)                           ▼
                                          population = farm labor ──┐
                                                   ▲                │
 PEAK POPULATION ──award──▶ SETTLEMENT SEEDS       └────────────────┘
                                │                   the ecology loop
                                ▼                   (and the death spiral)
                        new city nuclei
                        density caps rise with tenure
```

Three player decisions remain: **where to attack**, **where to plant awarded
seeds**, **what to protect**. Everything else runs itself.

## 1. Seed awards

| Currency        | Earns            | Ratchet                         |
| --------------- | ---------------- | ------------------------------- |
| Peak territory  | Farm seeds       | tiles-ever-held high-water mark |
| Peak population | Settlement seeds | population-ever high-water mark |

- **Ratchets, not current values**: awards trigger when the high-water mark
  crosses a threshold. Losing land/people never revokes a seed ("fixed"
  settlements), and oscillating can't farm awards.
- **Power-law ladder for settlements**, derived from the geometric scaling law
  (§6): the nth settlement triggers at `basePop · n^k`, where `k` is the
  measured area↔perimeter exponent (~2 for compact territory). Each settlement
  then costs a constant increment of _frontier effort_ (linear dimension), not
  a constant increment of population — the quadratic interior advantage is
  taxed back to linear. `basePop` and `k` are Config.food() knobs; `k` is
  discovered, not hand-picked.
- **Farm seeds per territory**: linear per-N-tiles to start (land → food
  potential should scale roughly with land). Knob.
- Seeds are **banked tokens** placed via the BuildBar (agency retained);
  placement costs nothing. Food's only job is feeding people.
- **Barns**: gone. Storage is an emergent property of stable farmland (§2).

Open: should the starter kit at spawn be expressed as pre-banked seeds?
(Probably yes — one system.)

## 2. Tile stability (tenure)

One clock, many consumers. A single map-wide per-tile tenure counter
(owner-agnostic — stability is the tile's continuous life, not the holder's).

**Demand-gated**: the clock only runs while the tile is _pushed against its
current limit_:

- City tile: runs while the tile is fully populated at its current density cap.
  A half-empty tile doesn't need more density, so it doesn't age.
- Farm tile: runs while maturity has settled at the tile's climate suitability
  (the farm is doing all this ground allows).

**Consumers** (all saturating curves — a plateau, so old empires don't become
unassailable; reuse the Gompertz shape from FarmGrowth):

- **City density cap**: `popPerDensity · capCurve(tenure)` — young suburb holds
  fewer people per tile than a century-old core.
- **Farm storage capacity**: local milli-food capacity per farm =
  `storageCurve(tenure)`. Replaces Barns.
- **Settlement nucleus strength**: growth pacing and/or supply radius scale with
  the nucleus tile's tenure. The nucleus is logically the oldest tile in the
  metro — founding early matters, capitals have gravity.

**Disruption taxonomy** (the key tuning surface — asymmetric on purpose,
because stability stacks a third positive-feedback loop onto the death spiral):

| Disruption                       | Response to tenure    | Rationale                                   |
| -------------------------------- | --------------------- | ------------------------------------------- |
| Ownership flip (conquest)        | Hard reset to 0       | War scars land; conquest = investment       |
| Depopulation (famine, recession) | Slow decay, NOT reset | Famine must be recoverable, not a crater    |
| Combat over the tile             | Clock paused + damage | Battlefield stalls growth, doesn't erase it |
| Plot razed (war-razing change)   | Reset                 | Composes with add-war-razing-and-spoilage   |

A tile must be **fully healed** (damage = 0, §3) before its clock can run.

## 3. Tile damage

- Fighting over a tile (tile inside an active attack's advance; exact trigger:
  each tile conquered in combat, plus tiles the front passes through) adds
  damage `0..1`.
- Damage **heals linearly over time** (knob: healPerTick). Heavily contested
  corridors stay battle-worn for a long while.
- While damage > 0 the tile: cannot receive urban growth, cannot have a farm
  planted, an existing farm's maturity is frozen (or senesces — open question),
  and tenure is paused. **Full heal before stability.**
- **Render**: a single standard brown, alpha-scaled by current damage. Later:
  texture/rubble pass; for now the gradient tint is the readability
  requirement.

## 4. Local food + labor

The local-ledger model ("rung B"): food is local, the population count stays
global but is _spatialized_ by the existing per-tile density field.

- **Labor**: each farm needs `farmersPerFarm` people to tend it. Output ×
  `max(laborFloor, min(1, localPop / farmersPerFarm))` — a soft factor with
  a floor, so degradation is graceful and labor alone never zeroes a farm.
  The labor pool of a farm (computed at food-shed refresh) is:
  1. city-dwellers in its nearest-farm Voronoi cell of the shed, with
     surplus beyond `farmersPerFarm` spilling to under-tended farms of the
     same shed network (a dense core staffs several nearby farms); PLUS
  2. an equal split of the RURAL population — everyone not housed in a city
     tile. Discovered the hard way: without the rural pool the model is a
     bootstrap death-trap (a young village has no city tiles → no labor →
     no food → never earns a city tile). Rural labor is aspatial until §4.2
     spatializes the population fully.
  Measured effect (harness, verdantia t2000): 25/26 nations alive (was 16)
  and leader share 12.8% (was 20.6%) — under-tended frontier farms are a
  strong natural anti-snowball brake.
- **Distribution**: farm output lands in its food-shed (FoodShed.ts stops being
  only a growth gate and becomes the feeding channel). Each neighborhood's
  fed-ratio is computed locally; local births/deaths flow through the density
  field of that neighborhood.
- **Storage**: local. Surplus banks into the district's stable-farmland
  capacity; shortfall draws the local stock first. A famine is a _regional_
  event — one metro recedes while another thrives.
- **Death-spiral guards** (all three deliberate):
  1. labor is a soft multiplier, not a gate;
  2. starvation acts faster than farm senescence — a famine leaves hungry
     people and intact-ish farms (recoverable), not dead farms;
  3. tenure decays (not resets) on depopulation.

Deferred to a future change ("rung C"): migration — people flowing from
starving neighborhoods toward fed ones. Without it, pockets can still die in
place; watch playtests for whether it's needed.

## 5. Legibility (first-class, not polish)

- Stability must be visible: city tiles intensify (darker/denser render) with
  tenure; heartland readable at a glance.
- Damage: brown gradient (§3).
- Seed bank: award counters where food prices used to be in the BuildBar; a
  toast/ping when a milestone awards a seed.

## 6. The geometric scaling law (discoverable balance basis)

The snowball has a geometric root, prior to any economic tuning. A nation's
**interior (area)** holds its population, farms, and manpower; its **border
(perimeter)** is where all contest — attack, defense, expansion — happens. For
compact territory the two are quadratically related:

```
        A ∝ P²      (circle bound: area grows as the square of circumference)
```

so doubling your fighting frontage **quadruples** the manpower behind it.
Every "per-tile" or "per-person" knob silently inherits this: flat thresholds,
flat award rates, and flat costs are all exponential fuel for whoever is
already biggest.

Real maps are not circles — coastlines, mountains, and neighbors make the
effective exponent an **empirical quantity**: fit `A ∝ P^k` and expect
`k ≤ 2`, varying by map and by game phase (ragged wartime borders have more
perimeter per area than a consolidated blob). So we **measure it, not assume
it**:

- The balance harness (`tests/perf/balance/BalanceRun.ts`) logs a per-nation
  time series each cadence: `(tick, areaTiles, borderTiles, population,
troops)`.
- A fitting pass runs log-log regression over the runs and emits `k` per map
  plus an aggregate — a report artifact recorded in balance-notes, and the
  chosen value checked into Config as `scalingExponent`.
- **Measured 2026-07-14** (BalanceRun, 25 nations + 40 bots, 3000 ticks):
  verdantia `k = 1.263` (R² 0.941, n = 5830), pangea001 `k = 1.272`
  (R² 0.935, n = 2736). Real borders are RAGGED — far below the circle
  bound of 2 — and remarkably map-stable. Adopted `scalingExponent: 1.26`.
- `k` is a **measured constant baked into config**, not a live in-sim
  computation — deterministic, legible, and re-measured whenever knobs or maps
  change enough to matter.

**Consumers** — anything that should cost "constant effort" gets normalized by
the law rather than hand-tuned:

| Quantity                  | Naive (snowball fuel) | Law-normalized                            |
| ------------------------- | --------------------- | ----------------------------------------- |
| Settlement ladder (§1)    | flat per-100k pop     | nth threshold ∝ `n^k`                     |
| Farm-seed award rate (§1) | flat per-N tiles      | candidate: per-`A^(1/k)` (frontier units) |
| Supply / attrition radii  | flat radius           | candidate: scale with `√A`                |
| Density-cap plateau (§2)  | flat ceiling          | candidate: phase-scaled                   |

Only the settlement ladder is committed in this change; the rest are listed so
future balancing reaches for the measured law first and a magic number second.

## Determinism & perf

- Tenure and damage are map-wide integer arrays updated on the existing supply
  cadence (`supplyRefreshTicks`) — same pattern as SupplyField/FoodShed. All
  math integer or fixed-order float; no wall-clock, no unseeded randomness.
- Neighborhood feeding reuses the food-shed BFS already computed per player per
  cadence; the incremental cost is one pass over owned tiles.

## Open questions (edit as they resolve)

1. Farm-seed award basis: peak territory (spec'd) vs. gross tiles-ever-conquered
   vs. current holdings. Peak-territory ratchet chosen for symmetry with
   settlements and anti-oscillation; revisit if it under-rewards aggression.
2. Damaged farms: freeze maturity or senesce while damaged?
3. Do awarded-but-unplaced seeds persist forever, or expire? (Lean: forever —
   simpler, and hoarding placement is self-punishing since unplaced seeds feed
   no one.)
4. Exact ladder values, tenure-curve time constants, damage/heal rates — all
   harness territory (`tests/perf/balance/`).
5. Migration (rung C) — only if regional death-in-place proves unfun.
