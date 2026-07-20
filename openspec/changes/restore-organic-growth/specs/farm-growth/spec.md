# Spec: farm-growth

Fields grow again (design.md D3) — amends simplify-food-economy's instant
footprint.

## MODIFIED Requirements

### Requirement: A farm is a fixed footprint with instant production

(Replaced.) A completed Farmland SHALL anchor a **worked field** that starts at its own tile and GROWS one tile at a time: on each growth pulse (`fieldGrowthRate × remaining` per tick, min one tile per full pulse) it adds the best-fertility frontier tile — 4-adjacent to the field, owned passable land, unclaimed by any field or city tile, within Chebyshev `farmRadius` of the nucleus; ties break on the lowest tile ref (deterministic greedy, no randomness). Production per farm SHALL be `farmOutputMilli × (Σ fertility over WORKED tiles / (255 × (2·farmRadius+1)²)) × fertilityBonus` — the growth IS the production ramp, and a fully grown field on owned land yields exactly the previous instant-footprint amount. Conquest of a worked tile removes it from the field immediately; the field regrows onto reclaimed ground. Worked tiles SHALL render as the tilled-soil plot pattern spreading from the nucleus, and the placement preview keeps showing the maximum footprint, spacing validity, and the full-field production fraction.

#### Scenario: A field ripens over time

- **WHEN** a Farmland completes on fertile owned land
- **THEN** its worked area and production climb tile by tile toward the full-footprint value instead of appearing at once

#### Scenario: Organic field shape

- **WHEN** the frontier offers a fertile riverbank and a dry slope inside the radius
- **THEN** the field claims the riverbank tiles first — the shape follows the fertility plane

#### Scenario: Conquest cuts the worked field

- **WHEN** an enemy takes worked tiles
- **THEN** production drops by exactly those tiles' fertility share on the next tick, and the field later regrows onto any reclaimed ground
