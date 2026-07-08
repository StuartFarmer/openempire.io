# Tasks: add-map-layer-sidecars

## 1. Core format module

- [ ] 1.1 Create `src/core/game/MapLayers.ts`: `LAYER_NAMES = ["crop","metal","oil","temperature","humidity"] as const`, `LayerName` type, `layerPlaneOffset(name, w, h)`, `expectedLayersByteLength(w, h)`, `decodeLayers(bytes, w, h)` (validates size, returns the backing Uint8Array), and `encodeLayers(planes, w, h)` for the exporter
- [ ] 1.2 Unit test `tests/core/game/MapLayers.test.ts`: encode→decode round-trip, size-mismatch rejection, plane offset addressing

## 2. Sim access

- [ ] 2.1 Extend `GameMapImpl` (`src/core/game/GameMap.ts`) with optional layer storage: `hasLayers()`, `layer(name, tile)` (dev throw when absent), constructed from decoded sidecar bytes
- [ ] 2.2 Surface `hasLayers()`/`layer()` through the `Game` interface (`Game.ts`, `GameImpl.ts`) and `GameView` so executions and the client view share the accessor
- [ ] 2.3 Test: accessor returns exact bytes per plane on a layered `GameMapImpl`; `hasLayers() === false` and `layer()` throws on an unlayered one

## 3. Loaders

- [ ] 3.1 Add `layersPath?` to `MapData` (`GameMapLoader.ts`) and resolve it in `FetchGameMapLoader` and `BinaryLoaderGameMapLoader` (mirror `terrainColorsPath`)
- [ ] 3.2 `TerrainMapLoader`: add `layers?: boolean` to `MapManifest`; when `manifest.layers && size === Normal`, fetch + `decodeLayers` and pass planes into `GameMapImpl`; log-and-continue on size mismatch
- [ ] 3.3 Extend `tests/core/game/TerrainMapLoader.test.ts` + `FetchGameMapLoader.test.ts`: opt-in at Normal, no layers at Compact, no layers without manifest flag, corrupt-size rejection

## 4. Generator export

- [ ] 4.1 `GeneratorMapExport.ts`: `buildGeneratorLayersBlob(map)` quantizing the engine's five fields via `encodeLayers` (import order/constants from core `MapLayers.ts`)
- [ ] 4.2 `GeneratorPage.ts`: add the `layers.bin` download button and update the drop-into-folder instructions (i18n keys in en.json)
- [ ] 4.3 Round-trip test (`tests/games/alternative/GeneratorMapExport.test.ts`): generate a small seeded world → export blob → `decodeLayers` → construct `GameMapImpl` → `layer()` returns the quantized engine values byte-for-byte

## 5. Go baker

- [ ] 5.1 `map-generator/main.go`: copy `layers.bin` when present (reuse `copyOptionalFile`), validate size = 5×w×h against the decoded image dims (skip + warn on mismatch), set `manifest["layers"] = true`
- [ ] 5.2 `map-generator/main_test.go`: bake a test map with and without layers.bin; assert output file + manifest flag
- [ ] 5.3 Allow `layers.bin` in `tests/MapConsistency.test.ts` optional-files lists (source assets and resources output)

## 6. Verification

- [ ] 6.1 `npx tsc --noEmit`, `npm run lint`, full vitest at baseline (only the 5 pre-existing failing files)
- [ ] 6.2 In-browser check via run-openfront: generate a world at `#generator`, confirm the layers.bin download; boot a game on a non-layered map and confirm zero behavior change
