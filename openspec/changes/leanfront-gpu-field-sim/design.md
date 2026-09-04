## Context

Two architectures were available and the port took the wrong one.

**Mirrored (what was built).** The CPU simulation stays authoritative; the GPU
receives uploaded planes, computes, and hands results back through provider seams
(`setSupplyProvider`, `setShedFloodProvider`, `setDistrictYieldProvider`). Both
floods now drive a live game bit-identically under it — and it is still the wrong
shape. Measured: the round trip costs a flat 18.7 ms/tick on spqr against CPU
floods that top out at 15.5 ms at total conquest, so it never pays; and four
separate bugs traced to holding two copies of one state.

**Intent-driven (what `conquest` does).** The GPU holds the state. The CPU writes
`PLAYER_INTENT_FIELDS` — `alive, attacking, commit, targetX, targetY` — and the
GPU derives ownership, troops, combat and population. There is one copy, so
staleness, phase mismatch and cutover ordering are not merely fixed but absent.

The measurements that justify the move are already in hand: the economy consumers
are 85.7% of sim time inclusive (`urbanTick`), the two floods only 16.9%, and the
whole tick reaches 108 ms at tick 9000 on spqr. Level A targeted the 17% and lost;
this targets the 86% and removes the round trip entirely.

## Goals / Non-Goals

**Goals:**

- One copy of every field, on the GPU.
- A CPU→GPU contract that carries intents and nothing derivable.
- Aggregate readback sized by districts (peak 617), not by map area.
- Keep the verified WESL passes, the dense slots, and the order-independence work.

**Non-Goals:**

- Changing OpenFront. This defines a second ruleset; `openfront` keeps the CPU sim
  and its baselines.
- Cross-device bit-determinism. Not available to a float field sim; see D4.
- Porting the CPU sim's entity systems. LeanFront cuts them (D3).

## Decisions

**D1 — Fields on the GPU, entities on the CPU; the line is SHAPE, not side.**
A field is a value per tile with local update rules: owner, troops, maturity,
density, tenure, damage, plot type, the two floods. An entity is a record with
identity: the player registry, the intent queue, the win check. Fields go to the
GPU because they are grids with neighbourhood rules; entities stay because they
are small and branchy. Structures are tile-anchored, so they are a plot-type FIELD
rather than the unit list OpenFront keeps — which is what removes the last large
per-entity system.

**D2 — Troops become a field.**
OpenFront holds troops as a per-player scalar deployed through `AttackExecution`
with per-attack bookkeeping. `conquest` holds them as a field and resolves combat
locally. Take the field form: it makes the attack front a CA (the CPU's `seep` is
already 1.6% of profile and pure neighbourhood work), it removes per-attack
records, and it makes water crossings expressible as the same field carrying a
(player, troops) payload instead of a transport-ship entity.

**D3 — Cut alliances, ships and trains from LeanFront.**
Not because they are hard on a GPU, but because the fork exists to simplify and
they are not yet part of the game being designed. Cutting them removes the entity
systems that would otherwise force a CPU-side sidecar with per-unit state and its
own ordering rules. OpenFront keeps all of them.

**D4 — Determinism becomes per-device, but order-independence gets STRICTER.**
These are different properties and conflating them would be a mistake. WGSL
specifies 2.5 ULP for division and wider for transcendentals, so two vendors may
differ in the last bits — accepted, because the alternative is integerising an
economy whose tenure term is unbounded and overflows u32. But a float `atomicAdd`
varies run to run on the SAME device, which is not a rounding difference, it is an
unreproducible game. So every reduction stays integer, and the shed tie-break and
canonical frontier ordering remain load-bearing — for parallelism now, not for
matching a CPU.

**D7 — Population is a FIELD, and per-player quantities are groupBy reductions.**
The CPU holds population as a per-player SCALAR while housing is a field, so it
needs `occupancy = urbanCivilians / housing` to spread the scalar over the field,
and `rural / farmCount` to spread the remainder. Both are artifacts of the
representation, not mechanics — and they are what made a per-district head count
appear to depend on the demographics, because the per-tile `floor` prevents
factoring the scalar back out.

Hold people as a field instead and both disappear: there is nothing to
distribute, people are where they are. Every per-player quantity then becomes the
primitive the framework already has —
`{ reduce: "sum", layer: "pop", groupBy: "owner" }` — which is what `conquest`
uses for population, troops and tiles owned.

The rule this generalises: do not mirror the CPU's DATA MODEL either, not just
its state. Porting `Σ floor(density × occupancy)` ports a workaround. Ask what
the quantity is.

**D8 — Generalise `groupBy`, but only DENSE reductions become declarations.**
`groupBy` currently requires the `players` block and yields `players.count`
values; it should accept any u32 id layer, so a reduction can group by district
(`cellSlot`, up to MAX_CELLS) as well as by owner. That is what makes the
per-player aggregates declarative, and they are the spine everything else hangs
off.

It does NOT follow that the existing hand-rolled reductions should be rewritten,
and the first draft of this decision said they should. A declarative reduce takes
an existing LAYER, so a computed quantity has to be materialised as a full-map
layer first and then scanned whole. That is right when nearly every tile
contributes and the layer already exists — population, troops, tiles owned. It is
wrong when the reduction is SPARSE.

The economy's are sparse: `district_yield` and `farm_credit` are fed by tilled
field tiles, ~28k of 2,097,152 on spqr (about 1.4%). The atomic form touches 28k
slots; the declarative form would materialise an 8 MB intermediate per quantity
and scan 2M tiles to reduce it — roughly 16 MB more memory and ~70x the write
traffic, to replace passes already verified exact.

So: dense reductions are declarations, sparse ones stay hand-rolled atomics. The
distinction is density, not elegance.

**D5 — Retire the mirroring scaffolding rather than carry it.**
The uploader's plane mirroring, the three provider seams, the staleness/decline
checks and the drift probe all exist to keep two copies agreeing. Under D1 there
is one copy, and keeping them would leave a second path that can silently disagree
with the first. Retire them WITH the cutover. What survives is everything that
computes: the WESL passes, the dense district slots, the integer accumulation and
the order-independent tie-breaks.

**D6 — Verify on a GPU host, sharing one run core.**
`RunGameCore.ts` already holds every metric with no `fs`/`path`/`crypto`, and the
sweep already runs under headless Chromium (`--gpu`) producing rows identical to
the Node pool. LeanFront's harness uses that host. Two runners computing metrics
separately would drift, and figures that are merely similar across hosts are worse
than none.

## Risks / Trade-offs

- **A big-bang cutover has a wide diagnosis surface.** Seven consumers move at
  once because a consumer cannot be switched while its producer is on the other
  side — that is exactly why the ledger cutover failed. Mitigation: every pass is
  verified in ISOLATION against the CPU first (the ledger already is: 0 districts
  off, totals identical), so the switch is the only untested step.
- **Balance shifts.** The city and patch draws are distributionally exact, not
  outcome-identical, so seeded games differ. Judge on the sweep's snowball metrics
  — leader share, gini, alive counts — not on hashes, and re-baseline afterwards.
- **Intra-tick collapse.** The CPU applies conquest at the moment each attack
  resolves; the GPU applies it once per dispatch, so a tile taken twice in one
  tick collapses to one net change. This is arguably better — it removes a
  dependence on which execution ran first — but it is a semantic change and should
  be measured (tiles with >1 ownership change per tick), not assumed harmless.
- **LeanFront and OpenFront diverge permanently.** Two rulesets, one CPU and one
  GPU, are two implementations to keep alive. Accepted: the fork's purpose is to
  diverge, and the ruleset seam already isolates them with a proven identity test.

## Migration Plan

1. Complete and isolation-verify the remaining passes: patch application (with the
   credit stream and labor gate as per-slot state), tenure aging, the acres
   histogram, troops-as-a-field, and the water crossing.
2. Build the LeanFront field system as a `defineFieldSystem` manifest with the
   intent block, alongside the existing CPU path. Nothing switches yet.
3. Switch `Rulesets.leanfront` to the field host behind the existing seam. The
   `openfront` ruleset is untouched throughout, and its identity test
   (`tests/Rulesets.test.ts`) stops being a no-op and starts guarding the split.
4. Re-baseline LeanFront on the GPU sweep host; record its own reference set.
5. Retire the mirroring scaffolding (D5).
6. Rollback: revert the ruleset switch. OpenFront never depended on any of it.

## Open Questions

_Resolved during review; kept here because each answer shapes the build._

**Does the AI move too? No — it writes intents like any other player.**
`AiAttackBehavior` is deterministic given state and a seeded RNG, so it COULD be
a GPU pass, but it is branchy and reads aggregates. It stays on the CPU and
writes the same intent fields a human does, which is exactly what
`nearestEnemyAI` already does for the lab systems. That also keeps one intent
path rather than two.

**What does a build intent cost? Nothing — plots are AWARDED, not purchased.**
This was asked from a stale assumption (`UnitInfo.costResource`, which covers
gold-cost units dormant until later ages) and it does not apply here.
`SeedAwards.ts` is explicit: crossing the peak-population ladder banks a FOUNDING
PAIR — one settlement seed and one farm seed — and placement spends a seed.
There is no affordability check to move.

So the split is simply:

- seed counts (`_farmSeeds`, `_settlementSeeds`) are per-player INTEGERS
  ratcheted from peak population, which the GPU already returns as an
  aggregate. Trivial on either side; keep them with the player registry.
- PLACEMENT LEGALITY is the per-tile part — owned, land, unoccupied, in shed
  reach — and that is GPU work, on state already resident.
- the intent carries tile plus unit type, and is valid iff a seed is banked and
  the tile is legal.

**Elimination a tick late: acceptable, take whichever is simpler.** Aggregates
arrive one dispatch behind, so a nation dies one tick after its population does.
Judge it wherever it falls out most cleanly — most likely on the CPU beside the
win check, since both read the same per-player aggregate.

**The seed ladder reads a one-tick-old population aggregate.** A founding pair
becomes spendable one tick after the population that earned it — accepted, and it
is the cheaper option: reading the live aggregate would force a sync point
between the population pass and the ratchet, where a tick-old copy is already
in hand from the previous dispatch. The ladder is a high-water ratchet that never
revokes, so a one-tick lag delays an award and can never lose one.

## Open Questions

_None outstanding._
