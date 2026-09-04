# Spec delta: leanfront-world-scale (leanfront-flow-economy)

## ADDED Requirements

### Requirement: The world has a physical scale, and rates derive from it

LeanFront SHALL define a spatial scale in KILOMETRES PER TILE (default 10, overridable per map) and a temporal scale of ONE TICK PER DAY. Every rate in the simulation SHALL be expressed in real units and converted, rather than tuned directly in ticks and tiles.

A knob whose value cannot be stated in real units is a knob nobody can reason about, and the current economy demonstrates the cost: its constants do not agree with each other. At one tick per day `farmGrowthRate` already implies a realistic 60–100 day growing season, while `avgLifespanTicks` implies a 100-day human lifespan and `foodShedRadius` a 180 km daily commute.

#### Scenario: A rate is stated in real units

- **WHEN** a designer sets how fast people migrate
- **THEN** it is given in km/day and converted using the map's km/tile, not chosen as tiles/tick

#### Scenario: Map scale is per map

- **WHEN** a map covers a region whose real extent differs from 10 km × its tile width
- **THEN** that map carries its own km/tile and the derived rates follow it
