## Context

`foodTick` (`src/core/execution/utils/FoodEconomy.ts`) provisions three cohorts
each tick: district civilians, the camp, and the deployed **war cohort**
(outgoing-attack + transport-ship troops). Today the war cohort is served
FIRST:

1. Requisition (lines ~108-138): `taxRatio = min(1, warNeed / fieldProd)` is
   removed from every district's civilian-available production, then the
   shortfall is drawn from the camp stock (`_foodMilli`) and every granary
   (`_fieldStockMilli`), largest first.
2. Only then do civilians eat the taxed-down production + whatever granary/camp
   is left (lines ~195-279).

At the food-production ceiling `production ≈ population × idleConsumptionMilli`.
Since `fightConsumptionMilli` (40) = 4× `idleConsumptionMilli` (10), committing
~`population/4` troops makes `warNeed ≈ production`, `taxRatio → 1`, civilians
get zero, and `starveFractionOf(0) = baseDeathFraction × (1/minFedForLife − 1)`
= 0.01 × 19 = **0.19/tick** — the civilian population collapses in ~22 ticks.

The sim is deterministic (seeded, integer/bigint milli-food, no floats in
outcomes); any reordering must preserve determinism and the `_foodFlow`
readouts the shell/stats consume.

## Goals / Non-Goals

**Goals:**

- District civilians are fed before the war cohort takes anything.
- The war cohort is funded only from genuine surplus + national reserves; when
  that can't meet `warNeed`, the **deployed cohort** starves (existing
  `warStarved` path), not civilians.
- Over-deploying costs you your army (attrition), never your civilian base.
- Determinism, integer/bigint math, and `_foodFlow` fields preserved.

**Non-Goals:**

- Retuning `fightConsumptionMilli`/`idleConsumptionMilli`/`minFedForLife` or any
  FoodConfig constant (structural fix only; balance re-sweep is separate).
- Changing supply-line attrition (`warSupplyAttrition`), farm growth, urban
  recession, or the camp/granary storage model.
- Changing how much a wave sends or the attack mechanics.

## Decisions

**D1 — Feed civilians first, requisition the army from the leftover.**
Reorder `foodTick` so the civilian district loop and the camp loop run BEFORE
war requisition. Civilian available production is the FULL district production
(no `taxRatio`). Each district banks its post-civilian surplus into its granary
(tenure-capped) exactly as today; the amount that would overflow the cap plus
any untouched production becomes the tick's **requisitionable surplus**.

Alternative considered: keep the army-first order but clamp `taxRatio` so
civilians always retain `civNeed`. Rejected — it still lets the army empty the
granaries before civilians can draw on them during a genuine local shortfall,
and it keeps two coupled clamps instead of a clean ordering.

**D2 — War funding sources, in deterministic order:** (a) the tick's
requisitionable civilian surplus, (b) the camp stock `_foodMilli`, (c) granary
reserves `_fieldStockMilli` (largest-first, tile-id tiebreak — unchanged order).
`warPaid` accumulates across these; `warFed = clamp(warPaid / warNeed, 0..1)`.
Reserves remain drainable by the army (a nation CAN wage war on its stores), but
only AFTER civilians have eaten this tick, so spending reserves on war removes
the buffer without directly starving anyone the same tick.

**D3 — Unmet war need starves the deployed cohort, unchanged.** The existing
`_warStarveCredit += (fighting + moving) × starveFractionOf(warFed)` and the
proportional `setTroops` cuts across attacks/boats stay as-is. With civilians no
longer subsidizing the army, a starving front now thins itself — the intended
"supply cost of war" — instead of exporting the famine home.

**D4 — Preserve outputs & determinism.** `productionMilli`, `civNeed`,
`warNeed`, `capacity`, `surplusRatio`, births/old-age, and every `_foodFlow`
field keep their current definitions and units. All new accumulation stays in
milli-food Numbers / bigint camp stock; iteration orders remain sorted by tile
id. `flow.consumption` still reports `civNeed + warNeed`.

## Risks / Trade-offs

- [At the ceiling, surplus ≈ 0, so a deployed army is fed almost entirely from
  reserves and melts once reserves are gone] → Intended: that is the "war is
  paid from your stockpile, then your army attrits" model, and it replaces total
  civilian genocide. Balance harness confirms war stays meaningfully costly.
- [Reserves can still be drained to zero by a huge sustained deployment,
  removing the civilian buffer for a later shortfall] → Acceptable and
  legible: you spent your granaries on war. Civilians only die if LOCAL
  production later can't cover them — a real regional famine, not a war tax.
- [Reordering a hot per-tick function risks a subtle regression] → Guard with a
  focused core regression test (large deployment must not collapse civilians;
  sustained over-deployment must thin the deployed cohort) and a balance
  re-sweep before archiving.

## Migration Plan

Pure in-place logic change in one core function; no data/schema/save migration.
Rollback is reverting the commit. Ship behind the normal food economy (no flag).

## Open Questions

- Should a small guaranteed civilian reserve be withheld from army requisition
  of granaries (so reserves can never be fully spent on war)? Deferred — start
  with "army may drain reserves after civilians eat"; revisit if the balance
  sweep shows reserve-dumping is dominant.
