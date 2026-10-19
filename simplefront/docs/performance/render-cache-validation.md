# SimpleFront incremental render validation

The live SimpleFront renderer now preserves its combined map texture, skips unchanged views, and recomputes only dirty 32×32 tile chunks. It retains baked terrain, existing colour and alpha semantics, camera presentation, and animated overlays. Plot type changes upload contiguous row runs instead of the whole plot plane; maturity-only changes do not upload that texture.

Global changes still redraw the full map. Dirty tiles include a clipped one-tile halo for ownership borders. The full fallback remains 25% of chunks or more than 2,048 chunk IDs; plot uploads fall back above 1/16 of the plane. These thresholds are conservative defaults, not measured optimal crossover points.

## Production GPU path

Measured on Apple M2 Max, Metal 3, headless Chrome 152, using Earth XL at 4096×2048. The terrain is real; ownership, farms and cities are synthetic. The harness calls the production compiler, `FieldKernel`, `CompiledFieldSystem.runView`, and region staging/upload path. It adds output readback and GPU timestamp queries only for validation.

Eight warm-up rounds precede 60 interleaved samples of each case:

| View update  | Tile coverage | GPU median |  GPU p95 | Full / partial median |
| ------------ | ------------: | ---------: | -------: | --------------------: |
| Full map     |          100% |   0.627 ms | 0.837 ms |                    1× |
| 128 chunks   |         1.56% |   0.023 ms | 0.031 ms |                 27.6× |
| 512 chunks   |         6.25% |   0.049 ms | 0.074 ms |                 12.9× |
| 2,048 chunks |           25% |   0.163 ms | 0.249 ms |                  3.8× |

The last row explicitly exercises the region API's capacity; the application's invalidation tracker chooses a full redraw at 25%. The 128-chunk case uses 3.62% of the full pass's GPU time, comfortably meeting the planned maximum of 25%.

These are map-colour compute timestamps. They exclude the GPU region-buffer copy, camera/compositor, simulation, dirty discovery and plot uploads. The measured submission-to-completion wall-time medians were 1.00 ms full and 0.40 ms for 128 chunks; those values include queue/wait overhead and are not GPU timestamps. JavaScript timing was approximately 0.1 ms quantized, so zero component medians mean below clock resolution. Serial query readback also makes this a microbenchmark rather than an application throughput measurement.

At ten sparse map updates per second, the measured compute saving is about 6.05 ms of GPU work per second, or 0.101 ms averaged across sixty displayed frames. Unchanged updates save the entire colour dispatch. This does not imply a 28× increase in game FPS. The earlier exploratory benchmark had different scene/timing conditions; compare full and partial results within this new run rather than comparing its absolute times with the earlier probe.

## Correctness and automated checks

All seven GPU parity cases compared every output byte, including alpha metadata, with zero mismatches:

- Initial full rendering on Earth XL and on a 65×33 map.
- Ownership changes on a chunk boundary, the border halo, and first/last map texels.
- Farm maturity and removal of city physical level at constant density.
- Clearing damage and highlights.
- Two region frames encoded before submission, preserving their different chunk IDs.
- Clipped region dispatch at non-aligned 65×33 map edges.

The border test additionally asserts a changed pixel in the neighbouring chunk (RGBA `[77,79,68,176]` → `[57,58,50,1]`). The interior city test asserts that removing physical level at constant density changes alpha `176` → `1`. These assertions ensure the comparison exercises visible effects, rather than merely re-rendering unchanged output.

No GPU validation errors occurred. The production view uses ten storage buffers on the tested adapter's ten-buffer limit; region IDs occupy a separate uniform binding.

The complete SimpleFront Vitest suite passed: **60 files, 548 tests**. The eight focused rendering/city files passed **58 tests**. Typechecking, targeted ESLint and whitespace checks passed. Tests cover unchanged worker data, pending deltas during submission, full retry after failure, stale map completion, paused hover/fades, baked-tint completion, neighbour invalidation and partial plot uploads. Independent production-code review found no actionable issues.

## Browser validation

The real page loaded, spawned a player and advanced the worker from tick 1 to tick 116 on both Verdantia and Earth XL. The probe verified actual map dimensions, baked terrain, Metal hardware and canvas backing sizes. No page, console or GPU errors occurred.

Each mode then replayed the same 200 scripted events at 10 Hz from one restored snapshot, with the worker paused. Four 50-event phases exercise stationary presentation, camera panning, changing hover and local synthetic fighting/plot mutations on an all-land patch. Camera presentation continues through the real animation loop. The reference forces full invalidation and full plot-plane uploads on the current build, so it isolates those boundaries rather than representing an old-checkout FPS baseline.

| Metric: full reference → cache      | Verdantia, 1920×1080 | Earth XL, 3840×2160 |
| ----------------------------------- | -------------------: | ------------------: |
| Render-completion wall time, median |         1.4 → 0.4 ms |        2.4 → 0.6 ms |
| Render-completion wall time, p95    |         1.8 → 0.9 ms |        4.7 → 3.1 ms |
| Worker-delta handling CPU, median   |         0.3 → 0.1 ms |        0.5 → 0.2 ms |
| Animation-frame interval, median    |       16.7 → 16.7 ms |      16.7 → 16.7 ms |
| Animation-frame interval, p95       |       16.8 → 16.8 ms |      16.7 → 16.8 ms |
| Conduit + plot upload bytes         |    6,558,396 → 4,995 | 419,435,200 → 5,000 |
| Conduit + plot upload calls         |            650 → 700 |           650 → 700 |

For both maps, 200 full reference views became **51 full + 49 partial + 100 skipped**. Partial coverage was 3.125% on Verdantia and 0.0244% on Earth XL. Hover remains a global invalidation; retaining it explains most of the remaining full passes.

The wall-time rows cover all 200 attempts, including skipped updates, and include asynchronous submission completion. They are not GPU timestamps. The CPU row measures real `onWorkerFrame` handling plus benchmark counters and has approximately 0.1 ms clock granularity. Upload counts cover conduit buffers and the plot texture only; parameter uniforms and the 8 KiB region-buffer copy are excluded. Small row writes increase call count while sharply reducing transferred plot bytes.

Both modes remained around the 60 Hz presentation cadence. This run demonstrates lower rendering work and measured CPU handling cost, not a demonstrated game FPS increase. Final canvas screenshot hashes also matched within each map's paired run, but the strict parity claim comes from compute-texture readback above, not from screenshots of time-dependent layers.

## Validation limits and decision

Keep this implementation and the existing fallback thresholds. The production shader saves substantial work on sparse updates, unchanged inputs submit no view, and the representative browser replay reduces measured work without a frame-cadence regression.

The browser protocol deliberately uses two representative endpoints and four five-second phases per mode, rather than the original full map/resolution/early-versus-late Cartesian matrix. Its local fighting mutations are synthetic; it is not a replay of a recorded late-game battle. The short worker smoke did not demonstrate creation of a new human city. City metadata and development behaviour are covered by GPU parity and automated tests, rather than that smoke attempt.

Camera GPU timestamps, prolonged dense-update comparisons against an old checkout, fixed-time parity for every animated overlay, and a full death/ambient/map-switch lifecycle walkthrough remain unmeasured. Async reset, paused hover/fade, baked-load completion and failed-submit retry have regression-test coverage. These limitations prevent claiming that every original end-to-end acceptance scenario was exercised; they do not change the measured sparse-pass benefit. No threshold tuning or weather-layer redesign is justified by this run.

## Evidence and reproduction

- [Production GPU probe](render-cache-gpu-validation.mjs) and [raw samples, metadata and source hashes](render-cache-gpu-validation.json).
- [Browser probe](render-cache-browser-validation.mjs) and [paired results](render-cache-browser-validation.json).
- [Implementation plan](../../../docs/superpowers/plans/2026-09-09-simplefront-render-cache.md).

From the repository root, start Vite in `simplefront` on port 9017, then run:

```sh
rtk proxy node simplefront/docs/performance/render-cache-gpu-validation.mjs
rtk proxy node simplefront/docs/performance/render-cache-browser-validation.mjs
rtk proxy npm --prefix simplefront test
rtk proxy npm --prefix simplefront run typecheck
```

The probes use the existing local Playwright installation and Chrome with hardware WebGPU. They add no application dependencies. Set `BENCH_URL` for the GPU probe or `SIMPLEFRONT_URL` for the browser probe to use another Vite address.
