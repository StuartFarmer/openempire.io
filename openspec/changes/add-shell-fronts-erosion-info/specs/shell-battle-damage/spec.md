# shell-battle-damage

## ADDED Requirements

### Requirement: Combat tile damage renders as a battle-worn wash

The shell SHALL maintain a per-tile `damage` conduit (0..255) fed from the sim's
`packedDamageUpdates` stream (currently produced but ignored), parallel to the
`density` conduit, and render damaged tiles as a brown "battle-worn" wash over
the terrain — matching the WebGL damage overlay. The field is CPU-written each
tick and never GPU-ticked.

#### Scenario: Fought-over ground darkens

- **WHEN** a tile is conquered from another player in combat (accruing tile
  damage in the sim)
- **THEN** that tile renders with a brown battle-worn wash that fades as the
  damage heals

#### Scenario: Damage is a render conduit

- **WHEN** OpenFront-live is running
- **THEN** the `damage` field is overwritten from `packedDamageUpdates` each tick
  and is never GPU-ticked
