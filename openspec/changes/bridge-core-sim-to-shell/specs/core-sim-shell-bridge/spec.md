# core-sim-shell-bridge

## ADDED Requirements

### Requirement: The real simulation runs in-process as the game authority

The `#shell` SHALL be able to run the real `src/core` simulation in-process
(via `createGameRunner`, without the worker, LocalServer, or HUD) as a selectable
mode, driving it one tick at a time from the viewer loop (`addTurn` +
`executeNextTick`) on the currently selected map with configurable bots and
random spawn. The cellular field games remain, reframed as ecology studies.

#### Scenario: Selecting OpenFront-live runs the sim

- **WHEN** the OpenFront-live mode is selected on a map
- **THEN** a real `GameRunner` is created for that map, the spawn phase resolves (random spawn), and each viewer tick advances the real simulation

### Requirement: The sim's ownership renders over the GPU terrain

Each tick the shell SHALL read the sim's dense per-tile owner
(`GameMap.tileStateBuffer()` masked to the owner id, indexed `y*width+x`),
upload it to a GPU `owner` field, and render an overlay that composites each
player's colour over the rendered terrain (`layers::tint`). The terrain SHALL
continue to derive on the GPU; the sim SHALL own the game state. Tile indexing
SHALL line up 1:1 with the terrain buffers (no remap).

#### Scenario: Territory appears over the real world

- **WHEN** the sim advances and players expand
- **THEN** their territory shows as coloured washes over the rendered terrain in the camera, updating each tick, aligned to the same tiles as the terrain

#### Scenario: The GPU field is not the authority

- **WHEN** OpenFront-live is running
- **THEN** the shell does NOT GPU-tick the `owner` field (it is CPU-written from the sim each tick); the field is a render conduit, not a simulation

### Requirement: Player colours are assigned by the viewer

Because the pure sim carries no colour, the shell SHALL assign a colour per
player smallID (a deterministic palette) for the overlay; unowned tiles
(smallID 0) SHALL show the terrain unchanged.

#### Scenario: Each empire is distinct

- **WHEN** several players hold territory
- **THEN** each renders in a distinct colour over the terrain, and neutral land shows the terrain with no wash
