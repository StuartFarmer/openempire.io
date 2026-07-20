# Spec: city-growth

Cities are permanent — remove the self-recession — amends restore-organic-
growth's demand-following city.

## MODIFIED Requirements

### Requirement: Cities grow when their people need homes, over suitability

(Amended.) The per-tile city plane SHALL be real sim state. The city holds one
tile per `popPerDensity` people (scaled by the AI difficulty multiplier): while
`cityTiles < ceil(population / (mult · popPerDensity))` it adds
`max(1, urbanGrowthRate × gap)` tiles per tick on the best-suitability frontier
— 4-contiguous from the nuclei (Core and completed Settlements), owned passable
land, not another structure's plot. Because farm fields are now unbounded, the
city has PRIORITY over them: it MAY claim a worked field tile, evicting it from
the farm (the field regrows onto other land), so the city can always grow into
owned ground. The city SHALL NEVER recede on its own:
a drop in population leaves the footprint (and therefore the housing) at its
high-water mark. City ground is lost ONLY to conquest (removed on ownership
change) or when the nation dies (population reaches 0 and all tiles are
relinquished). The Core stands while its people live.

#### Scenario: Demand-gated growth

- **WHEN** a fed player's population presses its housing ceiling
- **THEN** city tiles appear one pace at a time on the most suitable adjacent
  ground, and growth stops when population no longer presses housing

#### Scenario: A growing city displaces farmland

- **WHEN** a city needs to grow but its frontier is covered by its own worked
  farm field
- **THEN** the city claims those tiles anyway (evicting them from the farm), so
  housing keeps rising, and the farm regrows onto other owned land

#### Scenario: A city persists through a population collapse

- **WHEN** a city's population is decimated (but stays above zero) for a long
  time
- **THEN** the city keeps every tile it had — the footprint and housing do not
  shrink — until an enemy takes ground or the nation dies

#### Scenario: Conquest is the only thing that shrinks a city

- **WHEN** an enemy captures city tiles
- **THEN** those tiles leave the city (density cleared on the ownership change),
  and no other mechanism removes city tiles
