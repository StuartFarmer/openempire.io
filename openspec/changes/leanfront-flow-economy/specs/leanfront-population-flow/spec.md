# Spec delta: leanfront-population-flow (leanfront-flow-economy)

## ADDED Requirements

### Requirement: Population is a per-tile field

People SHALL be stored per tile as integer counts with a per-tile fractional carry, not as a per-player total. Every per-player population figure SHALL be a reduction over that field.

A scalar population forces a distribution rule to spread it back over the map (`occupancy`, the rural split), and those rules are artifacts of the representation rather than mechanics.

#### Scenario: A player's population is a reduction

- **WHEN** a player's population is needed
- **THEN** it is the sum of the population field over tiles that player owns

### Requirement: Births are sampled per tile

Each tile SHALL draw its own births from its own population and the birth rate, giving each person an equal chance of being a parent. Below one expected birth per tick the draw SHALL still produce WHOLE people occasionally rather than fractions continuously.

#### Scenario: A small settlement grows in whole people

- **WHEN** a tile of three people has an expected birth rate far below one per tick
- **THEN** it occasionally gains one whole person, rather than continuously gaining a fraction

#### Scenario: Births concentrate where people are

- **WHEN** one region holds ten times the people of another
- **THEN** it receives about ten times the births

### Requirement: People and food flow, conservatively

People and food SHALL move between adjacent tiles by a conservative relaxation: what leaves one tile arrives at another, and nothing is created or destroyed by movement itself. People flow toward food and work, are tethered toward urban centres, and are repelled by crowding. Food flows toward unfed people.

Movement SHALL be at most one tile per tick, which at the world scale is a real migration speed. Daily COMMUTING to work is a separate mechanism (the work radius) and SHALL NOT be modelled as flow.

Flow SHALL distinguish POTENTIAL — where people want to be, combining food, urban proximity and crowding — from MOBILITY, how easily they move, combining terrain and roads. Terms belong in potential when they should change where people END UP, and in mobility when they should change only how FAST they get there. Food SHALL move on the same transport at the same base speed as people, with the ratio exposed as a tunable value.

#### Scenario: Movement conserves people

- **WHEN** the flow passes run for a tick with no births or deaths
- **THEN** the total population is unchanged

#### Scenario: Distant fertile ground is eventually settled

- **WHEN** rich unworked land lies far from any urban centre
- **THEN** people reach it slowly rather than never, because distance from a centre raises the cost of moving rather than making the destination undesirable

#### Scenario: Labor arrives where work is

- **WHEN** a fertile region is unworked and a populated region is adjacent
- **THEN** people migrate toward the unworked ground over successive ticks

### Requirement: Work is done by people on the tile, relaxed by a radius

A field tile SHALL be worked by the people on it, and a WORK RADIUS knob MAY loosen that to people within a short distance. Production SHALL be proportional to workers up to a per-tile ceiling; beyond the ceiling the district SHALL expand by planting a new tile rather than producing more from the same one.

The ceiling SHALL be DERIVED from hectares worked per farmer against the tile's area, not chosen directly, so that a later technology which raises hectares per farmer raises the ceiling without a new knob or a special case.

At the world scale a realistic radius is one to two tiles, so this is a local neighbourhood, not a global assignment.

#### Scenario: An unstaffed field produces nothing

- **WHEN** a mature field tile has no people within the work radius
- **THEN** it produces no food

### Requirement: Surplus is lost and food decays

Food SHALL decay on a per-tile timer, and any food neither eaten nor decayed SHALL be lost rather than banked. There SHALL be no storage capacity, granary or stock field. The decay timer SHALL be a per-tile value so that improved farm tiles can hold food longer without a special case.

#### Scenario: A bumper harvest does not bank

- **WHEN** a district produces far more food than its people eat
- **THEN** the excess is gone, not carried forward

### Requirement: Death is local

People SHALL die where they are, from hunger or from age. Starvation SHALL NOT be pooled across a player or divided into cohorts.

#### Scenario: A famine is where the food is not

- **WHEN** one region has no food and another has plenty, and they are far apart
- **THEN** people die in the first while the second is unaffected

### Requirement: Urban is a threshold on density, and density is housing

A tile SHALL be urban when its population density crosses a threshold, and the density value above that threshold SHALL scale development continuously from village to dense city. Housing SHALL NOT be a separate field from density.

#### Scenario: A city is dense population, not a separate structure

- **WHEN** people accumulate on a tile past the urban threshold
- **THEN** the tile becomes urban and grows more developed as density rises, with no separate housing state

### Requirement: Conquest razes the population

Capturing a tile SHALL kill the people on it. The flee fraction SHALL be zero and the raze fraction total. A partial flee/raze/transfer split is a later refinement and is deliberately not attempted at the same time as the flow model.

#### Scenario: Captured ground is empty

- **WHEN** a tile is captured
- **THEN** its population is zero immediately afterward
