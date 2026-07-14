# Spec: seed-awards

See `design.md` §1 for the model and rationale.

## ADDED Requirements

### Requirement: Farm seeds are awarded from peak territory

On layered maps, Farmland SHALL NOT be purchasable. Instead the player SHALL accrue banked **farm seeds** as their territory high-water mark (the most tiles they have ever held simultaneously) crosses configured thresholds. Losing territory SHALL NOT revoke awarded seeds, and territory reconquered below the high-water mark SHALL NOT re-award (the ratchet prevents oscillation farming).

#### Scenario: Conquest earns farm seeds

- **WHEN** a player's held-tile count exceeds their previous high-water mark past the next configured threshold
- **THEN** a farm seed is added to their bank

#### Scenario: Losing and retaking land awards nothing

- **WHEN** a player loses tiles and then reconquers back up to (but not beyond) their previous high-water mark
- **THEN** no additional farm seeds are awarded

### Requirement: Settlement seeds are awarded from peak population

On layered maps, Settlements SHALL NOT be purchasable. The player SHALL accrue banked **Settlement seeds** as their population high-water mark crosses a power-law ladder of thresholds: the nth settlement triggers at `basePop · n^scalingExponent`, where `scalingExponent` is the empirically measured area↔perimeter exponent of the game's territorial geometry (see design.md §6; measured 1.26 on 2026-07-14 — ragged real borders sit far below the circle bound of 2). Each successive settlement thereby costs a constant increment of frontier effort rather than of raw population. Once awarded, a seed (and any Settlement placed from it) SHALL NOT be revoked by later population loss — settlements are fixed awards.

#### Scenario: Population milestones award settlements

- **WHEN** a player's population exceeds their previous peak past the next ladder threshold
- **THEN** a Settlement seed is added to their bank

#### Scenario: Famine does not revoke settlements

- **WHEN** a player's population collapses after a Settlement was awarded and placed
- **THEN** the Settlement remains (though its city may recede or its people starve)

### Requirement: The scaling exponent is measured, not assumed

The balance harness SHALL record a per-nation time series of `(tick, areaTiles, borderTiles, population, troops)` during bot runs, and a fitting pass SHALL estimate the area↔perimeter exponent `k` (log-log regression of `A ∝ P^k`) per map and in aggregate. The fitted value SHALL be reported (balance-notes) and checked into Config as `scalingExponent` — a measured constant consumed by the settlement ladder (and available to future balance work), never a live in-sim computation.

#### Scenario: Discovering the exponent

- **WHEN** the harness runs seeded bot games on a layered map with scaling instrumentation enabled
- **THEN** it emits fitted `k` values per map and aggregate, ready to be adopted as the `scalingExponent` config constant

### Requirement: Seeds are banked and placed by the player

Awarded seeds SHALL accumulate in a per-player bank, visible in the build UI in place of food prices. Placing a Farmland or Settlement SHALL consume one banked seed of that type and cost no food. Placement SHALL respect existing siting rules (owned, passable, mutual exclusivity with city tiles) plus the tile-damage gate (a damaged tile refuses placement). Banked seeds SHALL persist until spent.

#### Scenario: Placing spends a seed

- **WHEN** the player has 2 farm seeds and places a Farmland
- **THEN** the Farmland is created at no food cost and 1 farm seed remains banked

#### Scenario: No seeds, no placement

- **WHEN** the player has 0 Settlement seeds
- **THEN** the Settlement build option is unavailable until the next population milestone

### Requirement: The spawn kit is expressed as seeds

On layered maps, the spawn starter kit SHALL be expressed through the same system: the Core is founded as today, and the starter Farmland allotment is granted as pre-banked (or pre-placed, per current spawn behavior) farm seeds — there is no separate purchase path anywhere.

#### Scenario: Spawning on a layered map

- **WHEN** a player spawns
- **THEN** they receive the Core plus the configured starter farm allotment via the seed system, and no plot is ever purchasable with food afterward
