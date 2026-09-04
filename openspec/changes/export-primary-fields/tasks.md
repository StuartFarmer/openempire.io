# Tasks — export-primary-fields

## 1. Format + Export

- [x] 1.1 Create `src/core/game/ElevationMap.ts`: u16 plane encode/decode/expected-size (single source of truth, mirroring MapLayers.ts), with unit tests for round-trip and size rejection
- [x] 1.2 `GeneratorMapExport.ts`: build `elevation.bin` from the engine's elevation field; add the download to the generator page and `gen-world.ts` export set
- [x] 1.3 Record the world-engine render config in `info.json` on export (full `FoundationWorldEngineMapConfig`)

## 2. Retrofit + Bake

- [x] 2.1 `derive-layers.ts`: write `elevation.bin` (and the retrofit render config into info.json) from its reconstructed elevation field
- [x] 2.2 `map_generator.go`: pass `elevation.bin` through with a size check (width × height × 2); fail loudly when missing/mis-sized; copy the render config from info.json into `manifest.json` as the `world_engine` block
- [x] 2.3 Run `derive-layers.ts` for earth, earthxl, earthmini, spqr, world, majormenor; run `npm run gen-maps`; commit regenerated `resources/maps/*`

## 3. Loaders + Consistency

- [x] 3.1 `GameMapLoader.ts` / `FetchGameMapLoader.ts`: expose `MapData.elevationBin()`; manifest schema gains the optional `world_engine` block
- [x] 3.2 `tests/MapConsistency.test.ts`: every map ships `elevation.bin` with the correct size and a manifest render config

## 4. Shell Runtime Derivation

- [x] 4.1 Derivation runner: upload decoded elevation to the headless kernel and run the worldgen derivation passes (ocean→climate→fill→flow→irrigation→biome) once at map load on the shared device, exposing derived buffers to the resident field system
- [x] 4.2 Live terrain view: the worldgen color pass over derived layers becomes the shell's terrain view; baked terrain-colors.png remains the fallback when the sidecar or derivation is unavailable (visible status on fallback)
- [x] 4.3 Runtime scalars: climate/color knobs (latitudeEffect, elevationCooling, rainNoise, warmthRainfall, river/lake thresholds) as live shell controls re-running only climate/biome/color passes; seaLevel behind an explicit recompute that re-runs drainage
- [x] 4.4 Seasonal integration: the seasonal model (tilt, year phase) modulates the derived temperature inside the climate stage, replacing the interim baked-mean `temp` layer approximation

## 5. Verification

- [x] 5.1 Parity check: on a generated map (verdantia), the derived terrain with manifest config visually matches the baked terrain-colors.png (screenshot comparison; no shore halos or quantization artifacts)
- [x] 5.2 Browser verification on EarthXL and SPQR: load-time derivation completes, latitudeEffect slider recolors live, seasons sweep over derived temperature, fallback path renders when the sidecar is absent
- [x] 5.3 Full test suite + lint clean; existing lab systems (world, grazing, territory) regression-checked
