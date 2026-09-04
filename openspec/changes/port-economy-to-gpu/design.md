## Context

The per-tile economy is 85.7% of sim time and the GPU does it ~10x faster. The
question was never whether to move it, but how — and two answers have already
been tried and measured.

**Mirrored (Level A) is dead.** CPU authoritative, planes shipped both ways:
18.7 ms/tick of round trip against CPU floods topping out at 15.5 ms. The
compute won and the transport lost, so there is no crossover at any point in any
game. Its diagnostic value was real — it proved the seams and the exactness —
but it must not ship.

**Field-shaped redesign is out of scope.** Making population a per-tile field
produced a coherent but different game. The objective is the same game, faster.

What remains is the straightforward thing: run the per-tile work on the GPU,
keep the per-player bookkeeping where it is, and prove the results.

Most of it exists. Verified against the CPU: supply flood exact on
19,789/19,789 tiles; food-shed flood 100% cell agreement with 0 differing tiles;
crop CA bit-identical; district ledger 0 of 57 districts off with identical
totals at ticks 902 and 3102; patch credit and acreage 0 of 57 off; and both
floods driving a live game at 411/411 identical hashes across 4,000 ticks.

## Goals / Non-Goals

**Goals:**

- The same game, computed on the GPU, for the LeanFront ruleset.
- Bit-identical results everywhere it is achievable, and a stated bound where it
  is not.
- Aggregates crossing back, never planes.
- OpenFront untouched, guarded by its reference hashes.

**Non-Goals:**

- Changing any rule, knob, or mechanic.
- Moving population, food stock, births, deaths or starvation off the CPU. They
  are per-player arithmetic, they are cheap, and moving them is what turned the
  last attempt into a different game.
- Cross-device bit-determinism (D5).
- Shipping the flow economy (D7).

## Decisions

**D1 — Port the per-TILE work only; population stays a per-player scalar.**
The line is what the quantity IS, not where it would be convenient. Per-tile:
the two floods, crop maturity, tenure, district production and capacity, field
extent, placement draws. Per-player: population, food stock, births, deaths,
starvation, the seed ladder. The earlier reasoning — "a consumer cannot move
while its producer stays behind" — is about per-tile producers and consumers,
and does not generalise to "everything must be a field". Over-generalising it is
what produced a redesign.

**D2 — BIT-IDENTICAL throughout, including placement: draw SERIALLY.**

First attempt at this decision kept placement on the CPU to preserve seeded
outcomes. That does not work, and the reason is the Level A finding: placement
reads per-tile shed potential, so leaving it behind means reading a plane back,
which is the round trip that never pays. A PARTIAL port cannot win — either the
per-tile consumers all move or none of them do.

The premise underneath was also wrong. The draw looked unportable because the
parallel form (an exponential race, `key = -ln(U)/w`, atomicMin) reproduces the
distribution but not the specific choice. But the CPU walks an ASCENDING-SORTED
frontier accumulating weight until it passes the draw — deterministic given the
set — and the frontier is a handful of tiles, not a territory. A single-invocation
pass can walk it in exactly the same order and pick exactly the same tile.

So: parallelise building the frontier and its weights, which is the O(territory)
part, and run the draw itself SERIALLY in one thread, which is the O(frontier)
part.

MEASURED, because the argument depends on it (`UrbanPlacementStats.ts`, spqr,
3000 ticks): placements are ALWAYS exactly one per player per tick (n = 1.00 mean
and max), and the frontier runs 0-25 tiles mean with a maximum of 66. So the
serial half is at most ~66 candidates per player, ~4,200 iterations across a full
board — small enough for one invocation, and bounded rather than growing with
territory the way the flood does. The exponential race is abandoned as an over-parallelisation of a step too
small to need it — a good technique applied where it bought nothing and cost
exactness.

That makes the whole port provable by seeded hash, with f32 rounding as the only
permitted divergence — already measured at 1 milli in 400,000 on the one term
where it appears. If even that breaks a hash, the term is integerised rather than
tolerated. The gate is binary.

**D3 — The GPU must do ALL of `farmTick` before the ledger reads maturity.**
This is what broke the ledger cutover, and it was misread as needing a redesign.
`farmTick` runs INSIDE `foodTick`, immediately before the ledger loop, and it
does more than ripen: it seeds new nuclei and places patches, both of which write
maturity. The GPU only ripened, so its maturity and the CPU's diverged within the
tick and the ledger inherited it — first diff at tick 103, worst 19,587 milli.

The fix is ordering and completeness, not architecture: nucleus seeding is folded
into `farm_ripen` (done), patch application must land (task 1.1), and
`district_yield` must run after both. Then the ledger reads the same maturity the
CPU's does.

**D4 — Aggregates cross back, indexed by a DENSE district slot.**
Indexed by cell tile ref an accumulator is grid-sized: 8 MB each, 32 MB across
the four, so reading the "small results" would cost more than the flood planes
the port exists to stop shipping. Slots are assigned in ascending tile order so a
slot is a function of the farm SET, not of iteration order. Measured district
count peaks at 617 on spqr at full conquest, against a cap of 16,384.

**D5 — Determinism is per-device; order-independence gets STRICTER.**
Two different properties, and conflating them would be an error. WGSL specifies
2.5 ULP for division and wider for transcendentals, so two vendors may differ in
the last bits — accepted. But a float `atomicAdd` completes in nondeterministic
order and therefore varies RUN TO RUN on the same device, which is not a rounding
difference but an unreproducible game. Every reduction stays integer, and the
shed tie-break and canonical frontier ordering remain load-bearing.

**D6 — Cut over the economy as a UNIT, behind the ruleset.**
Injecting one consumer at a time is what failed: a consumer whose producer is
still on the CPU cannot agree with it inside a tick. The whole per-tile economy
switches together for `leanfront`, with OpenFront's CPU path untouched beside it
as the reference. Per-pass isolation verification (which most passes already
have) is what keeps the diagnosis surface small, since the switch is then the
only untested step.

**D7 — Park the flow economy, do not delete it.**
It stays a lab system. It is a coherent design and cost real work, and the
transport model may be wanted later as its own game. It is simply not LeanFront.

**D8 — Retire the mirroring scaffolding with the cutover.**
The uploader's plane mirroring, the staleness/decline checks and the drift probe
exist to keep two copies of the state in step. Under D6 there is one copy, and
keeping a second path that can silently disagree is worse than removing it. What
survives is everything that computes.

## Risks / Trade-offs

- **f32 rounding may still break hash identity somewhere unmeasured.** The ledger
  is exact and capacity is 1 milli in 400,000, but that is two passes at two
  ticks. If a hash diverges, the response is to integerise the offending term
  rather than to relax the gate — the whole value of D2 is that the gate is
  binary.
- **A serial draw is a one-thread pass in a parallel pipeline.** Measured at
  n = 1 placement per player per tick and a frontier of at most 66 tiles, so
  ~4,200 iterations per tick across the board — cheap, but a single GPU lane is
  far slower than a CPU one, and this is a serialisation point. Worth timing once
  it exists, and worth re-measuring if the frontier predicate ever widens.
- **A unit cutover has a wide diagnosis surface.** Mitigated by D6's isolation
  rule; the passes that lack isolation verification (task 1) get it before the
  switch, not after.
- **The GPU path cannot run in `npm test`.** Node has no WebGPU. The sweep
  already runs under headless Chromium and produces rows identical to the Node
  pool, so the baseline story exists; the vitest side needs a browser project.
- **Two economies to maintain.** OpenFront on CPU, LeanFront on GPU. Accepted:
  the ruleset seam already isolates them and its identity test guards the split.

## Migration Plan

1. Park flow (D7). No behaviour depends on it.
2. Complete and isolation-verify the three remaining passes.
3. Fix the ordering so GPU maturity equals CPU maturity at the moment the ledger
   reads it (D3), and re-run the ledger A/B until it is clean.
4. Wire the ruleset through to the shipping worker and switch `leanfront` as a
   unit (D6).
5. Verify: hash identity where D2 says it must hold; tolerance where it says it
   cannot; then measure the tick cost against the 108 ms/tick baseline.
6. Re-baseline LeanFront on the GPU sweep host and record its own reference set.
7. Retire the scaffolding (D8).
8. Rollback at any point: revert the ruleset switch. OpenFront never depends on
   any of it.

## Open Questions

_None outstanding._ Placement is resolved by D2: it moves to the GPU like
everything else, but its DRAW runs serially so the result is identical rather
than merely equidistributed.
