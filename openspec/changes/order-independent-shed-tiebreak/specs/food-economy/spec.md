# Spec delta: food-economy (order-independent-shed-tiebreak)

The existing requirements speak of "the field's nearest-farm Voronoi cell of the
shed" without saying which farm owns a tile that two farms reach at the SAME step
distance. Today the answer is whichever BFS wave arrived first. This delta states
the rule instead, so cell membership is a function of the map and the farms
rather than of traversal order.

## ADDED Requirements

### Requirement: Shed cell membership is order-independent

Every tile the food-shed reaches SHALL belong to the cell of a farm at minimum
step distance from it, and when two or more farms tie at that minimum distance
the tile SHALL belong to the farm with the **lowest tile ref**. Cell membership
SHALL therefore be a pure function of the owned-land shape and the set of farm
positions — never of the order in which the flood visited tiles, of the order
farms were founded, or of any other traversal artifact. The step distance itself
is unchanged: a tile still belongs to a NEAREST farm, and this requirement only
decides among equally near ones.

#### Scenario: A tile equidistant from two farms has a defined owner

- **WHEN** a tile is the same step distance from two of the player's farms through owned land
- **THEN** it joins the cell of the farm with the lower tile ref, whichever farm was founded or flooded first

#### Scenario: Cell membership does not depend on how the shed is computed

- **WHEN** the same owned territory and the same farm positions are evaluated by two different implementations of the shed flood
- **THEN** both produce identical cell membership for every reached tile

#### Scenario: Nearest still wins over the tie-break

- **WHEN** one farm is strictly closer to a tile than another, and the closer farm has the higher tile ref
- **THEN** the tile joins the closer farm's cell — the tie-break applies only at equal distance
