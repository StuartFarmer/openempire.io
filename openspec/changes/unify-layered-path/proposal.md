# Proposal: unify-layered-path

## Why

The game currently ships three divergent paths selected implicitly by map data: `world` plays full vanilla (gold/manpower economy, old procedural shading), `majormenor` plays the new sim with old shading (layers but no terrain-colors sidecar), and every other map plays the new path — and _any_ map silently reverts to full vanilla when a non-Normal map size is picked, because layers only load at Normal size and the terrain-colors sidecar fails its dimension check when downscaled. Two game modes and three rendering/sim tiers is an unsupportable matrix for a singleplayer fork whose direction is the layered 3-age resource game; this change makes the layered path the only path.

## What Changes

- Extend `map-generator/derive-layers.ts` to also emit `terrain-colors.png` (via the engine's real `generateWorldEngineBiome` + `buildWorldEngineTerrainColors`), and retrofit `world` and `majormenor` so every shipped map has both sidecars.
- **BREAKING**: Both sidecars (`layers.bin`, `terrain-colors.png`) become required for every map; the loader fails loudly instead of silently falling back to the vanilla path. `tests/MapConsistency.test.ts` enforces this for all of `resources/maps/`.
- **BREAKING**: Remove the compact/4x map-size option — maps load at Normal (full) resolution only. `map4x.bin`/`map16x.bin` and the `GameMapSize` plumbing go away; smaller battlefields are authored as explicit maps (e.g. `earthmini`). Multiplayer, if re-added later, is unaffected (map size was a client memory optimization, not a netcode concern).
- **BREAKING**: Collapse the `hasLayers()`/`hasFoodEconomy()` gate to always-true and delete the vanilla arms: gold/troop accrual tick, `startManpower`/`startingGold` init, the vanilla `maxTroops` formula, the gold build menu / `UnitDisplay` quick-build strip / gold HUD chip, the nation gold-structure build order, and the procedural terrain-shading bake path.
- **KEPT deliberately**: `encodeTerrainTile` survives as the tile-delta colorizer (water nukes recolor mutated tiles today; future land-modification/shading features need it). Gold-economy units (City, Factory, warships, nukes, …) stay defined but dormant — later ages reactivate them via `costResource` metal/oil.
- Port difficulty scaling (lost with the vanilla `maxTroops` formula) into the layered path: a per-difficulty population/food multiplier plus AI-behavior levers (slower economy/attack cadence, less optimal target selection on lower difficulties).
- Tests run always-layered via `tests/util/Setup.ts`; procedural-shading tests are rewritten against the sidecar path; CLAUDE.md's "classic maps play byte-identical vanilla" boundary is retired. i18n plumbing (`translateText`/en.json) stays as-is.

## Capabilities

### New Capabilities

- `unified-layered-mode`: There is exactly one game mode — the layered food-economy sim — active on every map at every size; map loading requires both sidecars and has no vanilla fallback.
- `difficulty-scaling`: Per-difficulty scaling for AI opponents on the layered path: population/food-knob multipliers and AI cadence/precision levers replacing the vanilla `maxTroops` type/difficulty multipliers.

### Modified Capabilities

- `map-layer-sidecars`: `layers.bin` becomes mandatory for every shipped map; the "map without layers bakes as before" and "loads with no layers" fallback scenarios are removed, along with the Normal-size-only loading restriction (Normal is the only size).
- `rich-terrain-color-sidecar`: `terrain-colors.png` becomes mandatory; the procedural-shading fallback is removed. `derive-layers.ts` gains the ability to bake the sidecar for maps whose engine state is gone. The tile-delta encoder (`encodeTerrainTile`) is explicitly retained for terrain mutation.

## Impact

- **Map pipeline**: `map-generator/derive-layers.ts`, `map-generator/main.go` (drop 4x/16x bake, require sidecars), `resources/maps/world/`, `resources/maps/majormenor/`, `Maps.gen.ts` (regenerated).
- **Core sim**: `TerrainMapLoader.ts`, `GameMap.ts`, `GameImpl.ts`, `PlayerImpl.ts`, `PlayerExecution.ts`, `Config.ts` (vanilla `maxTroops`/`troopIncreaseRate`/`goldAdditionRate` arms), `NationStructureBehavior.ts`, `TribeExecution.ts`, `AttackExecution.ts`.
- **Client**: `BuildMenu.ts`, `UnitDisplay.ts`, `ControlPanel.ts` (gold chip), `Leaderboard.ts`, `RadialMenuElements.ts`, `BuildBar.ts`, `EconPanel.ts` (ungated), `ColorUtils.ts`/`TerrainPass.ts` (procedural bake removed, delta encoder kept), `TerrainColorSidecar.ts` (mandatory), map-size UI in the singleplayer modal.
- **Tests**: `Setup.ts` always-layered; `MapConsistency.test.ts` gains sidecar enforcement; `BoardMap.test.ts`, `ImpassableTerrain.test.ts`, `TerrainMapLoader.test.ts`, `RadialMenuElements.test.ts` rewritten; balance harness verifies difficulty scaling.
- **Docs**: CLAUDE.md boundary section rewritten (every map layered; one game mode).
