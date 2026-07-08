# Spec delta: food-economy (add-tile-painted-structures)

## MODIFIED Requirements

### Requirement: Production comes from fertile owned land and Farmland

Farmland SHALL remain the primary food source, now as many small plots: each Farmland plot contributes production proportional to its anchor tile's crop byte, multiplied by its adjacency factor (see tribal-buildings). Natural land harvest stays marginal and sublinear (`fertilitySum^exponent`). Settlement capacity and Barn storage sums SHALL likewise apply each plot's adjacency factor.

#### Scenario: District arithmetic

- **WHEN** a farm plot has N edge-adjacent farm plots
- **THEN** its production is base × (1 + N × adjacencyBonus)
