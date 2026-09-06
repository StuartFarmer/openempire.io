# Task 5 — Compact GPU Growth Accelerator

## RED

Added `tests/LeanFrontSimpleGpuGrowth.test.ts` before the accelerator existed.

`npx vitest tests/LeanFrontSimpleGpuGrowth.test.ts --run` failed as expected:

```
Failed to resolve import "../src/client/games/leanfront-simple/economy/SimpleGpuGrowth"
```

## GREEN

- Added a compiled one-row field derivation with only `stock`, `level`, `kind`, and readable `nextStock` buffers.
- `SimpleGpuGrowth` uploads per-plot inputs and config uniforms, runs one pass, reads only the requested `nextStock` words, then retains CPU-derived metadata.
- Runtime creation chooses GPU once; an initialization failure yields `null`, and a dispatch/readback rejection permanently uses `growSimplePlotsCpu` for that runtime.
- `dispose()` destroys the owned field kernel alongside the economy.

Verification:

```
npx vitest tests/LeanFrontSimpleGpuGrowth.test.ts tests/LeanFrontSimpleEconomy.test.ts tests/LeanFrontSimpleRuntime.test.ts --run
# 3 files, 35 tests passed
npm run lint
npx tsc --noEmit
```

## Device limitation

This environment exposes no WebGPU device. The six exact CPU/GPU parity cases therefore return after `SimpleGpuGrowth.create()` returns `null`; fallback, rejection, compiled-field lifecycle, and disposal remain covered with no GPU device.
