# Tasks: add-urban-core-growth

Whole feature, one change. Order is build-order, not phases.

## 1. Data: hydrology layer

- [x] 1.1 Append `water` to `LAYER_NAMES` (MapLayers.ts); Go baker size check 5→6 planes (main.go)
- [x] 1.2 `buildFreshwaterPlane` (0.6·irrigation + 0.5·river + lakes) in GeneratorMapExport.ts; wired into gen-world.ts + derive-layers.ts
- [x] 1.3 Re-baked every layered map (verdantia, pangea001/002, majormenor, tribalsmall fixture, estuaria) to 6 planes; MapConsistency green
- [x] 1.4 `game.layer("water", tile)` works generically; covered by GameMapLayers/MapLayers/GeneratorMapExport tests + real-baked variety check in FoodEconomy

## 2. Core sim: density field + growth engine

- [x] 2.1 Keep Settlement/Farmland/Barn as SEEDS (not remove): Settlement re-added as a placeable city seed; Farmland/Barn kept. Mutual exclusivity (Farmland ↔ urban density) enforced in `plotSpawn` + `growUrbanArea`.
- [x] 2.2 PlayerImpl: `core`, `density` field (milliunit ints), `setDensity`/`densityEntries`/`urbanArea`; `farmMaturity` field + accessors; Player interface accessors.
- [x] 2.3 SpawnExecution founds the Core (seeds density) + starter Farmland kit. Additional Settlement seeds placed in-game; each re-seeded every tick by `seedSettlements`.
- [x] 2.4 `UrbanGrowth.urbanTick`: **binary, food-bounded, contiguous CA** — a city tile is fully opaque (density 1000) or nothing, placed whole and only 4-adjacent to an existing city tile (no gradient, no satellites), so `urbanArea` = literal city-tile count and sprawl ↔ population are 1:1. City size is BOUNDED BY FOOD: `targetTiles = max(seeds, capacity/popPerDensity)` where `capacity = production/idleConsumption` — a city never outgrows its farms (fixes country-spanning sprawl). Paced growth toward target; edge-first razing (never seeds) when food drops. Placement by suitability × food-shed gate. `tileKm=20`, `popPerDensity=3000` (≈5 farms/tile). 7 engine tests green (food-bound, binary+contiguity, water pull, supply gating, food-shed gate, recede-on-food-drop, determinism). Removed `dispersalRate`/`densityStepMilli`/`urbanYieldMilli`.
- [x] 2.5 Farm maturation (`FarmGrowth.ts`): climate suitability (GDD × AquaCrop Ks × FAO soil, Liebig min) + Gompertz growth / CDC senescence; yield scales with maturity in `FoodEconomy.foodTick`. 8 tests green.
- [x] 2.6 Food-shed (`FoodShed.ts`): maturity-weighted soft-decay field from Farmland, gates urban growth. 5 tests green.
- [x] 2.7 maxTroops = basePopulation + urbanArea·popPerDensity; farm-maturity knobs added to FoodConfig. Full suite at the 5-file baseline.
- [x] 2.8 Razing → conquer/relinquish clear the loser's density AND farm maturity (captor gets raw land); covered by the war-razing test

## 3. Player agency

- [x] 3.1 Buildable set is Settlement (seed) / Farmland / Barn; BuildBar offers all three. Roads/aqueducts (field-shaping infrastructure) deferred to a later change.
- [x] 3.3 City centers are UNCAPPED (place as many Settlement nuclei as you want); spam is pointless because the city footprint is population-bounded. Bots found a nucleus only when population outgrows the existing ones.
- [x] 3.4 Population is a food-driven DEMOGRAPHIC (add-urban-core-growth): births (up to 2× at ≥200% food, clamped to food headroom) and deaths (old age `1/avgLifespanTicks` on the CIVILIAN idle pool, starvation `1/(L·fedRatio)` on everyone) replace the old growth/starvation in `FoodEconomy.foodTick`; fractional birth/death/starve carry on PlayerImpl. One life ≈ 10 s (`avgLifespanTicks = 100`). City footprint tracks the LIVING population; tiles raze as people die (no protected seeds). A nation is eliminated when its whole population dies (`foodTick` relinquishes its tiles) even holding land. 3 tests (fed-grows-and-holds, starves-to-elimination, army-not-aged). **Snowball tension noted:** troops are both population and army pending the deferred territory-diffusion pivot.
- [x] 3.5 Per-tile POPULATION: the `density` field now stores actual people per tile (`0..popPerDensity`, a full tile = `popPerDensity`) instead of a binary 0/1000 marker — `setDensity`/`urbanArea`/render-byte scale by `popPerDensity`; removed `coreSeedMilli` (capital seeds a full tile). Behaviour-preserving (harness hash identical), client reads the 0..255 fill-byte unchanged. Foundation for localized movement/combat (**drag-vector** UX chosen; not built yet).
- [x] 3.6 Scale fixed to play: `tileKm=1` (a tile is 1 km², not a 400 km² block), `popPerDensity=1000` (→ 1000 people/km², a real town density) — cities are clusters of hundreds of tiles, populations in the 100k–400k range.
- [x] 3.7 Combat/AI awareness of the tribal economy: (a) attacks push toward the enemy's ECONOMY — `AttackExecution.addNeighbors` pulls enemy Farmland/Settlement tiles to the front of the conquest queue (with `capturedPlotRazeChance` a taken resource is captured-or-burned, far more damaging than open land); (b) the SUPPLY diffuse layer now costs exploration — tighter `supplyRadius=10` and stronger `warSupplyAttrition=0.05` make an out-of-supply push bleed ~5%/tick, which also curbs snowball (harness mean leader share ~40% vs ~55%+). (An AI target-selection "raid the exposed economy" strategy was prototyped but dropped — it fed snowball for little gain; the per-tile attack bias delivers the behaviour.)
- [~] 3.8 CONCENTRATED SEGMENT PUSH (humans only). FUNCTIONAL + tested:
  - Sim: `AttackExecution` takes a `sourceTiles` segment and seeds the advance from only that stretch of border (kept out of attack-combining), so the same troops punch deep and local. `tests/SegmentAttack.test.ts` — salient stays local + centred, drives deeper than whole-border.
  - Aiming (no drag): `BorderSegment.borderSegment` — the border point nearest the cursor follows it, and cursor DISTANCE sets breadth. Breadth now spans the FULL range on any border length: a click at the front seeds the WHOLE border (parity with the bots' whole-border push — fixes "can't do a wide attack, bots overpowered"), decaying exponentially to a `SEGMENT_MIN_WIDTH` spearhead deep in enemy land (`SEGMENT_WIDTH_FALLOFF` = characteristic distance). Pure/tested (`tests/BorderSegment.test.ts`, incl. whole-front reach).
  - Wired end-to-end: `AttackIntent.sourceTiles` → `ExecutionManager`; client `ClientGameRunner` computes the segment on the attack CLICK (aims from the border stretch nearest the click, breadth from distance) → `SendAttackIntentEvent`/`Transport`. Bots pass nothing → whole-border (unchanged).
  - LIVE HOVER HIGHLIGHT built (compiles/lints; needs in-browser verify): the aimed stretch is recoloured onto the player's OWN border cells inside `BorderStampPass` (a map-sized R8 segment mask sampled by `border-stamp.frag`; segment tiles are drawn cyan instead of the player colour) — reusing the existing border rendering rather than a separate full-tile wash (the earlier standalone `SegmentHighlightPass` was removed for reading "weird"). `SegmentHighlightController` (mouse-move → cached async border → `borderSegment` → mask → `view.updateSegmentHighlight`/`setSegmentHighlight`) mirrors `HoverHighlightController`; the facade API is unchanged. As the cursor moves over attackable land the aimed border stretch lights cyan (near = broad, far = spearhead), matching what the click commits. Tunables: `SEGMENT_WIDTH_FALLOFF`/`SEGMENT_MIN_WIDTH` (BorderSegment.ts — falloff sets how fast breadth concentrates; max is the full border), segment colour `mapOverlay.segmentHighlight{R,G,B}` (render-settings.json). Visual feel unverified headlessly — check with `npm run dev`.
- [x] 3.2 Bots: TribalEconomy ambition is BOUNDED BY TERRITORY — one Settlement per ~3000 owned tiles, ~12 farms per city seed. A bot grows a few real cities as it conquers land (not settlement-spam, not map-blanketing farmland). `farmYieldMilli` tuned so ~1 mature farm ≈ 1 city tile, so a human placing a handful of farms grows a visible town like the bots do.

## 4. Tests

- [x] 4.1 Density growth: S-curve, deurbanization under starvation, food-shed gate (UrbanGrowth.test.ts)
- [x] 4.2 Spatial: density gradient from core, freshwater pull, supply gating, determinism (UrbanGrowth.test.ts)
- [x] 4.3 Farm maturation: GDD band, AquaCrop water, Liebig min, Gompertz S-curve, senescence, determinism (FarmGrowth.test.ts)
- [x] 4.4 Food-shed: decay from mature farms, immature→weak, no-farms→zero, owned-land gating, determinism (FoodShed.test.ts)
- [x] 4.5 Razing→regrowth (FoodEconomy war-razing test); FoodEconomy/FoodAllocation updated for farm maturity.

## 5. Client

- [x] 5.1 Density transmission (packedDensityUpdates delta channel) + DensityPass (built-up wash over territory, full+delta uploads). The self-growing city renders in-game.
- [x] 5.2 BuildBar offers Settlement / Farmland / Barn seeds + Supply overlay toggle. Density/hydrology/food-shed overlays: pending.
- [x] 5.3 In-game verify on estuaria: founded capital grows area 1→46, renders as a built-up field; bots grow their own cities (screenshots)

## 6. Balance + gates

- [ ] 6.1 Harness: extend BalanceRun to census density/area/maturity; sweep w\_\* and r for leader-share/Gini/survivors; balance-notes entry
- [x] 6.2 Full gates: tsc clean, lint clean, vitest at the 5-file baseline, harness hashes deterministic
