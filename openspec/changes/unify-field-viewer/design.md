# Design — Unify the field viewer

## Context

`FieldDynamics` (`src/client/webgpu/FieldDynamics.ts`) compiles a system manifest (layers with `init`/`update` rules, params, players, phases, brushes, views, scalars) into GPU passes run by the lab: init once, then each tick run every layer's `update` (Jacobi) in phase order, then a view pass. It models a **per-tick cellular simulation**.

The worldgen terrain derivation (`src/client/shell/TerrainDerivation.ts` + `WebGpuWorldEngine`'s `PASS_TABLE`) is a **one-shot algorithm** run at map load: `flagsFromMask → histogram → quantile → climate → fillInit → iterate(fillStep,320) → flowDir → waterInit → iterate(waterStep,320) → waterMax → lakes → iterate(lakeSpread,12) → irrigationInit → iterate(irrigationStep,8) → humidityBiome → color`. It needs `iterate` (repeat to convergence), atomic global reductions (histogram bins → a single-dispatch quantile scan → the mountain threshold), single-dispatch passes, and scratch ping-pong buffers — none expressible in `FieldDynamics`. So it lives on bare `FieldKernel`, and the shell hand-wires the kernel, the sidecar decoding (`elevation.bin`/`hydro.bin`/`season.bin`), the `waterMask` connected-components classification, and the view routing between derived and baked terrain.

The decision (locked): re-express the worldgen natively in the DSL (no permanent escape hatch), and merge `#lab` and `#shell` into one page.

## Goals / Non-Goals

**Goals:**

- `FieldDynamics` can express the worldgen: an on-demand derivation stage with `iterate`, reduce-to-uniform, single-dispatch passes, and scratch fields.
- Terrain/climate/water/biome derivation becomes a `terrain` system; `TerrainDerivation.ts` and the raw `PASS_TABLE` are deleted.
- Map inputs are declared, not procedural; one generic loader decodes the sidecars.
- One field-viewer runtime mounts any system under a blit or camera renderer with generic panels; `#lab` and `#shell` are presets of it.

**Non-Goals:**

- No change to any sidecar/map format, `src/core`, or game rules — a client-runtime refactor.
- No change to observable behavior: the shell still shows derived terrain with live climate knobs, seasons, hover, and the baked fallback; the lab still runs its systems with brushes/scalars. Same pixels, new plumbing.
- Not a rewrite of the WESL pass bodies — the existing worldgen `.wesl` pass logic is reused; only its wiring (dispatch program, buffers, uniforms) moves into the DSL.

## Decisions

1. **A derivation stage, distinct from the tick loop.** A system gains a `derive` pipeline: an ordered list of steps run ON DEMAND — once at load, and re-run when a *derivation parameter* changes (the two-tier reactivity from export-primary-fields becomes a first-class notion: cheap steps re-run on knob changes, the full pipeline on structural changes). It produces **derived fields** that per-tick layers and views read. `init`/`update` remain for the cellular sim; `derive` is the algorithm. A system may have either or both (terrain = mostly `derive` + a seasonal `update`; empire = mostly `update`).

2. **`iterate` as a first-class step.** A derivation step may declare `iterate: N` (N a constant or a function of grid size), repeating the pass with ping-pong so it reads the previous iteration. Expresses flood/fill/flow convergence. The raw `FieldFrame.iterate` already exists; the compiler emits it from the manifest.

3. **Reduce-to-uniform (global reductions feeding the GPU program).** Distinct from the CPU-readout `scalars`: a derivation may declare a *global* computed by a reduction (e.g. `histogram` → `quantile` → `mountainThreshold`, or an atomic `max`), stored in a small uniform/buffer that later passes read. Modeled as: an atomic-accumulate pass over the field, then a single-dispatch pass that scans the accumulator into the global. The manifest declares the global and the two passes; the compiler wires the atomic buffer and the uniform.

4. **Single-dispatch passes.** A step may declare `kind: "single"` — dispatched once (one workgroup) rather than per tile — for serial scans (quantile) and small reductions. `FieldKernel` already supports single-dispatch; the compiler exposes it.

5. **Scratch fields.** Derivation-local buffers (ocean, fill, water, dir, hist) that exist for the pipeline, not as persistent layers — declared in the derivation, ping-ponged where a step advances them. Keeps the layer namespace for the actual sim state.

6. **Declared map inputs + a CPU prep hook.** A manifest declares the primary fields it consumes by sidecar+plane (`elevation`, `hydro.lake`, `hydro.river`, `season.amplitude`, `season.phase`, `layers.temperature`, …); one generic loader decodes them via the core format modules and uploads them as read-only input fields. Inputs that require CPU preparation before upload (the `waterMask` connected-components sea/lake classification, which is a genuine CPU graph algorithm) are a declared prep hook `prepare(inputs) -> field` run on the CPU at load. Everything else is pure GPU.

7. **One runtime, two presets.** A single `FieldViewer` component mounts (system, renderer, panels). Renderers: **blit** (full-canvas, the lab's) and **camera** (`CameraRenderer`, pan/zoom/mips, the shell's) — both consume a system's out-texture identically. Panels (system picker, map picker, view/brush selectors, param sliders, scalar readouts, hover readout) are generic, driven by the mounted system's declared views/params/brushes/scalars. `#lab` = blit + brush/scalar panels; `#shell` = camera + hover/knob panels + the `terrain` system loaded. The shell's bespoke climate sliders and hover become the generic param-slider and hover panels reading the `terrain` system's declared params and derived fields.

8. **Baked fallback preserved.** When a map lacks derivation inputs (or derivation fails), the viewer falls back to the baked `terrain-colors.png` bitmap under the camera — the existing shell fallback, now a viewer-level concern.

## The derivation model, concretely

A system manifest gains:

```
inputs: {                       // declared map inputs (decoded generically)
  elevation: "elevation.bin",
  lake: "hydro.lake", river: "hydro.river",
  temperature: "layers.temperature", humidity: "layers.humidity",
  seasonAmp: "season.amplitude", seasonPhase: "season.phase",
}
prepare: "prepare.ts"           // optional CPU input-prep (waterMask)
derived: ["ocean","flags","fill","water","dir","biome","temp","humid",...]  // derived + scratch fields
derive: [                       // the on-demand pipeline
  { pass: "flags_from_mask" },
  { global: "mountainThreshold", accumulate: "histogram", scan: "quantile" },  // reduce-to-uniform
  { pass: "climate" },
  { pass: "fill_init" }, { pass: "fill_step", iterate: "min(maxDim,320)" },
  { pass: "flow_dir" },
  { pass: "water_init" }, { pass: "water_step", iterate: "min(maxDim,320)" },
  ...
  { pass: "color", out: true },  // writes the terrain view texture
]
reactivity: { recolor: [...cheap steps...], full: [...all...] }  // which steps re-run on which param change
update: { temp: "layers/temp.wesl" }   // per-tick seasonal layer, reads derived + inputs
```

The existing `.wesl` pass bodies move in unchanged; only their bindings are generated from `inputs`/`derived`/`derive` (as the raw engine's `bindingsModule` does today, but driven by the manifest).

## Risks / Trade-offs

- [Large refactor touching the DSL core] → staged migration: land the primitives + a passing `terrain` system BEHIND the existing shell path, verify parity (the export-primary-fields screenshots), then flip the shell to the system and delete the old code. Nothing is removed until the replacement matches.
- [DSL grows complex] → the primitives are exactly what one real client (worldgen) needs; resist adding speculative ones. `iterate`/reduce/single/scratch is a closed set that covers the pipeline.
- [Merged page carries all concerns] → panels are independent, opt-in per preset; the runtime is a mount function, not a god component.
- [Parity regressions in derived terrain] → a golden-image check on a generated map (verdantia) plus the EarthXL/shell verifications gate the flip, same as export-primary-fields.
- [CPU `waterMask` stays CPU] → accepted; connected-components is a graph algorithm, not a field op. It is a declared, isolated prep hook, not scattered plumbing.

## Migration Plan

1. Add the derivation primitives to `FieldDynamics` (`iterate`, reduce-to-uniform, single-dispatch, scratch, the `derive` stage) with unit/compile tests, no consumer yet.
2. Re-express the worldgen as a `terrain` system on the new primitives; verify byte/visual parity against the current `TerrainDerivation` output (parked behind a flag).
3. Add declared map inputs + the generic loader + the `waterMask` prep hook.
4. Build the unified `FieldViewer` runtime (mount = system + renderer + panels); make `#lab` and `#shell` presets.
5. Flip `#shell` to the `terrain` system under the camera; delete `TerrainDerivation.ts`, the raw `PASS_TABLE`, and the shell's explicit terrain/decode/view-routing code.
   Rollback at any stage: the old path stays until step 5's parity check passes.

## Open Questions

- Whether the `terrain` system and the resident `world`/`empire` sim compose as ONE system (terrain derivation + seasonal + game layers in one manifest) or as **stacked systems** on a shared kernel (terrain provides derived fields; empire reads them). Leaning stacked/composable — a system can declare it consumes another system's derived fields — but this can be decided when the `terrain` system lands.
- Exact manifest syntax for `derive`/`global`/`iterate` — settled during implementation against the existing `defineFieldSystem` style, like the current FieldDynamics DSL.
