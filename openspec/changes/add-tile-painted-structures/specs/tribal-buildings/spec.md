# Spec delta: tribal-buildings (add-tile-painted-structures)

## MODIFIED Requirements

### Requirement: Structures are painted 2×2 plots

Settlement, Farmland, and Barn SHALL occupy a 2×2 tile footprint anchored at the clicked tile. A plot is placeable when all four tiles are land, owned by the builder, and not part of any existing structure's footprint — with no other spacing constraint. On the map each plot SHALL render as a per-type 2×2 color pattern painted into the terrain (farmland: alternating light/dark tilled rows) rather than a sprite icon.

#### Scenario: Dense districts are allowed

- **WHEN** a player owns a 4×4 area of land
- **THEN** four farmland plots can be packed edge-to-edge into it

#### Scenario: Footprints cannot overlap

- **WHEN** a plot placement would overlap any tile of an existing structure
- **THEN** the placement is rejected

#### Scenario: Painted appearance

- **WHEN** a farmland plot completes
- **THEN** its four tiles render the farmland pattern in place of base terrain shading

### Requirement: Paint-mode build UX

Selecting a tribal building SHALL enter a sticky paint mode: each click (and each new valid plot swept during a click-drag) places a plot and charges its cost; the mode persists until cancelled (right-click or Escape). The ghost preview SHALL show the 2×2 pattern at the cursor with validity coloring, and placement SHALL fail silently (no mode exit) on invalid plots or insufficient food.

#### Scenario: Painting a farm belt

- **WHEN** the player selects Farmland and drags across owned land
- **THEN** consecutive non-overlapping plots are placed along the path, each charged individually, until food runs out or the drag ends

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
