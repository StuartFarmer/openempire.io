# Spec delta: food-economy (add-supply-lines)

## MODIFIED Requirements

### Requirement: Production comes from Farmland only

Farmland SHALL remain the only food source, now supply-gated: each farm plot's production is multiplied by its tile's supply quality in addition to its fertility and adjacency factors. Unfarmed land still produces nothing.

#### Scenario: Frontier farms underperform

- **WHEN** two identical farm plots differ only in distance to the nearest Settlement/Barn
- **THEN** the distant one produces less, per the supply-quality curve

### Requirement: Supply failures kill troops

Fighting troops SHALL pay for broken supply lines in men, not food: each tick an attack loses `floor(troops × (1 − frontQuality) × warSupplyAttrition)` troops before the survivors eat at the base war rate, where frontQuality tracks the supply quality at the attack's recently conquered tiles. A fully supplied push loses nothing; a fully unsupplied one bleeds warSupplyAttrition of its strength per tick.

#### Scenario: Overextended armies bleed out

- **WHEN** two equal armies fight equally hard, one beside its granaries and one deep in unsupplied territory
- **THEN** the distant army loses troops to attrition every tick and shrinks even while the food stock is full, while the supplied army does not
