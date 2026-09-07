## ADDED Requirements

### Requirement: Every selectable variant is a complete game

Every variant exposed by the game selector SHALL implement the universal game-experience contract. A renderer, study, or simulation that lacks any mandatory lifecycle capability SHALL NOT appear as a selectable game variant.

#### Scenario: Complete game is selectable

- **WHEN** a registered variant supplies the universal lifecycle and its backend mapping
- **THEN** the shell SHALL expose it in the game selector

#### Scenario: Study is not presented as a game

- **WHEN** Terrain, Grazing, Settlement, or another non-match system lacks the universal lifecycle
- **THEN** the shell SHALL exclude it from the game selector while allowing its code to remain available to development tooling

#### Scenario: Field game cannot omit its experience mapping

- **WHEN** a GPU field system is registered as a playable game
- **THEN** its registration SHALL provide the required spawn, player, statistics, feedback, and interaction mappings

### Requirement: Games start in the game view automatically

Selecting, loading, or restarting any game SHALL initialize its backend, select its declared match view, start its simulation automatically, and enter the spawn phase without requiring the player to choose a view, brush, or Play control.

#### Scenario: Worker game starts automatically

- **WHEN** a worker-backed game finishes loading
- **THEN** its worker SHALL run, its match view SHALL be visible, and the spawn prompt SHALL be active

#### Scenario: GPU game starts automatically

- **WHEN** a GPU-backed game finishes loading
- **THEN** its field loop SHALL run, its match view SHALL be visible, and the spawn prompt SHALL be active

#### Scenario: Restart repeats startup

- **WHEN** the player restarts a game
- **THEN** the backend and common presentation state SHALL reset and the game SHALL return to its automatic spawn flow

### Requirement: Every game uses click-to-place spawning

During the spawn phase, every game SHALL prompt the player to click a valid land tile to place their base. The shell SHALL send that choice through the selected game's native command path and SHALL remain in the spawn phase until the backend accepts it.

#### Scenario: Valid spawn is accepted

- **WHEN** the player clicks a valid land tile during spawning
- **THEN** the backend SHALL place the player's base and the common experience SHALL leave the spawn phase

#### Scenario: Invalid spawn is rejected

- **WHEN** the player clicks water, an occupied tile, or another invalid spawn target
- **THEN** the game SHALL remain in the spawn phase and SHALL show rejection feedback

#### Scenario: Spawn uses backend-native authority

- **WHEN** a spawn command is issued
- **THEN** a worker game SHALL validate it in its worker and a GPU game SHALL validate/apply it through its field command path without creating a second authoritative simulation

### Requirement: Accepted spawn triggers the common camera transition

After the player's spawn is accepted, every game SHALL fly the camera to the accepted base anchor and perform the existing mask transition into the running match.

#### Scenario: Camera transitions after acceptance

- **WHEN** the backend reports an accepted spawn anchor
- **THEN** the shell SHALL animate toward that anchor and fade the mask into the match

#### Scenario: GPU acceptance is not delayed by aggregate sampling

- **WHEN** a GPU simulation batch accepts the player's spawn
- **THEN** the shell SHALL consume the bounded spawn output immediately after that batch completes
- **AND** SHALL NOT wait for the periodic statistics readback

#### Scenario: Rejection does not transition the camera

- **WHEN** a spawn attempt is rejected
- **THEN** the camera SHALL remain in spawn presentation and SHALL NOT mark itself centered on the rejected tile

### Requirement: Nations have shared identity presentation

Every participating nation SHALL have a stable display name, territory color, border color, and flag for the duration of a match. AI spawn anchors SHALL be shown during spawning, and nation identity SHALL be available on hover after spawning.

#### Scenario: Every game presents the map's AI nations

- **WHEN** any game enters its spawn phase
- **THEN** it SHALL present exactly the nations declared by the selected map manifest
- **AND** each nation SHALL spawn at its literal manifest coordinate without game-mode-specific placement or jitter

#### Scenario: Authored nation centers are playable

- **WHEN** a generated map authors a nation coordinate
- **THEN** that literal coordinate SHALL be passable dry land in the map and hydro data
- **AND** invalid coordinates SHALL be corrected in the map source rather than relocated by a game mode at runtime

### Requirement: Match presentation is shared exactly

Every game SHALL use the same territory palette, ownership borders, attack-source highlight, city/farm plot rendering, and post-spawn brightness mask as OpenFront Live wherever that presentation applies. A backend SHALL adapt its state into the shared presentation rather than approximate those visuals in a separate shader.

#### Scenario: GPU territory presentation matches Live

- **WHEN** a GPU-backed game renders ownership, plots, an attack target, or the accepted-spawn transition
- **THEN** it SHALL use the shared Live palette, border, plot sprite, segment highlight, and mask implementation

#### Scenario: Tick readout advances with completed simulation work

- **WHEN** a GPU-backed game completes ordinary fixed-clock ticks
- **THEN** its displayed tick SHALL advance with those completed batches rather than waiting for an aggregate readback interval

#### Scenario: Hover identifies a nation

- **WHEN** the player hovers a tile owned by another participating nation
- **THEN** the hover presentation SHALL show that nation's name, flag, color treatment, and available tile/nation statistics

#### Scenario: Identity remains cosmetic

- **WHEN** names, colors, or flags are assigned
- **THEN** those values SHALL NOT change simulation outcomes

### Requirement: Match controls are universal

Every game SHALL expose pause/resume, turbo, and restart controls. Controls for optional mechanics SHALL appear only when the selected game supports those mechanics.

#### Scenario: Pause and resume use the active backend

- **WHEN** the player toggles pause or resume
- **THEN** the shell SHALL control the selected backend's tick loop and keep the displayed state coherent

#### Scenario: Turbo uses the active backend

- **WHEN** the player enables or disables turbo
- **THEN** the selected backend SHALL change its supported tick rate without switching authority

#### Scenario: Unsupported optional control is hidden

- **WHEN** a game uses a fixed AI roster and cannot change bot count
- **THEN** the shell SHALL omit the bot-count control while retaining all mandatory match controls

### Requirement: The common HUD adapts to each game's resources and actions

Every game SHALL use the shared HUD structure for spawn state, player state, resource rows, commitment/action controls, and defeat state. The selected game SHALL supply the labels and values; the common layer SHALL NOT require OpenFront-specific resources or actions.

#### Scenario: LeanFront Simple resource HUD

- **WHEN** the player is running LeanFront Simple after spawning
- **THEN** the HUD SHALL show people, food/energy, relevant tile totals, and the food commitment/action controls supplied by that game

#### Scenario: OpenFront keeps richer content

- **WHEN** the player is running OpenFront Live
- **THEN** the same HUD surface SHALL retain the resources, build actions, and attack controls supported by OpenFront

#### Scenario: Defeated player sees defeat state

- **WHEN** the active backend reports that the local player is no longer alive
- **THEN** the common HUD SHALL display the defeat state and SHALL prevent invalid player actions

#### Scenario: LeanFront Simple opens with playable whole units

- **WHEN** a LeanFront Simple match creates its initial level-one city and farm
- **THEN** each tile SHALL start with 10 units and a capacity of 100
- **AND** ordinary farm growth SHALL make the 15-food farm action affordable within four ticks
- **AND** the HUD and tile hover SHALL present people, food, and capacity as whole units while the simulation retains internal precision

### Requirement: Statistics and history work for every game

Every game SHALL expose the common statistics/history surface using its declared bounded statistics. Sampling history SHALL be presentation-only and SHALL NOT become authoritative simulation state.

#### Scenario: GPU history uses aggregates

- **WHEN** statistics/history are displayed for a GPU game
- **THEN** the shell SHALL sample declared per-player or global aggregates and SHALL NOT read back full simulation planes

#### Scenario: Statistics reset with the match

- **WHEN** the player restarts or switches games
- **THEN** the common statistics and history SHALL be cleared before the next match begins

### Requirement: Rejection and outcome feedback are universal

Every game SHALL surface rejected spawn, attack, build, paint, or raze commands through the common feedback area when the backend can determine a rejection. Backend errors SHALL not silently leave the UI in a successful state.

#### Scenario: Rejected action is visible

- **WHEN** a backend rejects an attempted game action
- **THEN** the shell SHALL present a stable human-readable rejection and SHALL preserve the authoritative state

#### Scenario: Successful action clears stale rejection

- **WHEN** a later action succeeds or the match restarts
- **THEN** stale rejection feedback SHALL be cleared

### Requirement: Hover and attack-target feedback work for every game

Every game SHALL provide tile-hover identity and appropriate valid/invalid target feedback for its supported actions. A GPU game SHALL satisfy hover through bounded queries or already-available aggregates, not a full CPU mirror of its fields.

#### Scenario: Valid attack target is highlighted

- **WHEN** the player hovers a tile that the selected game permits as an attack target
- **THEN** the shell SHALL show that it is actionable and SHALL identify the target nation when owned

#### Scenario: Invalid target is distinguished

- **WHEN** the player hovers a tile that cannot receive the current action
- **THEN** the shell SHALL visibly distinguish it from a valid target

#### Scenario: GPU hover remains bounded

- **WHEN** hover feedback is requested from a GPU game
- **THEN** the implementation SHALL query only the hovered tile or bounded presentation data and SHALL NOT maintain a CPU copy of the simulation planes

### Requirement: Simulation backends remain independent

The universal experience SHALL standardize lifecycle and presentation only. Worker-backed games SHALL remain worker-authoritative, and GPU-backed games SHALL remain GPU-authoritative and intent-driven.

#### Scenario: Worker state stays in the worker

- **WHEN** OpenFront Live or original LeanFront runs
- **THEN** its existing worker SHALL own simulation state and send presentation frames through its protocol

#### Scenario: GPU state stays on the GPU

- **WHEN** LeanFront Simple or another GPU game runs
- **THEN** its fields SHALL remain GPU-resident and the CPU SHALL send compact intents and receive only bounded presentation data

#### Scenario: Common UI does not imply common simulation

- **WHEN** two games render the same spawn prompt, controls, or HUD structure
- **THEN** neither game SHALL execute, mirror, or synchronize the other backend's simulation model
