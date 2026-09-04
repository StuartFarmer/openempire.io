## ADDED Requirements

### Requirement: Initial Settlement Economy

The alternative sandbox SHALL create an initial settlement for the player and produce food from that settlement each runtime tick.

#### Scenario: First placement creates settlement

- **WHEN** the player places the first owned tile in the alternative sandbox
- **THEN** that tile becomes owned by the player
- **AND** the runtime records one player settlement at that tile

#### Scenario: Settlement produces food

- **WHEN** the runtime ticks after the player has a settlement
- **THEN** the player's food stock increases by the settlement base production amount

### Requirement: Settlement Distance Logistics Cost

The alternative sandbox SHALL calculate food cost from terrain and distance from the nearest owned settlement.

#### Scenario: Farther tile costs more food

- **WHEN** two neutral land tiles have different settlement distances and the same terrain cost
- **THEN** the farther tile has a higher food cost

### Requirement: Food-Constrained Expansion

Alternative expansion SHALL spend food instead of killing troops while claiming wilderness.

#### Scenario: Expansion spends food to claim wilderness

- **WHEN** expansion claims a neutral land tile
- **THEN** the player's food stock decreases by that tile's logistics cost

#### Scenario: Expansion stops when food is insufficient

- **WHEN** the active expansion frontier has claimable tiles but the player cannot afford the next claim
- **THEN** the expansion does not claim that tile on that tick
- **AND** the expansion stops until the player starts expansion again

### Requirement: Alternative Economy HUD

The alternative sandbox SHALL show the player food stock and food production for playtesting.

#### Scenario: HUD updates as food changes

- **WHEN** food is produced or spent during sandbox ticks
- **THEN** the sandbox displays the updated food stock and food per tick

### Requirement: Farm Building

The alternative sandbox SHALL allow the player to build farms on owned land tiles by spending food.

#### Scenario: Farm increases food production

- **WHEN** the player builds a farm on an owned land tile and has enough food
- **THEN** the farm is recorded on that tile
- **AND** the player's food per tick increases
- **AND** the player's food stock decreases by the farm cost

#### Scenario: Farm build fails without food

- **WHEN** the player attempts to build a farm without enough food
- **THEN** no farm is recorded
- **AND** the player's food stock is unchanged

### Requirement: Additional Settlement Building

The alternative sandbox SHALL allow the player to build additional settlements on owned land tiles by spending food.

#### Scenario: Settlement reduces local logistics distance

- **WHEN** the player builds a settlement on an owned land tile and has enough food
- **THEN** the settlement is recorded on that tile
- **AND** the settlement distance layer is recalculated from all settlements
- **AND** the player's food stock decreases by the settlement cost

### Requirement: Alternative Build Controls

The alternative sandbox SHALL provide build controls for farms and settlements.

#### Scenario: Build mode click creates building

- **WHEN** the player selects a build mode and clicks an owned land tile
- **THEN** the sandbox attempts to build the selected building type at that tile
- **AND** the HUD updates food production and building counts
