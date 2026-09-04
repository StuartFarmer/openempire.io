## Why

Two economy results were decided by **traversal order** rather than by the state
they claim to summarise. Both shipped alongside `order-independent-shed-tiebreak`
and share its rationale, but neither was specified.

1. **District production and capacity were float sums.** `foodTick` walked
   `shed.tilled` accumulating each tile's yield and storage as floats, flooring
   only at the end. Floating-point addition is not associative, so the district's
   total was in principle a function of the order the tile set was yielded in —
   and, more concretely, could not be reproduced by a reducer that completes in
   arbitrary order. It also contradicted the economy's own stated invariant that
   food math is integer milliunits.

   Honesty about scale: at the magnitudes this economy actually produces, the
   float sum's order-dependence appears to be theoretical. Reverting `foodTick`
   to float accumulators leaves the order test green, because 60 doubles of this
   size sum identically in either direction and the reported figure is floored by
   1000 anyway. This half of the change is an INVARIANT fix — integer,
   associative, reproducible by a parallel reducer — not a bug fix, and the
   proposal should not be read as claiming a behaviour it cannot demonstrate.

2. **Urban placement drew from an unordered pool.** `weightedPick` walks its pool
   accumulating weight until it passes the random draw, so the pool's ORDER
   decides which tile is returned. The frontier inherited its order from the
   supply field's `Map`, which inherited it from the BFS insertion sequence. A
   field with _identical contents in a different insertion order_ therefore grew
   a different city.

The second one is not theoretical: it was found by A/B'ing a game against a
GPU-served supply field with bit-identical values, which diverged anyway.
Re-inserting the same field in BFS order made 71/71 hashes match; tile-index
order gave 36/71. The simulation was reading the shape of a hash table.

## What Changes

- District production and storage capacity accumulate as **integer milliunits**,
  rounded per tile before summation, so a district's totals are a function of its
  tile set rather than of the iteration order. This also brings the code in line
  with the economy's existing stated invariant that all food math is integer
  milliunits.
- Urban placement draws from a **canonical (ascending tile-ref) frontier**, so
  which tile a given random draw selects is a function of the field's contents
  and the seed, not of how the field was built.
- **BREAKING** (simulation output): both change seeded game hashes. Neither adds,
  removes, or retunes any knob, unit, or mechanic; the inputs and the
  distributions are unchanged.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `food-economy`: the district production/storage requirement states that
  per-tile terms are rounded to integer milliunits before accumulation, making a
  district total a property of its tile set.
- `urban-core-growth`: the weighted-placement requirement states that the
  candidate pool is ordered by ascending tile ref before the draw, making
  placement a function of the suitability field rather than of its construction
  order.

## Impact

- `src/core/execution/utils/FoodEconomy.ts` — per-cell accumulation into dense
  `Int32Array` buffers indexed by cell, `Math.round` per tile term.
- `src/core/execution/utils/UrbanGrowth.ts` — `frontier.sort((a, b) => a - b)`
  immediately before each `weightedPick`.
- Determinism baselines: both changes landed in the same commits as
  `order-independent-shed-tiebreak` and are covered by the 4000-tick reference
  set recorded there (`verdantia` `801065038163313`, `2069060768539590`; `spqr`
  `4964847657180561`). They are not separately re-baselined.
- Unblocks the GPU port: a field producer other than the sim's own BFS can now
  serve either field without changing the game, which is what
  `.claude/skills/run-openfront/supply-injection-check.mjs` verifies.
- No renderer, shell, or UI change.
