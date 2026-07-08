# Design: add-tribal-food-economy

## Context

Builds directly on `add-map-layer-sidecars` (crop bytes readable in the sim). The vanilla economy: population (troops+workers) grows by a logistic curve in `Config` (`populationIncreaseRate`), max troops scale with territory and Cities, gold arrives at a flat rate. Phase 1 replaces the *population* half of that on layered maps while leaving gold, existing units, and all classic-map behavior untouched. A previous in-core food implementation exists in git history (world-generator branch commits "woo"/"fuck") — it validated the seams (AttackExecution/Config/PlayerImpl) but is superseded by this cleaner, spec-driven design; do not resurrect it wholesale.

## Goals / Non-Goals

**Goals**
- The produce→store→consume→grow/starve loop, integer-deterministic, fully knob-driven, active only on layered maps.
- Spatial value: fertile land and Farmland placement matter; war has a food price.
- Bots participate; balance harness proves no runaway loop before UI polish.

**Non-Goals**
- Ages framework, metal/oil, ships, gold removal (later specs).
- Food trading/gifting, per-unit food upkeep for buildings, supply lines/logistics distance (explicitly out — the old branch's supply-diffusion experiment is parked).
- HUD beyond a food readout + build menu entries.

## Decisions

1. **State on `PlayerImpl`, ticked by `PlayerExecution`.** Food stock (`bigint`, like gold), `fertilitySum` (number, sum of owned crop bytes), cached counts of Settlements/Farmland/Barns. The per-tick pass runs inside the existing `PlayerExecution.tick` (fixed order: production → consumption → overflow/decay → growth/starvation) rather than a new per-player execution — one fewer moving part, same hook the vanilla growth uses. Alternative (dedicated `FoodExecution` per player) rejected: no scheduling need justifies it.
2. **Incremental fertility accounting.** `fertilitySum` updates in the same code paths that transfer tile ownership (conquer/relinquish in `GameImpl`/`AttackExecution`), mirroring how `numTilesOwned` is maintained. No per-tick map scans. Farmland contribution = its tile's crop byte × `farmlandFertilityMult`, added/removed on build/capture/destroy.
3. **Integer math discipline.** Production/consumption computed in "food milliunits" (scaled integers) to allow sub-1 rates without floats; stock stored as bigint of milliunits, displayed ÷1000. Decay = `stock - floor(stock × decayNumer / decayDenom)` in bigint. The spec's "1 food per person per tick" is the *display-unit* default (`idleConsumptionMilli = 1000`).
4. **Activity detection reuses existing state.** Moving = player's troops attached to outgoing `AttackExecution`s not yet in contact + boat troops; fighting = attacks currently exchanging tiles (the attack already knows). Exposed as two counters the food pass reads — no new bookkeeping inside combat.
5. **Growth couples surplus to the vanilla curve shape.** Three regimes each tick: production > consumption → `growth = vanillaLogistic(pop, cap) × clamp01(surplusRatio / surplusForFullGrowth)` where `surplusRatio = (production − consumption) / consumption`; deficit covered by storage → stagnation (reserves feed people, they don't multiply); uncovered deficit → starvation `deaths = ceil(unfedPeople × starvationDeathFraction)` where `unfedPeople = deficitMilli / idleConsumptionMilli`. `cap = foodBasePop + settlementLevels × popPerSettlement` replaces the territory/City max-troops on layered maps via a `Config.maxTroops` branch keyed on `player.hasFoodEconomy()`. Keeping the logistic shape preserves familiar early-game feel; the food term only throttles it.
6. **Buildings ride the existing build pipeline.** Three `UnitType` additions; `ConstructionExecution` gains cases; cost check reads food instead of gold via a `costResource` field on unit info (`"gold" | "food"`) so later ages reuse the mechanism (metal/oil become new entries, not new plumbing). Build menu filters by `game.hasLayers()`.
7. **Bots: extend `NationStructureBehavior`** with a Tribal branch (gated on `hasLayers()`): maintain ratios (≈1 Settlement per N pop-cap used, Farmland on the highest-crop owned tile not yet farmed, Barn when overflow lost > threshold). Deliberately dumb; the balance harness tunes against it.
8. **Anti-snowball posture from day one.** The loop food→pop→conquest→more fertile land→more food is reinforcing by design; dampeners are decay (holding food is lossy), activity cost (expanding armies eat more — attacker pays), and cap-by-Settlement (conquered land ≠ instant pop; you must build). The harness's leader-share curve is the acceptance test: target = leader share grows sub-linearly after spawn phase at default knobs (exact thresholds set empirically in task 6 and recorded in the harness config).

## Risks / Trade-offs

- [Double economy confusion (gold still exists)] → phase-1 UI labels Tribal buildings' costs clearly; gold-costed vanilla units remain until the Metal-age change migrates them. Accepted transitional state.
- [Bots starve themselves and games go dead] → harness measures bot starvation rate; knob floor (`starvationDeathsPerMilli`) plus bot heuristic ordering (Settlement before Farmland before army) tuned until bot self-sufficiency is routine.
- [Perf: per-tick bigint ops × players] → O(players) per tick, trivial next to existing per-tile work; fertility accounting is O(tiles transferred).
- [maxTroops branch drift between layered/unlayered paths] → single `Config` function with an explicit `hasLayers` parameter and tests for both branches.
- [Population != troops semantics (workers split)] → phase 1 treats the whole population pool as eaters at the idle rate; only the troop share gets activity multipliers. Revisit if worker mechanics arrive.

## Migration Plan

Additive + branch-gated: unlayered maps hit zero new code paths (guarded at the top of the food pass and build-menu filter). Ship behind the existing map-choice — playtests happen by picking a layered map. Rollback = revert the change; no save/wire-format migration (singleplayer only).

## Open Questions

- Farmland area-of-effect (own tile only vs radius) — start with own-tile only; radius is a knob-shaped extension if Farmland feels too weak spatially.
- Whether NPC tribes (existing `TribeExecution`) should hold food stockpiles that are looted on conquest — deferred to a follow-up; flavorful but not load-bearing for the loop.
