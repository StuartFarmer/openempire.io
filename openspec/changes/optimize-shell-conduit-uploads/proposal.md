# Optimize OpenFront-live conduit uploads (fix big-map FPS)

## Why

OpenFront-live got very bad FPS on large maps. Profiling (a fast-forwarded
mature game, `perf-profile.mjs`) showed the per-tick `stepSim` blocking the main
thread for **108ms on EarthXL** (4096×2048 = 8.4M tiles), and — crucially — the
cost was **my upload code, not the sim**: rebuilding and re-uploading all five
full per-tile conduits (owner/plot/density/damage/front, ~33MB each) every tick.

Breakdown before (EarthXL, mature): `stepSim` 108ms = `uploadStructures` 51ms +
`uploadFront` 12ms + owner copy/upload ~20ms + `executeNextTick` (the real sim)
25ms. The sim only changes a handful of tiles per tick, yet we re-scanned and
re-DMAed the entire map.

## What Changes

- **Delta-apply, don't rebuild.** The sim already emits per-tile deltas
  (`packedTileUpdates` pairs for ownership; `tile|(byte<<24)` for density, farm
  maturity, and combat damage). Apply them in place in the sim callback and mark
  only the touched tiles dirty — no full-map rebuild loop.
- **Sparse, run-merged GPU uploads.** New `FieldKernel.writeBufferU32Range`
  uploads only a sub-range. Per tick, changed tiles are sorted and merged into
  contiguous runs; each run is uploaded, or a single full upload when nearly
  everything changed. Persistent GPU buffers retain the rest.
- **Border-walk the front.** Recompute the front by walking the human's border
  tiles (perimeter) instead of scanning all 8.4M tiles, and clear only last
  tick's painted tiles.
- **Bound the work.** Throttle the structure-unit enumeration (structures change
  slowly) and cap OpenFront-live catch-up to 2 sim ticks/frame so a slow big-map
  tick can't run a whole batch synchronously and freeze the frame.

Result (EarthXL, mature, headless): `stepSim` **108ms → 27ms** (4×);
`uploadConduits` **~83ms → 0.67ms** — my code is no longer the bottleneck (the
remaining 27ms is the real `src/core` sim tick). Verdantia (the default map) is
120fps, `stepSim` ~1ms. No behaviour change: structures, fronts, and damage
render identically.

## Capabilities

### New Capabilities

- `shell-conduit-upload-perf`: OpenFront-live uploads per-tile state to the GPU
  incrementally (delta-applied, sparse run-merged partial uploads) instead of
  re-uploading full-map buffers every tick, keeping large maps interactive.

## Impact

- `src/client/webgpu/FieldKernel.ts` — `writeBufferU32Range` (partial upload).
- `src/client/GameShellPage.ts` — delta-applied conduits in `onSimUpdate`;
  `uploadConduits` (unit diff + front) with run-merged `flushDirty`;
  border-walk `computeFront`; unit-diff throttle; catch-up cap.
- No `src/core` changes; no rendering/behaviour change.
