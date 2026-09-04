## 1. Close the pass set (each verified in ISOLATION before anything switches)

The ledger cutover failed because a consumer cannot move while its producer stays
on the CPU, so the switch has to be one step. That makes per-pass isolation
verification the only place bugs can be caught cheaply.

- [x] 1.1 Food-shed flood — verified 100% cell agreement, 0 differing tiles.
- [x] 1.2 Supply flood — verified 19,789/19,789 tiles exact.
- [x] 1.3 Crop CA ripen/senesce — verified bit-identical.
- [x] 1.4 District ledger — verified exact (0 districts off; totals identical at ticks 902 and 3102).
- [x] 1.5 Nucleus seeding — folded into `farm_ripen`.
- [x] 1.6 Conquest/relinquish effects — derived from the ownership delta and the zone flag.
- [~] 1.7 Patch APPLICATION, in two halves:
  - [x] the two per-district REDUCTIONS the gate needs — the credit stream's per-tick drive (summed maturity) and the acreage (tile count) — as `farm_credit`. Verified exact against the CPU: 0 of 57 districts off on either, at tick 1602. The CPU's `tilled || !ranked` filter turned out to be a no-op on the set it filters (`fieldTilesByCell` already excludes fallow), so one predicate covers it.
  - [ ] the persistent credit accumulator, the labor gate, and the claim write. UNBLOCKED by design D7 — see the dependency note below, which no longer applies once population is a field.
- [ ] 1.8 Tenure aging (farms age at their climate ceiling) as a pass.
- [ ] 1.9 The acres histogram (`EconomyModel`) as a per-slot reduction.
- [ ] 1.10 Troops as a field, with local combat resolution (design D2).
- [ ] 1.11 Water crossing as a (player, troops) field payload advancing by shader rules.
- [ ] 1.12 Verify each of 1.7–1.11 against the CPU in isolation, as 1.1–1.4 were.

### Dependency note: RESOLVED by D7 (population as a field)

The block below was real under the CPU's representation and evaporates under the
GPU-native one. Kept because the reasoning is the point: the dependency was on
`occupancy`, a factor that exists only to spread a per-player scalar over a
field, and which should not exist at all once people ARE a field. Per-district
head counts become `sum(pop) where cell == slot`.

### The block as it stood (now historical)

The patch gate is `residents >= (acreage + 1) × farmersPerFieldTile`, and
`residents` is `peopleByFarm` — which is NOT a pure field reduction:

```
people(tile) = floor(density(tile) × occupancy)      occupancy = urbanCivilians / housing
residents(cell) = Σ people(tile in cell) + floor(rural / farmCount)   (+ remainder to the first farm)
```

`occupancy`, `rural` and `farmCount` are all PER-PLAYER scalars produced by the
population model. The per-tile `floor` means occupancy cannot be factored out of
the sum — `Σ floor(d·occ) ≠ floor(Σd · occ)` — so the reduction needs the scalar
at pass time rather than afterwards.

So 1.7's second half sits AFTER the per-player aggregates exist (2.4), not
alongside the other phase-1 passes. Building it earlier would mean verifying it
against numbers that do not exist yet, which is the mistake the isolation-first
rule is meant to prevent. The same is likely true of 1.9 (the acres histogram
feeds an urban-room calculation) and should be checked before it is scheduled.

This is the producer/consumer coupling that killed the ledger cutover, one level
up: there it was a consumer needing a producer's per-tile output within the same
tick; here it is a field reduction needing a per-player scalar from the same
tick's demographics.

## 2. The LeanFront field system

- [ ] 2.1 Author the `defineFieldSystem` manifest: the field inventory from the spec, the intent block, and the district-slot aggregates.
- [ ] 2.2 The intent contract: alive, attack target and commitment, build intents (tile + unit type). Spawn kit as a brush stamp.
- [ ] 2.3 Intent validation ON THE GPU — cost, placement legality — with unaffordable intents dropped rather than pre-checked on the CPU (design, open question 2).
- [ ] 2.4 Aggregate readback: per-player and per-district scalars only, dense-slot indexed.
- [ ] 2.5 Build it alongside the CPU path; nothing switches yet.

## 3. Switch the ruleset

- [ ] 3.1 `Rulesets.leanfront` selects the field host. `openfront` untouched.
- [ ] 3.2 `tests/Rulesets.test.ts` stops asserting identity for leanfront and starts guarding the SPLIT — openfront's behaviour must not move.
- [ ] 3.3 Confirm OpenFront's reference hashes are unchanged (verdantia `801065038163313`, `2069060768539590`; spqr `4964847657180561`).
- [ ] 3.4 Measure the intra-tick collapse: tiles with more than one ownership change per tick (design, risk 3).

## 4. Verify and re-baseline

- [ ] 4.1 Run LeanFront under the GPU sweep host; record its own reference set and the adapter.
- [ ] 4.2 Compare snowball metrics (leader share, gini, alive, first elimination) against OpenFront's — the question is whether the game is still the same GAME, not whether hashes match.
- [ ] 4.3 Same-device replay: one seed, two runs, identical results.
- [ ] 4.4 Measure the per-tick cost against the CPU baseline (spqr: 108 ms/tick at tick 9000, of which the economy is 85.7%).
- [ ] 4.5 A vitest browser project for the GPU-dependent tests.

## 5. Retire the scaffolding (design D5)

- [ ] 5.1 Remove the uploader's plane mirroring.
- [ ] 5.2 Remove `setSupplyProvider`, `setShedFloodProvider`, `setDistrictYieldProvider` and their staleness/decline logic.
- [ ] 5.3 Remove the drift probe and the injection A/B harness.
- [ ] 5.4 Keep: every WESL pass, the dense district slots, the integer accumulation, the order-independent tie-breaks, `peekFoodShed`, the browser run host.
