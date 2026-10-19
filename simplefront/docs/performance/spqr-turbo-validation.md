# SPQR turbo slowdown after 6,000 ticks

The reported slowdown reproduces in the simulation without a canvas. With SPQR, 50 bots, default nations and default city development, the world grew from 1,377 developed tiles at tick 1,000 to 53,738 at tick 8,000. Core simulation and visual-observer work both became more expensive as cities grew.

## Changes

1. Preserve the ordered city-tile cache until its membership changes. Previously, capturing undeveloped land, maturing an existing tile, or reindexing its neighbours discarded the cache and caused another sort. Founding, capture, relinquishment and restore still invalidate the affected owners correctly.
2. Replace the worker observer's full city scan with a bounded change history. Each observer keeps an independent revision cursor. Founding, level changes and ownership changes record the affected tile. The 4,096-entry history uses 16 KiB; slow readers and snapshot restores fall back to full reconciliation. Output retains the existing physical insertion order and payload format.

The late-game CPU profile attributed about 8.7% of sampled time to ordered-city lookup including sorting, and 8.0% to the full city observer. These are inclusive samples, not additive categories. City construction, combat, capacity/birth calculations and periodic hashing also consume time; this patch does not make turbo speed independent of world size.

## Deterministic core comparison

Apple M2 Max, the same `spqr-turbo-6000` seed and human spawn, 8,000 ticks per run. The harness measures the real `GameRunner` tick separately from `CityDevelopmentUpdates.read` plus the human city summary. It excludes rendering, worker timers/transfers and the rest of frame construction. A 1 ms sampling CPU profiler runs from tick 5,000 onward in each variant.

| Median cost in the 500-tick window ending at |   Before |    After |
| -------------------------------------------- | -------: | -------: |
| Tick 1,000: simulation                       |  1.58 ms |  1.51 ms |
| Tick 6,000: simulation                       | 22.27 ms | 16.82 ms |
| Tick 6,000: city observer + summary          |  3.59 ms | 0.022 ms |
| Tick 8,000: simulation                       | 25.61 ms | 22.91 ms |
| Tick 8,000: city observer + summary          |  4.86 ms | 0.024 ms |

Summed measured simulation-plus-observer time across the run fell from **139.90 seconds to 105.63 seconds**, a **24.5% reduction**. The first cache fix alone reduced simulation time by about 10%; the change history removes the observer's full-city scan on ordinary updates.

The final game hash matches. Every 500-tick checkpoint also matches developed-tile count, owned area, living-player count and the measured owner/density/development payload byte count. The full simulation still grows more expensive over time: its tick-8,000 p95 was 67.18 ms after the change, versus 69.41 ms before. These are sequential runs on one machine, not a statistically controlled hardware survey or an application FPS claim.

## Browser and regression validation

The real page and worker reached tick **7,000** in **104.78 seconds** with 50 bots, default city settings and **42,662 developed tiles**. There were no page, console, worker or GPU errors. The harness used the real spawn and turbo APIs, allowed automatic cities, and issued no further human actions. The human was defeated by the end, while the world continued under the existing game rules; this is not validation of a surviving player's large late-game empire.

| Real browser window | Simulation ticks/sec | Animation-frame p95 | Main-thread worker-frame p95 |
| ------------------- | -------------------: | ------------------: | ---------------------------: |
| 500–1,000           |               141.00 |             16.8 ms |                       0.2 ms |
| 3,500–4,000         |                66.05 |             16.7 ms |                       1.2 ms |
| 5,500–6,000         |                46.09 |             16.8 ms |                       1.7 ms |
| 6,500–7,000         |                42.18 |             16.8 ms |                       1.6 ms |

The last window used zero full-map view passes and 491 partial passes. Presentation opportunities remained regular around 60 Hz, while simulation throughput still declined as the world grew. This is an after-only, unseeded browser check at 1920×1080 with a fixed camera after the spawn transition; it cannot establish a browser before/after speedup or actual displayed FPS. The measured improvement comes from the separate deterministic core comparison.

The full SimpleFront suite passes **551 tests across 60 files**. Typechecking and targeted ESLint pass. New regression coverage proves cache reuse without losing capture order, independent readers without repeated full scans, removal after restore, and fallback after more changes than the history retains. Existing tests cover construction, neutral ownership, maturation, worker reset and unchanged simulation hashes under visual readers. Independent code review found no actionable issues.

## Reproduction and evidence

- [Core reproducer](spqr-turbo-core.mts).
- [Before, intermediate and final measurements](spqr-turbo-core.json).
- [Browser reproducer](spqr-turbo-browser.mjs) and [real turbo results](spqr-turbo-browser.json).

From the repository root:

```sh
rtk proxy node --import tsx simplefront/docs/performance/spqr-turbo-core.mts
rtk proxy npm --prefix simplefront test
rtk proxy npm --prefix simplefront run typecheck
```

The core probe defaults to SPQR, 8,000 ticks and seed `spqr-turbo-6000`; `PROBE_TICKS`, `PROBE_SEED` and `PROBE_OUTPUT` override those values. It writes results and a late-game `.cpuprofile` beside the selected output path (default `/tmp/spqr-turbo-result.json`).

For the browser probe, start Vite in `simplefront` on port 9017 and run `rtk proxy node simplefront/docs/performance/spqr-turbo-browser.mjs`. Set `SIMPLEFRONT_URL` to use a different local address. The harness filters Vite development reload notifications so saving measurements cannot restart the timed match.
