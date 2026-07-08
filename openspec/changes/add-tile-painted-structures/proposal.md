# Proposal: add-tile-painted-structures

## Why

Tribal buildings are currently rare, expensive objects placed one at a time through the radial menu with a 15-tile exclusion zone and a large sprite icon. Stuart's direction: building should feel like **painting the land** — cheap per-tile structures that visibly transform terrain (a farm belt reads as tilled rows), required in quantity so that expansion is what grows an empire, with adjacency bonuses that reward contiguous districts.

## What Changes

- **Structures become 2×2 tile plots** — **BREAKING** (layered maps): Settlement/Farmland/Barn occupy a 2×2 footprint of owned land, buildable on any free plot (no minimum spacing), one structure per tile. Their map appearance is a per-tile 2×2 color pattern painted into the terrain (e.g. farmland: alternating light/dark tilled rows) instead of a sprite icon.
- **Paint-mode build UX**: selecting a tribal building enters a sticky paint mode — click (or click-drag) to place plot after plot; right-click/Escape exits. The ghost preview shows the 2×2 pattern with validity coloring.
- **Costs drop ~10×, escalation flattens**: per-plot base costs with a gentle per-owned growth knob replace the linear doubling ladder — empires are built from dozens of plots.
- **Per-plot effects shrink proportionally**: a settlement plot houses a fraction of the old settlement; barns store less each; farms produce less each — quantity and placement are the game.
- **Adjacency bonus**: each edge-adjacent same-type plot grants a modest percentage bonus to a plot's effect (production/cap/storage), encouraging farm belts, town clusters, and granary districts.
- Bots paint plots (preferring adjacency + fertility); balance harness re-swept.

## Capabilities

### Modified Capabilities

- `tribal-buildings`: plot footprint, placement rules, paint UX, cost model, per-plot effects, adjacency bonus.
- `food-economy`: farm production/cap/storage formulas gain the adjacency term and rebased per-plot magnitudes.

## Impact

- Core: placement (`PlayerImpl.canSpawnUnitType` tribal branch + plot occupancy in `GameImpl`), `FoodEconomy.ts` (adjacency-aware farm production), `Config.ts` (maxTroops/storage adjacency terms, FoodConfig v3 costs/effects), bots.
- Client: InputHandler ghost/paint mode, BuildPreviewController (2×2 ghost), new tile-pattern render path (per-tile structure texture + patterns, replacing StructurePass sprites for tribal types), BuildMenu stays the entry point.
- Tests: placement/occupancy/adjacency suites; harness retune.
