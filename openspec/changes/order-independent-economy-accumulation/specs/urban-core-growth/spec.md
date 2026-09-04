# Spec delta: urban-core-growth (order-independent-economy-accumulation)

`Suitability-driven spatial growth` states the PROBABILITY each frontier tile is
chosen with, but not how the draw is realised. The implementation walks the
candidate pool accumulating weight until it passes a random draw, so which tile
comes out depends on the pool's ORDER as well as its contents — and the pool
inherited its order from the supply field's hash-map insertion sequence.

That made city growth a function of how the suitability field was BUILT rather
than of what it contains. A field with identical values in a different insertion
order grew a different city: verified by A/B'ing a game against an externally
computed supply field with bit-identical values, which produced 36/71 matching
hashes in tile-index order and 71/71 when re-inserted in the simulation's own BFS
order.

## MODIFIED Requirements

### Requirement: Suitability-driven spatial growth

The frontier tile filled each step SHALL be chosen with probability proportional to `s(x) = max(0, w_food·crop + w_water·(freshwater + w_shore·shore) + w_logi·supplyQuality − w_cong·localDensity) · min(1, wFoodShed·foodShed(x))`. The food-shed factor gates growth to fed land; the congestion term biases the front outward. Tiles the settlements cannot reach through owned land (supply quality ≈ 0) or that no farm feeds (food-shed ≈ 0) do not urbanize.

The candidate pool SHALL be placed in a canonical order — ascending tile ref — before each draw, so that for a given seed the tile selected is a function of the suitability field's CONTENTS alone. Placement SHALL NOT depend on the order in which the field or the frontier was constructed.

#### Scenario: Water and coast draw growth

- **WHEN** freshwater or shoreline tiles are within reach and fed by the food-shed
- **THEN** the city preferentially expands toward them over dry interior land of equal fertility

#### Scenario: The same field grows the same city

- **WHEN** two runs of the same seeded game are given suitability fields with identical values but built in different orders
- **THEN** both place the same tiles in the same sequence
