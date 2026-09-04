## ADDED Requirements

### Requirement: Movement Work Jobs

Alternative expansion SHALL represent neutral tile expansion as movement work from an owned source tile into a destination tile.

#### Scenario: Expansion creates movement job

- **WHEN** the player starts expansion toward a claimable frontier tile
- **THEN** the system creates a movement job with owned source tile, neutral destination tile, owner id, troop amount, and work remaining
- **AND** the destination tile is not claimed immediately

### Requirement: Movement Work Cost

Movement jobs SHALL calculate required work from troop amount, destination terrain, settlement-distance logistics, and optional source-to-destination slope.

#### Scenario: Farther movement requires more work

- **WHEN** two movement jobs have the same troop amount and terrain but different settlement distances
- **THEN** the farther destination requires more movement work

#### Scenario: Uphill movement requires more work

- **WHEN** the destination elevation is higher than the source elevation
- **THEN** the movement job requires more work than flat movement with the same terrain and logistics cost

### Requirement: Food And Troop Throughput

Movement jobs SHALL spend food into work each tick, capped by troop throughput.

#### Scenario: Food reduces remaining movement work

- **WHEN** a movement job is active and the player has food
- **THEN** each tick spends at most the troop throughput amount of food
- **AND** the job work remaining decreases by the spent amount

#### Scenario: No food stalls movement

- **WHEN** a movement job is active and the player has no food
- **THEN** the job remains active
- **AND** work remaining does not decrease on that tick

### Requirement: Movement Completion Captures Tile

Alternative expansion SHALL capture the destination tile only after movement work completes.

#### Scenario: Completed movement captures destination

- **WHEN** a movement job's work remaining reaches zero
- **THEN** the destination tile becomes owned by the movement job owner
- **AND** the frontier can continue from the newly owned tile

### Requirement: Movement Work Playtest Visibility

The alternative sandbox SHALL expose active movement progress for playtesting.

#### Scenario: Sandbox displays active movement work

- **WHEN** an expansion movement job is active
- **THEN** the sandbox shows current movement work progress or remaining work
