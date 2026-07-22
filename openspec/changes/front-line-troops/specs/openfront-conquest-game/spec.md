# Spec: openfront-conquest-game

Delta: combat resolves on the force local to the tile. See `design.md` D4.

## MODIFIED Requirements

### Requirement: Combat resolves on the troop ratio

Conquest SHALL resolve on the attacker-vs-defender troop relationship, not a
fixed threshold: attacker losses SHALL scale with the defender/attacker troop
ratio and the terrain magnitude (the `within(defender/attacker, 0.6, 2) · mag`
shape from `Config.attackLogic`), and the advance rate SHALL scale as
`attackTilesPerTick` does. Where OpenFront reads per-player aggregates
(defender troops per owned tile), the game SHALL use the tile-local troop
garrison.

(Amended by `front-line-troops`.) The **attacker** side of that ratio SHALL be
the attack's force at the tile being conquered, not the attack's global total.
The ratio shape, terrain magnitudes and speeds, defense posts, fallout, traitor
modifiers, large-attacker/large-defender debuffs, and the neutral-land
(`TerraNullius`) branch SHALL be unchanged.

#### Scenario: A stronger attacker advances cheaper and faster

- **WHEN** an attacker's local force greatly exceeds the defender's tile garrison
- **THEN** it conquers at low attacker loss and high speed; when the forces are near parity, losses rise and the advance slows — matching the ratio shape

#### Scenario: Front width no longer buys free strength

- **WHEN** an attack of a given total is spread across a wide front versus concentrated on a narrow one
- **THEN** the wide attack's per-tile force is correspondingly lower and its per-tile cost correspondingly higher, rather than every tile being priced off the undivided total
