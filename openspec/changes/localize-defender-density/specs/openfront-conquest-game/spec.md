# Spec: openfront-conquest-game

Delta: the tile-local troop garrison this capability already mandates becomes
concrete, and the loss blend, defender losses, and advance speed are wired to
it. See `design.md` D4–D5.

## MODIFIED Requirements

### Requirement: Combat resolves on the troop ratio

Conquest SHALL resolve on the attacker-vs-defender troop relationship, not a
fixed threshold: attacker losses SHALL scale with the defender/attacker troop
ratio and the terrain magnitude (the `within(defender/attacker, 0.6, 2) · mag`
shape from `Config.attackLogic`), and the advance rate SHALL scale as
`attackTilesPerTick` does. Where OpenFront reads per-player aggregates
(defender troops per owned tile), the game SHALL use the tile-local troop
garrison.

(Amended by `localize-defender-density`.) The tile-local troop garrison SHALL be
the `local-garrison` capability's value for the tile under attack. Specifically:

- **Attacker loss** SHALL be a configurable blend of a force-ratio term and a
  local-garrison term, `wForce · forceRatioTerm + wLocal · localTerm`, whose
  weights are configuration knobs defaulting to `0.3` and `0.7` respectively.
  The force-ratio term retains its existing global `within(defender/attacker,
  0.6, 2) · mag` shape; the local term SHALL read the tile's garrison in place
  of the defender's troops-per-owned-tile average.
- **Defender loss** per conquered tile SHALL be the tile's local garrison
  instead of the defender's troops-per-owned-tile average, so overrunning
  populated ground destroys a real share of the defender's army while sweeping
  empty ground destroys almost none.
- **Advance speed** SHALL scale by the tile's garrison ratio. Because a per-tile
  garrison and a national troop count are not the same scale, the existing
  global speed factor SHALL be *multiplied* by the mean-1 garrison ratio rather
  than having the garrison substituted for the defender's troop count — the
  naive substitution collapses the factor onto its clamp floor and would make
  conquest uniformly faster.
- The **per-tick tile budget** (`attackTilesPerTick`, driven by the width of the
  attacking front) SHALL be unchanged; locality enters through per-tile cost and
  per-tile speed only.
- All other factors — terrain magnitude and speed, defense posts, fallout,
  traitor modifiers, large-attacker and large-defender debuffs, and the
  neutral-land (`TerraNullius`) branch — SHALL be unchanged.

#### Scenario: A stronger attacker advances cheaper and faster

- **WHEN** an attacker's local force greatly exceeds the defender's tile garrison
- **THEN** it conquers at low attacker loss and high speed; when the forces are near parity, losses rise and the advance slows — matching the ratio shape

#### Scenario: The heartland costs more than the frontier

- **WHEN** the same attacker with the same troop count conquers a tile in the defender's population centre and a tile in the defender's empty owned hinterland, with terrain, defense posts, and all other modifiers held equal
- **THEN** the population-centre tile costs the attacker substantially more troops per tile than the hinterland tile

#### Scenario: The advance stalls at a city and races across open land

- **WHEN** an attack front crosses empty owned territory and then reaches a defended population centre
- **THEN** its tiles-per-tick rate is high across the empty territory and drops sharply at the population centre, rather than remaining constant

#### Scenario: Breaking an army requires reaching the people

- **WHEN** an attacker conquers a large area of the defender's empty hinterland, and separately conquers a small number of the defender's dense city tiles
- **THEN** the city tiles inflict far greater total defender troop losses than the much larger area of hinterland

#### Scenario: Neutral land is unaffected

- **WHEN** an attack expands into unowned (`TerraNullius`) land
- **THEN** its cost and speed are exactly as before this change, since no defender garrison exists

#### Scenario: Balance-neutral configuration reproduces the prior game

- **WHEN** the garrison clamp band is configured as `[1, 1]` and the blend weights as `0.6` / `0.4`
- **THEN** attacker loss, defender loss, and advance speed are identical to their pre-change values for every tile
