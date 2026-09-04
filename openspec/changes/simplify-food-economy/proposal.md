# Proposal: simplify-food-economy

## Why

The settlement-ecology model has grown into eleven interlocking systems with 64 knobs (Liebig/Gompertz farm maturation, a farm CA with labor coverage, Voronoi food sheds with per-district granaries, tile tenure, tile damage, a supply BFS with three overlapping ways deployed troops die, credit-based demographics, a seed-award ladder, and a 5-weight urban CA). Playtesting shows the product of these systems is illegible: optimal play is unclear, battles feel arbitrary (three stacked death channels on top of vanilla combat), and spawn soil quality is a hidden ~cropN² life-and-death lottery. This change replaces the whole stack with a model a player can compute in their head — every mechanic answers exactly one visible question — while keeping the fork's identity (terrain quality drives the economy; food gates growth; troops are population).

## What Changes

- **BREAKING** — the food economy is replaced wholesale. The new model:
  - **Baked tile fertility**: one 0..1 number per tile, computed once at map load from the crop/humidity/water/temperature layers, calibrated so mid-range inputs ≈ 0.5, with a `fertilityBonus` multiplier knob. Rendered as a toggleable overlay — the player reads the land before planting.
  - **Fixed-radius farms**: a Farmland works all owned land tiles in a fixed radius; production = `farmOutput × avgFertility(footprint) × fertilityBonus`. Placement UI outlines the footprint on hover. No maturation mechanic, no cellular automaton, no labor coverage.
  - **One national food pool**: production in, `population × consumption` out, one granary with cap `base + perFarm × farms`. Food is the build currency — Settlement and Farmland cost food via the existing `costResource` mechanism. No districts, no regions, no decay, no allocation slider.
  - **Single logistic population**: population moves toward `min(foodCapacity, housing)` at one rate up and a faster rate down. Housing = `base + perSettlement × settlements`. Troops remain population (merged).
  - **Vanilla combat with continuous terrain**: the per-tile attack cost/speed keeps every vanilla factor (defender density, defense posts, size debuffs, neutral toll) but replaces the 3-band Plains/Highland/Mountain switch with two continuous factors from data the sim already has: an uphill-climb multiplier from packed magnitude deltas, and a wetness multiplier from the humidity/water layers. Dry land is fast and cheap; rainforest is slow and costly; attacking uphill bleeds.
- **BREAKING** — deleted subsystems (land reverts to always-usable; no hidden fields): food sheds/districts, the military supply field and war supply attrition, war requisition and war starvation, fight/move food consumption, tile tenure/stability, tile damage (conquest still razes structures via the raze-chance rule), the farm CA and labor coverage, farm maturation (Gompertz/Liebig/GDD/AquaCrop), the seed-award ladder, the food-allocation slider and intent, and the credit-based demographics (births/deaths/starvation/lifespan accumulators).
- Bots simplify accordingly: buy a farm on the best affordable footprint, buy a settlement when housing-bound; attack logic keeps the existing reserve behavior minus deleted food coupling.
- The city-footprint painting survives as **presentation only** — a visual that tracks population, never a mechanic that feeds back into the sim. The player never paints; they fight and place structures.
- The in-game tuning panel keeps working over the new (much smaller, ~15-knob) `FoodConfig`.

## Capabilities

### New Capabilities

- `tile-fertility`: the baked per-tile fertility field — formula, 0.5-at-average calibration, the bonus multiplier, and the client overlay.
- `combat-terrain`: continuous slope + wetness factors in vanilla attack cost and speed, replacing the terrain-type bands.

### Modified Capabilities

- `food-economy`: one national pool + granary cap + logistic population replace districts, requisition, credits, and per-cohort feeding; war costs no food.
- `farm-growth`: a farm is a fixed-radius footprint with instant, fertility-scaled production — replaces the farm CA, maturation, and labor coverage; adds the hover footprint preview.
- `tribal-buildings`: Settlement and Farmland are purchased with food (`costResource`); housing = base + per-Settlement; city painting is presentation-only.
- `economy-planner`: bot economy reduces to affordability + best-visible-footprint + housing-bound rules.

### Removed Capabilities

- `seed-awards`: the peak-population ladder and paired awards are deleted (structures are bought, not awarded).
- `supply-field`: the military supply BFS and war supply attrition are deleted.
- `tile-damage`: combat tile scarring/healing is deleted (structure razing on conquest survives in tribal-buildings).
- `tile-stability`: the tenure clock and everything it fed (storage caps, density caps, pace boosts) is deleted.
- `food-allocation`: the population-share slider and `food_allocation` intent are deleted.

## Impact

- **Core sim** (`src/core/`): `FoodConfig` shrinks from 64 knobs to ~15; `FoodEconomy.ts`, `UrbanGrowth.ts` rewritten small; `FarmGrowth.ts`, `FoodShed.ts`, `SupplyField.ts`, `TileTenure.ts`, `SeedAwards.ts`, `TuneFoodConfigExecution` allowlist, tile-damage state in `GameImpl` all removed or gutted; `Config.attackLogic` gains the slope/wetness factors; `Schemas.ts` drops the `food_allocation` intent.
- **Bots**: `TribalEconomy`/`EconomyModel` planner collapses; `AiAttackBehavior` drops `fieldStaffingNeed` coupling.
- **Client**: fertility overlay; farm-footprint hover preview; HUD/tuning panel regrouped; allocation slider removed; shell OpenFront-live panel follows automatically.
- **Tests**: the food/farm/shed/supply/tenure/damage/seed test files are replaced by a much smaller suite; balance harness knob sweeps retarget the new config.
- **No map/sidecar format changes** — fertility is derived at load from existing layers; combat reads existing magnitude bits and layers. The sim still never reads `elevation.bin`/`hydro.bin`.
