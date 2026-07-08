# Design: add-tile-painted-structures

## Context

Builds on rework-tribal-scarcity. Prior art: the parked experimental branch's `FoundationStructureTerrainOverlay` proved per-type 2×2 RGBA terrain patterns work in this renderer. The sticky ghost-placement mode (`uiState.ghostStructure`) already exists in InputHandler — paint mode extends it rather than inventing new input plumbing.

## Decisions

1. **Footprint + occupancy.** Plots anchor at the clicked tile and cover `(x,y),(x+1,y),(x,y+1),(x+1,y+1)`. `GameImpl` keeps a `Map<TileRef, Unit>` occupancy index over all four tiles, maintained on build/delete (capture transfers the unit, not the tiles — the index is ownership-agnostic). Tribal placement validation checks the four tiles (land, owned, unoccupied) and skips `structureMinDist` entirely; vanilla structures keep their spacing rules.
2. **Adjacency.** Plots are neighbors when anchors differ by exactly ±2 on one axis (edge-sharing plots). Effect multiplier `1 + neighbors × adjacencyBonus` (knob, default 0.1, max 4 neighbors → +40%). Computed on read: farms during the food tick, settlements/barns in the cap/storage sums — each does 4 anchor lookups against a per-player anchor set (O(plots × 4), cheap at hundreds of plots). No cached bonus state to invalidate.
3. **FoodConfig v3 magnitudes.** Costs: settlement 150 / farmland 40 / barn 60, `costGrowthPerOwned: 0.03` (plot #34 ≈ 2× base). Effects: `populationPerSettlement` 3,000, `storagePerBarn` 1,500, `farmProductionMilli` 80 (a crop-150 farm plot ≈ 12 food/tick → ~12 farm plots + ghost feed one settlement-district's 15k people). Ghost infrastructure and start values unchanged — the opening is identical, the ladder just has more, smaller rungs.
4. **Rendering: per-tile structure texture, not sprites.** A `Uint8Array` per-tile plot-type buffer (0 = none) uploaded like the trail/railroad textures; the terrain/territory composite samples it and swaps in the 2×2 pattern colors (pattern pixel = tile's position parity within the plot — anchor parity gives the row-banding "tilled" look). StructurePass skips tribal types. Patterns start from the parked branch's palette (farmland greens/browns; settlement warm roofs; barn tans).
5. **Paint mode.** BuildMenu click on a tribal entry sets `ghostStructure` (existing) but placement no longer exits the mode; pointer-drag emits a build intent per new valid anchor entered (client-side dedupe against the occupancy view + in-flight anchors; the sim re-validates authoritatively). Right-click/Escape clears. Vanilla units keep the old click-once flow on classic maps.
6. **Bots** paint: farmland target scoring adds `+adjacency` (prefer tiles adjacent to own farms), settlement/barn placement near existing clusters; triggers unchanged, affordability via unit info costs as today.

## Risks / Trade-offs

- [Drag-paint intent floods] → client throttles to one intent per anchor per drag; sim-side validation is the backstop.
- [Per-tick adjacency cost] → O(plots×4) map lookups; measured by the harness perf numbers (FullGamePerf if in doubt).
- [Pattern readability at low zoom] → patterns are flat colors per tile; at 1px/tile a district reads as a solid color block, which is the desired "regions" look.

## Migration Plan

Layered-map-gated as ever. Existing saved games don't exist (singleplayer, no persistence) — no migration.
