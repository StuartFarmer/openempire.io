# Tasks: simplify-food-economy

Staged so the suite stays green per task: build the new model first, cut the
old systems over, then delete them one per task with their tests.

## 1. Fertility (tile-fertility spec)

- [x] 1.1 `FertilityMap` core util: bake the u8 fertility plane at map load from crop/humidity/water/temperature (design D1 formula, water/impassable = 0); expose `game.fertility(tile)`; tests: 0.5-at-mid calibration, determinism, water = 0
- [x] 1.2 New `FoodConfig` shape (design D7 knob table) replacing the 64-knob interface; keep the `FOOD_TUNABLE_KEYS` derivation and `tune_food_config` intent working; update TuningPanel groups
- [x] 1.3 Client fertility overlay rendering the baked plane + numeric value in the tile readout (game HUD and #shell hover rows)

## 2. Farms (farm-growth spec)

- [x] 2.1 Farm production: per-tick `farmOutputMilli × avgOwnedFertility(footprint) × fertilityBonus` over the Chebyshev radius; no maturation/labor/CA in the path; tests: fertility ratio, conquest-cuts-footprint, instant full rate
- [x] 2.2 Spacing rule in `canBuild` (no own Farmland within `2·farmRadius`); test both sim rejection and bot compliance
- [x] 2.3 Placement preview: footprint outline + fertility tint + invalid state on hover (game client and #shell build mode)

## 3. Pool + population (food-economy spec)

- [x] 3.1 Rewrite `foodTick`: production → consumption → granary buffer → cap, single national pool; `costResource: food` purchases draw it; tests: buffer-then-famine order, cap overflow, no war food coupling
- [x] 3.2 Single-logistic population with asymmetric rates and one milli-credit accumulator; `maxTroops = housing`; tests: S-curve to capacity without overshoot, decline > growth rate, housing bind + settlement unbind
- [x] 3.3 Spawn kit: 1 Settlement + 1 Farmland + `startingFood` + `startPopulation`, identical for all player types; remove starter-field pre-claiming

## 4. Structures (tribal-buildings spec)

- [x] 4.1 Settlement/Farmland purchase path via `costResource: food`; housing from completed Settlements; structure razing on conquest (`capturedPlotRazeChance`) kept; Barn goes dormant
- [x] 4.2 Presentation-only city painter: footprint sized `population/popPerDensity` around Settlements over the existing density channel; assert-no-feedback test (disabling the painter changes no sim outcome)
- [x] 4.3 HUD/build-bar: food costs replace seed counters; remove allocation sliders (HUD + #shell)

## 5. Combat terrain (combat-terrain spec)

- [x] 5.1 `attackLogic` slope+wetness factors replacing the terrain-type switch (design D5); neutral toll on the continuous mag; tests: uphill > downhill cost/speed, dry < wet, kSlope=kWet=0 vanilla degradation, defender-density/post factors unchanged
- [x] 5.2 Remove the food-war couplings from `AttackExecution`/`FoodEconomy`: no fight/move consumption, no requisition, no war starvation, no supply attrition

## 6. Deletions (one per task, suite green after each)

- [x] 6.1 Delete `SeedAwards.ts`, seed banks, award ratchet + tests; prune en.json seed strings
- [x] 6.2 Delete `SupplyField.ts` + supply knobs + tests
- [x] 6.3 Delete tile damage (GameImpl plane, heal tick, render channel, damage gates) + tests; keep the damage-free razing rule
- [x] 6.4 Delete `TileTenure.ts` + tenure knobs + tests
- [x] 6.5 Delete `FoodShed.ts`, `FarmGrowth.ts` (CA/maturation/labor), field claim state + tests
- [x] 6.6 Delete the `food_allocation` intent, `foodPopulationShare`, `defaultPopulationShare` from Schemas/executions/Transport + tests; prune en.json
- [x] 6.7 Delete credit demographics remnants (`_birthCredit`/`_deathCredit`/`_starveCredit`/`_warStarveCredit`, `minViablePopulation`, lifespan knobs) + tests
- [x] 6.8 Rewrite `EconomyModel`/`TribalEconomy` to the two bot rules (economy-planner spec); drop `fieldStaffingNeed` from `AiAttackBehavior`; delete the planner calculus + its tests, add the two-rule tests

## 7. Reconciliation + balance

- [x] 7.1 Sweep for orphans: dead knobs in `FoodConfig`, unused GameUpdate channels, stale en.json keys (`TranslationSystem` test), `MapConsistency` untouched; full suite green (known-failing baseline excepted)
- [x] 7.2 Balance harness re-sweep at new defaults (`--difficulty` spread): alive count, leader share, time-to-first-settlement vs the old model; record tuned defaults in balance-notes.md
- [x] 7.3 In-browser playtest via run-openfront + #shell: opening arc (grow from tick one), farm placement preview, fertility overlay, a war across wet/dry and up/downhill terrain; note findings in balance-notes.md
- [x] 7.4 Annotate `rework-settlement-ecology` as superseded by this change (note in its proposal.md; archive decision per design Open Questions)
