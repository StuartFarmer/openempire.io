## Context

`FoodShed.recompute` (`src/core/execution/utils/FoodShed.ts`) floods owned land
from every Farmland with a FIFO multi-source BFS, carrying each tile's step
distance and the source farm that reached it. First writer wins:

```ts
if (stamp[n] === run) { …union…; continue; }   // already reached → never revisited
stamp[n] = run; distOf[n] = d; srcFarmOf[n] = curFarm;
```

A tile equidistant from two farms therefore belongs to whichever wave the queue
happened to pop first, which depends on the order `player.units(Farmland)`
yields seeds and on FIFO interleaving. Nothing in the specs constrains it.

Measured against the WESL port (`src/client/lab/systems/shedspike/`, diffed by
`.claude/skills/run-openfront/shed-gpu-diff.mjs` on a real 21-nation Verdantia
game at tick 4302): identical reachability (35,627 tiles both sides), identical
step distance on **every** tile, and 1,580 tiles (4.43%) assigned to a different
farm — all of them equal-distance ties. The parallel relaxation converges to
"minimum distance, then minimum source ref" because that is the only fixpoint a
queue-free formulation can have.

## Goals / Non-Goals

**Goals:**

- Make shed cell membership a pure function of (owned land, farm positions).
- Keep step distances, reachability, and the shed cutoff exactly as they are.
- Make a compute-shader shed verifiable by exact diff rather than by inspection.

**Non-Goals:**

- Porting the shed to the GPU. This change only removes the blocker; the rig
  stays a measurement harness and nothing is wired into the sim.
- Touching labor spillover, coverage ranking, feeding regions, or any knob.
  Those consume cell membership; they are not redefined here.
- Re-tuning balance. Outcomes shift slightly because seam tiles move, but no
  parameter changes.

## Decisions

**D1 — Tie-break on lowest source tile ref.**
Alternatives: (a) lowest farm _maturity_ — unstable, maturity changes every tick
so cells would flicker between refreshes; (b) most recently founded — reintroduces
history dependence; (c) split the tile's labor between tied farms — changes the
Voronoi model itself and complicates every consumer. Tile ref is static, total,
and already the repo's standard deterministic tie-break (`|| a - b` in the
coverage sort, `hungry.sort((a, b) => a - b)` in spillover, union-by-smaller-root
in the region merge). It is also exactly what a parallel min-relaxation computes,
so CPU and GPU agree by construction.

**D2 — Implement as relaxation-on-improvement, not a second pass.**
The BFS must now revisit a tile when an equal-distance neighbour offers a lower
source. Options: (a) keep the FIFO BFS and re-enqueue a tile whose source
improves; (b) run the BFS then iterate a fixup pass to convergence; (c) switch to
a lexicographic Dijkstra keyed on (distance, source). (a) is the smallest change
to the existing loop and stays O(shed) in practice — a source improvement can
only propagate within the equal-distance frontier, and each tile's source is
monotonically non-increasing so re-enqueues are bounded. Take (a); fall back to
(c) if profiling shows churn.

**D3 — Seeds are inserted in ascending tile-ref order.**
Not required for correctness under D1, but it makes the common case converge
without any re-enqueue at all (the lower-ref wave is already in front), keeping
the cost close to today's.

**D4 — Verification is the seeded hash plus the existing GPU diff.**
The change deliberately alters hashes, so "hashes unchanged" cannot be the test.
Instead: (i) new unit tests pin the tie-break directly on a constructed
two-farm map; (ii) the GPU diff rig must report 100% cell agreement afterward,
which is a far stronger end-to-end check than any hand-written fixture — two
independent implementations agreeing tile-for-tile on a real 21-nation board.

## Risks / Trade-offs

- **Re-enqueue churn makes the flood slower** → bounded by D3 (seeds pre-sorted)
  and measured with `tests/perf/balance/ShellDeltaProbe.ts` before/after; the
  shed is ~19% of tick time, so a regression would be visible immediately.
- **Balance drifts because seam tiles change district** → the affected tiles are
  by definition equidistant between two farms, so their labor and food move
  between two adjacent districts rather than appearing or vanishing. Re-run the
  balance harness on both an engine map and a real-data map and compare the
  snowball metrics, not just the hashes.
- **Stored sweep results and presets predate the change** → `simFingerprint()`
  already stamps stored rows with a hash of `src/core`, so stale rows are
  dropped rather than silently mixed.
- **A future spec assumes queue order somewhere else** → grep for other
  first-writer-wins traversals (military supply in `SupplyField.ts` has the same
  shape and the same latent ambiguity). Out of scope here, but it is the next
  place this argument applies.

## Migration Plan

1. Land the tie-break behind no flag — it is a deterministic rule change, not a
   toggle; two shed semantics coexisting would be worse than either.
2. Re-baseline: record fresh seeded hashes for the harness, and note in
   `balance-notes.md` that pre-change rows are not comparable.
3. Re-run `shed-gpu-diff.mjs` and confirm 100% cell agreement — the acceptance
   gate for this change.
4. Rollback: revert the commit. No data migration, no persisted state, no config.

## Open Questions

- Should `SupplyField.recompute` get the same treatment in a follow-up? It is
  the same multi-source flood with the same unstated tie-break, and the same GPU
  argument applies to it. Deliberately excluded here to keep the diff small.
