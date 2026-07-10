# Design: add-supply-lines

## Context

Ports two concepts from the dead-end repo (per the investigation): the deterministic owned-tile distance field (its FoundationLogistics, minus the O(V²) sort-queue) and the smooth `1/(1+(d/r)^p)` carrying-capacity decay (its TroopFood sandbox, minus the non-deterministic fluid sim). Food stays a global per-player stock; supply is a *quality multiplier* where things happen.

## Decisions

1. **Bounded multi-source BFS, not full Dijkstra.** Uniform step cost (cardinal, owned passable land) means BFS with a plain queue is exact — no heap needed. Flood cutoff at `supplyRadius × 3` (quality < ~0.04 beyond) bounds work independent of empire size. Distances stored in a per-player `Map<TileRef, number>`; absent = out of supply.
2. **Refresh cadence, staggered.** Recomputed every `supplyRefreshTicks` (default 10) per player, staggered by player hash (like the cluster calc), inside PlayerExecution. Between refreshes the field is slightly stale — acceptable; determinism holds because staleness is identical everywhere.
3. **Nodes = completed Settlements + Barns.** Towns and granaries both anchor logistics; farms don't (they're the consumers). Knobbing node types was considered and skipped — YAGNI.
4. **Farm term**: production per farm ×= `qualityAt(farmTile)`. Composes with fertility and adjacency (all multiplicative, floored once at the sum as today).
5. **Army front tracking**: `AttackImpl` gains a `frontTile` (last conquered tile, updated in AttackExecution's conquer loop — one assignment per conquered tile, no allocation). FoodEconomy reads `qualityAt(frontTile)` for each outgoing land attack; fighting consumption ×= `1 + (1 − q) × warSupplyPenalty` (default 1.0 → up to 2× the war rate, i.e. 8× idle when fully unsupplied). Attacks with no front yet (or boat-borne) use quality 0 — expeditionary forces pay full penalty, which is thematic.
6. **Overlay is client-recomputed** for display only (same BFS from client-side unit views + territory), avoiding wire changes; small divergence from sim staleness is invisible at overlay precision. Toggle joins the existing alt-view mechanism.
7. **Branch isolation**: everything lands on `supply-lines`; `lean` remains the fallback. No changes to classic-map behavior (all supply code behind hasLayers, as ever).

## Risks

- [BFS cost on huge empires] → cutoff bounds the flood; staggered cadence spreads work; harness watches tick times.
- [Double-penalty stacking (supply penalty × starvation) collapses war entirely] → warSupplyPenalty knob; harness + playtest tune.
- [Bots ignore supply when farming] → their district clustering already correlates with supply nodes; watch item, not blocking.
