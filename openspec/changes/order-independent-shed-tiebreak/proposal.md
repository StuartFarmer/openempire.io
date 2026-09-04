## Why

The food-shed's nearest-farm assignment is decided, when two farms are the same
step-distance from a tile, by **whichever BFS wave reached it first** — an
artifact of the queue, not a design decision. Nothing in the specs says which
farm should win a tie, so the answer is "whatever the traversal happened to do".

That blocks moving the shed off the CPU. A WESL flood of the same algorithm
reproduces the CPU's step distances on **100%** of tiles (verified against a real
21-nation game: 35,627 shed tiles, zero distance discrepancies) but disagrees on
**4.43%** of cell assignments — every one of them an equal-distance tie. A
parallel relaxation has no queue and therefore cannot reproduce a queue-order
rule; it can only reproduce a rule stated in terms of the data. Until the tie is
decided by something order-independent, a compute-shader shed can never be
verified by exact diff, only eyeballed.

## What Changes

- The food-shed's equidistant tie-break becomes explicit and order-independent:
  when two or more farms are at the same step distance from a tile, the farm with
  the **lowest tile ref** claims it. The shortest-path distance itself is
  unchanged.
- **BREAKING** (simulation output): tiles on a Voronoi seam between equidistant
  farms may move to a different cell than today. That shifts which district's
  labor pool they count toward, which farm's maturity sets their shed potential,
  and which feeding region they eat from. Seeded game hashes change.
- No knob, unit, mechanic, or config value is added, removed, or retuned.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `food-economy`: the nearest-farm Voronoi cell requirement gains a stated
  tie-break — equidistant farms are resolved by lowest source tile ref, so cell
  membership is a function of the map and the farms alone, not of traversal
  order.
- `urban-core-growth`: the food-shed potential requirement states which farm's
  maturity `M` applies when several reach a tile at equal distance (the same
  lowest-ref source), so the projected potential is well-defined rather than
  implementation-defined.

## Impact

- `src/core/execution/utils/FoodShed.ts` — `recompute`'s multi-source BFS: an
  equal-distance neighbour must now be able to _improve_ a tile's source, which
  the current first-writer-wins traversal cannot express. Needs a relaxation that
  re-visits on improvement (or an equivalent lexicographic ordering).
- Seeded determinism artifacts: `tests/perf/balance` hashes, any stored sweep
  results (`results.jsonl`) and exported presets predate the change and are not
  comparable across it — `simFingerprint()` already guards stored rows.
- Enables (does not perform) the GPU port: `src/client/lab/systems/shedspike/`
  already implements the lowest-ref rule, so after this change the existing diff
  rig (`.claude/skills/run-openfront/shed-gpu-diff.mjs`) should report 100%
  agreement instead of 95.57%, turning the port into a verifiable refactor.
- No change to the renderers, the shell, or any UI.
