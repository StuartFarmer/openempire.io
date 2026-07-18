# Unify the field viewer — lab and shell as one runtime

## Why

The lab (`#lab`) is a thin, generic runner of one abstraction: a `FieldDynamics` system (compile → upload layers → tick → blit). The shell (`#shell`) is an application that staples together three unrelated mechanisms — a `FieldDynamics` system (`world`), a raw hand-wired terrain-derivation kernel (`TerrainDerivation`, ~a dispatch program on bare `FieldKernel`), and a camera renderer — plus ~80 lines of ad-hoc sidecar decoding. From the player's perspective the two are the same thing (systems + a viewer), but they diverged because the worldgen derivation **outgrew the abstraction**: `FieldDynamics` models a per-tick cellular sim (layers with local `init`/`update` rules, Jacobi stepping, diffusion), while the worldgen is a one-shot algorithm needing `iterate` (run a pass until convergence), atomic global reductions (histogram → quantile), and single-dispatch passes — none of which the DSL expresses. So terrain had to be written one layer down, and the shell accreted all the plumbing to drive it.

This change closes the gap: `FieldDynamics` gains the primitives to express the worldgen natively, terrain becomes just another system, map inputs become declarations instead of procedural code, and the two pages collapse into one runtime that mounts systems under a chosen renderer.

## What Changes

- **`FieldDynamics` gains a derivation stage** — a named, ordered, ON-DEMAND pipeline (run at load and when a derivation parameter changes) distinct from the per-tick `update` loop, producing derived fields the tick-loop layers and views read. Backed by new first-class primitives:
  - **`iterate`**: repeat a pass N times within a step (N may scale with map size) — flood fill, depression fill, flow routing.
  - **Reduce-to-uniform**: a reduction pass computes a global value from a field (atomic accumulate + a single-dispatch scan — the histogram→quantile pattern) that later passes read as a uniform, feeding back into the GPU program (distinct from the CPU-readout scalars).
  - **Single-dispatch passes**: a pass that runs once (not per tile) — serial scans/quantiles.
  - **Derivation scratch fields**: intermediate buffers (ocean, fill, water, dir, hist) that live for the derivation, not as persistent layers.
- **The worldgen is re-expressed as a `FieldDynamics` derivation** — every pass (flags, histogram, quantile, climate, fill, flow, water, lakes, irrigation, biome, color) becomes a native DSL construct on the new primitives. `TerrainDerivation.ts` and `WebGpuWorldEngine`'s hand-wired `PASS_TABLE`/dispatch program are removed; terrain, climate, water, and biome derivation live in a `terrain` system.
- **Systems declare their map inputs** — a manifest declares the primary fields it consumes (`elevation.bin`, `hydro.lake`/`hydro.river`, `season.amplitude`/`season.phase`, `layers.*` planes), and a generic loader decodes the sidecars (via the core `ElevationMap`/`HydroMap`/`SeasonMap`/`MapLayers` modules) and uploads them as read-only input fields. The shell's hand-written decode/plane/`waterMask` code becomes a declaration; input transforms that must run on the CPU (the `waterMask` connected-components classification) are a declared input-prep hook.
- **The two pages merge into one field-viewer runtime** — a single component mounts a system with a chosen renderer (**blit** or **camera**) and chosen panels (system picker, map picker, view/brush selectors, scalar readouts, parameter sliders, hover readout). `#lab` and `#shell` become presets/routes of it (lab = blit + brush/scalar chrome; shell = camera + climate-knob/hover chrome). The shell's climate sliders, hover readout, and view routing become generic panels driven by the mounted system's declared params/views.
- **The camera renderer is shared** — `CameraRenderer` becomes a mountable renderer of the unified viewer; the baked-`terrain-colors.png` fallback path stays for when a map lacks derivation inputs.

## Capabilities

### New Capabilities

- `field-derivation-primitives`: the `FieldDynamics` derivation stage and its primitives (`iterate`, reduce-to-uniform, single-dispatch passes, scratch fields), sufficient to express the worldgen natively; the worldgen re-expressed as a `terrain` system.
- `declared-map-inputs`: systems declare the primary map fields they consume; a generic loader decodes the sidecars and uploads them (plus a CPU input-prep hook), replacing procedural map plumbing.
- `unified-field-viewer`: one field-viewer runtime mounting systems under a blit or camera renderer with generic panels; `#lab` and `#shell` as presets of it.

### Modified Capabilities

<!-- runtime-terrain-derivation (export-primary-fields) is REALIZED differently: same behavior (derived terrain, live climate knobs, seasons), now expressed as a FieldDynamics system rather than a hand-wired kernel. Its requirements are preserved; only the implementation mechanism changes. -->

## Impact

- `src/client/webgpu/FieldDynamics.ts` — the derivation stage + primitives (`iterate`, reduce-to-uniform, single-dispatch, scratch fields); the compiler emits the on-demand derivation program.
- `src/client/webgpu/FieldKernel.ts` — frame/dispatch support the primitives (already has `iterate`/atomics at the raw level; expose them through the compiler).
- New `src/client/lab/systems/terrain/` — the worldgen re-expressed as a system (passes become derivation steps + views).
- Removed: `src/client/shell/TerrainDerivation.ts`, `src/client/webgpu/WebGpuWorldEngine.ts`'s `PASS_TABLE`/dispatch program (the WESL passes move into the `terrain` system), the shell's explicit decode/`waterMask`/view-routing code.
- New generic map-input loader (extends/replaces `MapLayerUpload.ts`) decoding elevation/hydro/season/layers via the core format modules.
- New `src/client/FieldViewerPage.ts` (or equivalent) — the merged runtime; `FieldLabPage`/`GameShellPage` become thin presets or are folded in.
- `src/client/shell/CameraRenderer.ts` — mountable renderer of the unified viewer.
- No `src/core` changes, no map/sidecar format changes, no game-rule changes — a client-runtime refactor that preserves all shipped behavior.
