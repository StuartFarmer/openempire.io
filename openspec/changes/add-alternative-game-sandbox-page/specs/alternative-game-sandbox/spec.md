## ADDED Requirements

### Requirement: Alternative sandbox route

The system SHALL expose a reachable local page for alternative game development
without changing the default OpenFront landing page or game-start flow.

#### Scenario: Default page remains OpenFront

- **WHEN** a user opens the app root
- **THEN** the existing OpenFront landing/game flow SHALL remain available.

#### Scenario: Sandbox page is reachable

- **WHEN** a user navigates to the alternative sandbox route
- **THEN** the app SHALL render the alternative sandbox page.

### Requirement: Alternative board map

The sandbox SHALL create a deterministic local board map using the shared
`BoardMap` contract.

#### Scenario: Sandbox map has required buffers

- **WHEN** the sandbox creates its initial map
- **THEN** the map SHALL include terrain bytes, tile state, and optional typed
  layers with one value per tile.

#### Scenario: Sandbox map has custom coloring

- **WHEN** the sandbox map is rendered
- **THEN** terrain colors SHALL be derived through the board-map colorizer hook.

### Requirement: Local expansion simulation

The sandbox SHALL support a minimal local ownership expansion loop independent
from networking and OpenFront multiplayer transport.

#### Scenario: Expand into neighboring land

- **WHEN** the sandbox expansion step runs
- **THEN** at least one eligible neighboring land tile SHALL become owned.

#### Scenario: Water remains unowned

- **WHEN** the sandbox expansion step considers water tiles
- **THEN** water tiles SHALL remain unowned.
