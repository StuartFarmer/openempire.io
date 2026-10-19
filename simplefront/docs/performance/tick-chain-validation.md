# SimpleFront tick-chain validation

## Delivered milestone

Normal local SimpleFront now seals and independently verifies one SHA-256 input block per executed tick, including empty ticks. Full-state checks are off in this path. Existing legacy runners still use their original numeric checksum and cadence. No root OpenFront live source was changed.

The shell has an **export replay** button. The recording binds the original game/player IDs, development settings, current simulation source identity and actual map assets. Replay never generates replacement seeds. Changing relevant source or assets makes old recordings incompatible by design; keep the matching checkout to diagnose an old match.

On a local tick failure, input stops and a replacement worker reconstructs the last successfully applied prefix. A sealed pending tick is attempted only against that fresh runner. One failed rebuild, a 120-second deadline, or repeated integrity episodes stops the client; the replay remains exportable. Unsent/unsealed inputs are discarded. A matching input chain does **not** prove correct execution or prevent cheating.

Remote multiplayer is **not shipped**. Versioned wire schemas and a two-receiver library harness exist, but the existing Transport/LocalServer/ClientGameRunner/legacy worker protocol has not been migrated. The actual multiplayer service is absent from this checkout. Do not advertise this local milestone as production multiplayer support.

## Verification

- Final regression suite: **71 files / 612 tests passed**. `npm --prefix simplefront run build` passed, including TypeScript checking; existing large-chunk warnings remain. `git diff --check` passed.
- Normal-worker test confirms zero periodic state-hash calls.
- Three real SPQR modes compare development state, tile ownership/damage, player state and the final numeric checksum, not just the input digest.
- Separate-process replay of 10,000 blocks reached applied tick 9,999 and matched final state hash `2481127316754760000`. It generated 34 diagnostic checkpoints at a 300-tick cadence. The original normal recording contains no historical state checks to compare; these 34 values are newly generated diagnostic output, not claimed historical matches.
- Chrome 152.0.7977.77, native Web Crypto: reference digest agreed with independent Node SHA-256; real SPQR shell ran at least 601 blocks, exported zero state checkpoints, replaced its worker, restored matching cursor/stats while paused, cleared all seven dynamic GPU planes (including a pre-existing highlight), resumed, then terminated cleanly on repeated injected controller failures. See [browser evidence](tick-chain-browser.json).
- Real partial-mutation injection and stale-recovery/terminal-control cases are covered by automated tests. Browser failure injection targets the lifecycle controller; it is not a real dropped WebSocket packet test.
- Independent read-only review found two recovery issues: an unnecessary extra tick prevented paused/finished matches from completing recovery, and worker replacement left GPU conduits uncleared. Both were reproduced with failing regressions, fixed, and cleared by follow-up review. Fresh initialization now applies any retained pending block before publishing readiness; historical burn/death effects are suppressed.
- The final recovery-only worker revision changed the build identity from `6ed0ad01…` to `ffd2e91d…`. The nine long measurements and 10,000-tick replay below were collected before that last recovery patch; normal simulation, diagnostics scheduling and hashing algorithms were unchanged. A fresh [three-mode 1,000-tick check](tick-chain-final-smoke.json), separate-process replay (four checkpoints, final hash `17729201365872398`) and browser lifecycle validation passed on the final identity. Old records intentionally reject the new identity.

## Performance

All nine runs completed: three repetitions each of legacy checks, checks disabled without a chain, and checks disabled with authority sealing plus receiver verification. Each uses the same SPQR seed, 50 bots plus authored nations, organic development and one human spawn. The late window is pre-step ticks 9,000–9,999. Every run produced identical explicit physical-state fingerprints and the same final numeric checksum. See [full measurements](tick-chain-benchmark.json).

| Late-window measure | Legacy state checks | Tick chain |
| --- | ---: | ---: |
| Verification wall time, median across three runs | 6,000.74 ms | 406.27 ms |
| Periodic full-state calls per 1,000 ticks | 100 | 0 |
| Per-run verification-time reduction | — | 92.5%, 92.4%, 94.1% |
| Core tick p95, median across runs (excludes async chain wait) | 83.50 ms | 31.96 ms |

The chain overhead includes authority sealing, receiver validation and the serialized apply wrapper. Its late-window per-block p95 was **1.13–1.25 ms**, so the strict sub-1-ms end-to-end target was **not met**. The ≥90% verification-time reduction target was met in all three comparisons. These are observed wall-time results under the limitations below, not controlled before/after FPS measurements.

Isolated seal-plus-verify p95 after warmup: empty block **0.088 ms**, one action **0.251 ms**, 32 actions **0.515 ms**, 256 actions **2.524 ms**. Asset loading/hashing during this benchmark initialization took **15.73 ms**. The 10,000-block recording was **1,880,768 bytes**; record size is not total heap usage.

Independent near-limit payload probe on Apple M2 Max / Node v25.2.1: a 64,756-byte block (one attack with 12,600 source tiles) took 17.07 ms p95 for seal **and** verify, 50 measured samples after 10 warmups; maximum 19.53 ms. This is below the 100 ms tick budget, not a guarantee for other machines or arbitrary payload shapes.

Limitations: timing is wall time, including native async overhead, not a CPU profiler attribution. Tests/browser validation and one diagnostic replay ran concurrently with portions of the benchmark. Heap observations include unreclaimed objects and cannot establish incremental retained memory. No before/after browser FPS claim is made. Construction, combat and rendering costs remain; eliminating hash spikes does not eliminate every cause of stutter.

The 10,000-tick diagnostic replay took 135.6 seconds under concurrent load, with 34 full-state checks. This exceeded the live recovery deadline. Normal recovery disables those diagnostics, but late-game recovery within 120 seconds is **not established**; the intended failure path is a clean stop if the deadline expires.

## Commands

From the repository root:

```sh
npm --prefix simplefront test
npm --prefix simplefront run build
npm --prefix simplefront run replay:chain -- --record match.json --state-every 300 --out replay-report.json
npm --prefix simplefront run benchmark:chain -- --map SPQR --seed simplefront-pace-01 --ticks 10000 --repeats 3 --out benchmark.json
```

Output files use exclusive creation; choose a new path for a new report. In a sandbox that blocks the `tsx` CLI's IPC socket, use `node --import tsx simplefront/scripts/replay-tick-chain.ts ...` (and the analogous benchmark script).

Browser lifecycle probe: start a separate SimpleFront dev server, then run `SIMPLEFRONT_URL=http://127.0.0.1:9019 CHAIN_BROWSER_OUTPUT=/tmp/new-browser-report.json node simplefront/scripts/validate-tick-chain-browser.mjs`. It requires installed Chrome/Playwright and WebGPU support.

## Remaining release work

1. Negotiate and wire the versioned protocol through the existing multiplayer client/worker bridge; keep legacy replay semantics separate.
2. Integrate the real authenticated server authority, retained receipt ledger, ranges and rejoin/stop messages; obtain its repository first.
3. Validate real two-client reconnects, build rejection, repeated-failure isolation and late-game catch-up against that service.
4. Measure isolated late-game normal/turbo browser frame behaviour and recovery deadline success on supported machines. Expand protocol/resource-limit boundary coverage before remote rollout.
