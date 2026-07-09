# Spec delta: food-economy (add-supply-lines)

## MODIFIED Requirements

### Requirement: Production comes from Farmland only

Farmland SHALL remain the only food source, now supply-gated: each farm plot's production is multiplied by its tile's supply quality in addition to its fertility and adjacency factors. Unfarmed land still produces nothing.

#### Scenario: Frontier farms underperform

- **WHEN** two identical farm plots differ only in distance to the nearest Settlement/Barn
- **THEN** the distant one produces less, per the supply-quality curve

### Requirement: Consumption scales with activity

Fighting troops SHALL additionally pay a supply-line penalty: a land attack's effective fighting rate is multiplied by `1 + (1 − frontQuality) × warSupplyPenalty`, where frontQuality tracks the supply quality at the attack's recently conquered tiles. A fully supplied push pays the base war rate; an overextended one pays up to the knob-capped multiple — and starves in the field, since starvation already reaches deployed troops.

#### Scenario: Overextended armies starve

- **WHEN** two equal armies fight equally hard, one beside its granaries and one deep in unsupplied territory
- **THEN** the distant army consumes meaningfully more food per tick and shrinks first when the stock runs dry
