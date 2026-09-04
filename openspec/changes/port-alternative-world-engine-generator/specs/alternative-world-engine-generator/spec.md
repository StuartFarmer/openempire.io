## ADDED Requirements

### Requirement: Alternative World-Engine BoardMap

The alternative game SHALL provide a world-engine map generator that returns a valid `BoardMap` with OpenFront-compatible terrain bytes and named per-tile data layers.

#### Scenario: Generate deterministic world-engine map

- **WHEN** the caller creates two alternative world-engine maps with the same width, height, and seed
- **THEN** both maps expose the same terrain bytes
- **AND** both maps expose the same generated terrain colors
- **AND** every named per-tile layer has exactly `width * height` entries

### Requirement: Foundation-Equivalent Terrain Colors

The alternative world-engine map SHALL expose a `BoardMap.colorizer` that returns the same RGBA terrain color buffer produced by the ported world-engine colorizer.

#### Scenario: Render generated colors through BoardMap

- **WHEN** the client renders an alternative world-engine `BoardMap` through `buildBoardMapTerrainRGBA`
- **THEN** the returned RGBA buffer matches the generated world-engine terrain colors byte-for-byte

### Requirement: Sandbox Uses World Engine

The alternative sandbox SHALL create and reset maps through the world-engine map path.

#### Scenario: Reset sandbox map

- **WHEN** the sandbox resets the alternative map
- **THEN** it replaces the active generated map
- **AND** subsequent rendering uses the replacement map's colorizer and layers
