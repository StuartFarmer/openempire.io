# game-system-contract

## ADDED Requirements

### Requirement: A system self-describes how it is hosted

A `FieldSystem` SHALL support optional, JSON-safe metadata that the viewer uses
to host it: `description`, `kind` ("study" | "game"), `defaultMap`, and
`defaultView`. The viewer SHALL honor these when mounting a system (initial map,
initial view) instead of hardcoding them.

#### Scenario: A system opens on its declared defaults

- **WHEN** a system declaring `defaultMap` and `defaultView` is selected
- **THEN** the viewer mounts it on that map with that view selected, without the page hardcoding the choice

#### Scenario: Metadata stays JSON-safe

- **WHEN** the metadata fields are set
- **THEN** they are plain data (strings/enums), carrying no functions, so the manifest's data core remains serializable

### Requirement: A system owns its input mapping

A `FieldSystem` SHALL support an optional `input` hook that receives pointer and
keyboard gestures — pointer gestures already resolved to map-tile coordinates by
the viewer's camera transform — and responds by stamping a declared brush or
writing the local player's intent fields (through the `players` channel). The
viewer SHALL route input events to this hook when present, and fall back to its
default gesture handling when absent.

#### Scenario: Clicking a tile commands the local player

- **WHEN** a `game` system with an `input.onTile` hook is mounted and the user clicks a map tile
- **THEN** the hook receives the tile coordinates and writes the local player's intent (e.g. target that tile), which the system's layers read via `players::val`

#### Scenario: Brushes still work through input

- **WHEN** a system's `input.onTile` stamps a declared brush
- **THEN** the existing brush pass runs at that tile, identically to painting in the lab

#### Scenario: Systems without input keep the viewer default

- **WHEN** a system declares no `input` hook
- **THEN** the viewer applies its default gesture handling (camera pan/zoom/hover, with a plain drag stamping the active brush when one is selected), so existing systems are unchanged

### Requirement: A system owns its AI

A `FieldSystem` SHALL support an optional `ai` hook (`decide(ctx)` run on a
`cadenceTicks` schedule) that reads the current tick, scalar readbacks, and a
seeded rng, and writes each non-human player's intent fields. The viewer SHALL
invoke this hook on schedule and upload the resulting intents via
`writePlayers`. The viewer SHALL NOT contain a hardcoded bot driver.

#### Scenario: A system ships its own bots

- **WHEN** a `game` system with an `ai` hook runs
- **THEN** the viewer calls `decide` every `cadenceTicks`, the hook writes non-human players' intents, and those drive the simulation — with no system-specific bot logic in the viewer

#### Scenario: The viewer's hardcoded bot driver is gone

- **WHEN** a system without an `ai` hook runs (e.g. a `study` system with no players)
- **THEN** no bot intents are written, and the previously hardcoded `writeBots` no longer exists in the viewer

#### Scenario: AI and input share the player-intent channel

- **WHEN** both `ai` (non-human players) and `input` (local player) write intents in a frame
- **THEN** the viewer merges them into the per-player intent records and uploads them once via `writePlayers`, so WESL layers read a consistent `players` struct
