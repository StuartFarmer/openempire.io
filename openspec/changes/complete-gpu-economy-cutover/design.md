## Context

`port-economy-to-gpu` built every per-tile pass and verified each against the
CPU at full conquest — the two floods, the crop CA (154,178 of 154,178 tiles
exact), the district ledger, patch credit and acreage, tenure, the placement
weights and draws. It then switched two consumers and stopped.

That is the most expensive place to stop. The dispatch (~10 ms) and the upload
(~17 ms) are paid every tick however many consumers are served, so the fixed
cost is already being paid while only part of the saving is collected.

Measured, spqr at tick 9102, interleaved, 100 samples per arm:

| served from the GPU  | sim ms/tick |
| -------------------- | ----------- |
| nothing              | 97.4        |
| district ledger      | 87.9        |
| ledger + farm CA     | 65.9        |
| + shed, as attempted | **82.1**    |

The last row is why this change exists as a design problem rather than a
to-do list.

## Goals / Non-Goals

**Goals:**

- Move the remaining per-tile work — the shed's DERIVATION as well as its flood,
  urban placement, the supply field — so the whole economy switches as a unit
  for LeanFront.
- Cross back per district and per player only. No per-tile field returns during
  normal play, and no result is reassembled on the host.
- Retire the uploader's per-player walk with the shed that made it necessary.
- Leave OpenFront's CPU path and reference hashes untouched.

**Non-Goals:**

- Moving `foodTick`'s own regional allocation, granary and demography
  arithmetic. It is ~28% of the tick and per-district by shape; whether it moves
  is a separate question, argued on its own evidence (see D5).
- Bit-identity with the CPU. `port-economy-to-gpu` D9 settled that: the GPU
  floods every tick where the CPU reads a snapshot up to ten ticks old, and the
  fresher answer is the better one.
- Changing any rule, knob or mechanic.

## Decisions

**D1 — THE PER-TILE FIELD DOES NOT COME BACK AT ALL. Move the derivation.**

The first attempt read the shed flood back and let the CPU scatter and bucket it
— 535k entries on nearly every tick, ~16 ms, more than the flood was worth. The
obvious fix is to compact per owner on the device so the CPU takes a slice
instead of bucketing. That is the wrong fix, and taking it would have repeated
the change's own central mistake one level down.

A scatter exists only because the CPU still derives from the field. `recompute`
takes the flood and produces the coverage classification, the labour pools and
the regions — all per tile, all on the host. The flood was ported and its
consumer was left behind, which is D6 of the parent change ("a consumer whose
producer is still on the CPU cannot agree with it") applied to the shed's own
internals rather than to the economy's.

CHECKED, rather than assumed — every CPU reader of the shed's per-tile data
after the cutover:

| consumer                         | needs                    | after the cutover      |
| -------------------------------- | ------------------------ | ---------------------- |
| `FoodEconomy` ledger loop        | `tilled` per tile        | already GPU-served     |
| `FarmGrowth` (x3)                | `tilled`/`ranked`/`cell` | already GPU-served     |
| `upload.ts` flag walk            | `tilled`/`ranked`        | retires with the shed  |
| `EconomyModel.assessStaffing`    | `tilled.size`            | a COUNT                |
| `EconomyModel.committedStaffing` | cell per tile            | `acresAccum`, verified |
| `UrbanGrowth.recedeToTarget`     | cell per tile            | moves with placement   |
| `FoodEconomy` granary sweep      | `hasCell(cell)`          | per DISTRICT           |

Not one of them needs the per-tile sets. So they never cross, and there is
nothing to scatter.

What the derivation becomes:

- **Coverage** (`ranked`/`tilled`/fallow) is a per-district SELECTION — staff the
  N ripest claimed tiles, N = residents / farmersPerFieldTile. That is not a
  sort: a 256-bin maturity histogram per district plus a prefix sum gives the
  cut-off, and a second pass marks each tile against it. Both are the reduction
  shape `farm_credit` already uses.
- **Labour pools** (`peopleByFarm`, `laborByFarm`) are per-district integer
  sums of density — `atomicAdd`, identical in shape to `driveAccum`.
- **Regions** are connected components over districts that touch. Per tile,
  `atomicOr` the "these two districts are adjacent" fact into a district-pair
  structure; the union-find itself is over ~600 nodes and stays where it is,
  because 600 is not territory.

What crosses back is then per district — pooled people, coverage counts, the
adjacency pairs — which is O(districts), flat in map size, and the shape D4 of
the parent change already asked for.

`PlayerFoodShed` stops being a per-tile object. That is the reshape this change
is really about, and the reason it is a change rather than a task.

**D2 — The seam is verified on its OUTPUT, and that is where this went wrong.**

The shed's raw flood was verified at 100% cell agreement long ago. The artefact
the provider hands over is not that flood: it is compacted, read back, and
reassembled, and each of those steps can be wrong on its own. None had been
compared, and wiring the seam in dropped the district count from ~576 per tick
to ~121 while making the tick 5x faster.

Two defects were behind it, and both are the kind only an output diff finds:

- a sparse-array iteration in the scatter (`for...of` over an array indexed by
  smallID yields `undefined` for the holes), which threw inside `flood` — called
  from `recompute`, called from `foodTick` — and aborted the economy for the
  rest of the tick;
- the flood naming a farm the CPU no longer had, which threw on
  `cellClaims.get(farm)!.push(...)` for the same reason.

Once both were fixed the output diff was exact: 534,955 tiles against 534,936,
ZERO cells assigned differently, and the DERIVATION built on top identical to
the unit — tilled 141,900 both, ranked 141,326 both, pooled people 141,178,585
both, regions 67 both. The data was never the problem. The seam was.

**D3 — A timing without a health assertion is not a measurement.**

Both of the session's worst results were a tick that got faster while the board
died — 17 ms with the districts collapsed, and a 3% figure that was really
noise. The first looked like success; the second nearly closed the change at
"the port is worth 2x".

So every cost measurement carries a count of the entities the work is done over,
and an A/B interleaves its arms on one board with enough samples to exceed the
board's own variance (p95 is twice the median here, so consecutive blocks of 30
measure the board, not the change).

**D4 — Seams state their staleness, and consumers guard against it.**

A provider is computed from a snapshot before the tick and consumed during it.
Anything it names may have been destroyed in between. That is not a bug to be
fixed but a property to be stated — and consumers that assume otherwise fail
INSIDE the tick, where a throw silently abandons the remaining work.

The guard belongs in the consumer, next to the invariant it depends on, not in
each provider that might violate it.

**D5 — `foodTick`'s own arithmetic is out of scope. The parent's D1 has been
narrowed, so this no longer rests on a rule that says more than it means.**

That change's D1 banned computing per-player quantities on a device. Its
justification only supported banning their REPRESENTATION as per-tile fields —
the flow economy failed because putting population in cells changed where people
are, which changed starvation and growth. A 256-entry buffer and a 256-thread
pass moves the addition, not the people.

DONE, in the parent's task 3b.2: D1 and its spec requirement now say "a
per-player quantity SHALL NOT be indexed by tile", and where it computes is
settled on cost. Two things already shipping stopped reading as violations —
`roomCount` (a per-player integer reduction on the device) and `playerSeed` (a
per-player upload) — which matters here, because task 2.4 uses exactly that pair
of shapes.

Nothing in this change depends on the distinction going further: the per-tile
work is ~70% of the tick and is where the return is.

## Risks / Trade-offs

- **The remaining seams may not pay individually, and cannot be judged
  individually.** The fixed ~27 ms is already spent; each consumer is pure
  saving from here, but only the complete set beats the CPU. → Measure the
  cumulative position after each, and do not ship any partial state.
- **The derivation is more shader than the flood was.** Coverage selection,
  labour pooling and adjacency are three new passes over covered tiles. → They
  are the reduction shape already proven by `farm_credit` and `district_yield`,
  and each is verified in isolation before anything consumes it.
- **`PlayerFoodShed` is consumed by four modules.** Reshaping it touches
  `FoodEconomy`, `UrbanGrowth`, `EconomyModel` and `TribalEconomy`. → The table
  above is the full list of per-tile readers, and every one is already served or
  moves in this change; what remains of the type is per-district.
- **The uploader shrinks but does not vanish.** Owner deltas, plots and damage
  still cross. ~3.4 ms of its 17 ms is the O(grid) owner scan, which the sim's
  own `packedTileUpdates` could replace. → Out of scope here; noted so the
  remaining floor is honest.
- **More seams mean more staleness surfaces.** Each is a place where a snapshot
  meets a live simulation. → D4 makes the contract explicit rather than
  implicit, and each seam gets the guard at the point of consumption.
- **A device that fails mid-game.** → `GpuEconomy.create` already returns null
  rather than throwing, and the ruleset falls back to the CPU economy.

## Migration Plan

Steps 1 and 2 originally read "per-owner compaction, then the shed flood on the
new primitive". That is the fix D1 rejects — compacting per owner still hands
the host a per-tile field and still leaves the derivation behind. Corrected to
follow D1:

1. The derivation's three reductions — coverage selection, labour pools,
   adjacency — each isolation-verified against the CPU before anything consumes
   them.
2. Reshape `PlayerFoodShed` to per-district state, confirm nothing on the host
   scatters or buckets a per-tile field any more, then measure with a health
   assertion.
3. Urban placement, then supply, then the city half of tenure — same pattern.
4. Switch LeanFront as a unit once the cumulative measurement beats the CPU.
5. Retire the uploader's per-player walk and the mirroring the seams no longer
   need.
6. Rollback at any point: the ruleset switch. OpenFront never depends on any of
   it.

## Open Questions

- ~~Does the coverage histogram need 256 bins?~~ — ANSWERED by task 1.2's
  measurement, and the question had the wrong axis. Bin count never mattered: a
  histogram picks a maturity LEVEL and the CPU selects by
  `(maturity DESC, tileRef ASC)`, so a cut-off landing inside a group of tiles
  at equal maturity is unresolvable at any bin count — and ties are large
  (1,266 tiles in one district on spqr). It is moot anyway, because the cut-off
  never binds: 0 districts of 591 on spqr and 0 of 48 on verdantia have a pool
  that staffs some but not all of their claimed tiles. The spillover caps each
  cell at its need before coverage reads the pool, so `slots <= claims` always
  and equality is the normal case. Coverage is a comparison and a mark; the
  under-staffed branch stays exact as a per-district serial selection, because
  a war that guts a population would reach it.
- ~~The city half of `tenureTick`~~ — RESOLVED by the parent's task 1.13, and
  the premise was wrong. Both shapes it needed already exist and are verified:
  `playerSeed` is the per-player uniform going in, `roomCount` is the per-player
  integer reduction coming back, and `owner[i]` indexes both directly. Its
  inputs — `density`, `tenure`, damage via `farmFlags` — are all resident
  planes, so leaving it on the CPU would mean copying two planes back to read
  them. It MOVES, as task 2.4. The piece to design rather than transcribe is the
  render side effect: `recordDensityUpdate` emits a byte when aging changes
  `urbanRenderByte`, which wants `maturity_compact`'s count-and-pack.
