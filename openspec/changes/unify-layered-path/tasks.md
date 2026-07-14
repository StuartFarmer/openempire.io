# Tasks: unify-layered-path

## 1. Data — every map ships both sidecars

- [x] 1.1 Extend `map-generator/derive-layers.ts` to also emit `terrain-colors.png`: call `generateWorldEngineBiome(ocean, temperature, humidity)` then `buildWorldEngineTerrainColors(...)` on the fields it already reconstructs, encode via canvas like `gen-world.ts` does
- [x] 1.2 Run derive-layers for `world` and `majormenor`; verify both source folders gain the missing sidecars and the images look sane (spot-check dimensions and a non-empty pixel histogram)
- [x] 1.3 `npm run gen-maps`; verify every `resources/maps/*/manifest.json` now has `layers: true` and `terrain_colors: true` and both files exist
- [x] 1.4 Add MapConsistency assertions: every shipped map has `layers.bin` + `terrain-colors.png` + both manifest flags

## 2. Remove map sizes (Normal only)

- [x] 2.1 Go baker: stop emitting `map16x.bin` in `map-generator/main.go`; delete existing baked 16x files; re-run gen-maps (`map4x.bin` kept — it is the pathfinding minimap, see design D3 amendment)
- [x] 2.2 Remove `GameMapSize` from loaders (`TerrainMapLoader.ts`, `FetchGameMapLoader.ts`) — always fetch full-res `map.bin` + sidecars
- [x] 2.3 Remove the map-size field from `Schemas.ts`/`GameConfig` and every consumer (worker init, LocalServer, ClientGameRunner, GameBoard)
- [x] 2.4 Remove the size selector from the singleplayer UI and any related en.json keys it exclusively used
- [x] 2.5 Update `TerrainMapLoader.test.ts` and any fixtures that exercised compact sizes

## 3. Loader hard-requires both sidecars

- [x] 3.1 `TerrainMapLoader.ts`: `layers.bin` fetch+decode unconditional; missing/undecodable → throw with map name and artifact
- [x] 3.2 `TerrainColorSidecar.ts` / `GameBoard.ts`: missing, unfetchable, or dimension-mismatched `terrain-colors.png` → throw (no `withTerrainColorSidecar` pass-through fallback)
- [x] 3.3 `GameMap`/`GameMapImpl`: assert layer planes at construction; drop the `layer()` runtime throw-guard contract

## 4. Collapse the gate — sim core

- [x] 4.1 Delete predicates: `GameMap.hasLayers`, `GameImpl.hasLayers`/`_hasLayers`, `Game.hasFoodEconomy`, `PlayerImpl.hasFoodEconomy`, `GameView.hasLayers`, `PlayerView.hasFoodEconomy`, and the `EconomyPlayer.hasFoodEconomy` config-surface member
- [x] 4.2 `GameImpl.ts`: starting troops = `food().startPopulation` unconditionally; remove `startManpower` path; keep the layered `conquer`/`relinquish` arm (fertility bookkeeping + scorched land) as the only arm
- [x] 4.3 `PlayerImpl.ts`: init = zero gold + `startingFood` + `defaultPopulationShare` unconditionally; wire update always emits food fields; `canBuildUnitType` drops the tribal-structure mode gate
- [x] 4.4 `PlayerExecution.ts`: `urbanTick` is the only economy tick; delete the `addTroops`/`addGold`/`goldWork` arm
- [x] 4.5 `SpawnExecution.ts`: `foundCore()` unconditional; `AttackExecution.ts`: resource-targeting bias unconditional; `TribalEconomy.tribalEconomyActive` drops `hasLayers()`
- [x] 4.6 `NationStructureBehavior.ts`: tribal build order is the only build order; delete the gold-structure order (cities/ports/factories/SAM logic) — leave defense-post handling intact

## 5. Collapse the gate — config

- [x] 5.1 `Config.maxTroops`: layered formula only; delete the vanilla formula and its per-type/difficulty multipliers (replaced in group 7)
- [x] 5.2 Delete now-unreachable `troopIncreaseRate`/`goldAdditionRate` (and their interface members) after confirming no remaining callers
- [x] 5.3 Keep gold-cost `UnitInfo` entries (City, Factory, warships, nukes, …) defined and dormant; verify none reachable from the build UI

## 6. Collapse the gate — client UI and rendering

- [x] 6.1 `BuildMenu.ts`: tribal filter only; `UnitDisplay.ts`: delete the gold quick-build strip; `RadialMenuElements.ts`: wrench omission unconditional
- [x] 6.2 `ControlPanel.ts`: food chip/fields/allocation row always render; delete the gold chip (desktop + mobile); `Leaderboard.ts`: food column only
- [x] 6.3 `BuildBar.ts`, `EconPanel.ts`, `GameLeftSidebar.ts`, `WebGLFrameBuilder.ts` (`syncDensityField`/`syncSupplyOverlay`): remove `hasLayers()` early-returns
- [x] 6.4 `ColorUtils.ts`: `buildBoardMapTerrainRGBA` collapses to `map.colorizer(map)` (throw if absent); delete the full-map `buildTerrainRGBA` bake path; KEEP `encodeTerrainTile` + the `terrain` palette block in render-settings as the tile-mutation encoder
- [x] 6.5 `TerrainPass.ts`: base texture always from colorizer; `applyTerrainDelta` unchanged (procedural per-tile recolor); simplify `setTerrainColors`/`rebuildTerrain` so user palette changes affect only mutated tiles
- [x] 6.6 Prune en.json keys orphaned by deleted UI (gold chip, size selector, old build menu strings) until `TranslationSystem.test.ts` passes

## 7. Difficulty scaling on the layered path

- [x] 7.1 Add config surface (per design D6): per-(playerType, difficulty) population multiplier applied in layered `maxTroops`; humans always 1
- [x] 7.2 AI cadence: per-difficulty `TribeExecution` pulse interval and `NationStructureBehavior` build frequency
- [x] 7.3 AI precision: top-k candidate selection (seeded PRNG) for `TribalEconomy` placement and `AttackExecution` resource bias; k=1 at max difficulty
- [x] 7.4 Unit tests for all three levers (determinism + monotonicity across difficulties)
- [x] 7.5 Balance-harness runs per difficulty (`BalanceRun.ts`); record chosen constants in balance notes

## 8. Tests, docs, verification

- [x] 8.1 `tests/util/Setup.ts`: synthesize layers by default (opt-out only if a test needs raw terrain); remove vanilla-arm tests; update `RadialMenuElements.test.ts`, `BoardMap.test.ts`, `ImpassableTerrain.test.ts` to the sidecar+delta model
- [x] 8.2 Full `npm test` green (minus the known-failing baseline), `npm run lint`
- [x] 8.3 Rewrite CLAUDE.md: retire the "classic maps byte-identical vanilla" boundary; new invariant = every map layered, one game mode, sidecars mandatory; update map list/pipeline notes
- [x] 8.4 In-game verify via run-openfront: start a game on `world` (retrofitted) and `verdantia` — sidecar shading, BuildBar, food chip, water-nuke recolor all working
