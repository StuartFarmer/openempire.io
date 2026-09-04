# #shell input parity + structures drawn on tiles

## Why

Two gaps versus the classic WebGL client:

1. **Input model.** The shell used a Pan/Brush tool _dropdown_ to switch between
   panning and acting. The WebGL client has no such toggle: dragging always pans,
   and a click that doesn't drag acts (spawn/attack/build). The tool select only
   makes sense where we literally paint tiles (the cellular study systems).
2. **Structures aren't drawn.** OpenFront-live renders territory ownership but
   not the tribal structures. In WebGL, Farmland, Settlements, and the urban
   "city" are drawn as per-tile fills (PlotPass + DensityPass) — not sprites.

Both are client-side rendering/interaction; no core rules change. The sim already
exposes the state: `game.units(Settlement, Farmland, Barn)` (single-tile plots),
`player.isFieldTile`/farm-CA maturity (packed field deltas), and per-tile urban
`density` (packed density deltas).

## What Changes

- **WebGL input model (shared base).** Drag always pans; a click that stays put
  fires the tile action. Painting-on-drag survives only for systems with declared
  brushes (the cellular studies), which keep the Pan/Brush toggle. OpenFront-live
  shows no tool select — drag pans, click acts, including during the spawn phase
  (drag to look around, click to settle the spawn).
- **Structures on tiles (GPU fields, WebGL parity).** Two CPU-written per-tile
  fields — `plot` (0 none / 1 Settlement / 2 Farmland / 3 Barn) and `density`
  (0..255 urban) — uploaded each tick like `owner`. The `plot` field is rebuilt
  from `game.units(...)` plus claimed farm-CA tiles (from packed field deltas);
  `density` is maintained from packed density deltas. The openfront overlay
  composites them over the terrain: settlement flat-fill, farmland cultivated
  tint, and a density-graded urban wash — mirroring PlotPass/DensityPass at the
  per-tile granularity the field view supports.

## Capabilities

### New Capabilities

- `shell-input-parity`: the field viewer's pointer model matches the WebGL
  client — drag pans, click acts, tool select only for tile-painting systems.
- `shell-structure-tiles`: OpenFront-live draws Farmland, Settlements, and urban
  density as per-tile fills over the terrain, fed from the live sim each tick.

## Impact

- `src/client/viewer/FieldViewerBase.ts` — click-vs-drag pointer model
  (`hasBrushPainting`/`hasClickAction`, drag threshold); the tool select is now a
  paint-only affordance.
- `src/client/GameShellPage.ts` — no tool for OpenFront-live; per-tick `plot`/
  `density` upload; capture packed field/density deltas from the sim callback.
- `src/client/lab/systems/openfront/` — `plot`/`density` conduit layers +
  overlay compositing in `views/openfront.wesl`.
- `tests/FieldDynamics.test.ts` — openfront layer set updated.
- No `src/core` changes.
