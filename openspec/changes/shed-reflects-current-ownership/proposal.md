## Why

`PlayerFoodShed` held its per-tile output in `Map<TileRef, …>` per player. That
representation carried an accidental behaviour nobody designed: a player's shed
kept **stale entries for ground it had already lost**, because the Map was only
rebuilt on that player's own refresh cadence. One consequence is visible in the
food economy — field storage banked in a cell the player no longer holds
survives until their next refresh, up to `supplyRefreshTicks` later.

Replacing those Maps with shared per-tile planes (a tile has exactly one owner,
so sheds are disjoint) makes the shed reflect **current** ownership: the moment
the new owner's flood covers a tile, it is theirs. That is measurably faster —
~21% off the tick on SPQR at tick 3802, from 40.0 ms to 31.4 ms — but it cannot
reproduce the old staleness, because two players' stale views of one tile cannot
coexist in a single slot.

The effect is tiny (3,981 divergent reads out of 262M; one unit of population in
44 million at tick 3802) and arguably a correction rather than a regression: you
should not bank grain on ground you have lost. But it is a behaviour change, so
it is specified rather than slipped in as a refactor.

## What Changes

- The food-shed's per-tile output reflects current ownership. A tile that
  changes hands belongs to the new owner's shed as soon as that shed is
  recomputed, and stops contributing to the previous owner's.
- **BREAKING** (simulation output): field storage held in a cell a player no
  longer covers is released at the next food tick instead of surviving until
  that player's next shed refresh. Seeded game hashes change on long runs.
- No knob, unit, or mechanic is added, removed, or retuned. The shed's
  distances, cells, potential values and refresh cadence are unchanged.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `food-economy`: the local-storage requirement gains the release rule for a
  cell the player no longer covers, so how long orphaned stock survives is
  stated rather than being a side effect of how the shed was stored.

## Impact

- `src/core/execution/utils/FoodShed.ts` — `potential`/`cellOf` become shared
  planes tagged with the owning shed's smallID; each shed clears only the tiles
  still tagged to it. Accessors `cellAt`/`hasCell` replace the Map reads.
- `src/core/execution/utils/FoodEconomy.ts` (the pruning site),
  `FarmGrowth.ts`, `UrbanGrowth.ts`, `EconomyModel.ts` — call sites move from
  `shed.cellOf.get/has` to the accessors.
- Determinism baselines: hashes are unchanged on the previously used horizons
  (verdantia 1500 ticks, spqr 3000 ticks) and change only on longer runs, so the
  reference set must be re-recorded at a longer horizon. **1200-tick checks are
  not sufficient to detect shed changes** — that is what let this through
  unnoticed at first.
- Stored sweep rows and presets from before the change are not comparable;
  `simFingerprint()` already stamps rows with a hash of `src/core`.
