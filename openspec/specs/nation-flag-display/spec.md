# nation-flag-display Specification

## Purpose
Define deterministic flag assignment and display for shell nations without affecting simulation outcomes.
## Requirements
### Requirement: Every nation has a flag

Every nation in the `#shell` SHALL be assigned exactly one flag. The assignment SHALL follow this precedence: (1) the human's chosen flag for the human's nation; (2) an authored **specific** flag on the nation definition; (3) a pick from an authored **historical list** on the nation definition; (4) otherwise a **deterministic-random** flag drawn from the library.

#### Scenario: Human uses their picked flag

- **WHEN** the human has selected a flag on the front page and starts a game
- **THEN** the human's nation SHALL display that flag

#### Scenario: Human without a selection gets a random flag

- **WHEN** the human has no flag selected
- **THEN** the human's nation SHALL display a deterministic-random flag from the library

#### Scenario: Authored specific flag wins

- **WHEN** a nation definition specifies a single flag id
- **THEN** that nation SHALL display that flag

#### Scenario: Nation with no authored flag

- **WHEN** a nation definition has no flag field
- **THEN** that nation SHALL display a deterministic-random flag from the library

### Requirement: Historical flag list

A nation definition MAY carry a list of flag ids (e.g. a set of historical flags). When present and no more specific rule applies, the nation SHALL display one flag chosen from that list.

#### Scenario: Pick from a list

- **WHEN** a nation definition provides a list of two or more flag ids
- **THEN** the nation SHALL display exactly one flag from that list

### Requirement: Deterministic and stable assignment

Flag assignment SHALL be deterministic: the same nation (by its stable id/seed) SHALL resolve to the same flag every time within a session, and list/random picks SHALL NOT change frame-to-frame.

#### Scenario: Stable across frames

- **WHEN** a nation's label is rendered on successive frames
- **THEN** its flag SHALL remain the same image and SHALL NOT flicker or resample

#### Scenario: Reproducible for a given seed

- **WHEN** two nations resolve their random flag from the same seed input
- **THEN** they SHALL resolve to the same flag (determinism), and different seeds SHALL spread across the library

### Requirement: Flag rendered beside nation labels

The `#shell` SHALL render each nation's flag as a small image beside that nation's name in the existing DOM label surfaces: the hover nation chip and the spawn-phase nation markers. Flags of non-uniform aspect ratio SHALL be displayed at a constant height without distortion.

#### Scenario: Flag on hover chip

- **WHEN** the player hovers another nation's territory
- **THEN** the hover chip SHALL show that nation's flag image next to its name and troop count

#### Scenario: Flag on spawn markers

- **WHEN** the game is in the spawn phase
- **THEN** each nation's spawn marker SHALL show that nation's flag next to its name

#### Scenario: Missing image degrades gracefully

- **WHEN** a nation's resolved flag URL fails to load
- **THEN** the label SHALL still render the name and troops with no flag image and no layout break

### Requirement: Simulation ignores flags

The deterministic core simulation SHALL treat flags as opaque cosmetic data only: flag ids MAY be carried through nation/player data, but no simulation logic (spawning, combat, economy, win conditions) SHALL branch on a flag value.

#### Scenario: Flags do not affect the sim

- **WHEN** the same seeded game is run with and without flag data present on nations
- **THEN** the simulation outcome (tiles, troops, deaths, winner) SHALL be identical
