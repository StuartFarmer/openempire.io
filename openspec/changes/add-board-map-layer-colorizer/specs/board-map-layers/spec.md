## ADDED Requirements

### Requirement: Board map contract

The system SHALL expose a reusable board-map data contract with required
dimensions, terrain bytes, tile state, optional named tile layers, and optional
terrain colorization.

#### Scenario: OpenFront map has no custom layers

- **WHEN** an existing OpenFront game map is adapted to the board-map contract
- **THEN** the board map SHALL expose its terrain byte buffer and tile-state
  buffer without requiring any custom layers.

#### Scenario: Alternative map supplies custom layers

- **WHEN** a board map includes a layer named `elevation`
- **THEN** consumers SHALL be able to read one layer value per tile from that
  typed array.

### Requirement: Tile layer validation

The system SHALL validate board-map terrain, state, and layer buffers before
renderer consumption.

#### Scenario: Layer length mismatch

- **WHEN** a board map layer length does not equal `width * height`
- **THEN** validation SHALL reject the map with an explicit error.

#### Scenario: Required buffer length mismatch

- **WHEN** a board map terrain or state buffer length does not equal
  `width * height`
- **THEN** validation SHALL reject the map with an explicit error.

### Requirement: Terrain colorizer hook

The system SHALL allow board maps to provide a custom terrain colorizer that
builds an RGBA terrain texture from terrain bytes and optional layers.

#### Scenario: Default OpenFront coloring

- **WHEN** no custom colorizer is supplied
- **THEN** the renderer SHALL use the existing OpenFront terrain-byte coloring.

#### Scenario: Custom layer-aware coloring

- **WHEN** a custom colorizer is supplied for a board map with an `elevation`
  layer
- **THEN** the renderer SHALL use the returned RGBA pixels for the terrain
  texture.
