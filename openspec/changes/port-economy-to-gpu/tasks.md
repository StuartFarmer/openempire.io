## 0. Park the redesign

- [x] 0.1 Remove `flow` from the shell picker so there are two games again, the CPU original and the GPU fork. Keep the system folder — it is a coherent design and may be wanted later as its own game.
- [x] 0.2 Note in `leanfront-flow-economy` that it is parked and why: the objective was a port and it became a different game.

## 1. Complete the per-tile passes

Everything here is verified in ISOLATION against the CPU before anything
switches. That is the only cheap place to catch bugs, because the cutover
(section 3) moves the whole economy at once by necessity.

Already done and verified:

- [x] 1.1 Supply flood — exact on 19,789/19,789 tiles.
- [x] 1.2 Food-shed flood — 100% cell agreement, 0 differing tiles.
- [x] 1.3 Crop CA ripen/senesce — bit-identical.
- [x] 1.4 Nucleus seeding — folded into `farm_ripen`.
- [x] 1.5 District ledger — 0 of 57 districts off; totals identical at ticks 902 and 3102.
- [x] 1.6 Patch credit stream and acreage — 0 of 57 districts off.

Remaining:

- [ ] 1.7 Patch APPLICATION: the credit accumulator as per-slot persistent state, the labour gate (`residents >= (acreage+1) x farmersPerFieldTile`), and the claim write. Its two reductions are already exact (1.6); this is the gate and the write.
- [ ] 1.8 The placement DRAW, serially (design D2). Build the frontier and weights in parallel; walk the draw in one invocation in the CPU's ascending-tile order so it picks the same tile. Applies to both the city draw and the patch draw.
- [ ] 1.9 Tenure aging — farms age at their climate ceiling.
- [ ] 1.10 The acres histogram (`EconomyModel.assessCommitted`) as a per-slot reduction.
- [ ] 1.11 Retire `urban_pick` / `urban_claim` / `farm_patch` / `farm_patch_claim` — the exponential-race form. They are correct but equidistributed rather than identical, which 1.8 supersedes.
- [ ] 1.12 Isolation-verify 1.7-1.10 against the CPU as 1.1-1.6 were, each with its own probe.

## 2. Fix the ordering the ledger cutover exposed

- [ ] 2.1 Order the pipeline so every write to maturity happens before `district_yield` reads it — ripen, nucleus seeding, then patch application. `farmTick` runs inside `foodTick` immediately before the ledger loop, and the GPU must match that.
- [ ] 2.2 Re-run the ledger A/B with the ledger injected and require a clean hash stream. It previously diverged at tick 103 with a worst error of 19,587 milli because the GPU was not doing all of `farmTick`.
- [ ] 2.3 Confirm GPU maturity equals CPU maturity tile-for-tile at the moment the ledger reads it — the drift probe already exists and measured 662 tiles of disagreement when it did not.

## 3. Cut over as a unit

- [ ] 3.1 Route the ruleset through to the sim worker so `leanfront` selects the GPU economy. The ruleset already reaches the worker and is verified live; it currently selects only a `Config`.
- [ ] 3.2 Switch every per-tile consumer together (design D6). A consumer whose producer is still on the CPU cannot agree with it inside a tick, which is what killed the incremental attempt.
- [ ] 3.3 Keep OpenFront on the CPU path throughout, and keep `tests/Rulesets.test.ts` guarding the split.

## 4. Verify

- [ ] 4.1 SEEDED HASH IDENTITY, CPU economy against GPU economy, on verdantia and spqr at the 4000-tick horizon. This is the gate; it is binary.
- [ ] 4.2 If a hash diverges from f32 rounding, integerise the offending term rather than relaxing the gate (design D2).
- [ ] 4.3 Confirm OpenFront's reference hashes are unchanged: verdantia `801065038163313`, `2069060768539590`; spqr `4964847657180561`.
- [ ] 4.4 Same-device replay: one seed, two runs, identical.
- [ ] 4.5 Measure the tick cost against the CPU baseline — spqr reaches 108 ms/tick at tick 9000, of which the economy is 85.7%. The projection is ~12 ms; it is unproven until measured end to end.
- [ ] 4.6 A vitest browser project for the GPU-dependent tests, since Node has no WebGPU.

## 5. Retire the scaffolding

- [ ] 5.1 Remove the uploader's plane mirroring.
- [ ] 5.2 Remove the provider seams and their staleness/decline logic, which exist only to keep two copies of the state in step.
- [ ] 5.3 Remove the drift probe and the injection A/B harness once 4.1 has passed.
- [ ] 5.4 Keep: every WESL pass, the dense district slots, integer accumulation, the order-independent tie-breaks, `peekFoodShed`, the browser run host and the GPU sweep pool.
