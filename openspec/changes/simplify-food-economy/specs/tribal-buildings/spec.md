# Spec: tribal-buildings

Structures in the simplified economy: bought with food, housing from
Settlements, city painting as pure presentation. See design.md D3/D6.

## ADDED Requirements

### Requirement: Settlement and Farmland are purchased with food

Settlement and Farmland SHALL be buildable structures with `costResource: food`, paid from the national pool at placement. There SHALL be no seed awards, no ladders, and no free structures beyond the spawn kit. The spawn kit SHALL place one Settlement and one Farmland at spawn plus `startingFood`, so the opening is identical for every player.

#### Scenario: Buying a farm

- **WHEN** a player with sufficient food places a Farmland on a valid site
- **THEN** the cost is deducted from the pool and the structure begins construction; with insufficient food the placement is rejected

#### Scenario: The opening

- **WHEN** any player spawns
- **THEN** they hold `startPopulation` people, `startingFood` food, one Settlement, and one Farmland

### Requirement: Settlements provide housing

Each completed Settlement SHALL add `housingPerSettlement` to the player's population ceiling above `housingBase`. Housing is the only Settlement mechanic — no supply projection, no growth pacing, no tenure.

#### Scenario: Housing-bound growth

- **WHEN** a player's population sits at the housing ceiling with food to spare
- **THEN** completing a Settlement lets the logistic resume toward the food capacity

### Requirement: Conquest razes structures; land is always usable

When a tile holding a structure is conquered in an attack on another player, the structure SHALL be razed with probability `capturedPlotRazeChance` (else captured). Conquered land itself SHALL be immediately usable — no damage state, no healing timers, no frozen production.

#### Scenario: Scorched structures, clean land

- **WHEN** an attacker overruns a defender's farm district
- **THEN** structures raze or capture per the chance roll, and the attacker can build on any conquered tile the same tick

### Requirement: The city footprint is presentation only

The sim MAY maintain a per-tile density plane painting each Settlement's visual footprint (sized `population / popPerDensity` tiles, grown contiguously by a fertility/water prettiness score) for the renderer. NOTHING in the sim SHALL read this plane — it has no effect on housing, production, combat, placement, or any other rule. The player never paints tiles.

#### Scenario: Zero feedback

- **WHEN** the density painter is disabled entirely
- **THEN** every sim-observable outcome (population, food, combat, purchases) is unchanged

## REMOVED Requirements

### Requirement: Seed-placed structures (awarded seeds spent on placement)

**Reason**: The award ladder replaced purchasing to pace founding, but needed a taper exponent and rung retunes just to avoid being inert; direct food cost is self-pacing and legible.
**Migration**: `costResource: food` purchases above; seed banks and award state deleted (see seed-awards spec).

### Requirement: Barn storage structures

**Reason**: Storage is a granary formula (`granaryBase + granaryPerFarm × farms`), not a building, in the simplified model.
**Migration**: Barn stays a dormant defined unit like other gold-cost units; it grants nothing.
