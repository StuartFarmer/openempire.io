# Tasks — Unify the field viewer

## 1. Derivation primitives in FieldDynamics (no consumer yet)

- [x] 1.0 Extract the shared pass-linking machinery into `src/client/webgpu/FieldDerivation.ts` (`bindingsModule` + `linkDerivation`: grid/single passes, `iterate`, ping-pong `advances`, atomic globals) and refactor `WebGpuWorldEngine` onto it — verified behavior-identical (generator page 634 dispatches unchanged; shell derives verdantia/majormenor/EarthXL with no errors). This is the machinery the `derive` stage delegates to.
- [x] 1.1 Add the `derive` stage to `FieldSystem`/`compileFieldSystem` (`derive: { fields, steps, typeImports }`): an on-demand pipeline (delegating to `linkDerivation`) compiled distinct from the per-tick loop; `CompiledFieldSystem` gains `derivedNames` + `runDerive(frame)`. Additive — 33 existing FieldDynamics tests still pass, lab systems unaffected.
- [x] 1.2 `iterate: N` step, ping-ponged; `runDerive` emits `FieldFrame.iterate` (tested)
- [x] 1.3 Reduce-to-uniform: the atomic-global pattern (histogram bins + single-dispatch scan → a Globals uniform) is expressible via the explicit-type bind grammar (`hist:array<atomic<u32>,256>!`, `G:GlobalsAtomic!`) that `linkDerivation` handles — the worldgen uses exactly this
- [x] 1.4 `kind: "single"` single-dispatch passes (passed through to `linkDerivation`)
- [x] 1.5 Derivation scratch/derived fields as buffers (ping-pong inferred from `advances`, fixed `count` for accumulators), separate from the layer namespace (tested)
- [ ] 1.6 Two-tier reactivity: declare which steps re-run on a light param change vs a structural one (deferred — `runDerive` currently runs the full pipeline; the recolor/full split lands with the terrain system in phase 2)
- [x] 1.7 Compiler tests: derive-stage links passes, reports `derivedNames`, ping-pongs advanced buffers, preserves fixed counts, `runDerive` emits pass+iterate, plain systems no-op (4 new tests, 37 total pass)

## 2. Worldgen re-expressed as the `terrain` system

- [x] 2.0 Two derive-stage enablers (additive, tested): a system may have a `derive` block with NO layers (pure derivation), and a `derive.uniform` custom `P` struct so the worldgen passes keep their own Params — reusing the pass bodies UNCHANGED instead of forking them. Existing systems unaffected (38 tests pass).
- [x] 2.1 New `src/client/lab/systems/terrain/system.ts`: the faithful worldgen derivation (flags_from_mask → histogram/quantile global → climate → fill·iterate(320) → flow → water·iterate(320) → waterMax → irrigation·iterate(8) → biome → color) declared as a `derive` block reusing the worldgen `.wesl` bodies (WORLDGEN_MODULES). **Compiles through the derive stage** — every pass's bindings, iterate, atomic globals, and single-dispatch resolve (verified by test). Not yet registered in the lab (needs the runner's `runDerive`, phase 4).
- [x] 2.2 Derived + scratch fields declared (elevation/waterMask/hydro/season inputs; flags/temperature/precipitation/humidity/fill/dir/water/irrigation scratch; hist 256 + G 4 accumulators); ping-pong inferred from `advances`.
- [ ] 2.3 Seasonal `temp` as a per-tick `update` layer + two-tier reactivity (recolor vs full) — deferred; the full derivation currently re-runs. Lands with the runner (phase 4).
- [x] 2.4 Parity check: the `terrain` system's derived output matches the current `TerrainDerivation` on EarthXL — `TerrainSystemRunner` mounts the system on the shared GPU device and runs `runDerive` from the identical inputs + Params; a `y` dev-toggle in the shell A/Bs the two on the same frame. Screenshots (`parity-1-handwired` vs `parity-2-system`) are visually identical (biomes, snow line, bathymetry, lakes). Fixed a compiler collision along the way: a `derive` field whose name is also in `MAP_LAYER_NAMES` (e.g. `elevation`) was allocated as both a derive buffer and a map-layer buffer (`Duplicate field buffer`); derive-owned names are now excluded from the map-layer scan.

## 3. Declared map inputs + generic loader

- [x] 3.1 `FieldDeriveSpec.inputs` declaration (per input field: which sidecar plane fills it — `elevation`/`layers.plane`/`hydro.plane`/`season.plane`+scale/`prepare`) + a generic `loadMapInputs` (`src/client/webgpu/MapInputs.ts`) decoding via `ElevationMap`/`MapLayers`/`HydroMap`/`SeasonMap` into the derive-field record, reporting absent sidecars (season on non-harmonic maps) as `missing`. Reproduces the shell's per-plane decode byte-for-byte (`tests/MapInputs.test.ts`, 4 tests; amplitude within float-ordering ε).
- [x] 3.2 CPU `prepare` hook (`FieldPrepareHook`): runs after sidecar decode to produce inputs no single sidecar gives. `buildWaterMask` (sea/lake connected-components) moved to `src/client/lab/systems/terrain/waterMask.ts` and driven by the `terrain` system's `prepare` hook from map.bin + decoded elevation + `config.seaLevel`; `TerrainDerivation` re-exports it until phase 5.
- [x] 3.3 `terrain` system declares its inputs; the shell builds a `MapInputBundle` from the raw sidecar bytes and feeds `TerrainSystemRunner` through `loadMapInputs` (not the hand-built fields). The `y`-toggle A/B confirms the declared loader reaches the derivation with output identical to the shell's hand-written decode on EarthXL.

## 4. The unified `FieldViewer` runtime

- [ ] 4.1 `FieldViewer` mount(system, renderer, panels); renderers: blit + `CameraRenderer` (make the camera mountable, out-texture-agnostic)
- [ ] 4.2 Generic panels from declarations: system/map pickers, view/brush selectors, param sliders, scalar readouts, hover readout (reading declared views/params/brushes/scalars/inputs)
- [ ] 4.3 Baked `terrain-colors.png` fallback as a viewer-level concern (renderer shows the bitmap when derivation inputs are absent/failed, with status)
- [ ] 4.4 `#lab` preset: sim systems under blit + brush/scalar panels; `#shell` preset: `terrain` (+ resident sim) under camera + hover/param panels

## 5. Flip and delete

- [ ] 5.1 Flip `#shell` to the `terrain` system under the camera; verify parity (export-primary-fields screenshots: EarthXL derived terrain, latitude/season live, hover, fallback) and the `#lab` regressions (world, settlement, empire, grazing, territory)
- [ ] 5.2 Delete `src/client/shell/TerrainDerivation.ts`, `WebGpuWorldEngine`'s `PASS_TABLE`/dispatch program (WESL passes now live in the `terrain` system), the shell's explicit decode/`waterMask`/view-routing, and the `MapLayerViews` CPU colorizer
- [ ] 5.3 Fold `FieldLabPage`/`GameShellPage` into the `FieldViewer` presets (or thin wrappers); remove the duplicated tick-loop/turbo/upload code
- [ ] 5.4 Full tsc + lint clean; `#webgpu` generator page still works (or is re-pointed at the `terrain` system); all lab systems and both presets verified
