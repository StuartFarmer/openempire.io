## ADDED Requirements

### Requirement: Players produce food from owned land

The game SHALL maintain a food resource for each player and increase it during normal game ticks from the player's owned tile count.

#### Scenario: Food increases from owned tiles

- **WHEN** a player owns land during active gameplay
- **THEN** the player's food increases by `ownedTileCount * foodPerOwnedTilePerTick` according to game configuration

#### Scenario: No owned land produces no food

- **WHEN** a player owns zero tiles
- **THEN** the player produces no food from land ownership

### Requirement: Neutral expansion spends food

The game SHALL charge food when a player's attack conquers Terra Nullius land.

#### Scenario: Plains neutral tile cost

- **WHEN** a human or nation player conquers a plains Terra Nullius tile
- **THEN** the game charges `16 * neutralFoodCostScale` food by default

#### Scenario: Highland neutral tile cost

- **WHEN** a human or nation player conquers a highland Terra Nullius tile
- **THEN** the game charges `20 * neutralFoodCostScale` food by default

#### Scenario: Mountain neutral tile cost

- **WHEN** a human or nation player conquers a mountain Terra Nullius tile
- **THEN** the game charges `24 * neutralFoodCostScale` food by default

### Requirement: Neutral expansion stops without enough food

The game SHALL stop a neutral expansion attack when the attacker cannot pay the next neutral tile food cost.

#### Scenario: Insufficient food stops expansion

- **WHEN** an active attack attempts to conquer a Terra Nullius tile whose food cost exceeds the attacker's current food
- **THEN** the tile remains unconquered
- **AND** the neutral expansion attack ends

### Requirement: Player combat remains troop-based

The game SHALL keep existing player-vs-player attack troop spending and combat resolution unchanged.

#### Scenario: Attacking another player uses existing troop logic

- **WHEN** a player attack targets another player
- **THEN** the game removes and resolves troops using the existing attack behavior
- **AND** food is not charged for the player-vs-player tile conquest in this change

### Requirement: Food is visible in normal gameplay

The client SHALL show the local player's food amount and food income in the normal game HUD.

#### Scenario: Solo game food display

- **WHEN** a player starts a normal solo game
- **THEN** the HUD displays current food and food income without requiring the alternative sandbox page

#### Scenario: Food display updates

- **WHEN** food changes because of production or neutral expansion spending
- **THEN** the HUD updates to reflect the new food value
