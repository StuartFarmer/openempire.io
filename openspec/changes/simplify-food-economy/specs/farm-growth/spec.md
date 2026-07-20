# Spec: farm-growth

Farms as fixed-radius footprints with fertility-scaled production.
Replaces the farm CA, maturation, and labor coverage. See design.md D2.

## ADDED Requirements

### Requirement: A farm is a fixed footprint with instant production

A completed Farmland SHALL work the Chebyshev square of radius `farmRadius` around its tile. Its per-tick production SHALL be `farmOutputMilli × (Σ fertility over OWNED land tiles in the footprint / footprintArea) × fertilityBonus` — unowned, water, and impassable tiles contribute zero but still count in the divisor. Production SHALL be at full rate from the tick the structure completes: no maturation, no senescence, no labor gating, and no per-tile field state. Losing territory inside a footprint SHALL reduce that farm's output immediately; a Farmland whose tile is conquered is subject to the structure-razing rule (tribal-buildings).

#### Scenario: Output follows the land

- **WHEN** two farms of equal radius sit on land averaging 0.8 and 0.4 fertility
- **THEN** the first produces twice the second, every tick, from completion

#### Scenario: Conquest cuts into a footprint

- **WHEN** an enemy conquers a third of the owned tiles inside a farm's footprint
- **THEN** that farm's production drops by that third's fertility share on the next tick

### Requirement: Farms cannot overlap and the footprint is previewed

A Farmland SHALL NOT be placeable within Chebyshev distance `2 × farmRadius` of an own existing Farmland — overlap is prevented at placement, never resolved at runtime. During placement the client SHALL outline the exact footprint under the cursor, tint its tiles by fertility, and indicate an invalid site (spacing, unowned nucleus, water) before the click.

#### Scenario: Hover shows what you get

- **WHEN** the player selects Farmland placement and moves the cursor
- **THEN** the footprint outline and its fertility tint follow the cursor, and an invalid site renders in a distinct error state

#### Scenario: Spacing enforced

- **WHEN** the player attempts to place a Farmland 4 tiles from their own farm at `farmRadius = 3`
- **THEN** the placement is rejected client-side and by `canBuild` in the sim

## REMOVED Requirements

### Requirement: Farm maturation (Gompertz × GDD × AquaCrop × Liebig)

**Reason**: Eleven knobs of invisible non-linearity; the min() of staves plus double-counted soil produced the ~cropN² spawn lottery.
**Migration**: Baked fertility (tile-fertility spec) × instant production above.

### Requirement: Fields grow as a cellular automaton (plots, credit, claim thresholds)

**Reason**: Field size was an emergent product of credit pacing × labor × suitability that neither player nor bot could plan around.
**Migration**: The fixed footprint above; the tilled-soil paint may fill in over time as pure presentation.

### Requirement: Labor coverage gates tilling

**Reason**: The population↔agriculture death spiral required three separate patches to keep bots alive; it produced failure loops, not decisions.
**Migration**: Deleted; population interacts with farms only through eating and buying.
