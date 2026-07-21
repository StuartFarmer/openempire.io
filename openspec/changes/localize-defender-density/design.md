## Context

`Config.attackLogic(gm, attackTroops, attacker, defender, tileToConquer)` runs
once per conquered tile and already receives the tile. It ignores it for
everything except terrain and defense-post proximity. The defender's
contribution is:

```
D  = defender.troops()            // national army, a scalar
Td = defender.numTilesOwned()

defenderTroopLoss  = D / max(1, Td)                              // global avg
currentAttackerLoss = within(D/A, 0.6, 2) · mag · 0.8 · …        // global ratio
altAttackerLoss     = 1.3 · (D/Td) · (mag/100) · traitorMod      // global avg
attackerTroopLoss   = 0.6·currentAttackerLoss + 0.4·altAttackerLoss
```

and `attackTilesPerTick` / `tilesPerTickUsed` likewise read `D` globally.

Measured today (plains, `mag = 80`, human attack so `A = D/5`, sub-100k-tile
players so the large-nation debuffs are all 1.0):

| term | value | share |
| --- | --- | --- |
| `0.6 · within(5, 0.6, 2)·64` | 76.8 | 88% |
| `0.4 · 1.3·(D/Td)·0.8`, with `D/Td = 25` | 10.4 | 12% |
| **total** | **87.2 troops/tile** | |

The per-tile population field this change reads already exists:
`PlayerImpl._density: Map<TileRef, number>` (people per tile, `0..popPerDensity`,
default `popPerDensity = 10000`), with `_urbanAreaMilli` kept as its running sum
by the single writer `setDensity()`. `GameImpl.conquer()` and `relinquish()` both
zero the previous owner's density, so capture already removes population from the
map through that same choke point.

Constraint: `src/core` is fully deterministic with no floating-point in sim
logic, so the garrison field must be integer/fixed-point and free of
iteration-order dependence.

## Goals / Non-Goals

**Goals:**

- Make the defender's per-tile defensive strength a function of **where their
  people actually live**, not a nationwide average.
- Preserve the *scale* of today's formula so the change is a redistribution
  rather than a global buff/nerf — the multiplier is normalized against the
  defender's own mean density.
- Keep the cost O(1) per conquered tile and O(1) per density write.
- Degrade exactly to current behavior when there is no density field.
- Implement the tile-local garrison that `openfront-conquest-game` already
  requires.

**Non-Goals:**

- **Spatializing the attacker.** `A` stays a scalar. Attacker-side locality
  (troops distributed along the front) is a separate, larger change.
- **Spatial resolution of opposing attacks.** The scalar annihilation in
  `AttackExecution.init()` is untouched here.
- **AI target selection.** `AiAttackBehavior` stays density-blind; see Risks.
- **Client visualization.** A garrison overlay is a natural companion but is not
  required by this change.
- Changing terrain magnitudes, defense posts, fallout, traitor, or large-nation
  modifiers.

## Decisions

### D1: Garrison = the defender's army distributed over their population field

The defending force at tile `t` is that tile's **share of the defender's own
army**:

```
garrison(t) = D · smoothedDensity(t) / Σ density
```

Rewritten against the defender's own mean density
(`meanDensity = Σ density / Td`), this is exactly:

```
ratio(t)    = smoothedDensityPerTile(t) / meanDensity        // mean ≈ 1
garrison(t) = (D / Td) · ratio(t)
```

The second form is the one to implement: **`ratio(t)` is the single new
primitive**, and `D/Td` — today's value — survives as the scale. Any tile at the
defender's average density defends exactly as it does today.

*Alternatives considered.* (i) **Absolute density** (`garrison = k · density(t)`
with a global constant `k`): more physically honest, but it silently rescales
every existing balance number and makes a nation's defense depend on its
absolute urbanization level rather than its internal geography. Rejected as too
disruptive for the first pass; `ratio` is recoverable to it later by swapping the
normalizer. (ii) **Raw per-tile density with no smoothing**: creates one-tile
cliffs that an attacker can route around, since `AttackExecution`'s conquest
queue can pick any border tile.

*Note on "mean preservation":* `ratio` is mean-1 by construction over the
defender's owned tiles, but only **approximately** in practice — the smoothing
kernel spills mass onto tiles the defender does not own, and clamping (D3) is
not mean-neutral. The claim is that the *scale* is preserved, not that the
aggregate is bit-identical.

### D2: Smoothing via an incrementally-maintained bucket grid, bilinearly sampled

A radius-4 scan per conquered tile is ~81 `Map.get`s; a per-tick blur rebuild is
worse. Instead, maintain per player a sparse `Map<bucketIndex, sum>` over `B×B`
tile buckets with `B = 4` (the chosen ~80 km catchment; power of two for shift
arithmetic):

- **Update** in `setDensity()` alongside the existing `_urbanAreaMilli += v - prev`:
  one `Map` write. O(1), and it automatically covers conquest and relinquish
  because both route through `setDensity(tile, 0)`.
- **Read**: bilinear sample over the 2×2 neighboring buckets so the field is a
  smooth pyramid instead of a blocky step. Four `Map.get`s, integer weights:

  ```
  u = 2x + 1 - B ;  i0 = u >> 3 ;  tx = u & 7        // B = 4, so 2B = 8
  v = 2y + 1 - B ;  j0 = v >> 3 ;  ty = v & 7
  w00=(8-tx)*(8-ty)  w10=tx*(8-ty)  w01=(8-tx)*ty  w11=tx*ty    // Σ = 64
  smoothed = (Σ wᵢⱼ · bucketSum(i,j)) / 64
  smoothedDensityPerTile = smoothed / B²
  ```

  All-integer, no accumulation order dependence, exactly reproducible.

Bilinear sampling is what removes the sidestep exploit: without it, a tile at a
bucket corner would read zero garrison while sitting one tile from a metro.

*Alternative considered:* a full-map blurred plane rebuilt on change — simpler to
read but O(map) per update, and density changes every tick during urban growth.

### D3: The clamp band is the real balance knob

The raw ratio range is enormous: a nation whose entire population sits on 5 of
2000 owned tiles yields `ratio ≈ 2000/5 / B²`-scaled values in the hundreds.
Clamp `ratio` to a configured band, default **`[0.2, 24]`**. The clamp, not the
formula, decides whether a heartland is a speed bump or a wall, so it is a
`FoodConfig` knob and the primary axis of the harness sweep.

### D4: The primitive is the *ratio*; substituting the absolute garrison into the speed term is a scale bug

The loss term is already a per-tile density, so it takes the absolute garrison
directly:

```
altAttackerLoss = 1.3 · garrison(t) · (mag/100) · traitorMod
                = 1.3 · (D/Td) · ratio(t) · (mag/100) · traitorMod
defenderTroopLoss = garrison(t)
```

The speed term is **not** scale-compatible. `tilesPerTickUsed` currently reads
`within(D/(5A), 0.2, 1.5)`, comparing a *national army* against the attack pool.
Substituting `garrison(t)` (a per-tile share, ~200 vs `D` ~50 000) collapses the
expression onto its 0.2 floor everywhere and would make the whole map faster —
the opposite of the intent. Instead **modulate the existing global factor by the
mean-1 ratio**, which preserves scale by construction:

```
tilesPerTickUsed = within( (D/(5A)) · ratio(t), 0.2, 1.5 ) · speed · …
```

`attackTilesPerTick` (the per-tick budget, driven by front width) is left alone —
front width remains the throughput driver; locality enters through per-tile cost.

### D5: Reweight the blend to 0.3 / 0.7, as config knobs

At today's 0.6/0.4 the density term is ~12% of per-tile loss, so localizing it
alone would be nearly invisible. Move to `0.3·forceRatio + 0.7·localDensity`,
both as `FoodConfig` knobs.

Worked example, plains, `D/Td = 25`, `A = D/5`, clamp band `[0.2, 24]`:

| | ratio | garrison | force term (×0.3) | density term (×0.7) | **total/tile** |
| --- | --- | --- | --- | --- | --- |
| empty steppe | 0.2 | 5 | 38.4 | 3.6 | **42** |
| average ground | 1.0 | 25 | 38.4 | 18.2 | **57** |
| metro core | 24 | 600 | 38.4 | 436.8 | **475** |

An `A = 10 000` attack sweeps ~238 steppe tiles or ~21 metro tiles — a metro of
~5 tiles is breakable by a committed army but eats roughly half of it. That is
the intended feel; the harness confirms or moves the band.

### D6: Cities crack progressively — a designed consequence, not an accident

`conquer()` zeroes the captured tile's density, which lowers the metro's bucket
sum, which lowers `ratio` for the tiles still to take. A city therefore gets
*cheaper as it falls*, giving a natural release valve against stalemates. No
extra code; it falls out of routing everything through `setDensity`.

### D7: Zero-density fallback

If `Σ density == 0` (the inert food config used by legacy sim tests, or a player
before their first urban tile), `ratio(t) = 1` exactly, so every formula reduces
to today's behavior. This is what keeps `TestConfig.setInertFood` games
deterministic and unchanged.

### D8: Placement

`ratio(t)` belongs next to the field that feeds it — a method on `PlayerImpl`
(with the bucket map beside `_density`), exposed through the `Player`/economy
interface that `Config` already consumes, so `Config.attackLogic` stays a pure
function of its inputs and `src/core` boundary rules are unaffected.

## Risks / Trade-offs

- **AI blunts itself against heartlands.** `AiAttackBehavior` cannot read the
  garrison field and commits `troops/20` per attack; bots may stall on metros
  and read as passive. → Out of scope by decision. Mitigations available as
  follow-up: fold `ratio` into the `addNeighbors` conquest priority so attacks
  flow around dense ground, and/or into AI target selection. Watch bot
  win-rates in the harness sweep; if bots regress badly, land the priority
  tweak in the same change rather than deferring.
- **Impregnable capitals / stalemate.** A too-high clamp ceiling could freeze
  fronts permanently. → D6's progressive cracking is the built-in valve; the
  clamp is a knob; the harness sweep is a required task, not optional polish.
- **Compounding with `tile-damage`.** Captured city tiles already lose density
  *and* accrue combat damage that blocks regrowth. Conquered heartlands may stay
  worthless for a long time, weakening conquest as a strategy. → Measure total
  urban area over a harness run; treat as a balance finding for the damage/heal
  rates rather than blocking this change.
- **Bucket-boundary aliasing.** → Bilinear sampling (D2); worth an explicit test
  that a tile at a bucket corner adjacent to a metro reads a high ratio.
- **Approximate mean preservation** (D1) means aggregate conquest pace will
  drift somewhat even before the reweight. → Harness baseline before/after; the
  reweight in D5 is the dominant effect anyway.
- **Trade-off accepted:** attacker-side locality is absent, so the "concentrate
  vs spread" throughput asymmetry from the proposal is *not* fixed by this
  change. Wide fronts still take ground faster. What changes is that spreading
  now sweeps cheap empty land while the decisive ground is expensive and
  specific — the map acquires targets. Closing the throughput asymmetry itself
  needs the attacker-spatialization change.

## Migration Plan

No persisted state and no wire format changes — the bucket grid is derived from
`_density` and rebuilt implicitly by normal play. Rollback is reverting the
change. Staging: land the `ratio` primitive with the blend weights set to today's
`0.6/0.4` and the clamp band pinned to `[1, 1]` (an exact no-op), verify the full
suite is unchanged, then open the band and reweight in a second commit so any
test movement is attributable.

## Open Questions

- Clamp band defaults `[0.2, 24]` and weights `0.3/0.7` are reasoned, not
  measured. The harness sweep sets the shipped values.
- Should the force-ratio term (`within(D/A, …)`) eventually read the local
  garrison too, making combat fully local? Deferred — it interacts with
  attacker spatialization and should be decided alongside it.
- Should `AttackExecution.addNeighbors`'s conquest priority read `ratio` so
  fronts naturally flow around dense ground? Likely yes; gated on whether the
  harness shows bots regressing.
