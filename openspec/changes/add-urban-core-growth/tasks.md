# Tasks: add-urban-core-growth

Whole feature, one change. Order is build-order, not phases.

## 1. Data: hydrology layer

- [x] 1.1 Append `water` to `LAYER_NAMES` (MapLayers.ts); Go baker size check 5→6 planes (main.go)
- [x] 1.2 `buildFreshwaterPlane` (0.6·irrigation + 0.5·river + lakes) in GeneratorMapExport.ts; wired into gen-world.ts + derive-layers.ts
- [x] 1.3 Re-baked every layered map (verdantia, pangea001/002, majormenor, tribalsmall fixture, estuaria) to 6 planes; MapConsistency green
- [x] 1.4 `game.layer("water", tile)` works generically; covered by GameMapLayers/MapLayers/GeneratorMapExport tests + real-baked variety check in FoodEconomy

## 2. Core sim: density field + growth engine

- [ ] 2.1 Remove plots: delete Settlement/Farmland/Barn unit types, plot occupancy, one-per-tile placement, stroke-paint gating (core + client)
- [x] 2.2 PlayerImpl: `core`, `density` field (milliunit ints), `setDensity`/`densityEntries`/`urbanArea`; Player interface accessors. (player-update fields land with the flip)
- [x] 2.3 SpawnExecution founds the Core (seeds density, resets stake) instead of the plot kit. (Explicit found_capital intent/UI deferred to task 5.)
- [x] 2.4 `UrbanGrowth.urbanTick`: K from suitability over supply-reachable land; logistic ΔA scaled by surplus; suitability-CA deposit with congestion + satellites/coalescence; deurbanization. SupplyField now sources from the Core. FoodConfig knobs added. 6 engine tests green (S-curve, gradient, water pull, supply gating, deurbanization, determinism)
- [x] 2.5 Flip: PlayerExecution → urbanTick; maxTroops = basePopulation + urbanArea·popPerDensity; urbanArea plumbed through player updates; rebalanced pop/yield knobs (village→metropolis); rewrote FoodEconomy/SupplyLines/FoodAllocation onto density. Full suite at the 5-file baseline.
- [x] 2.6 Razing → conquer/relinquish clear the loser's density (captor gets raw land, regrows via logistic); covered by the war-razing test

## 3. Player agency: infrastructure

- [ ] 3.1 Aqueduct / Road / Granary unit types (cost food); each contributes its boost to the suitability field / supply reach / local K
- [ ] 3.2 Bots: retarget TribalEconomy to found + place infrastructure toward high-suitability land

## 4. Tests

- [x] 4.1 Density growth: S-curve, deurbanization under starvation (UrbanGrowth.test.ts)
- [x] 4.2 Spatial: density gradient from core, freshwater pull, supply gating, determinism (UrbanGrowth.test.ts). Satellite/coalescence mechanism in place; explicit test pending.
- [x] 4.3 Razing→regrowth (FoodEconomy war-razing test); determinism (identical hashes, UrbanGrowth + FoodEconomy). Infrastructure biasing: pending (task 3).

## 5. Client

- [x] 5.1 Density transmission (packedDensityUpdates delta channel) + DensityPass (built-up wash over territory, full+delta uploads). The self-growing city renders in-game.
- [~] 5.2 Founding is automatic at spawn; BuildBar stripped of dead plot buttons → lean overlay-toggle bar (Supply). Infrastructure placement + density/hydrology toggles: pending (tasks 3, 5).
- [x] 5.3 In-game verify on estuaria: founded capital grows area 1→46, renders as a built-up field; bots grow their own cities (screenshots)

## 6. Balance + gates

- [ ] 6.1 Harness: extend BalanceRun to census density/area/maturity; sweep w\_\* and r for leader-share/Gini/survivors; balance-notes entry
- [x] 6.2 Full gates: tsc clean, lint clean, vitest at the 5-file baseline, harness hashes deterministic
