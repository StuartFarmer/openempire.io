# Spec: seed-ladder

The geometric founding-pair ladder (design.md D2).

## ADDED Requirements

### Requirement: Founding pairs are awarded by a geometric peak-population ladder

Settlement and Farmland SHALL cost nothing and SHALL be placeable only by spending a banked seed of their type. Each player SHALL track a peak-population high-water mark; when it first crosses rung n at `seedLadderBase × seedLadderGrowth^(n−1)`, the player banks one founding pair (one Settlement seed + one Farmland seed). Rungs never re-award (population dips do not refund or repeat). The spawn kit is pair zero — placed structures, not banked seeds.

#### Scenario: Every next town costs double the people

- **WHEN** `seedLadderBase` is 4000 and `seedLadderGrowth` is 2 and a player's peak population reaches 4000, then 8000
- **THEN** exactly one pair is banked at each crossing (two seeds of each type total), and a dip below 8000 followed by regrowth past it awards nothing

#### Scenario: Seeds gate placement

- **WHEN** a player with zero Settlement seeds attempts to place a Settlement
- **THEN** `canBuild` rejects it; with a seed banked the placement succeeds and consumes the seed

### Requirement: The ladder is visible

The HUD and #shell build UI SHALL show banked seed counts per type and the next rung ("next pair at N"), so the ladder answers "when do I get my next town?" on screen.

#### Scenario: Progress readout

- **WHEN** a player with peak population 5412 has consumed the 4000-rung pair
- **THEN** the UI shows their seed counts and "next pair at 8000"
