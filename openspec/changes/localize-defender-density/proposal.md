# Proposal: localize-defender-density

## Why

Combat is spatially blind. An attack is a scalar troop count, and the only
per-tile defense input the sim reads is `defender.troops() / defender.numTilesOwned()`
— a **nationwide average**. A defender's metropolis and their empty steppe
defend exactly alike, no matter that one holds their entire population and the
other holds nobody. There is nothing on the map worth defending, and nowhere an
attack can be stopped.

Two consequences follow directly, both observed in play:

- **Spreading strictly dominates concentrating.** Advance rate is
  `≈ 0.45 · attack.borderSize()` (proportional to front width), while cost per
  tile is entirely independent of front width. A 200-tile front takes ground
  ~100× faster than a 2-tile spearhead for the same troops-per-tile. The
  concentrated push added by `add-urban-core-growth` is therefore a strictly
  worse move, and splitting into several segment pushes is punished twice over
  (they don't merge, so each sub-attack carries a worse `D/A` ratio).
- **Territory is uniform mush.** Conquest is a flood fill priced by terrain
  alone. Taking someone's capital feels identical to taking their frontier.

The data to fix this already exists and is already required:

- `PlayerImpl._density` stores **per-tile population** (0..`popPerDensity`),
  maintained by `setDensity()` with a running sum. Its own doc comment reads:
  _"the field is per-tile so a future combat/movement layer can draw people from
  specific tiles."_ This change is that layer.
- `openfront-conquest-game` already states: _"Where OpenFront reads per-player
  aggregates (defender troops per owned tile), the game SHALL use the tile-local
  troop garrison."_ That requirement was never implemented — the code still
  reads the aggregate. This change closes it.

## What Changes

- **New per-tile garrison field.** The defender's troops are *distributed over
  the population field* rather than averaged over territory. The garrison
  defending a tile is `D · blurredDensity(t) / Σ density`, i.e. that tile's
  share of the defender's own army. The multiplier is normalized against the
  defender's **own mean density**, so a tile at that mean defends exactly as it
  does today and `D/Td` survives as the scale — this is a *redistribution*, not
  a global buff or nerf. (Mean preservation is approximate, not exact: the
  smoothing kernel spills mass onto unowned tiles and the clamp below is not
  mean-neutral. See design.md D1.)
- **A 4-tile (~80 km) garrison catchment.** Density is smoothed over a
  neighborhood before being read, so a city projects a defensive shadow past its
  own footprint and cannot be sidestepped one tile to the left. Implemented as a
  coarse bucket grid maintained incrementally in `setDensity()` — O(1) per
  update, O(1) per combat read, no per-tick rebuild, fully integer and
  deterministic.
- **BREAKING (balance): the density term becomes the dominant defense channel.**
  The attacker-loss blend moves from `0.6·forceRatio + 0.4·density` to
  `0.3·forceRatio + 0.7·localDensity`. Today the density term contributes ~12%
  of per-tile loss (≈10 troops of ≈87); localizing it without reweighting would
  leave the new spatial signal nearly invisible. Both weights become config
  knobs so the harness can tune them.
- **Defender losses localize too.** `defenderTroopLoss` moves from the same
  `D/Td` aggregate to the local garrison: overrunning a dense city tile
  destroys a real share of their army, while sweeping empty steppe kills almost
  nobody. Breaking an enemy now requires reaching their people.
- **Advance speed localizes.** `tilesPerTickUsed` scales by the same local
  multiplier, so a front visibly **stalls** at a defended metro and races across
  open country — the effect is felt as a stopped advance, not just a quiet
  drain. (It scales the existing factor rather than substituting the garrison
  for `D`: a per-tile garrison is ~250× smaller than a national army and would
  collapse the expression onto its floor, making the whole map *faster*. See
  design.md D4.)
- **Clamp band as tuning knobs.** The local/mean multiplier is clamped to a
  configured band (default `[0.2, 24]`). The raw range is enormous — a sprawling
  nation whose entire population sits on 5 of 2000 tiles yields a raw multiplier
  in the hundreds — so the clamp, not the formula, is the real balance control.
- **Explicit aggregate fallback.** When a defender's total density is zero (the
  inert-food config used by legacy sim tests, or a player with no urban field
  yet), the garrison falls back to `D/Td` and every existing behavior is
  byte-identical.

Non-goals (deliberately out of scope, see design.md): spatializing the
*attacker's* troops, and spatial resolution of opposing attacks — the scalar
annihilation in `AttackExecution.init()` is untouched here.

## Capabilities

### New Capabilities

- `local-garrison`: the tile-local defender garrison — distributing a player's
  troops over the per-tile population field, the catchment blur and its bucket-grid
  representation, mean preservation, the clamp band, and the zero-density fallback.

### Modified Capabilities

- `openfront-conquest-game`: the "Combat resolves on the troop ratio" requirement
  gains a concrete definition of the tile-local garrison it already mandates, the
  reweighted loss blend, localized defender losses, and localized advance speed.

## Impact

- **Core sim:** `Config.attackLogic` (loss blend + defender loss), `Config.attackTilesPerTick`
  (speed factor), new garrison accessor; `PlayerImpl.setDensity` gains incremental
  bucket-grid maintenance plus a garrison read path; new `FoodConfig` knobs
  (catchment radius, blend weights, clamp band). `AttackExecution` call sites are
  unchanged — it already passes `tileToConquer` into `attackLogic`.
- **Determinism:** bucket sums are integer and updated in `setDensity` only;
  no floating-point accumulation, no iteration-order dependence.
- **Performance:** replaces a per-conquered-tile radius scan (~81 `Map.get`s at
  r=4) with a single bucket lookup. Net cost is one extra `Map` update per
  density change.
- **Tests:** `src/core` change, so tests are mandatory. New unit tests for the
  garrison field (mean preservation, clamp, fallback) and combat tests asserting
  a metro tile costs and slows more than a steppe tile for the same defender.
  Legacy inert-food tests must stay unchanged via the fallback.
- **Balance:** harness sweep (`tests/perf/balance/BalanceRun.ts`) over the blend
  weights and clamp band. Expect conquest to accelerate across open land and
  decelerate sharply at population centers; territory-vs-population snowball
  should shift toward population.
- **Known risk / follow-up:** `AiAttackBehavior` has no notion of density and
  will blunt attacks against heartlands it cannot read. AI target selection is
  out of scope here and is called out as follow-up work in design.md.
- **Client:** no required change. A garrison overlay is a natural companion
  (the shell already ships read-only legibility overlays) but is not part of
  this change.
