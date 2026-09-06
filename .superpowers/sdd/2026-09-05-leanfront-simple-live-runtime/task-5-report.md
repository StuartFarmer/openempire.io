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

Review correction:

- `capacity`, `stock`, and the final `stock + growth` remain `u32` in WGSL;
  only the growth curve's ratio/rate/log inputs use `f32`. This preserves exact
  stocks above `2^24`, including level-1000 / stocks 16,777,001 and 16,777,235.
- The CPU oracle now rounds integer capacity and stock to `f32` before the
  ratio, multiplication, and logarithm boundaries, matching the WGSL curve;
  it still adds integer growth to the original exact stock.
- `FieldKernel.create()` now destroys a partially built kernel (including its
  allocated buffers) or an acquired owned device if construction fails. Shared
  devices remain owned by their caller.
- A fake-kernel test runs without WebGPU and verifies binary config upload,
  normal and empty batches, dispatch/readback counts, short-read rejection,
  and disposal.

Verification:

```
npx vitest tests/LeanFrontSimpleGpuGrowth.test.ts tests/LeanFrontSimpleEconomy.test.ts tests/LeanFrontSimpleRuntime.test.ts tests/FieldKernel.test.ts --run
# 4 files, 49 tests passed (including FieldKernel cleanup coverage)
npm run lint
npx tsc --noEmit
```

## Device limitation

This environment exposes no WebGPU device. The seven exact CPU/GPU parity cases therefore return after `SimpleGpuGrowth.create()` returns `null`; fallback, rejection, compiled-field lifecycle, upload/readback contract, and disposal remain covered with no GPU device.
