# Spec: combat-terrain

Continuous terrain in vanilla combat: slope and wetness replace the
Plains/Highland/Mountain bands. See design.md D5.

## ADDED Requirements

### Requirement: Attack cost and speed read continuous slope and wetness

`attackLogic` SHALL replace the three-band terrain-type switch with two continuous factors computed from data the sim already holds: `climb = max(0, magN(target) − avg(magN of the attacker-owned 4-neighbors of the target)))` with `magN = magnitude / 31` (uphill only — descending costs base rate), and `wetness = (humidityN + waterN) / 2`. Per-tile attacker magnitude SHALL be `baseCombatMag × (1 + kSlope·climb) × (1 + kWet·wetness)` and conquest speed SHALL be `baseCombatSpeed / ((1 + kSlope·climb) × (1 + kWet·wetness))`. All other vanilla factors — defender troop density, defense posts, large-attacker/defender debuffs, the neutral-land `mag/5` toll, fallout — SHALL be unchanged. With `kSlope = kWet = 0` the formula SHALL degrade to flat vanilla behavior at `baseCombatMag`/`baseCombatSpeed`.

#### Scenario: High ground defends itself

- **WHEN** an attacker on low terrain conquers tiles up a magnitude gradient, and the same army later attacks down the same gradient
- **THEN** the uphill tiles cost more troops and conquer slower than the downhill tiles, all other factors equal

#### Scenario: Desert highway, rainforest quagmire

- **WHEN** two otherwise-identical attacks cross a dry low-humidity region and a wet high-humidity region
- **THEN** the dry advance is cheaper and faster than the wet one

#### Scenario: Zero knobs = vanilla baseline

- **WHEN** `kSlope` and `kWet` are tuned to 0
- **THEN** every tile costs `baseCombatMag`-scaled losses at `baseCombatSpeed`-scaled speed regardless of terrain, and defender-density/post/size factors behave exactly as before

### Requirement: Combat reads only sim-legal terrain data

The slope and wetness inputs SHALL come only from packed map.bin magnitude bits and the layers.bin planes. The sim SHALL NOT read `elevation.bin` or `hydro.bin` for combat (or anything else).

#### Scenario: No new data dependencies

- **WHEN** a map loads with only its mandatory sidecars
- **THEN** combat terrain factors are fully defined with no additional file reads
