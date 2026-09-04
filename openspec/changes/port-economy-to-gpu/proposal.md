## Why

The economy is the simulation's cost. Profiled on spqr with a real 40-bot game,
`urbanTick` is **85.7% of sim time inclusive**, and a tick reaches 108 ms by tick
9000 — which is the 5 fps complaint that started this work. The two distance
floods everyone assumes are the problem are only 16.9% of it; the per-tile
consumers are the rest.

The GPU does that work roughly ten times faster. One dispatch of the whole
pipeline — both floods, the crop CA, the district ledger, suitability, the
placement draws, the room count — measures **8.9 ms on spqr**, against ~93 ms of
CPU economy at the same scale.

Two earlier attempts failed, and the reasons shape this one:

- **The mirrored port ("Level A")** kept the CPU simulation authoritative and
  shipped whole planes to the GPU and back. Measured: a flat 18.7 ms/tick round
  trip against CPU floods that top out at 15.5 ms even at total conquest, so it
  never pays at any point in any game. The compute WON (8.9 vs 15.5); the round
  trip lost it.
- **The flow-economy redesign** made population a per-tile field, and everything
  followed from that: local starvation, travelling labour, food transport,
  birth distribution, migration forces. It is a coherent design, but it is a
  DIFFERENT GAME, and the objective here was always to move the same game onto
  the GPU. That work is parked, not deleted.

What this change does is the port that was actually asked for: the ORIGINAL
rules, on the GPU, verified against the CPU. Most of it is already built and
proven exact — the supply flood (19,789/19,789 tiles), the food-shed flood (100%
cell agreement, 0 differing tiles), the crop CA (bit-identical), the district
ledger (0 of 57 districts off), the patch credit and acreage reductions (0 of 57
off), and both floods driving a live game at **411/411 identical hashes over
4,000 ticks**.

## What Changes

- **LeanFront's economy computes on the GPU.** The per-tile work — both distance
  floods, crop ripening, district production and granary capacity, tenure aging,
  field expansion, urban placement — runs as compute passes. OpenFront keeps the
  CPU path unchanged.
- **The game does not change.** Population stays a per-player scalar. The food
  shed stays. Labour, storage, starvation, growth and every knob keep their
  current meaning. This is a refactor with a verification obligation, not a
  redesign.
- **What crosses back is per-district and per-player AGGREGATES**, indexed by a
  dense slot rather than by tile ref. A tile-indexed accumulator is grid-sized
  (8 MB each on spqr), so "read back the small results" would have cost more
  than the planes it replaces.
- **VERIFIED PASS BY PASS, not by seeded hash.** Bit-identity was the original
  contract and is not achievable in a form worth having: the CPU's distance
  fields refresh every ten ticks and are read stale in between, so matching its
  hashes means reproducing its cache staleness on purpose. A GPU that floods
  every tick computes a BETTER answer — measured at 370 of 168,314 spqr tiles
  carrying a placement weight 0.16-14.7% from the CPU's, all with the same shed
  cell, which is snapshot age and nothing else. So the gate is four things: each
  pass agreeing with the CPU function it replaces on IDENTICAL inputs, same-seed
  replay on a device, balance metrics inside the harness's seed-noise band, and
  OpenFront's hashes untouched. The first is what has actually been catching
  bugs — a probe measuring a board no game occupies, a damage flag set only on
  tiles carrying crop, and a placement draw weighting by the ungated base
  suitability instead of the shed-gated product.
- **Determinism becomes per-device for the GPU path.** Reproducible from a seed
  on a given machine, not bit-identical across GPU vendors — WGSL specifies only
  2.5 ULP on division. Order-INDEPENDENCE stays mandatory and is stricter than
  the CPU needed, because a float `atomicAdd` varies run to run on the same
  device.
- **The flow-economy system is parked**, kept as a lab system so nothing is lost,
  and is not part of LeanFront.

## Capabilities

### New Capabilities

- `gpu-economy`: what it means for the economy to compute on the GPU — what must
  match the CPU exactly, what may differ and by how much, what determinism means
  when the sim runs on a device, and where results are allowed to cross back.

### Modified Capabilities

_None._ No rule changes. The GPU path may compute a per-tile quantity more
accurately than the CPU does — the distance fields are the case, since it floods
every tick where the CPU reads a snapshot up to ten ticks old — but a more
accurate evaluation of the same rule is not a different rule, and every such
difference is named and bounded rather than discovered.

One CPU-side defect is fixed on the way, and it is a fix regardless of the port:
the field-expansion draw enumerated its candidates in the insertion order of a
JavaScript Map, so which plot a field grew depended on the order its tiles were
once written rather than on the board. Two identical fields built in different
sequences expanded differently. It is now ordered by tile ref, as the city draw
already was. That changes seeded outcomes once, so the reference hashes are
re-recorded.

## Impact

- `src/client/games/leanfront/economy/fields/passes/*.wesl` — tenure aging, the acres histogram,
  the PRNG and the city draw's real (shed-gated) weight have landed and are
  verified; patch application is the one pass still missing. The serial draw
  that D2 called for is NOT built and is not needed — the exponential race
  already there reproduces the distribution, which is the contract now.
- `src/core/execution/utils/` — the provider seams (`setSupplyProvider`,
  `setShedFloodProvider`, `setDistrictYieldProvider`) already exist and are
  tested; the remaining consumers need theirs.
- `src/client/webgpu/ShellSim.worker.ts` — has never been wired to any of this.
  The ruleset already reaches it (`Rulesets.ts`, verified live), but selects only
  a `Config`.
- `src/client/games/leanfront/economy/upload.ts` — the plane mirroring, staleness checks and
  decline paths exist to keep two copies of the state in step. Under GPU
  ownership there is one copy; they are retired with the cutover, not carried.
- `tests/perf/balance/` — the sweep already runs under headless Chromium
  (`--gpu`), verified row-identical to the Node pool, which is what makes a
  GPU-path baseline possible at all.
- OpenFront's simulation, specs and reference hashes are untouched throughout,
  and that is a gate rather than an expectation.
