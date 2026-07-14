## Context

`TribalEconomy` (src/core/execution/utils/TribalEconomy.ts) is the shared
build brain for nations and tribe bots on layered maps. Its policy is three
hand-tuned constants (`FARMS_PER_SEED = 12`, `MIN_FARM_CROP = 30`,
`BARN_AT_STOCK_FRACTION = 0.85`) plus a fixed priority order. Every knob
re-tune in the balance sweep silently invalidates them.

The sim it drives is closed-form (FoodEconomy.ts, UrbanGrowth.ts,
FarmGrowth.ts, FoodShed.ts):

- Births clamp to `capacity = productionMilli / idleConsumptionMilli`
  (FoodEconomy.ts:150,190) — **population equilibrium is food capacity**, not
  `maxTroops`. Farms are the only production source (`landHarvestMilli = 0`).
- A farm's maturity converges to its tile's `climateSuitability` (Gompertz up,
  senescence down, both capped at suitability — FarmGrowth.ts:101-108), so
  long-run yield per farm is
  `suit(t) × cropN(t) × district(t) × farmYieldMilli` exactly.
- City tiles are placed only on the frontier inside the **military supply
  field** (`supply.dist`, UrbanGrowth.ts:149) contiguous with a **nucleus**
  (Core/Settlements), gated by the farm-fed **food-shed**. So land (urban
  area) tracks population automatically _unless_ the placeable frontier runs
  out — which is what Settlements relieve.
- Storage overflow is rebated to the population, deficits draw from stock —
  storage is war/famine insurance, not throughput.

Constraint: everything runs in the deterministic core (seeded PRNG, no
`Date`/`Math.random`), per-pulse cost must stay near the current sampling
budget, and all core changes need tests.

## Goals / Non-Goals

**Goals:**

- Bot economy decisions derived at runtime from `Config.food()` + layers, so
  re-tuning knobs re-tunes the bots with zero code changes.
- One common currency (population-ticks over a derived horizon) so farm vs.
  settlement vs. barn vs. "build nothing" are directly comparable.
- The model can never disagree with the sim: it imports the sim's own
  functions (`climateSuitability`, `foodShedDecay`, supply curves) rather
  than re-deriving them.
- Same public surface: `TribalEconomy.tryBuild(budget)`; callers
  (`NationExecution`, `TribeExecution`) untouched.

**Non-Goals:**

- Attack/conquest ROI, retreat, or any military decision — future change.
- Human-player assistance/UI (the model is exported and reusable, but no UI).
- Forward simulation (MCTS/rollouts) — the equilibrium math captures the
  value at a tiny fraction of the tick budget.
- Changing any sim behavior. This change is decision-making only; on-map
  outcomes differ only because bots choose differently.

## Decisions

### D1: Common currency = population-ticks over a derived horizon

Every action scores as `ΔPop × usefulTicks − foodCost / idleConsumptionMilli`.
Food converts to population-ticks at the sim's own rate (one person eats
`idleConsumptionMilli` per tick). The horizon is derived, not tuned:
`H = 2 × rampTicks(suit = 1)` — twice the slowest possible farm ramp, from
the same Gompertz closed form as D2 (~100 ticks at defaults). Every farm
therefore spends at least half the horizon mature (steady yield dominates
ramp time), while producing sooner still beats producing marginally more
later. Deriving H from the ramp keeps the two self-consistent: a shorter
fixed horizon could price the _best_ tiles negative purely because their
ramp outlasts it.
_Alternative considered:_ discounted infinite horizon (exponential discount
factor) — rejected: introduces exactly the kind of unexplainable tuning
constant this change removes; a finite horizon states the same preference in
sim-native units.

### D2: Farm value is exact steady-state yield, ramp-discounted in closed form

```
steadyYieldMilli(t) = suit(t) × cropN(t) × (1 + adjacency(t)·adjacencyBonus) × farmYieldMilli
ΔPop(t)             = steadyYieldMilli(t) / idleConsumptionMilli
rampTicks(t)        = ln( ln(m₀) / ln(min(suit(t), 0.95)) ) / farmGrowthRate   // Gompertz closed form, m₀ = farmSeedMilli/1000
score(t)            = ΔPop(t) × max(0, H − rampTicks(t)) − costMilli / idleConsumptionMilli
```

`suit(t)` is the sim's `climateSuitability` (already exported from
FarmGrowth.ts). The Gompertz ODE `dM/dt = r·M·ln(1/M)` has exact solution
`M(τ) = exp(ln(m₀)·e^(−rτ))`, giving `rampTicks` in closed form — no
simulation needed. "Build nothing" is the empty action with score 0; a farm
whose lifetime yield can't repay its cost (barren soil, hostile climate)
scores negative and is skipped — this _derives_ `MIN_FARM_CROP` instead of
assuming it. _Alternative:_ keep a fertility floor constant — rejected, it's
the exact anti-pattern being removed.

### D3: Settlement value = urban-room relief + nucleus coverage

Population is never room-bound (births clamp to food capacity only), but
**land** is: city tiles must be inside the supply field and contiguous with a
nucleus. A Settlement is worth building when the city is (or will be, at
current food capacity) frontier-starved:

```
targetTiles   = capacity / popPerDensity                  // where the city is headed
roomTiles     = |owned tiles in supply field with positive urban suitability, non-farm|
roomDeficit   = max(0, targetTiles − roomTiles)
score(s)      = min(roomDeficit, newRoom(s)) × popPerDensity × H_remaining − cost/idleConsumptionMilli
```

`newRoom(s)` counts owned, suitable tiles the candidate would newly bring
into supply reach (estimated by counting owned land within `supplyRadius` of
s that is currently outside the supply field — same decay family the sim
uses). Candidate sites are sampled near farm clusters that no existing
nucleus's food-shed covers, plus near the border — so settlements land where
the shed and the room are. This _derives_ the `populationOutgrewNuclei`
trigger: found a settlement exactly when the food-supported city outgrows its
placeable room. _Alternative:_ value settlements by supply quality for
attacks — deferred with attack ROI.

### D4: Barn value = insurance target derived from demographics

Storage exists to buffer deficits (overflow is rebated, so an undersized cap
loses nothing in peacetime). The planner keeps enough cap to fully feed the
population for one generation (`avgLifespanTicks`) — the window within which
starvation would otherwise hollow the nation:

```
bufferTarget  = pop × idleConsumptionMilli × avgLifespanTicks   // milli
score(barn)   = positive iff capMilli < bufferTarget AND stock ≥ 0.75 × cap
                (stock near cap ⇒ the banked share is actually accruing)
```

Scored below any positive farm/settlement score of equal cost (insurance
never outranks growth), which reproduces the sane part of the old
stock-fraction trigger from first principles. The `0.75` accrual check is the
one acknowledged policy constant, named and documented in code.

### D5: Greedy selection, existing sampling, existing PRNG

Per `tryBuildOne`: sample candidate tiles exactly as today (seeded PRNG,
border + near-plot anchors, bounded attempts), score every candidate with the
model, execute the single best strictly-positive-score affordable action.
Greedy is near-optimal here because farm values are additive (adjacency is a
small local perturbation; sampling naturally clusters follow-up candidates
next to high-value farms, so districts still emerge). _Alternative:_
exhaustive scan of all owned tiles — rejected: per-pulse cost scales with
territory; sampling keeps today's budget and determinism.

### D6: Model is a separate pure module

`EconomyModel.ts` exports pure functions over `(Game, Player, tile)` — no
state, no PRNG, no executions. `TribalEconomy` becomes candidate generation +
argmax + `ConstructionExecution` dispatch. This keeps the math unit-testable
against the sim (build the model's top pick in a real game, assert realized
steady-state yield matches the prediction within rounding) and reusable by a
future attack-ROI change.

## Risks / Trade-offs

- [Model drifts from sim if FoodEconomy/FarmGrowth change] → the pinning test
  (predicted vs. realized yield in a live game) fails loudly; model imports
  sim functions instead of copying formulas.
- [Bots get stronger; balance shifts] → A/B in the balance harness
  (`BalanceRun.ts`, verdantia, fixed seeds) before/after; snowball metrics
  (leader share) re-checked. If optimal play snowballs, that's a knob
  finding, not an AI bug — record it in balance-notes.
- [Room-deficit estimate (`newRoom`) is approximate — supply is a BFS field,
  the estimate is radial] → acceptable: it only orders settlement candidates;
  the trigger (roomDeficit > 0) uses the real supply field.
- [Per-pulse cost grows: scoring adds climateSuitability + shed lookups per
  candidate] → bounded sampling (≤ ~40 candidates/pulse, as today);
  suitability is O(1) per tile; supply/shed fields are already computed and
  cached per tick by the sim.
- [Greedy misses farm-pair adjacency synergies (~10% district bonus)] →
  accepted; sampling anchored on existing plots recovers most of it, and the
  loss is second-order next to siting accuracy.

## Migration Plan

No data or save migration: decision logic only, deterministic, active only
behind `tribalEconomyActive()` (layered maps). Classic maps byte-identical.
Rollback = revert the commit. Existing tests asserting old heuristic behavior
(farms-per-seed counts, barn timing) are updated to assert model-driven
behavior instead.

## Open Questions

- Whether tribe bots (small pulse budget) should skip settlement scoring
  entirely for cheapness — decide during implementation by measuring pulse
  cost; correctness is unaffected either way.
