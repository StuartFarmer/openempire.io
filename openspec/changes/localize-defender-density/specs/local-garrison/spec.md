# Spec: local-garrison

The tile-local defender garrison: a player's troops distributed over their
per-tile population field. See `design.md` D1–D3, D6–D8.

## ADDED Requirements

### Requirement: A tile's garrison is its share of the defender's army

Each owned land tile SHALL expose a **garrison ratio** — the smoothed local
population density at that tile divided by the player's own mean density over
their owned tiles (`Σ density / numTilesOwned`). The garrison defending a tile
SHALL be `(troops / numTilesOwned) · ratio`, i.e. the player's troops
distributed over where their people actually live rather than averaged over
territory. A tile at exactly the player's mean density SHALL have a ratio of 1
and therefore the same garrison the current global average produces.

#### Scenario: The heartland outdefends the frontier

- **WHEN** one player holds a dense metropolis and a large tract of empty owned steppe
- **THEN** the metro tiles report a garrison many times larger than the steppe tiles, while the player's total troop count is unchanged

#### Scenario: A uniformly settled nation is unaffected

- **WHEN** a player's population is spread evenly across every owned tile
- **THEN** every tile's ratio is approximately 1 and its garrison approximately equals `troops / numTilesOwned`

### Requirement: The garrison is smoothed over a catchment radius

The density read at a tile SHALL be smoothed over a configured catchment of
approximately 4 tiles, so a population centre projects defensive strength
past its own footprint and cannot be evaded by attacking an adjacent tile. The
smoothing SHALL be continuous across catchment boundaries — no tile adjacent to
a dense centre may read a near-zero ratio.

#### Scenario: A city cannot be sidestepped by one tile

- **WHEN** an attacker targets an undeveloped tile lying one tile outside a metropolis
- **THEN** that tile still reports a substantially elevated garrison ratio rather than the empty-land value

#### Scenario: No aliasing at catchment boundaries

- **WHEN** two adjacent tiles fall on opposite sides of an internal catchment-cell boundary, equidistant from the same population centre
- **THEN** their garrison ratios are approximately equal

### Requirement: The garrison ratio is clamped to a configured band

The ratio SHALL be clamped to a configured `[min, max]` band before use, so that
neither empty territory becomes free to take nor a population centre becomes
impossible to take. The band SHALL be a configuration knob, and setting it to
`[1, 1]` SHALL reduce every consumer to its pre-change global-average behavior.

#### Scenario: Balance-neutral configuration

- **WHEN** the clamp band is configured as `[1, 1]`
- **THEN** every tile's garrison equals `troops / numTilesOwned` and combat behaves exactly as it did before this change

#### Scenario: The ceiling binds on an extreme concentration

- **WHEN** a player's entire population occupies a handful of tiles out of thousands owned, implying a raw ratio in the hundreds
- **THEN** the reported ratio is the configured maximum, not the raw value

### Requirement: Zero population falls back to the global average

The garrison ratio SHALL be exactly 1 for every tile when a player's total
population density is zero — a player before their first urban tile, or a game
running an inert food configuration — so all dependent behavior is identical to
the pre-change global average. This case SHALL NOT divide by zero or produce a
non-finite value.

#### Scenario: Inert-food games are unchanged

- **WHEN** a game runs with no population field at all
- **THEN** every tile reports ratio 1 and combat outcomes are byte-identical to the pre-change behavior

### Requirement: The garrison field is deterministic and O(1)

The garrison field SHALL be maintained incrementally by the single writer that
sets per-tile population, in constant time per write, and SHALL be readable in
constant time per query — no per-tick rebuild and no radius scan at combat time.
All arithmetic SHALL be integer or fixed-point, with no dependence on iteration
order, so two clients simulating the same game produce identical values.

#### Scenario: Determinism across runs

- **WHEN** the same seeded game is simulated twice
- **THEN** every garrison ratio queried during combat is identical in both runs

#### Scenario: Population changes keep the field current

- **WHEN** a tile's population changes, or a tile is conquered or relinquished (both of which zero the previous owner's population there)
- **THEN** subsequent garrison queries in that neighborhood reflect the new population without any explicit rebuild step

### Requirement: Capturing a population centre weakens what remains

The garrison ratio of a population centre's remaining tiles SHALL fall as the
centre is taken, because capture zeroes the previous owner's population on the
captured tile. A defended city SHALL therefore become progressively cheaper to
conquer as it falls, rather than presenting constant resistance to the last tile.

#### Scenario: A city cracks

- **WHEN** an attacker takes the outer tiles of a metropolis and continues inward
- **THEN** the garrison on the yet-uncaptured tiles is lower than it was before the outer tiles fell
