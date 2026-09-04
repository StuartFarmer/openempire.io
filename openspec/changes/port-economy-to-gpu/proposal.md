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
- **BIT-IDENTICAL, verified by seeded hash.** Every per-tile consumer moves, so
  no plane is ever read back; and the placement draws — which looked unportable —
  become identical rather than merely equidistributed by building the frontier in
  parallel and walking the DRAW serially, since a frontier is a handful of tiles.
  That leaves f32 rounding as the only permitted divergence, already measured at
  1 milli in 400,000 on the one term where it appears.
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

_None._ No rule changes. Placement — the one piece that looked as though it must
change seeded outcomes — is made identical by drawing serially, so this change
alters no requirement, and the seeded hashes are the proof.

## Impact

- `src/client/economy/fields/passes/*.wesl` — three passes remain: patch
  application (the credit stream and labour gate as per-slot state), tenure
  aging, and the acres histogram. Everything else exists and is verified.
- `src/core/execution/utils/` — the provider seams (`setSupplyProvider`,
  `setShedFloodProvider`, `setDistrictYieldProvider`) already exist and are
  tested; the remaining consumers need theirs.
- `src/client/webgpu/ShellSim.worker.ts` — has never been wired to any of this.
  The ruleset already reaches it (`Rulesets.ts`, verified live), but selects only
  a `Config`.
- `src/client/economy/upload.ts` — the plane mirroring, staleness checks and
  decline paths exist to keep two copies of the state in step. Under GPU
  ownership there is one copy; they are retired with the cutover, not carried.
- `tests/perf/balance/` — the sweep already runs under headless Chromium
  (`--gpu`), verified row-identical to the Node pool, which is what makes a
  GPU-path baseline possible at all.
- OpenFront's simulation, specs and reference hashes are untouched throughout,
  and that is a gate rather than an expectation.
