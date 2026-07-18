# openfront-conquest-game

## ADDED Requirements

### Requirement: Terrain sets the conquest cost (OpenFront terrain typing)

The `conquest` game SHALL derive each tile's terrain type from the terrain
base's elevation using OpenFront's thresholds (low → Plains, mid → Highland,
high → Mountain) and apply OpenFront's per-type defense magnitude (Plains 80,
Highland 100, Mountain 120) and advance speed (16.5, 20, 25). Higher ground
SHALL be harder and slower to conquer than plains, using those numbers.

#### Scenario: Mountains resist, plains fall

- **WHEN** an attack of equal force presses a Mountain tile and a Plains tile
- **THEN** the Plains tile is taken faster and at lower attacker cost than the Mountain tile, in the ratio OpenFront's magnitudes/speeds imply

### Requirement: Combat resolves on the troop ratio

Conquest SHALL resolve on the attacker-vs-defender troop relationship, not a
fixed threshold: attacker losses SHALL scale with the defender/attacker troop
ratio and the terrain magnitude (the `within(defender/attacker, 0.6, 2) · mag`
shape from `Config.attackLogic`), and the advance rate SHALL scale as
`attackTilesPerTick` does. Where OpenFront reads per-player aggregates
(defender troops per owned tile), the game SHALL use the tile-local troop
garrison.

#### Scenario: A stronger attacker advances cheaper and faster

- **WHEN** an attacker's local force greatly exceeds the defender's tile garrison
- **THEN** it conquers at low attacker loss and high speed; when the forces are near parity, losses rise and the advance slows — matching the ratio shape

### Requirement: Population→troops economy bounded by the terrain

Population SHALL grow on owned land toward the terrain's carrying capacity
(from the base's climate — warmth × moisture × fertility), and troops SHALL
mobilize from population toward that capacity; a conquered tile SHALL start with
a garrison carved from the winning pressure. So fertile, temperate land raises a
bigger army than desert or ice — capacity comes from the terrain, not raw area.

#### Scenario: Fertile land fields a bigger army

- **WHEN** two equal territories differ only in the terrain climate under them
- **THEN** the one on fertile, temperate, watered land grows more population and more troops than the one on barren or frozen land

### Requirement: The conquest combat is the game's own, not shared

The terrain-typed cost and troop-ratio formulas SHALL live in the `conquest`
game's own `lib/`, not in `shared::` (a game's combat rules are system-specific).

#### Scenario: Combat stays with the game

- **WHEN** the conquest game is authored
- **THEN** its combat helpers are in `conquest/lib/`, and `shared::` gains no conquest/combat module
