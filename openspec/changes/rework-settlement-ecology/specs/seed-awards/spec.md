# Spec: seed-awards

See `design.md` §1 for the model and rationale. Revised 2026-07-15: one
ladder, paired awards — the peak-territory farm-seed ratchet is deleted
(farm growth, §1b, makes one farm seed worth a whole district; territory's
reward is room to spread, not tokens).

## ADDED Requirements

### Requirement: Founding pairs are awarded from peak population, tapering with size

Settlements and Farmland SHALL NOT be purchasable. The player SHALL accrue banked seeds as their population high-water mark crosses a power-law ladder of thresholds: the nth crossing triggers at `basePop · n^(scalingExponent · ladderTaper)`, where `scalingExponent` is the empirically measured area↔perimeter exponent (design.md §6) and `ladderTaper` (> 1) steepens the ladder past constant-frontier-effort: awards THIN OUT as the empire grows (revised 2026-07-15 — a big nation needs ever fewer founding kits for the same achievement, and mid-game conquest captures enemy settlements and farms, supplying plots the ladder no longer must). Each crossing SHALL bank a **founding pair**: one Settlement seed AND one farm seed, together. The ratchet SHALL never re-award (population regained below the high-water mark awards nothing), and awards SHALL never be revoked by later population loss — nor shall any Settlement or field placed from them. The FIRST rung SHALL sit within the spawn kit's reach: a lone kit village (one Core, one farm nucleus, the field its labor sustains) must be able to cross it, since the kit is the only economy a player has until the first pair arrives (task 10 — at a first rung above the one-field ceiling the entire seed economy is unreachable).

#### Scenario: The spawn kit can earn the first pair

- **WHEN** a nation grows undisturbed on ordinary fertile ground with only its spawn kit
- **THEN** its population crosses the first ladder rung and banks the first founding pair

#### Scenario: A population milestone awards the pair

- **WHEN** a player's population exceeds their previous peak past the next ladder threshold
- **THEN** exactly one Settlement seed and one farm seed are added to their banks

#### Scenario: Famine does not revoke

- **WHEN** a player's population collapses after seeds were awarded (placed or not)
- **THEN** the seeds and any placed Settlements/fields remain (though the people may starve and the fields go fallow)

#### Scenario: Oscillation cannot farm awards

- **WHEN** a player's population falls and then regrows up to (but not beyond) the previous high-water mark
- **THEN** no additional seeds are awarded

### Requirement: The scaling exponent is measured, not assumed

The balance harness SHALL record a per-nation time series of `(tick, areaTiles, borderTiles, population, troops)` during bot runs, and a fitting pass SHALL estimate the area↔perimeter exponent `k` (log-log regression of `A ∝ P^k`) per map and in aggregate. The fitted value SHALL be reported (balance-notes) and checked into Config as `scalingExponent` — a measured constant consumed by the founding ladder (and available to future balance work), never a live in-sim computation.

#### Scenario: Discovering the exponent

- **WHEN** the harness runs seeded bot games on a layered map with scaling instrumentation enabled
- **THEN** it emits fitted `k` values per map and aggregate, ready to be adopted as the `scalingExponent` config constant

### Requirement: Seeds are banked and placed by the player

Awarded seeds SHALL accumulate in per-player banks (farm and Settlement counted separately — awarded together, placed independently), visible in the build UI in place of food prices. Placing a Farmland or Settlement SHALL consume one banked seed of that type and cost no food. Placement SHALL respect existing siting rules (owned, passable, mutual exclusivity with city and field tiles) plus the tile-damage gate (a damaged tile refuses placement). Banked seeds SHALL persist until spent.

#### Scenario: Placing spends a seed

- **WHEN** the player has 2 farm seeds and places a Farmland
- **THEN** the Farmland nucleus is created at no food cost and 1 farm seed remains banked

#### Scenario: No seeds, no placement

- **WHEN** the player has 0 Settlement seeds
- **THEN** the Settlement build option is unavailable until the next population milestone

### Requirement: The spawn kit is the same founding pair

The spawn starter kit SHALL be expressed through the same system: the Core is founded as today (the first "settlement"), paired with one starter farm nucleus granted via the seed system (pre-placed or pre-banked, per current spawn behavior) — there is no separate purchase path anywhere. The kit nucleus SHALL arrive with a starter FIELD (playtest 2026-07-19): pre-claimed tiles settled at their climate suitability, sized to the acreage the spawn village's own labor sustains (`startPopulation / farmersPerFieldTile` tiles, nucleus included) and grown on the best-suitability frontier, claim-viable tiles only. Without it the village's day-one capacity is one tile's yield: the population crashes toward a few hundred and the plot labor gate then locks the field at that size (the field needs people, the people need the field). Hostile ground plants fewer tiles; dead soil keeps nucleus-only scarcity.

#### Scenario: Spawning on a layered map

- **WHEN** a player spawns
- **THEN** they receive the Core plus one farm nucleus via the seed system, and no plot is ever purchasable with food afterward

#### Scenario: The starter field carries the start population

- **WHEN** a player spawns on ordinary fertile ground
- **THEN** the kit field feeds the whole starting population from tick one, and the population grows from the start rather than crashing toward a one-tile capacity
