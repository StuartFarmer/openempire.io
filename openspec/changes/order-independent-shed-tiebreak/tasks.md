## 1. Baseline before changing behavior

- [~] 1.1 NOT OBTAINABLE retroactively — the change has landed, so pre-change hashes can only be produced by reverting it. The horizons named here (1500/1200) are in any case now known to be too short to detect shed changes at all (see §5 and `balance-notes.md`); the post-change reference set at 4000 ticks in §5 is what serves this purpose.
- [~] 1.2 NOT OBTAINABLE retroactively. D2's re-enqueue risk was instead checked post-hoc against the figures recorded in 5.2, and again in `shed-reflects-current-ownership` 4.2: no regression outside the probe's ~10% resolution.
- [~] 1.3 NOT OBTAINABLE retroactively — 95.6% was the PRE-change disagreement. The gate that matters is 4.2, which confirms 100% agreement / 0 differing tiles after the change, and that passed.

## 2. Implement the tie-break

- [x] 2.1 In `FoodShed.recompute`, insert BFS seeds in ascending tile-ref order (design D3) so the lower-ref wave leads and the common case needs no re-visit.
- [x] 2.2 Change the flood to relax on improvement (design D2a): an already-reached neighbour whose distance equals the candidate distance AND whose source ref is higher adopts the lower source and is re-enqueued; strictly-closer neighbours behave as today.
- [x] 2.3 Confirm the region union-find still merges on flood contact — the touch test must not be skipped when a tile is revisited for a source improvement rather than a distance improvement.
- [x] 2.4 Verify the single fused output pass still reads each tile once and that `potential` uses the winning source's maturity.

## 3. Tests (src/core — required)

- [x] 3.1 `tests/FoodShed.test.ts`: a tile exactly equidistant from two farms joins the LOWER tile-ref farm's cell, regardless of which farm is built first.
- [x] 3.2 `tests/FoodShed.test.ts`: build the same two farms in the opposite order and assert identical `cellOf` for the whole shed (order independence).
- [x] 3.3 `tests/FoodShed.test.ts`: a strictly-nearer farm with a HIGHER tile ref still wins (the tie-break does not override distance).
- [x] 3.4 `tests/FoodShed.test.ts`: the winning source's maturity sets `potential` at a tied tile (urban-core-growth delta).
- [x] 3.5 Run the existing shed/farm/urban/economy suites and the full suite; only the CLAUDE.md known-failing baseline may be red.

## 4. Acceptance: two implementations agree

- [x] 4.1 Re-dump the reference with `tests/perf/balance/ShedReference.ts --map verdantia --ticks 4000`.
- [x] 4.2 Run `.claude/skills/run-openfront/shed-gpu-diff.mjs --ref <dir>` and require **100% cell agreement, 0 differing tiles** — the gate for this change.
- [x] 4.3 Confirm reachability and distances are still exact (no one-sided tiles, zero genuine distance differences).

## 5. Re-baseline and record

Reference set at 4000 ticks (recorded on the implementing commit; these also
carry the integer district accumulation and the canonical frontier order):
`verdantia` 2 runs nations 20 bots 40 → `801065038163313`, `2069060768539590`;
`spqr` 1 run nations 0 bots 50 → `4964847657180561`.

- [x] 5.1 Re-run the balance harness on an engine map and a real-data map; compare snowball metrics against 1.1 — leader 21.9→24.7% and 20.8→21.5%, gini 0.698→0.716 and 0.642→0.631, first eliminations unchanged. Within seed noise.
- [x] 5.2 Re-run the spqr tick-cost probe and confirm no material regression against 1.2 — 11.0 / 23.9 / 32.5 ms at ticks 1802 / 2802 / 3802 against 10.8 / 23.9 / 31.4 before, inside the probe's noise band. D3's pre-sorted seeds keep the re-enqueue path cold.
- [x] 5.3 Record the new seeded hashes and note in `balance-notes.md` that pre-change sweep rows and presets are not comparable across this change — in `rework-settlement-ecology/balance-notes.md`, alongside the 4000-tick horizon rule.
