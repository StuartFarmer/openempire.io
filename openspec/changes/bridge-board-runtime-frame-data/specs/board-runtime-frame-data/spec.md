## ADDED Requirements

### Requirement: Board Runtime Frame Bridge

The system SHALL provide a client-side bridge that converts a `BoardRuntime` into renderer-compatible frame data.

#### Scenario: Initial frame requests full upload

- **WHEN** a caller creates a bridge for a board runtime and reads the first frame
- **THEN** the frame exposes the runtime tile state
- **AND** `changedTiles` is `null`

### Requirement: Incremental Tile Deltas

The bridge SHALL report changed tile refs after runtime ticks mutate tile ownership state.

#### Scenario: Changed tile emitted

- **WHEN** a runtime tick changes one tile state value
- **THEN** the next frame includes that tile ref in `changedTiles`
- **AND** unchanged tile refs are not included

### Requirement: Sandbox Tick Loop

The alternative sandbox SHALL advance the board runtime on a timer while expansion is active.

#### Scenario: Expansion progresses after click

- **WHEN** the player has placed a start tile and clicks to expand
- **THEN** the sandbox starts ticking the runtime
- **AND** owned tile count can increase without pressing the manual Expand button
