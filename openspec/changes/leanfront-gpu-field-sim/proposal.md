## Why

LeanFront currently differs from OpenFront only in its renderer: the ruleset seam
(`src/core/game/Rulesets.ts`) selects a `Config` and nothing else, so both run the
same CPU simulation. The fork exists to simplify mechanics, and nothing has been
simplified.

Meanwhile the GPU port of the food economy has been building the wrong
architecture. It kept the CPU simulation authoritative and mirrored state onto the
GPU as uploaded planes, injecting results back through provider seams. Every
failure in that work came from holding TWO COPIES of the same state:

- an observer that recomputed the food shed early and moved the sim's own refresh
  cadence (25/41 hashes);
- a pre-ripen maturity compared against a post-ripen result, mistaken for an f32
  problem;
- the district-ledger cutover diverging because its producer (`farmTick`) stayed
  on the CPU inside the same tick;
- 662 tiles of maturity drift, one-directional, because the GPU's field could
  never expand.

Each fix was correct and the class of bug kept recurring. Mirroring is the cause.

The repo already contains the right architecture, working:
`src/client/lab/systems/conquest/` holds ownership, troops, population and combat
entirely on the GPU, and the CPU writes five numbers per player per tick
(`PLAYER_INTENT_FIELDS` — `alive, attacking, commit, targetX, targetY`).
Ownership flips are DERIVED there, not uploaded.

LeanFront should be that: a GPU-resident field simulation driven by intents. It is
the fork whose purpose is to cut, so it can drop what does not fit.

## What Changes

- **LeanFront's simulation becomes GPU-resident.** Every per-tile field — owner,
  troops, farm maturity, urban density, tile tenure, damage, plot type, and the
  food-shed and supply floods — lives in GPU buffers and is advanced by compute
  passes. No field is uploaded as a mirror of CPU state, and no field is read back
  per tile.
- **The CPU→GPU contract is INTENTS, not state.** Per player per tick: alive,
  attack target and commitment, and the build intents (tile + unit type) the
  player issued. Discrete one-offs (the spawn kit) are brush stamps.
- **The GPU→CPU contract is AGGREGATES.** Per player and per district scalars —
  population, food, production, capacity, tiles owned — sized by district count
  (measured peak 617 on spqr), not by map area.
- **BREAKING for LeanFront only — mechanics cut.** Alliances, transport-ship and
  train ENTITIES, and per-unit state are removed from LeanFront's ruleset. Moving
  troops over water becomes a field: a (player, troops) payload that advances by
  shader rules toward its target. OpenFront's ruleset is untouched.
- **Determinism is redefined for LeanFront** as reproducible ON A GIVEN DEVICE
  rather than bit-identical across devices, because WGSL guarantees only 2.5 ULP
  on division and ~3–4 on transcendentals. Order-INDEPENDENCE is still required
  and is stricter than before: a float `atomicAdd` varies run to run on the same
  device, so every reduction stays integer.
- Structures stay tile-anchored, so plots become a type FIELD rather than a unit
  list.

## Capabilities

### New Capabilities

- `leanfront-field-sim`: the ruleset's simulation model — which fields exist, what
  the intent contract carries, what crosses back, and what determinism means when
  the sim runs on a GPU.

### Modified Capabilities

_None._ OpenFront's rules are unchanged; this defines a second ruleset. The
existing `food-economy` and `urban-core-growth` requirements continue to describe
OpenFront, and LeanFront's field sim implements the same economy against them
except where this change's spec says otherwise.

## Impact

- `src/core/game/Rulesets.ts` — `leanfront` stops being an empty Config subclass
  and starts selecting a different simulation host.
- `src/client/economy/` — the uploader's plane mirroring, the injection seams
  (`setSupplyProvider`, `setShedFloodProvider`, `setDistrictYieldProvider`), the
  staleness/decline logic and the drift probe are all scaffolding for keeping two
  copies in step. They are not needed under GPU ownership and should be retired
  with the cutover, not carried.
- Kept from that work: every WESL pass (both floods, the crop CA, the district
  ledger, the patch and city draws, suitability, room count), the dense district
  slots, and the order-independence changes — all of which the field sim needs.
- `tests/perf/balance/` — the harness already runs under headless Chromium
  (`--gpu`), verified to produce identical rows to the Node pool. GPU-dependent
  vitest tests still need a browser project.
- No change to OpenFront's simulation, its specs, or its baselines.
