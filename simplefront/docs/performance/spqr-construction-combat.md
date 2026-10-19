# SPQR construction and combat performance

Construction and combat changes reduce measured simulation-plus-observer time for the same 8,000-tick SPQR replay from **117.56 to 95.57 seconds: 18.7% less time**. Hashing code and its diagnostic schedule were held constant in frozen source copies, excluding the concurrent hashing changes.

## Changes

- Construction checks cached neighbor support and the maximum building level before querying live ownership, damage and structures. Unsupported buildings no longer pay for structure lookups. Candidate ordering, selection arithmetic and RNG consumption remain unchanged.
- An economy refill reuses its housing and birth calculations for capacity reconciliation and construction. It reads food again after clamping the balance, preserving food and fractional credits. Construction still refreshes housing for each construction opportunity.
- Combat avoids copying and sorting redistribution destinations that are already ascending. It also sorts its front once across opposing attacks; drained entries remain present throughout those clashes.

The geometry check alone reduced replay time to 103.36 seconds, a 12.1% reduction. Most of the combined improvement comes from construction and the associated economy calculations. In late-game CPU samples, construction steps fell from approximately 19.80 to 12.38 seconds of inclusive sampled time, and the complete economy tick from 29.21 to 17.80 seconds. These overlap and must not be added together.

## Deterministic replay

Apple M2 Max, SPQR 2048×1024, 50 bots, default nations, default city settings, seed `spqr-turbo-6000`, human spawn 1049653. All variants include the preceding render-cache and city-index/observer improvements. Each uses the real GameRunner plus city observer and human summary, with a 1 ms sampling profiler from tick 5,000 onward.

| Median simulation cost in the 500-tick window ending at |   Before |    After |
| ------------------------------------------------------- | -------: | -------: |
| 1,000                                                   |  1.52 ms |  1.41 ms |
| 6,000                                                   | 20.12 ms | 15.31 ms |
| 7,000                                                   | 23.21 ms | 15.85 ms |
| 8,000                                                   | 25.62 ms | 19.48 ms |

All 16 checkpoints match: SHA-256 of the diagnostic game hash plus complete city development snapshot, developed/owned/alive counts, and packed update byte counts. The snapshot includes fractional construction work, insertion order, unfinished work and city RNG states. The final diagnostic game hash is also identical. This checkpoint is not a complete cryptographic digest of every game field.

This is one sequential run per variant on a shared development machine. Host load and garbage collection introduce noise; for example, the combined variant's 6,000–6,500 window was slower than the geometry-only variant. The 8,000-tick p95 fell only from 71.89 to 66.52 ms, so expensive tail ticks remain. These measurements exclude canvas rendering, worker scheduling/transfers and most frame assembly, and are not a browser FPS claim.

## Combat experiment

A separate benchmark compares the real seep and troop-distribution methods against the frozen baseline, alternating execution order across seven samples. Troop fields, total troops, reserve and insertion order match after every one of 100 comparison ticks per shape.

| Front shape         | Baseline median, 2,000 passes | Optimized median | Time reduction |
| ------------------- | ----------------------------: | ---------------: | -------------: |
| Straight, 512 tiles |                     263.23 ms |        184.80 ms |          29.8% |
| Bent, 252 tiles     |                     131.65 ms |        127.39 ms |           3.2% |

The bent-front gain is modest and noisy; this does not imply a 30% improvement for all combat. Full-replay sampled seep time was approximately unchanged (5.01 versus 4.89 seconds). A reusable neighbor-target buffer was tested and discarded because it slowed bent fronts.

## Verification and reproduction

The full suite ran **584 passing tests across 64 passing files**. Two new hashing suites could not load their still-missing `TickChainAuthority` and `TickChainSession` modules during concurrent development. Typechecking was also blocked by those imports and the concurrent async Vite configuration changes. No construction/combat type errors were reported. Scoped ESLint passed. Independent code review found no correctness issues.

New regression coverage checks skipped structure work, eligibility after new support and damage, reused birth/housing calculations after food clamping, exact redistribution remainders, drained fronts, snapshot semantics and multiple opposing attacks including deletion of the first. The 41 focused combat tests passed.

- [Replay measurements and source hashes](spqr-construction-combat.json).
- [Core harness](spqr-turbo-core.mts).
- [Combat harness](combat-front-benchmark.mts) and [samples](combat-front-benchmark.json).

```sh
rtk proxy env PROBE_CHECKPOINTS=1 PROBE_OUTPUT=/tmp/spqr-probe.json node --import tsx simplefront/docs/performance/spqr-turbo-core.mts
rtk proxy env COMBAT_BASELINE_SRC=/path/to/prechange/src node --import tsx simplefront/docs/performance/combat-front-benchmark.mts
```

For a paired comparison, copy the complete `simplefront/src` tree before editing, together with the harness, map loader, package/TypeScript configuration and access to the same resources/dependencies. Run both variants against that frozen tree, replacing only the five construction/combat files listed in the source manifest for the optimized run. This prevents unrelated live edits from changing hashing or other simulation code between measurements.
