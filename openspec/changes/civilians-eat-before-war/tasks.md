## 1. Reorder the food tick so civilians eat first

- [x] 1.1 In `foodTick` (`src/core/execution/utils/FoodEconomy.ts`), keep the war-cohort SUPPLY-LINE ATTRITION (per-attack `warSupplyAttrition` losses) and the `fighting`/`moving`/`warNeed` computation where they are, but MOVE the war REQUISITION (the `taxRatio` production tax + camp/granary draws) to run AFTER the civilian district loop and the camp loop.
- [x] 1.2 Remove the `taxRatio` reduction from civilian available production: each region's civilians eat from the FULL district production (`avail = r.prod`), banking surplus into the tenure-capped granary and drawing local shortfall from granary then camp exactly as today. Track the tick's requisitionable surplus (production/overflow not consumed by civilians) per the design.
- [x] 1.3 After civilians and the camp are fed, requisition the war need from, in deterministic order: (a) the tick's post-civilian surplus (banked into granaries), (b) the camp stock `_foodMilli`, (c) granary reserves `_fieldStockMilli` (largest-first, tile-id tiebreak — unchanged). Accumulate `warPaid`; compute `warFed = clamp(warPaid / warNeed, 0..1)`.
- [x] 1.4 Keep the existing war-starvation path (`_warStarveCredit`, `warStarved`, proportional `setTroops` cuts across attacks/boats) driven by the new `warFed`; civilians are no longer taxed to feed the army.
- [x] 1.5 Preserve determinism, integer/bigint milli-food math, and every `_foodFlow` output (`production`, `consumption = civNeed + warNeed`, `starvedTroops`, `capacity`, `population`) and the `surplusRatio` return value.

## 2. Tests

- [x] 2.1 Add a core regression test (`tests/FoodEconomy.test.ts`) that puts a nation at half its farm capacity, commits a wave whose fight-consumption exceeds production, and asserts the low-water civilian idle pool does NOT crater. Verified it FAILS against the pre-fix (army-first) code (minIdle 2690 < threshold) and passes with the fix.
- [x] 2.2 Add a case asserting the over-deployed cohort spends itself in the field while the civilian idle pool holds throughout.
- [x] 2.3 Ran `npx vitest` across the food/economy/attack suites (88 passing) and the full suite; the only failures are the pre-existing known-failing baseline (InputHandler/UserSettings/SoundManager/GameView/PlayerView — localStorage/DOM env), not this change.

## 3. Balance + verification

- [ ] 3.1 Re-run `tests/perf/balance/BalanceRun.ts` (a couple of seeds/difficulties) and confirm war remains costly via army attrition without runaway civilian loss; note results in the change's balance evidence. (DEFERRED — heavier perf run; the regression test already shows the deployed cohort spends itself while civilians hold.)
- [x] 3.2 `npm run lint` and `npm run format` on the touched files (FoodEconomy.ts + FoodEconomy.test.ts) — clean; `tsc --noEmit` clean.
