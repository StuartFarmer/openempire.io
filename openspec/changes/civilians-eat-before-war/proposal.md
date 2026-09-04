## Why

Deploying a normal-sized attack wave can annihilate a nation's entire civilian
population (e.g. 1,000,000 → ~10,000 in ~2 seconds) even though only a small
fraction of troops are actually committed. The war cohort is fed by
**requisition with absolute priority over civilians**: it taxes food production
first and drains the camp stock and every granary before civilians eat. Because
a deployed attacker consumes 4× a civilian (`fightConsumptionMilli` 40 vs
`idleConsumptionMilli` 10) and a nation sits at its food-production ceiling,
committing ~25% of the population in a wave requisitions ~100% of food output.
Civilians then get zero food and starve at up to 19%/tick, wiping the
population. War should cost you your **army**, not your civilians.

## What Changes

- **Reverse the food-priority order in the per-tick food tick.** Each feeding
  district's **civilians eat first** from that district's own production and
  granary. The **war cohort requisitions only what's left** — the post-civilian
  surplus, then the camp stock, then granary reserves.
- **An underfed army starves instead of the civilians.** When requisition can't
  cover the war need, `warFed` drops and the existing war-starvation attrition
  thins the deployed cohort (attacks/boats) — civilians keep eating their local
  production. A prolonged over-deployment melts the army, not the nation.
- Removes the production **tax on civilians** (`taxRatio`) as the mechanism that
  fed the army; the army is funded from genuine surplus + reserves instead.
- No config-constant retuning is required for correctness; the fix is structural
  (ordering + funding source). Balance re-sweep via `tests/perf/balance` after.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `food-economy`: the per-tick provisioning order changes so district civilians
  are fed before the war cohort requisitions food; war need is met from surplus
  and reserves only, and an unmet war need starves the deployed cohort rather
  than the civilian population.

## Impact

- **Code**: `src/core/execution/utils/FoodEconomy.ts` (`foodTick` — reorder the
  requisition block after civilian feeding; fund war from surplus + reserves;
  keep `warStarved` attrition). No signature changes; `_foodFlow` outputs
  unchanged.
- **Tests**: add a core sim regression test proving a large deployment no longer
  collapses the civilian population, and that a sustained over-deployment
  instead thins the deployed cohort. `src/core` changes require tests.
- **Balance**: re-run `tests/perf/balance/BalanceRun.ts` to confirm war remains
  costly (army attrition) without runaway civilian loss.
- No client, schema, or save-format impact.
