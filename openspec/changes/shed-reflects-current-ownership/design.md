## Context

`PlayerFoodShed` exposed its per-tile output as two `Map<TileRef, …>` per
player: `potential` and `cellOf`. Measured on SPQR at 323,471 shed tiles across
66 players (`tests/perf/balance/ShedStructureCost.ts`):

```
build cellOf   Map 35.23 ms   plane 6.22 ms   → 5.7× cheaper
build tilled   Set  1.37 ms   mask  0.19 ms   → 7.3× cheaper
read  323k     Map 13.01 ms   plane 3.37 ms   → 3.9× cheaper
```

Two per-tile Maps rebuilt per refresh cadence is ~70 ms of hashing against ~12 ms
of plane writes — and every consumer of them is a random access, a `.size`, a
membership test, or one accumulation grouped by cell. None needs a hash table.

Sheds are **disjoint**: a tile has exactly one owner and the flood is gated on
ownership, so no two sheds can cover the same tile at the same instant. The
per-tile output therefore does not need to be per player at all.

## Goals / Non-Goals

**Goals:**

- Take the hashing out of the shed's hot path.
- State what happens to storage on ground a player has lost.
- Keep distances, cells, potential values, and the refresh cadence unchanged.

**Non-Goals:**

- Any GPU work. This is `src/core` only; it happens to also be the prerequisite
  that makes a compute-shader shed viable, but nothing here depends on that.
- Converting `tilled`/`ranked` (Sets) or the per-farm Maps. They are small
  (1.37 ms) and can follow separately if worth it.

## Decisions

**D1 — One shared plane per quantity, tagged with the owning shed.**
Alternatives: per-player planes (66 × 2M × 12 B ≈ 1.5 GB — out); per-player
sorted arrays with binary search (O(log n) reads, no better than a hash);
keeping the Maps (the thing being removed). A shared plane is 12 MB on the
largest map and gives O(1) array reads. Each entry carries the `smallID` of the
shed that wrote it, so asking one player's shed about another player's ground
answers "not in my shed" rather than silently returning the other player's
value — consumers only ever ask about their own tiles, but relying on that would
be a footgun.

**D2 — Each shed clears only the tiles still tagged to it.**
A shed remembers exactly the tiles it wrote (`tiles`, which is the BFS visit
list). On refresh it clears that slice — skipping any tile whose tag has since
changed, because that tile has been re-flooded by its new owner and clearing it
would delete a live entry. Getting this wrong diverged the simulation from tick
~2300 on SPQR.

**D3 — Reset the planes when the game changes.**
The planes are module-level, so a new game in the same process (the shell
restarting a match; the next test) would inherit stale entries, and since
smallIDs are reused the tag would match and hand the new game the old one's
shed. `ensurePlanes` compares the `Game` identity and clears the tags when it
differs.

**D4 — Accept the storage-release change rather than emulate the old staleness.**
The one behaviour that a shared plane cannot reproduce is a player reading its
own stale view of a tile it has lost. Exactly one site depends on it —
`FoodEconomy.ts:217`, which prunes `_fieldStockMilli` for cells the shed no
longer covers. Preserving it exactly would need a per-shed `Set` of its tiles for
that single membership test: ~15 ms per cadence at 323k tiles, handing back most
of the win to keep an accident nobody designed. Measured impact of accepting it:
3,981 divergent reads out of 262M, one unit of population in 44 million at tick 3802.

## Risks / Trade-offs

- **Hash divergence is invisible on short runs** → verdantia at 1500 ticks and
  spqr at 3000 ticks are UNCHANGED by this; only longer runs differ. The
  determinism horizon for anything touching the shed is therefore 4000 ticks,
  and the reference set below is recorded at that length.
- **Balance drifts because districts lose banked grain sooner** → the stock
  released is only ever on ground already lost, so it removes a small windfall
  for a losing player rather than shifting any ongoing production. Re-run the
  harness on an engine map and a real-data map and compare snowball metrics.
- **A future consumer asks a shed about a foreign tile** → returns "not in my
  shed" (D1) rather than a stale value, which is the safer failure.

## Migration Plan

1. Land the plane conversion (implemented) together with this spec.
2. Re-record the determinism reference set at 4000 ticks. Recorded on the
   implementing commit:
   - spqr, 1 run, 4000 ticks, nations 0, bots 50, seed-prefix `base`
     → `5398942253514943`
   - verdantia, 2 runs, 4000 ticks, nations 20, bots 40, seed-prefix `base`
     → `1176633938518865`, `2100340343259815`
3. Note in `balance-notes.md` that pre-change sweep rows are not comparable.
4. Rollback: revert the commit; no persisted state, no config, no data migration.

## Open Questions

- `tilled`/`ranked` are still `Set<TileRef>` and `cellOf`'s sibling structures
  per farm are still Maps. Worth converting? Measured at only 1.37 ms, so
  probably not on its own — but it would be free to do alongside a GPU port,
  which wants mask planes anyway.

- **Should the stock release be tightened to the moment coverage is lost?**
  Writing task 2.3's test (`tests/LocalFood.test.ts`) showed that this change's
  first spec draft overstated what landed. Per-tile coverage IS current — the
  losing player's `hasCell` goes false the moment the conqueror's flood tags the
  tile. But the sweep that releases the stock is gated on `peopleByFarm` as well,
  and that map is only rebuilt on the losing player's OWN refresh, so the
  orphaned stock stays in one of its feeding regions — and drawable — for up to
  `supplyRefreshTicks` after the ground is gone. Measured: coverage flips at tick
  12, stock is released at tick 20, with a 10-tick cadence.

  Making the release immediate means excluding cells the shed no longer covers
  from the region build, not just from the sweep. That is a further behaviour
  change, needs its own re-baseline, and is arguably the rule the proposal's
  "you should not bank grain on ground you have lost" implies — but it is NOT
  what this change did, so the spec now states the shipped rule and this is
  logged rather than quietly claimed.
