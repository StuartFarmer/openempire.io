# Spec delta: tribal-buildings (rework-settlement-ecology)

## MODIFIED Requirements

### Requirement: Plots are placed from awarded seeds, never bought

Settlement and Farmland SHALL have no food cost; placing one consumes a banked seed of that type (per seed-awards). The build UI SHALL show banked seed counts where prices were shown. All existing siting rules stand (owned land, passability, Farmland ↔ city-tile mutual exclusivity), plus the tile-damage gate: placement on a damaged tile is refused.

#### Scenario: The BuildBar shows seeds, not prices

- **WHEN** the player opens the build UI on a layered map
- **THEN** Settlement and Farmland show banked seed counts, and each is placeable only while its count is above zero

## REMOVED Requirements

### Requirement: Barn

**Reason**: storage is grown, not built — stable Farmland accumulates local storage capacity (see tile-stability and the food-economy delta). The Barn unit, its build option, its costs, and its adjacency bonus are removed on layered maps.

**Migration**: remove `UnitType.Barn` from the buildable set and BuildBar; `barnCapacity`/`storagePerBarn` plumbing in FoodEconomy is replaced by tenure-driven per-farm capacity; bots stop planning Barns; en.json Barn strings pruned (TranslationSystem test enforces).
