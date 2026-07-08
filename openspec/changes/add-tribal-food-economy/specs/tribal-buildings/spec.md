# Spec: tribal-buildings

## ADDED Requirements

### Requirement: Three new food-costed unit types

The game SHALL add `Settlement`, `Farmland`, and `Barn` unit types, buildable on owned land through the existing build intent flow, with costs paid from the player's food stock (not gold). They SHALL be available only when the food economy is active (layered maps) and SHALL NOT appear in the build menu otherwise. Existing unit types and their gold costs are unchanged.

#### Scenario: Building costs food

- **WHEN** a player with sufficient food builds a Farmland
- **THEN** the food stock decreases by the configured cost and the unit is constructed

#### Scenario: Insufficient food

- **WHEN** a player's food stock is below the cost
- **THEN** the build is rejected exactly as an unaffordable gold build is today

#### Scenario: Hidden on classic maps

- **WHEN** a game runs on an unlayered map
- **THEN** none of the three types is buildable or listed

### Requirement: Settlement raises the population cap

Each Settlement SHALL raise its owner's maximum population by a configured amount; base cap without Settlements is a knob. On layered maps this cap SHALL replace the vanilla territory/City-driven max-troops curve.

#### Scenario: Cap scales with Settlements

- **WHEN** a player builds a second Settlement
- **THEN** max population increases by exactly the per-Settlement amount

#### Scenario: Losing a Settlement

- **WHEN** a Settlement is destroyed or captured
- **THEN** the former owner's cap drops accordingly (captured Settlements count for the conqueror)

### Requirement: Farmland raises production, not storage

Farmland SHALL add production scaled by its tile's crop byte (per `food-economy`) and SHALL NOT affect the storage cap.

#### Scenario: Farmland with full barns

- **WHEN** a player at storage cap builds Farmland
- **THEN** production rises but the effective stock stays capped (surplus overflows)

### Requirement: Barn raises storage, not production

Each Barn SHALL raise the storage cap by a configured amount; base storage without Barns is a knob. Barns SHALL NOT affect production.

#### Scenario: Barn absorbs surplus

- **WHEN** a player whose surplus previously overflowed builds a Barn
- **THEN** subsequent surplus accumulates up to the new higher cap

### Requirement: Bots build Tribal structures

On layered maps, nation bots SHALL build Settlements, Farmland, and Barns with a simple heuristic (favoring fertile tiles for Farmland) so bot economies exercise the same rules as players.

#### Scenario: Bot economy participates

- **WHEN** a seeded singleplayer game runs on a layered map with nation bots
- **THEN** bots construct Tribal buildings and their populations obey the same food rules
