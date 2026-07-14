# Spec: tile-damage

See `design.md` §3.

## ADDED Requirements

### Requirement: Combat damages the ground it is fought on

On layered maps, each land tile SHALL carry a **damage** value in [0,1]. Combat over a tile — a tile conquered in an attack, or that an active front passes through — SHALL add configured damage to it. Damage application SHALL be deterministic (identical on every client).

#### Scenario: A contested corridor gets battle-worn

- **WHEN** attacks repeatedly sweep back and forth over the same tiles
- **THEN** those tiles accumulate damage toward 1 while quiet tiles elsewhere stay at 0

### Requirement: Damage heals over time

Damage SHALL decay toward zero at a configured per-tick heal rate while the tile is not being fought over. Heavily damaged tiles take correspondingly long to recover.

#### Scenario: The scar fades

- **WHEN** fighting moves away from a damaged tile
- **THEN** its damage declines each tick until fully healed

### Requirement: A damaged tile is unproductive until fully healed

While a tile's damage is greater than zero it SHALL: refuse urban growth (the city CA skips it), refuse new Farmland placement, halt an existing Farmland's maturation there, and pause the tile's tenure clock (per tile-stability). Only a **fully healed** tile (damage = 0) resumes growth and can begin accruing stability.

#### Scenario: No rebuilding on smoking ground

- **WHEN** the player tries to place a Farmland on a tile with damage 0.3
- **THEN** placement is refused until the tile fully heals

#### Scenario: The city grows around the scar

- **WHEN** the urban CA would otherwise expand into a damaged frontier tile
- **THEN** it is skipped in favor of healed candidates until its damage reaches 0

### Requirement: Damage is rendered as a brown battle-worn tint

The renderer SHALL tint each damaged tile a single standard brown with intensity scaled by current damage, fading as it heals — contested areas read as battle-worn at a glance.

#### Scenario: Watching a front heal

- **WHEN** the player looks at a recently contested corridor
- **THEN** tiles show a brown tint proportional to remaining damage, fading to normal terrain as they heal
