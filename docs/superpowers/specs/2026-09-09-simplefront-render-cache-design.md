# SimpleFront incremental map rendering

## Decision

Keep the existing baked terrain and combined map texture. Recompute that texture only when its inputs change, and then only in affected 32×32 tile chunks. Continue drawing the cached texture through the existing camera every display frame. Preserve the current full-map shader for initial renders, broad changes and reference comparisons.

This is a renderer optimization, with no changes to simulation, game rules or artwork. A full separation of snow, weather and water animation is a later visual feature, not a prerequisite for these savings.

## Quick experiment, 9 September 2026

Machine: Apple M2 Max; WebGPU adapter apple / metal-3; Chrome 152 headless. GPU timestamps measured 60 samples per case after 8 warmups, with one dispatch or render pass per sample. Cases were interleaved. The scene uses the shipped Earth XL map and terrain image (4096×2048, 8,388,608 tiles), deterministic synthetic ownership, 284,130 urban tiles and 284,230 farm tiles. The camera uses the production shader with its plot plane enabled.

| Operation                                              | Median GPU ms | p95 GPU ms | Median speedup over full map |
| ------------------------------------------------------ | ------------: | ---------: | ---------------------------: |
| Existing full-map colour shader                        |         1.619 |      2.623 |                           1× |
| Same colour body, 128 dispersed 32×32 chunks (1.5625%) |         0.045 |      0.149 |                        35.8× |
| Same colour body, 512 chunks (6.25%)                   |         0.121 |      0.462 |                        13.4× |
| Same colour body, 2,048 chunks (25%)                   |         0.437 |      0.985 |                         3.7× |
| Camera only, 1920×1080, whole map                      |         0.185 |      0.441 |                            — |
| Camera only, 1920×1080, close view                     |         0.120 |      0.380 |                            — |
| Camera only, 3840×2160, whole map                      |         0.383 |      1.075 |                            — |
| Camera only, 3840×2160, close view                     |         0.381 |      1.402 |                            — |

The partial experiment replaces only the compute entry point's coordinate mapping; the colour body and neighbour reads remain intact. It selects dispersed chunks with a deterministic permutation. A full readback of both outputs verified all 131,072 selected tiles matched byte-for-byte and all unselected output bytes stayed zero. This establishes sparse shader correctness for a static scene, not correctness of future dirty tracking across game updates.

Evidence and reproducer:

- [Raw samples and source hashes](../../../simplefront/docs/performance/2026-09-09-renderer-benchmark.json)
- [Isolated benchmark](../../../simplefront/docs/performance/2026-09-09-renderer-benchmark.mjs)

Run from the repository root, with the already-installed Playwright package and Chrome:

```sh
rtk proxy npm --prefix simplefront run dev -- --host 127.0.0.1 --port 9017 --strictPort
```

In another terminal, also at the repository root:

```sh
rtk proxy node simplefront/docs/performance/2026-09-09-renderer-benchmark.mjs
```

`BENCH_URL` overrides the server URL; `BENCH_OUTPUT` overrides the default `/tmp/simplefront-render-benchmark.json`. The probe creates an isolated browser context and does not open a saved game. No dependencies were installed for this experiment; Playwright is locally available but is not declared in this repository's package.json.

### Interpretation and limits

- These are isolated GPU-pass measurements, not FPS or full-game benchmarks. CPU simulation, dirty-region discovery, uploads, presentation/compositing, boats/fire and seasonal derivation are excluded. The camera renders to an offscreen RGBA8 target, not the browser swapchain.
- GPU load/power state varied: full-map samples ranged from 0.639 to 4.387 ms. Earlier eight-dispatch batches were faster per dispatch; the table uses the final single-dispatch run. Do not present either result as a guaranteed time on this or another device.
- The production view loop defaults to 10 ticks/second, with additional redraws. At exactly 10 view updates/second, the median 1.56% case would save about 15.74 GPU ms per second, or 0.262 ms averaged over 60 displayed frames, before tracking/upload overhead. On frames containing a view update, the isolated pass reduction is about 1.57 ms. A 35.8× pass speedup does not imply a 35.8× FPS increase.
- The synthetic dirty fraction is an experimental input. The actual number/distribution of changed chunks in a running match has not been measured.
- The experiment computes chunk positions arithmetically. Production will upload chunk IDs; end-to-end validation must include this cost.
- The existing shader uses ten storage buffers, matching this adapter's limit. Adding another storage buffer for dirty indices would fail here. Use an 8 KiB uniform buffer for at most 2,048 packed chunk IDs instead.

## Existing behaviour

`GameShellPage.uploadBakedTint()` loads the background and suppresses seasonal derivation on success. `renderOpenfront()` still runs `view/simplefront` over the full grid. `FieldViewerBase` presents the camera every display frame, independently of view updates. Worker conduit buffers and city sprites already receive partial uploads.

One remaining upload is global: changing any plot type sets `plotBytesDirty` and uploads the entire R8 plot plane (8 MiB on Earth XL). Fix this alongside incremental colour updates.

## Requirements

- Scope changes to SimpleFront; preserve existing simulation, rules, city sprites, camera, boats, fire and other field-system behaviour.
- Add no runtime dependencies.
- Preserve pixel output, including alpha metadata, border neighbours, hover, mask fades, farm maturity, ownership, damage and highlights.
- Keep full-map rendering available for initial state, map/view changes, global parameters, player palettes and terrain recolouring.
- Dirty tracking must be proportional to incoming changed tiles and dirty chunks, not a new full-grid scan per tick.
- A changed tile invalidates its clipped 3×3 neighbourhood; chunk rounding may include extra pixels.
- The first render after load/reset/resize is full. Zero invalidation means zero view dispatches, while camera presentation and effects continue.
- Never discard invalidation arriving while prior GPU work is in flight.
- Do not exceed the adapter's existing storage-buffer limit.
- Treat 25% dirty chunks and 2,048 chunk IDs as initial conservative full-render fallback limits, not a measured crossover.
- Retain source/raster comparison tests and measure CPU plus GPU costs before claiming an application speedup.

## Alternatives and scope

1. **Only skip unchanged views:** smallest first step, useful during quiet periods but still global whenever a tile changes. Ship this first.
2. **Cached image with dirty chunks:** selected approach. Reuses the existing colour shader, texture and delta uploads, and the experiment supports a substantial reduction in colour-pass work.
3. **Move all colour logic into the screen shader:** avoids a full-map intermediate update, but repeats territory neighbour work per screen pixel and changes cost with zoom/DPR. Not tested here; unnecessary to obtain the measured sparse-update benefit.

Initially, hover/visibility-mask changes still invalidate the full map to preserve current ordering and alpha metadata. Do not move those effects into the camera until profiling a real hover-heavy session justifies it.

For future seasonal effects, keep a snow-free terrain texture plus static hillshade/water-mask inputs, slowly updated snow coverage, and time-driven water/cloud sampling. Avoid recomputing water blur per animation frame. That requires separate visual acceptance tests; no snow/weather speedup was measured in this probe.
