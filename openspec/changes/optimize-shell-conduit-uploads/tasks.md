# Tasks — Optimize OpenFront-live conduit uploads

## 1. Partial-upload primitive

- [x] 1.1 `FieldKernel.writeBufferU32Range(name, data, first, last)` — upload
      only elements [first,last] of a Uint32 buffer.

## 2. Delta-applied conduits

- [x] 2.1 `onSimUpdate`: apply `packedTileUpdates` (owner + plot-on-conquest),
      `packedDensityUpdates`, `packedDamageUpdates`, `packedFieldUpdates` (plot farm
      claim) in place; mark only touched tiles dirty. Drop the full owner copy and
      the Uint8 density/damage mirrors.
- [x] 2.2 `uploadConduits`: structure-unit add/remove diff (throttled), front
      recompute, then `flushDirty` each conduit.
- [x] 2.3 `flushDirty`: sort changed tiles, merge contiguous runs, upload per
      run (or one full upload past a threshold).

## 3. Bounded front + catch-up

- [x] 3.1 `computeFront`: walk the human's border tiles; clear last tick's
      painted tiles; no full-map scan.
- [x] 3.2 Cap OpenFront-live catch-up to a small number of sim ticks per frame.

## 4. Verify

- [x] 4.1 tsc + lint; FieldDynamics tests pass; structures/fronts/damage render
      identically (headless checks).
- [x] 4.2 Profile before/after (`perf-profile.mjs`, EarthXL mature): stepSim
      108ms → 27ms; uploadConduits ~83ms → <1ms; Verdantia 120fps.
