# Tasks — #shell input parity + structures on tiles

## 1. WebGL input model (shared base)

- [x] 1.1 `FieldViewerBase`: `hasBrushPainting()` (declared brushes) and
      `hasClickAction()` (discrete-click systems). Pointer model: brush-tool systems
      paint on drag; otherwise drag pans and a press that releases without moving
      past a small threshold fires `onTileGesture`.
- [x] 1.2 `GameShellPage`: OpenFront-live overrides `hasClickAction()` → true; no
      `tool` set on mount; the Pan/Brush toggle renders only when `hasBrushPainting()`.
- [x] 1.3 Verify (headless): OpenFront-live shows no tool buttons; a drag pans and
      does not spawn during the spawn phase; a click spawns.

## 2. Structure fields (plot + density)

- [x] 2.1 openfront system: `plot` and `density` layers (u32, init-only — CPU
      written, never GPU-ticked), like `owner`.
- [x] 2.2 `GameShellPage`: allocate `plotState`/`fieldState`/`densityState`
      (Uint8) + `plotU32`/`densityU32` upload buffers in `startSim`; capture
      `packedDensityUpdates`/`packedFieldUpdates` from the sim callback into
      `densityState`/`fieldState`.
- [x] 2.3 Each `stepSim`: rebuild `plot` from `game.units(Settlement, Farmland,
Barn)` tiles + claimed farm tiles (`fieldState ≥ claimByte`); fill `density`
      from `densityState`; `writeBuffer("plot"/"density", …)`. Not GPU-ticked.

## 3. Overlay compositing

- [x] 3.1 `views/openfront.wesl`: over the terrain tint + owner wash, add the
      density-graded urban wash, the flat Settlement fill, and the Farmland tint
      (derived from the tile terrain colour). Reads `layers::plot`/`density`.
- [x] 3.2 `tests/FieldDynamics.test.ts`: update the openfront layer set to
      include `plot`/`density` (init-only, not ticked).

## 4. Verify

- [x] 4.1 tsc + lint; FieldDynamics test passes.
- [x] 4.2 Headless: spawn, build a settlement, grow — the settlement/farmland/
      city read as distinct per-tile fills over the terrain; screenshot confirms.
