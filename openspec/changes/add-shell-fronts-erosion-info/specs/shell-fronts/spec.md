# shell-fronts

## ADDED Requirements

### Requirement: Active fronts are coloured by force balance

The shell SHALL compute a force balance for the human's active attacks
(`outgoingAttacks()` and `incomingAttacks()`) from the human's perspective
(attacker troops vs defender troops, localized by front length) and tint the
contested border tiles between the human and each opponent: green when the
human's side dominates, white when even, red when the enemy dominates. Combat
is a per-tick grind, so the colour updates each tick as troops are bled.

#### Scenario: A winning front reads green

- **WHEN** the human is attacking with a strong troop advantage
- **THEN** the contested border with that opponent tints toward green

#### Scenario: A losing front reads red

- **WHEN** an enemy is attacking the human and dominates the front
- **THEN** that contested border tints toward red

### Requirement: Fronts show a signed troop-imbalance label

The shell SHALL render a DOM label at each active attack's front location(s)
(`clusteredPositions()`) showing the signed troop imbalance (`+N` when the
human's side is ahead, `-N` when behind), coloured to match the balance.

#### Scenario: The imbalance is legible

- **WHEN** a front is active
- **THEN** a `+N`/`-N` label sits at the front, tracking pan/zoom, and updates as
  the grind shifts the balance
