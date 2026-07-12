# Tasks: add-urban-core-growth

Whole feature, one change. Order is build-order, not phases.

## 1. Data: hydrology layer

- [ ] 1.1 Append `water` to `LAYER_NAMES` (MapLayers.ts); bump `expectedLayersByteLength` consumers
- [ ] 1.2 Generator: bake the `water` plane from normalizedWatermap + irrigation + lake/river masks (GeneratorMapExport.ts, gen-world.ts, derive-layers.ts)
- [ ] 1.3 Re-bake every layered map (verdantia, pangea001/002, majormenor, tribalsmall fixture) + the new `estuaria` demo map; MapConsistency green
- [ ] 1.4 `game.layer("water", tile)` accessor + test

## 2. Core sim: density field + growth engine

- [ ] 2.1 Remove plots: delete Settlement/Farmland/Barn unit types, plot occupancy, one-per-tile placement, stroke-paint gating (core + client)
- [ ] 2.2 PlayerImpl: `core: TileRef`, `density` field (milliunit ints), `area()`, `maturity()`; player-update fields (layered only)
- [ ] 2.3 `found_capital` intent + FoundCapitalExecution + Executor case; SpawnExecution places the Core, not the kit
- [ ] 2.4 `UrbanGrowth.tick(mg, player)`: carrying capacity K from suitability; logistic ΔA scaled by food surplus/allocation; suitability-CA deposit onto frontier; satellite seeding + coalescence. FoodConfig knobs (r, w_food, w_water, w_shore, w_logi, w_cong, dispersalRate, popPerDensity)
- [ ] 2.5 Rewire FoodEconomy production/consumption/pop-cap onto `density × crop × supplyQuality`; keep storage/decay/starvation/allocation stages
- [ ] 2.6 Razing → clears captured-tile density (regrowth via logistic)

## 3. Player agency: infrastructure

- [ ] 3.1 Aqueduct / Road / Granary unit types (cost food); each contributes its boost to the suitability field / supply reach / local K
- [ ] 3.2 Bots: retarget TribalEconomy to found + place infrastructure toward high-suitability land

## 4. Tests

- [ ] 4.1 Density growth: S-curve (accelerate→saturate), deurbanization under starvation, K responds to land
- [ ] 4.2 Spatial: exponential-ish density gradient from core, radius ~ √area, water/shore pull, supply gating, satellite→coalescence
- [ ] 4.3 Infrastructure biases growth direction; razing→regrowth; determinism (identical hashes)

## 5. Client

- [ ] 5.1 Density field render pass (continuous heat over territory; supply-overlay pass as template) replacing plot sprites
- [ ] 5.2 Found-capital UX + infrastructure placement bar; hydrology/density overlays; en.json
- [ ] 5.3 In-game verify on `estuaria`: found → watch S-curve growth toward river/coast; screenshots

## 6. Balance + gates

- [ ] 6.1 Harness: extend BalanceRun to census density/area/maturity; sweep w\_\* and r for leader-share/Gini/survivors; balance-notes entry
- [ ] 6.2 Full gates (tsc, lint, vitest baseline); determinism spot-check
