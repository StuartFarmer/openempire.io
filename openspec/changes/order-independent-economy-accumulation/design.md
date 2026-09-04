## Context

Both changes were made while porting the food economy's fields to compute
shaders, and both were found the same way: by making a second, independent
implementation produce the same field and asking why the game still differed.

The urban one is the sharper story. `SupplyInjection.worker.ts` runs two seeded
games — one with the simulation's own BFS, one with a GPU-computed supply field
verified bit-exact against it (19,789/19,789 tiles) — and compares hash streams.
They diverged anyway. The values were identical; the `Map` insertion order was
not. Re-inserting the same field in BFS order, changing nothing else, took the
run from 36/71 matching hashes to 71/71. That is a controlled experiment
identifying iteration order as the sole cause.

## Goals / Non-Goals

**Goals:**

- Make a district's totals a function of its tile set.
- Make urban placement a function of the suitability field's contents.
- Keep both distributions exactly as designed — this is about which of several
  equally-probable-by-spec outcomes occurs, not about changing probabilities.

**Non-Goals:**

- Performance. The integer change happens to be faster (it also replaced four
  hash lookups per tile with a dense index), but that is not why it is here.
- Touching the shed's Voronoi tie-break — that is
  `order-independent-shed-tiebreak`, a separate change with its own gate.
- Porting anything to the GPU. These changes make a port VERIFIABLE; they do not
  perform one.

## Decisions

**D1 — Round each tile's term, then sum as integers.**
Alternatives: (a) sum floats and round at the end (status quo — order-dependent);
(b) sum in a fixed sorted order (preserves float totals but forces a sort of
28k+ tiles per district per tick, and still cannot be reproduced by a parallel
reduction); (c) round per tile, sum as integers. Only (c) is associative, which
is what makes it reproducible by any producer — including a GPU atomic add in
arbitrary completion order. Rounding per tile also matches what the economy
already claims to do ("no floating-point accumulation"), so this is bringing the
code to the spec rather than moving the spec.

**D2 — Accumulate by dense cell index, not by cell tile ref.**
The loop runs once per tilled tile and hashed the cell's tile ref four times per
tile. A dense `Int32Array` indexed by the shed's own farm index removes the hash
entirely. Incidental to the correctness goal but free alongside it.

**D3 — Sort the frontier immediately before each draw, rather than keeping a
sorted structure.**
Alternatives: (a) a sorted set / heap for the frontier; (b) sort once and
maintain the invariant on insert; (c) sort before each `weightedPick`. The
frontier is a handful of tiles and the loop is bounded by `MAX_DEPOSITS`, so (c)
costs nothing measurable and is one line with no invariant to maintain or
accidentally break later. Take (c); revisit only if the frontier ever grows large.

**D4 — Do not fold these into `shed-reflects-current-ownership`.**
They landed in the same commits, so folding was tempting. But that change's own
proposal states "the shed's distances, cells, potential values and refresh
cadence are unchanged", and these alter accumulated values and placement — the
fold would contradict the text it was folded into. They share a rationale with
`order-independent-shed-tiebreak` instead, and share its re-baseline.

## Risks / Trade-offs

- **Rounding per tile changes district totals slightly** → each term moves by at
  most half a milliunit, against per-district totals in the thousands of
  milliunits; the sign of the error is not systematic, so it does not bias
  production up or down. Confirmed by the balance metrics being within seed noise
  at the shared re-baseline.
- **Sorting the frontier biases placement** → it does not change any tile's
  weight, only which equally-weighted arrangement the walk encounters first. The
  draw remains proportional to `s(x)`. The distribution was checked separately
  against the GPU's exponential-race sampler and matched.
- **These are invisible on short runs** → both change hashes, but like the shed
  change they can take thousands of ticks to surface. Anything touching them must
  use the 4000-tick horizon, not 1200.

## Migration Plan

1. Already landed, unflagged — two deterministic rule changes, not toggles.
2. Re-baseline is shared with `order-independent-shed-tiebreak` (4000 ticks;
   `verdantia` `801065038163313`, `2069060768539590`; `spqr`
   `4964847657180561`). No separate reference set.
3. Rollback: revert the two hunks. No persisted state, no config, no data.

## Open Questions

- `weightedPick` has other callers. Do any of them walk a pool whose order is
  similarly incidental? Out of scope here, but the same argument would apply
  wherever a weighted walk consumes a hash-map iteration.
