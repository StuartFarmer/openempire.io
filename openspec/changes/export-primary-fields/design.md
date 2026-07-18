# Design — export-primary-fields

## Context

The shell (`#shell`) hosts a resident WESL field simulation (seasonal temperature today; weather, food, territory later) rendered under a pan/zoom camera. Terrain currently comes from the baked `terrain-colors.png`, which froze every climate decision at generation time; the first attempt to recolor terrain live from on-disk data produced artifacts because `map.bin`'s water magnitude encodes shore distance, not bathymetry, and the real inputs (float elevation, precipitation, watermap) never ship.

Meanwhile the entire worldgen pipeline already exists as GPU passes (`src/client/worldgen/*.wesl` + `WebGpuWorldEngine`): elevation → ocean flood → climate → depression fill → flow → irrigation → biome → terrain colors, running headlessly on a shared device in well under a second even at 4096×2048. The only missing ingredient is the primary field it starts from.

Constraints: the map format is governed by the unify-layered-path invariants (every map ships its sidecars; the baker copies, never parses; `MapLayers.ts`-style single-source-of-truth modules; `MapConsistency.test.ts` enforces). The in-game renderer's use of `terrain-colors.png` must not change.

## Goals / Non-Goals

**Goals:**

- Every map ships `elevation.bin` (u16 full-precision elevation) + its render config in the manifest.
- The shell derives world layers and terrain colors at map load from those primaries, on the GPU.
- Climate knobs (latitudeEffect etc.) become runtime scalars; the seasonal model plugs into the derived temperature.
- Baked `terrain-colors.png` stays as in-game base texture and shell fallback.

**Non-Goals:**

- No change to the in-game (GameRunner) rendering path.
- No change to `layers.bin` (crop/metal/oil planes stay authored/baked as-is).
- No removal of `terrain-colors.png` from the format.
- No live editing of elevation itself (terraforming) — the primary field is read-only input.

## Decisions

1. **Export elevation, not every derived field.** Everything downstream (ocean, climate, watermap, humidity, biome, colors) is deterministically derivable on the GPU from elevation + config by passes we already maintain. Shipping derived fields would triple sidecar weight and create N formats that can drift from the pipeline. Alternative considered: bake all worldgen layers into an extended `layers.bin` — rejected as redundant with a pipeline we run in <1s, and it would freeze climate parameters again.

2. **u16 quantization (2 bytes/tile).** The engine's elevation is normalized 0..1; 16 bits gives 65k steps vs the current 5-bit magnitude. f32 would double size for precision below visual/sim relevance. EarthXL costs 16 MB (vs 8 MB layers.bin) — acceptable.

3. **A shared format module, mirroring `MapLayers.ts`.** New `src/core/game/ElevationMap.ts` owns encode/decode/expected-size; exporter, derive-layers, loaders, and tests all import it. The Go baker never parses (copy + size check), same contract as `layers.bin`.

4. **Render config lives in the manifest** (a `world_engine` block written from `info.json` by the baker). The manifest already travels with every map load; a separate sidecar for ~15 numbers is overkill. Retrofitted maps record the config produced by `derive-layers.ts` (its name-derived seed + defaults), which makes their derivation reproducible even though it never matched a real generation run.

5. **Derivation runs as the shell's load step using the existing worldgen pass table, headless on the shared device.** The worldgen engine's passes are reused as-is; the shell wires elevation upload → derivation frame → derived buffers consumed by the resident field system (they enter as map-layer-like read-only inputs). Alternative considered: porting derivation into FieldDynamics as iterate blocks — deferred; the raw pass table already works and iterate blocks remain a future DSL feature.

6. **Two-tier parameter reactivity.** Climate/color knobs (latitudeEffect, elevationCooling, rainNoise, warmthRainfall, thresholds, tilt/season) re-run only the cheap climate/biome/color passes — live sliders. Drainage-affecting knobs (seaLevel) re-run the full fill/flow stack behind an explicit recompute (~1s on XL), keeping sliders honest about cost.

7. **Migration order: format first, consumers second.** Exporter + derive-layers + baker + `gen-maps` rerun land before any loader/shell code depends on the sidecar; the shell falls back to baked terrain whenever the sidecar or derivation is missing, so partial states stay shippable.

## Risks / Trade-offs

- [Retrofitted earth-like maps derive climate that differs from their hand-baked look] → the manifest config for retrofits is chosen by `derive-layers.ts` to approximate the baked output (same pipeline it already uses for layers.bin); the baked terrain remains the fallback and the in-game truth, so divergence is a shell-tuning matter, not a regression.
- [Repo size grows ~30 MB across ten maps] → u16 (not f32) and no new derived-field sidecars; acceptable for a git-tracked asset dir that already ships map4x/thumbnails.
- [Derivation cost on huge maps (~1s EarthXL) blocks map switching] → it replaces CPU bitmap colorizing of similar cost, runs once per load behind the existing loading status, and only seaLevel-class changes ever re-trigger it.
- [Two terrain renderers (baked in-game, derived in shell) can drift visually] → the derived path uses the same WESL colorizer that generated the baked PNGs in the first place; a parity screenshot check on a generated map (e.g. verdantia) belongs in verification.
- [Manifest schema change ripples through zod/loaders] → additive optional block; loaders treat absence as "no derivation, use fallback".

## Migration Plan

1. Land format module + exporter + derive-layers + baker changes.
2. Run `derive-layers` for the six image-only maps, then `npm run gen-maps`; commit regenerated `resources/maps/*`.
3. Land loader + consistency-test changes (now enforceable — all maps ship the sidecar).
4. Land shell derivation + live terrain + runtime scalars.
   Rollback: revert shell consumers; the sidecar is additive and inert to the game.

## Open Questions — resolved during implementation

- Every map regenerates through its ORIGINAL pipeline, no cross-contamination: engine maps via `gen-world.ts` (true engine elevation); earth-family maps via `earth/bake.ts`, now exporting elevation.bin from REAL ETOPO bathymetry/altitude (real ocean texture, no synthetic shelf) — running derive-layers on these clobbers their real-data layers (it did once, and was reverted); image-only maps via a full fresh `derive-layers.ts` run (consistent trio). The `--elevation-only` flag survives as an escape hatch only.
- The exported elevation uses a seaLevel-ANCHORED land mapping (land in `(seaLevel, 1]`, water below), NOT the raw magnitude/30 field — the raw field puts low land below `seaLevel` and the runtime flood reads it as submerged (all-ocean continents on first EarthXL run). derive-layers additionally blurs + dithers the 31-level land magnitude: quantized plateaus give the drainage solver zero gradient, which rendered as diagonal flow artifacts.
- Manifest block: flat `world_engine: {…}` knobs; the shape is `WorldEngineManifestConfig` in core `TerrainMapLoader.ts`, with the games-side exporter typed against it as the drift guard (core cannot import games code).
- Water is never re-derived: `buildWaterMask` classifies map.bin's water bodies whole (BFS components; sea = ocean bit anywhere OR deep bathymetry — catches the Med/Caspian that the baker's largest-body-only rule misses; shallow bodies = lakes) and `flags_from_mask` writes flags directly. The flood + threshold-lake passes survive only for the procedural generator (with the `ocean_scan_x/y.wesl` separable scans added for XL sizes). The seaLevel/lake sliders and the recompute button were removed — sea level is a fact of the shipped map, not a knob.
- Real climate base (user decision "B"): the baked temperature plane uploads as `tempBase`; land temperature = tempBase + seasonal swing by default, synthetic model behind a toggle; ocean temperature always synthetic (the measured plane is land-extrapolated over water — polygonal seams). Permanent ice: `iceThreshold` (default −8 °C ≈ 0.338 in the plane's linear −30..35 °C encoding, matching EarthColors `iceTempC`) classifies palette Ice, rendered clean (no vegetation tints/rivers); the ice line breathes with the seasons.
- Real seasonal model (`season.bin`, optional sidecar): the crude latitude×tilt swing had no continentality — coastal and interior tiles at the same latitude swung identically. Replaced by a per-tile first-harmonic fit (amplitude + phase) of monthly MODIS land-surface temperature over the DEVIATION from each tile's annual mean (so the LST-vs-air absolute offset cancels; only the cycle shape is kept). Runtime: `T = tempBase + amplitude·cos(2π·(yearPhase − phase))·seasonStrength`. Verified Ireland ~11 °C vs Siberia ~40 °C swing at equal latitude. Land-only (MODIS ocean is nodata → ocean keeps the synthetic model); optional so generated maps fall back to the latitude model. `map-generator/earth/season.py` fits + resamples to each earth grid.
- Lakes/rivers separated (`hydro.bin`): layers.bin's `water` plane merges rivers+lakes+irrigation (food-economy proximity) and both saturate it, so it cannot distinguish them. hydro.bin ships the two fields the colorizer already uses (`lakes` mask + `normalizedWatermap`; real-data maps use HydroLAKES + log-normalized HydroRIVERS). Lakes flag as lakes (they're LAND in map.bin), rivers grade on their own thresholds — `lakeFillCut` removed.
- Unified water rendering: one depth model for all water — `depth = surface − bed`, where the sea's surface is sea level and inland water's is the depression-fill level. One colorizer branch (depth ramp + shallow-shelf blur + warm/cold), no ocean/lake/river split.
- bake.ts elevation export normalizes land by the map's TRUE max elevation, not the image ramp's 4000 m magnitude cap — the cap saturated the Himalaya/Tibet into a flat plateau.
