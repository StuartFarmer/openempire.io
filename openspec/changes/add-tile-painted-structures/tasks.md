# Tasks: add-tile-painted-structures

## 1. Core: plots + adjacency

- [x] 1.1 GameImpl plot-occupancy index (Map<TileRef, Unit> over 2×2 footprints, maintained on build/delete); tribal placement = 4 tiles land+owned+unoccupied, no min-dist; expose occupancy check + per-player anchor lookup for adjacency
- [x] 1.2 FoodConfig v3: plot costs (150/40/60) + costGrowthPerOwned (0.03) + per-plot effects (pop 3000, storage 1500, farmProductionMilli 80) + adjacencyBonus (0.1)
- [x] 1.3 Adjacency-aware effects: farm production in foodTick; settlement cap in Config.maxTroops; barn storage in foodTick — all via anchor-distance-2 neighbor counts
- [x] 1.4 Core tests: packing/overlap/ownership placement rules, adjacency arithmetic (belt vs scattered), cost growth curve, capture keeps plots painted

## 2. Bots

- [x] 2.1 Plot painting heuristics: farmland scoring = fertility + adjacency; settlements/barns cluster; verify bots build dozens of plots and survive (test + harness census)

## 3. Client (paint UX + rendering)

- [x] 3.1 Per-tile plot-type buffer → GL texture; terrain composite paints per-type 2×2 patterns (farmland tilled rows etc.); StructurePass skips tribal types
- [x] 3.2 Paint mode: sticky placement (no exit on build), drag-paint one intent per new valid anchor, right-click/Escape exits; 2×2 ghost with validity coloring
- [x] 3.3 In-game verify on verdantia: paint a farm belt by dragging, patterns render, adjacency visible in production readout

## 4. Balance + gates

- [ ] 4.1 Harness re-sweep; balance-notes entry; verify plots-per-game census (dozens per nation) and sane leader share
- [ ] 4.2 tsc/lint/full vitest at baseline
