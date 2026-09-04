## ADDED Requirements

### Requirement: Board Runtime Stores Dynamic Layers

The system SHALL provide a board runtime that stores a `BoardMap`, named dynamic tile layers, global values, entities, and systems.

#### Scenario: Create runtime from board map

- **WHEN** a caller creates a runtime for a valid `BoardMap`
- **THEN** the runtime exposes the same map
- **AND** the runtime exposes the map's existing named layers
- **AND** the runtime can store additional named typed-array layers

### Requirement: Runtime Layers Are Validated

The system SHALL reject runtime tile layers whose length does not match the board map tile count.

#### Scenario: Reject mismatched layer

- **WHEN** a caller adds a tile layer with a length different from `width * height`
- **THEN** the system throws an error naming the invalid layer

### Requirement: Systems Are Polymorphic

The system SHALL allow game modes to provide ordered systems that can handle commands, advance ticks, and expose overlays without closed effect unions.

#### Scenario: Execute systems

- **WHEN** a runtime command is dispatched and a tick is advanced
- **THEN** only systems that can handle the command receive it
- **AND** systems with tick handlers run in runtime order

### Requirement: Runtime Entities Are Sparse

The system SHALL provide a sparse entity store for dynamic objects such as buildings or units without requiring one object per tile.

#### Scenario: Store building entity

- **WHEN** a caller stores an entity with a tile reference and component data
- **THEN** the entity can be retrieved by ID
- **AND** the tile can still be represented by named typed layers separately
