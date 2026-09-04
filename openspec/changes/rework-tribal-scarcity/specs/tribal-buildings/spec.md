# Spec delta: tribal-buildings (rework-tribal-scarcity)

## MODIFIED Requirements

### Requirement: Three new food-costed unit types

The game SHALL add `Settlement`, `Farmland`, and `Barn` unit types, buildable on owned land through the existing build intent flow, with costs paid from the player's food stock. Costs SHALL escalate with the number already constructed (linear ramp per owned unit, using the same owned-count convention as vanilla gold buildings) so each purchase is a meaningful branch decision. They SHALL be available only when the food economy is active (layered maps). On layered maps the build menu SHALL offer only food-costed units — gold-costed units are absent until later ages reintroduce their economies.

#### Scenario: Building costs food

- **WHEN** a player with sufficient food builds a Farmland
- **THEN** the food stock decreases by the configured cost and the unit is constructed

#### Scenario: Escalating cost

- **WHEN** a player who owns N Farmland queries the next Farmland's cost
- **THEN** it equals the base cost × (N + 1)

#### Scenario: Storage gates the ladder

- **WHEN** a purchase's cost exceeds the player's storage cap
- **THEN** it cannot be saved for without first raising capacity with Barns

#### Scenario: Insufficient food

- **WHEN** a player's food stock is below the cost
- **THEN** the build is rejected exactly as an unaffordable gold build is today

#### Scenario: Only food-costed units on layered maps

- **WHEN** the build menu opens in a layered game
- **THEN** it lists Settlement/Farmland/Barn (and no gold-costed units); on classic maps the vanilla menu is unchanged
