# Spec delta: tribal-buildings (rework-settlement-ecology)

## MODIFIED Requirements

### Requirement: Plots are placed from awarded seeds, never bought

Settlement and Farmland SHALL have no food cost; placing one consumes a banked seed of that type (per seed-awards). The build UI SHALL show banked seed counts where prices were shown. All existing siting rules stand (owned land, passability, Farmland ↔ city-tile mutual exclusivity), plus the tile-damage gate: placement on a damaged tile is refused.

#### Scenario: The BuildBar shows seeds, not prices

- **WHEN** the player opens the build UI on a layered map
- **THEN** Settlement and Farmland show banked seed counts, and each is placeable only while its count is above zero

## ADDED Requirements

### Requirement: A founded town anchors a city tile

Every city nucleus (the Core and each completed Settlement) SHALL anchor at
least one city tile in the urban growth target: the target is the greater
of the nucleus count and the population-derived footprint (added task 10 —
without the floor, a Settlement placed while national population is below
`(urbanArea + 1) · popPerDensity` stays a hollow nucleus and a founding
pair cannot actually found anything). The tile itself SHALL arrive through
the normal urban CA (contiguity, food-shed gate, pacing) — founding grants
demand, not instant housing. Recession SHALL never raze a living town's
anchor tile.

#### Scenario: A founding pair takes root at village scale

- **WHEN** a Settlement completes beside a maturing field while national
  population is far below one full city tile of people
- **THEN** the urban target rises by one and the growth pass places the
  town's first city tile where the shed feeds it

#### Scenario: Famine shrinks the city but never erases a living town

- **WHEN** population collapses after several towns are founded
- **THEN** the city recedes toward the nucleus count, not below it, while
  the player lives

## REMOVED Requirements

### Requirement: Barn

**Reason**: storage is grown, not built — stable Farmland accumulates local storage capacity (see tile-stability and the food-economy delta). The Barn unit, its build option, its costs, and its adjacency bonus are removed on layered maps.

**Migration**: remove `UnitType.Barn` from the buildable set and BuildBar; `barnCapacity`/`storagePerBarn` plumbing in FoodEconomy is replaced by tenure-driven per-farm capacity; bots stop planning Barns; en.json Barn strings pruned (TranslationSystem test enforces).
