# Spec delta: urban-core-growth (order-independent-shed-tiebreak)

The food-shed potential is `M · decay(d)`, where `M` is the maturity of the
projecting farm. When several farms reach a tile at the same step distance the
formula is ambiguous about whose `M` applies. This delta pins it to the same
lowest-tile-ref source that owns the tile's cell, so the projected potential is
well-defined instead of implementation-defined.

## MODIFIED Requirements

### Requirement: Food-shed drives city growth

On layered maps, mature Farmland SHALL project a **food-shed** — a soft-decay potential `M · 1/(1+(d/foodShedRadius)^foodShedPower)` over owned land at step-distance `d`, separate from the military supply field. A Settlement's urban growth rate SHALL be gated by the food-shed at each candidate tile as a continuous multiplier: land with no food-shed does not urbanize; land ringed by ripe farms grows fastest. Where several farms reach a tile, `M` and `d` SHALL be those of the tile's own shed cell — the nearest farm, resolved at equal distance by lowest tile ref (per food-economy) — so the potential at a tile is a pure function of the map, the farms, and their maturities.

#### Scenario: Cities grow toward their farms

- **WHEN** one settlement sits near mature farms and another has none nearby, in the same nation
- **THEN** the fed settlement grows into a city while the unfed one stays a hamlet

#### Scenario: Equidistant farms project a defined potential

- **WHEN** a candidate tile is the same step distance from a ripe farm and a barely-planted one
- **THEN** the potential there is projected by whichever of the two has the lower tile ref, identically on every run
