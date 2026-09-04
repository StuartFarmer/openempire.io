# Spec: front-line-troops

An attack's troops as a per-tile field over its front. See `design.md` D1–D7.

## ADDED Requirements

### Requirement: An attack's troops are distributed across its front

An attack SHALL hold its troops as a per-tile quantity over the tiles it is
currently pressing, rather than as a single total. The attack's reported troop
count SHALL remain the sum of that field, so existing readers observe no change
in meaning.

#### Scenario: The total still reads as the total

- **WHEN** an attack is created with a given number of troops
- **THEN** its reported troop count equals that number, and equals the sum of its per-tile field

#### Scenario: Troops land on the stretch that was clicked

- **WHEN** a player commits troops aimed at one stretch of their border
- **THEN** the committed troops are distributed across that stretch's frontier and no troops are placed on parts of the border outside it

### Requirement: Opposing pushes interact only where their fronts touch

Two opposing attacks between the same pair of players SHALL reduce each other
ONLY at tiles where their fronts are physically adjacent, and only by the force
each side has present at those tiles. An attack SHALL NOT be cancelled,
reduced, or deleted on the basis of the two attacks' total troop counts.

#### Scenario: Countering the far end of the border does nothing here

- **WHEN** an enemy is pushing into one end of a long shared border and the defender commits troops at the opposite end
- **THEN** the enemy's push is unchanged in troops and continues advancing, because the two fronts are nowhere adjacent

#### Scenario: Countering where they are pushing blunts them there

- **WHEN** the defender commits troops onto the stretch the enemy is actually pressing
- **THEN** the opposing forces annihilate at those tiles, bounded by the smaller of the two local forces

#### Scenario: A large army cannot erase a push it has not reached

- **WHEN** a defender counters with far more troops than the incoming push, but at a stretch that only partly touches it
- **THEN** only the touching portion of the incoming push is reduced; the untouched portion survives at full strength

### Requirement: Advance is paid for by the force at the tile

Conquering a tile SHALL draw its attacker losses from the force the attack has
at that tile, not from the attack's global total. Where an attack's local force
is insufficient, that tile SHALL NOT be conquered and the rest of the front
SHALL be unaffected.

#### Scenario: A thin stretch stalls while the rest advances

- **WHEN** one stretch of a wide front exhausts its local troops
- **THEN** that stretch stops taking tiles while the remaining stretches continue to advance

#### Scenario: Concentration beats dispersal

- **WHEN** the same total troops are committed as a narrow deep push and, in a separate comparable game, spread across a wide front
- **THEN** the narrow push takes each of its tiles at a lower troop cost than the wide one, because the per-tile force ratio is more favourable

### Requirement: Troops seep along the front

Each tick, a configured fraction of each front tile's troops SHALL be shared
with its front-adjacent neighbours, so a stalled stretch can be reinforced from
neighbouring stretches and a breakthrough can be exploited. The seep SHALL be
computed from a start-of-tick snapshot so it does not depend on iteration
order. At a seep fraction of zero the field SHALL NOT redistribute at all.

#### Scenario: A stalled stretch recovers

- **WHEN** one stretch of a front is exhausted while its neighbours hold troops
- **THEN** over subsequent ticks that stretch regains troops from its neighbours and can advance again

#### Scenario: Seep is deterministic

- **WHEN** the same seeded game is simulated twice
- **THEN** the per-tile troop field is identical at every tick in both runs

### Requirement: Setting an attack's total rescales its distribution

Setting an attack's troop total SHALL rescale the per-tile field proportionally
so the shape of the distribution is preserved and the new sum matches the value
set. When the field is empty, the troops SHALL be spread across the current
front.

#### Scenario: Retreat and merge keep working

- **WHEN** an attack's troop total is set directly, as retreat and attack merging do
- **THEN** the attack's reported total equals the value set, and its troops remain distributed rather than collapsing onto one tile
