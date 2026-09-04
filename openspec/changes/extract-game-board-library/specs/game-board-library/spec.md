## ADDED Requirements

### Requirement: Embeddable board lifecycle

The system SHALL provide a TypeScript board API that mounts the OpenFront board into a caller-provided DOM element and returns a lifecycle handle.

#### Scenario: Mount board

- **WHEN** a TypeScript consumer calls the board API with a container element and valid game start configuration
- **THEN** the system creates the input overlay, WebGL canvas, worker-backed game view, frame loop, and renderer inside that board lifecycle

#### Scenario: Dispose board

- **WHEN** the consumer calls the returned lifecycle handle's dispose method
- **THEN** the system stops animation work, releases worker/render resources, removes DOM nodes it created, and unregisters board-owned listeners

### Requirement: Local turn driving by default

The system SHALL support running the board without multiplayer networking or AI by using local turn driving as the default runtime mode.

#### Scenario: Start local board

- **WHEN** a consumer starts the board without providing a network or AI adapter
- **THEN** the system advances turns locally and accepts local player intents through the board API

### Requirement: Optional turn adapter boundary

The system SHALL expose typed boundaries for external turn sources and outgoing player intents without implementing networking or AI in the board library.

#### Scenario: External turn source plugs in

- **WHEN** a consumer provides a turn adapter that emits validated turns
- **THEN** the board processes those turns through the same worker simulation path used by local mode

#### Scenario: Player intent leaves board

- **WHEN** board input creates a player intent
- **THEN** the board emits the typed intent through the adapter boundary instead of directly depending on WebSocket, auth, or server modules

### Requirement: Product shell exclusion

The board library SHALL NOT require OpenFront product-shell modules to be present at runtime.

#### Scenario: Consumer imports board package

- **WHEN** another TypeScript project imports the board entrypoint
- **THEN** the import does not require auth, account, lobby, matchmaking, ads, store, clan, chat, leaderboard, server, or deployment modules

### Requirement: Core packaging boundary

The deterministic core package SHALL NOT import from client, renderer, HUD, or app-shell modules.

#### Scenario: Core dependency check

- **WHEN** dependency checks run against `src/core`
- **THEN** no imports from `src/client`, `src/server`, HUD, renderer, or app-shell paths are present

### Requirement: Existing app compatibility

The existing OpenFront client SHALL continue to support its current app flow while using the extracted board host internally.

#### Scenario: Existing client starts a game

- **WHEN** the current OpenFront client joins or starts a supported game mode
- **THEN** the board renders and processes turns through the extracted board host without removing the app's existing lobby, settings, and HUD behavior
