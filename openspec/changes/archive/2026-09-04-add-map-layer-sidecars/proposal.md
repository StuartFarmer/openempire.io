# Proposal: add-map-layer-sidecars

## Why

The 3-age resource game (Tribal/food, Middle/metal, Modern/oil) needs the world generator's climate and resource fields (crop, metal, oil, temperature, humidity) inside the deterministic simulation, so executions can price expansion and production by terrain quality. Today those fields exist only in the browser at generation time — the sim sees just the 1-byte terrain packing — so there is no data path for any resource mechanic to build on.

## What Changes

- The generator page (`#generator`) additionally exports a `layers.bin` blob: per-tile Uint8 (0–255) planes for `crop`, `metal`, `oil`, `temperature`, `humidity`, row-major, same dimensions as `image.png`.
- The Go baker (`map-generator`) copies `layers.bin` into `resources/maps/<name>/` (full resolution only, like `terrain-colors.png`) and sets `"layers": true` in the manifest.
- Map loaders (`GameMapLoader.MapData`, `FetchGameMapLoader`, `BinaryLoaderGameMapLoader`, `TerrainMapLoader`) resolve and fetch the sidecar when the manifest opts in.
- The sim gains read-only per-tile layer access (e.g. `game.layer("crop", tile) → 0..255`), available to executions and to the client view.
- Maps without `layers.bin` report no layers; mechanics that need layers are gated on their presence. Classic hand-drawn maps get **no** derived fallback — the resource game targets generated maps only.

## Capabilities

### New Capabilities

- `map-layer-sidecars`: exporting, baking, loading, and reading per-tile map data layers (crop/metal/oil/temperature/humidity) end-to-end from generator to sim.

### Modified Capabilities

- `generator-map-export`: the export flow gains a fourth artifact (`layers.bin`) alongside `image.png`, `terrain-colors.png`, and `info.json`.

## Impact

- **Generator/export:** `src/client/GeneratorPage.ts`, `src/games/alternative/world/GeneratorMapExport.ts` (the world engine already computes all five fields — this is serialization only).
- **Baker:** `map-generator/main.go` (sidecar copy + manifest flag; mirrors the existing `terrain-colors.png` handling), `tests/MapConsistency.test.ts` allowed-files list.
- **Loaders:** `src/core/game/GameMapLoader.ts`, `FetchGameMapLoader.ts`, `BinaryLoaderGameMapLoader.ts`, `TerrainMapLoader.ts`.
- **Sim:** `src/core/game/GameMap.ts` / `Game.ts` / `GameImpl.ts` (layer storage + accessor), worker map load path.
- **Determinism:** baked bytes are identical for every client by construction; no runtime generation is introduced.
- **Tests:** round-trip test (generator export → packed bin → sim accessor returns the same bytes) plus loader opt-in/opt-out tests.
