# Spec delta: urban-core-growth (rework-settlement-ecology)

Playtest iteration 2026-07-19 (tasks.md §11): husk nations must leave the
map. A remnant tribe at single-digit population sits at birth/death
equilibrium (capacity ≈ population), so the exact-zero elimination never
fires — and the nation enclaving it never attacks, because the AI
reserve/trigger gates compare troops to housing-based `maxTroops`, which a
food-bound population may never reach.

## MODIFIED Requirements

### Requirement: A nation dies when its population dies

On layered maps, a player SHALL be eliminated when their entire living population (idle troops plus deployed) reaches zero — even if they still hold territory. Their land reverts to neutral. A player SHALL also be eliminated as UNVIABLE when both their living population AND their food-supported capacity fall below `minViablePopulation`: at husk scale, births and deaths balance and the population never reaches exactly zero on its own. A famine dip alone SHALL NOT eliminate a nation whose fields still carry a viable capacity — population-only dips recover.

#### Scenario: Starving to death loses the game

- **WHEN** a nation's population starves all the way to zero
- **THEN** the nation is eliminated and its territory becomes neutral, though no enemy ever conquered it

#### Scenario: A husk at equilibrium disbands

- **WHEN** a nation is reduced to a handful of people whose food base can only ever support that handful
- **THEN** the nation disbands and its land reverts to neutral, rather than haunting the map at a population that displays as zero

#### Scenario: A famine dip with live fields recovers

- **WHEN** a famine cuts a nation below `minViablePopulation` people while its mature fields still support far more
- **THEN** the nation survives and the surviving population regrows toward what the fields carry

## ADDED Requirements

### Requirement: AI nations mop up husk neighbors

An AI player (bot or nation) SHALL attack a bordering non-friendly AI neighbor it outnumbers at least 20:1 with a small dedicated force, bypassing its reserve/trigger troop-ratio gates — those gates are housing-ratio gates and a food-bound population may sit under them forever, which would leave an enclaved remnant unattacked indefinitely. At most one such mop-up attack per target SHALL be in flight at a time. Human targets SHALL be exempt: the difficulty-based protections remain the sole authority for attacking humans.

#### Scenario: An enclaved remnant is finished off

- **WHEN** a nation fully encloses a husk tribe of a few people while sitting below its own reserve troop ratio
- **THEN** it still sends a small attack that eliminates the husk

#### Scenario: Humans keep their difficulty protections

- **WHEN** the dwarfed bordering neighbor is the human player
- **THEN** no mop-up attack fires; the normal difficulty rules alone decide
