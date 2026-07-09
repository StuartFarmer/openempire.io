# Spec delta: tribal-buildings (add-tile-painted-structures)

## MODIFIED Requirements

### Requirement: Structures are painted single-tile plots

Settlement, Farmland, and Barn SHALL occupy exactly one tile — placeable on any owned, passable land tile without an existing structure, with no spacing constraint. On the map each plot SHALL render as a per-type **2×2 sub-tile pixel pattern inside its single tile** (farmland: the tile's own terrain topsoil color on the top row over a darkened copy below — tilled rows that blend with the local biome, per the reference implementation) rather than a sprite icon. Plots SHALL build instantly — tribal structures have no construction time.

#### Scenario: Dense districts are allowed

- **WHEN** a player owns a 2×2 area of land
- **THEN** four farmland plots can be packed tile-by-tile into it

#### Scenario: One structure per tile

- **WHEN** a plot placement targets a tile already holding a structure
- **THEN** the placement is rejected

#### Scenario: Painted appearance, instant

- **WHEN** a farmland plot is placed
- **THEN** its tile immediately renders the tilled 2×2 sub-tile pattern (no construction phase, no invisible state) and its production effect starts the same tick

### Requirement: Paint-mode build UX (per the foundation reference)

Farmland SHALL use stroke painting exactly as the reference implementation (~/Developer/games/OpenFrontIO, foundation module): pointer-down starts a stroke, every new tile the pointer crosses while held places a plot (deduped per stroke), pointer-up ends the stroke, and the mode stays armed for the next stroke until cancelled (right-click or Escape). Settlement and Barn SHALL use sticky single placement (click per plot, mode persists). Placement failures (invalid tile, insufficient food) fail silently without exiting the mode. The ghost preview shows the pattern at the cursor with validity coloring.

#### Scenario: Painting a farm belt

- **WHEN** the player selects Farmland and drags across owned land
- **THEN** every tile crossed by the stroke gains a farm plot, each charged individually, until food runs out or the drag ends

### Requirement: Plot economics — cheap, many, gently escalating

Per-plot base costs SHALL be roughly an order of magnitude below the previous building costs, with escalation `cost = base × (1 + owned × growthFactor)` where growthFactor is a small knob (a few percent) — building the fiftieth plot is meaningfully but not prohibitively dearer than the first. Per-plot effects (population cap, storage, production) SHALL shrink correspondingly so empires require dozens of plots, making territory the binding constraint.

#### Scenario: Empires are many plots

- **WHEN** a player wants to house a population several times the base cap
- **THEN** they need on the order of tens of settlement plots (and the land to hold them)

### Requirement: Adjacency bonus for districts

Each edge-adjacent plot of the same type (up to 4 neighbors, same owner) SHALL grant a modest configured percentage bonus to a plot's effect — farm production, barn storage, and (for settlements) population growth rate, since capacity is mirrored client-side where adjacency data is unavailable. The bonus SHALL reflect current neighbors each tick (built, destroyed, or captured plots take effect immediately).

#### Scenario: Farm belt outperforms scattered farms

- **WHEN** four farmland plots form a contiguous belt versus four isolated plots on identical fertility
- **THEN** the belt's total production is higher by the configured adjacency margin
