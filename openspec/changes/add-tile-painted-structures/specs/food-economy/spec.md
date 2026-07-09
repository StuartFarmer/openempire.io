# Spec delta: food-economy (add-tile-painted-structures)

## MODIFIED Requirements

### Requirement: Production comes from Farmland only

Farmland SHALL be the ONLY food source: each Farmland plot contributes production proportional to its tile's crop byte, multiplied by its adjacency factor. Unfarmed land SHALL produce nothing (the land-harvest knob defaults to zero) — conquest wins tiles to farm, never free food, so expansion feeds an empire only through what gets built on it.

#### Scenario: Land alone feeds nobody

- **WHEN** a player holds any amount of territory with no Farmland
- **THEN** food production is zero

#### Scenario: District arithmetic

- **WHEN** a farm plot has N edge-adjacent farm plots
- **THEN** its production is base × (1 + N × adjacencyBonus)

### Requirement: Settling paints the starter kit

The game SHALL begin when the player settles: the spawn paints a free 2×2 starter homestead — one Settlement and three Farmland plots — centered on the chosen spot (falling back to the nearest owned land when the exact block is unavailable). The starting stake is unaffected by the kit, the starting population is sized to what the kit's farms feed, and the population-cap floor (basePopulation) is a small camp allowance on top of the kit Settlement. Spawn-phase re-settles rebuild the kit at the new location. This replaces the former invisible "ghost infrastructure".

#### Scenario: The opening

- **WHEN** a player picks a spawn on a layered map
- **THEN** they start with 1 Settlement + 3 Farmland painted at the spawn, the full food stake, and a population the kit sustains — idling does not starve

#### Scenario: Re-settle

- **WHEN** the player re-picks their spawn during the spawn phase
- **THEN** the old kit is removed and a fresh kit is painted at the new spot
