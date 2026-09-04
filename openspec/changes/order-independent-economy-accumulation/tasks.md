## 1. Integer district accumulation (implemented)

- [x] 1.1 In `FoodEconomy.foodTick`, accumulate district production and storage capacity into dense `Int32Array` buffers indexed by the shed's farm index (design D2).
- [x] 1.2 Round each tile's storage capacity and yield to integer milliunits before adding (design D1).
- [x] 1.3 Keep `prodOf`/`capOf` as the read interface so consumers are unchanged.

## 2. Canonical frontier order (implemented)

- [x] 2.1 Sort the frontier by ascending tile ref immediately before each `weightedPick` in `UrbanGrowth` (design D3).
- [x] 2.2 Confirm the sort does not disturb the frontier's membership bookkeeping (`inFrontier`, the splice-on-place).

## 3. Tests (src/core — required)

- [x] 3.1 `tests/FoodEconomy.test.ts`: a district's production and capacity totals are identical when its tilled tiles are accumulated in two different orders. Guards the invariant, but does NOT witness the old float version — verified by reverting `foodTick` to float accumulators, which leaves it green (60 doubles at these magnitudes sum identically either way, and the reported figure is floored by 1000). Recorded in the test's own comment rather than left implied.
- [x] 3.2 `tests/LandUseZoning.test.ts`: the same suitability field inserted in reversed order grows the same city. Power confirmed — removing the sort fails it (285 tiles vs 293).
- [x] 3.3 Run the existing economy/urban/shed suites and the full suite — 145/150 files pass; the 5 red are exactly the CLAUDE.md known-failing baseline.

## 4. Acceptance

- [x] 4.1 An externally computed supply field with bit-identical values produces an identical hash stream (`.claude/skills/run-openfront/supply-injection-check.mjs`) — 71/71 at 600 ticks, 161/161 at 1500. Before the frontier sort this was 36/71.
- [x] 4.2 Confirm the same for the shed flood at the 4000-tick horizon — **411/411 identical** on verdantia at 4000 ticks with BOTH fields served from the GPU (7 shed-seed-stale calls, first at tick 308, which decline to the CPU by design).

## 5. Re-baseline and record

- [x] 5.1 Reference hashes are shared with `order-independent-shed-tiebreak` (4000 ticks): `verdantia` `801065038163313`, `2069060768539590`; `spqr` `4964847657180561`. No separate re-baseline.
- [x] 5.2 Note in `balance-notes.md` that sweep rows and presets predating this change are not comparable, alongside the same note for the shed changes.
