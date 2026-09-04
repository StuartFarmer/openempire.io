## Why

`port-economy-to-gpu` built and verified every per-tile pass, then switched two
consumers and stopped. Where it stopped is the worst place to stand: the dispatch
and the uploader are paid EVERY tick regardless of how many consumers are
served, so the fixed cost is already being paid and only part of the saving is
being collected.

Measured on spqr at tick 9102, 100 samples per arm, interleaved so both arms see
the same board:

| served from the GPU | sim ms/tick |
| ------------------- | ----------- |
| nothing             | 97.4        |
| district ledger     | 87.9        |
| ledger + farm CA    | **65.9**    |

`FullGamePerf` on the same board: mean 51.3 ms, p95 101 ms, p99 120 ms, **max
255 ms**, with 505 of 9000 ticks over the 100 ms budget, and `PlayerExecution`
at 91.6% of sim time. Late game is where the game is unplayable, and the economy
is what makes it so.

The remaining consumers are `foodShedField` (16.1% of the tick),
`growUrbanArea` (8.5%), `supplyField` (4.3%) and `tenureTick`'s city half
(0.7%). Their passes already exist and are verified. What is missing is the way
to serve them.

## What Changes

- **The shed's DERIVATION moves, not just its flood.** An attempt to serve the
  flood alone made the tick WORSE — 65.9 ms to 82.1 ms — because the CPU then
  had to scatter 535k entries and bucket them by player on nearly every tick.
  That scatter exists only because `recompute` still derives coverage, labour
  pools and regions on the host: the producer was ported and its consumer left
  behind, which is D6 of the parent change made one level down. Checked rather
  than assumed — after the cutover NO CPU reader needs the shed's per-tile sets.
  So the field never comes back, and there is nothing to scatter.
- **`PlayerFoodShed` stops being a per-tile object.** Coverage becomes a
  per-district selection (a maturity histogram plus a prefix sum, not a sort),
  labour pooling becomes an integer reduction, and region adjacency becomes a
  per-tile fact reduced to ~600 district pairs. What crosses back is per
  district, flat in map size.
- **Urban placement and the supply field move** on the same discipline: move the
  consumer, not just the producer.
- **Every seam is verified on WHAT IT SERVES**, not on the pass behind it. The
  shed's raw flood was verified long ago at 100% cell agreement; the artefact
  the provider hands over — compacted, read back, scattered — had never been
  compared, and wiring it in without that check silently killed the board.
- **The seams state their staleness contract.** An external flood is computed
  from a snapshot, so it can name a farm that no longer exists. Consumers assume
  otherwise, and one such assumption threw inside `foodTick` and aborted the
  economy for the rest of the tick.
- **The uploader's remaining cost goes with the shed** (~8 ms of its 17 ms is a
  per-player walk reading `tilled`/`ranked`, which the GPU will own).
- **A health assertion accompanies every timing measurement**, because the two
  most dangerous results of the last session were both a tick that got faster
  while the board died.

## Capabilities

### New Capabilities

- `gpu-economy-seams`: what a provider seam must guarantee for a per-tile
  producer that lives on a device — what crosses back and in what shape, how
  staleness is bounded, what must be verified before one is wired in, and how a
  performance claim is distinguished from a broken simulation.

### Modified Capabilities

_None._ `gpu-economy` (from `port-economy-to-gpu`) already states the rules this
change implements; nothing about the game's requirements changes.

## Impact

- `src/client/economy/fields/passes/` — the shed's derivation: a per-district
  maturity histogram and prefix sum for coverage, integer reductions for the
  labour pools, an adjacency reduction for regions. Plus the urban-placement and
  supply equivalents.
- `src/client/economy/GpuEconomy.ts` — the remaining providers, serving
  per-district results. No scatter, no bucketing, no per-tile readback.
- `src/core/execution/utils/FoodShed.ts` — **`PlayerFoodShed` reshaped to
  per-district state.** `SupplyField.ts`, `UrbanGrowth.ts`, `EconomyModel.ts`,
  `TribalEconomy.ts` follow it. Seam contracts and the staleness guards they
  imply; new seams for urban placement and the city half of tenure.
- `src/client/economy/upload.ts` — its per-player walk retires with the shed
  (D8).
- `src/client/economy/LedgerProbe.worker.ts` — one isolation probe per seam, and
  the board-health assertions that go with every timing.
- OpenFront's CPU path and reference hashes are untouched throughout, and that
  is a gate rather than an expectation.
