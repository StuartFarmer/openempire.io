# Spec: farm-growth

Lift the footprint cap so a field grows organically without bound — amends
restore-organic-growth's Chebyshev-radius maximum.

## MODIFIED Requirements

### Requirement: A farm is a fixed footprint with instant production

(Amended.) A completed Farmland SHALL anchor a **worked field** that starts at
its own tile and GROWS organically with no footprint cap: each tick it claims
the best-fertility tiles on its 4-adjacent frontier — owned passable land,
unclaimed by any field or city tile and holding no structure — with **no
distance limit** from the nucleus, so the field flows around rivers and coasts
and keeps growing as the player's territory grows. Growth is deterministic
(best `fertility` first, ties on the lowest tile ref, no randomness), paced by
`fieldGrowthRate` and self-limited by the field's own perimeter each tick (it
cannot claim beyond its current frontier in one tick). Production per farm SHALL
be `farmOutputMilli × (Σ fertility over WORKED tiles / (255 × (2·farmRadius+1)²))
× fertilityBonus` — unchanged in form and thus *per worked tile*, so a field
larger than `(2·farmRadius+1)²` yields proportionally MORE than the old
full-footprint amount (growth keeps adding value). `farmRadius` remains only as
the production reference area and the farm-placement spacing rule (no own farm
within `2·farmRadius`); it is NO LONGER a growth bound. Conquest of a worked
tile removes it from the field immediately; the field regrows onto reclaimed
ground. Worked tiles SHALL render as the tilled-soil plot pattern.

#### Scenario: A field grows past the old footprint

- **WHEN** a Farmland sits on a large expanse of owned fertile land and runs for
  a long time
- **THEN** its worked area grows beyond `(2·farmRadius+1)²` tiles and its
  production rises above `farmOutputMilli` — the field keeps spreading rather
  than stopping at a square

#### Scenario: Organic field shape

- **WHEN** the frontier offers a fertile riverbank and a dry slope
- **THEN** the field claims the fertile tiles first and its shape follows the
  fertility plane, never a bounding box

#### Scenario: Conquest cuts the worked field

- **WHEN** an enemy takes worked tiles
- **THEN** production drops by exactly those tiles' fertility share on the next
  tick, and the field later regrows onto any reclaimed ground

#### Scenario: A structure may be placed on worked field ground

- **WHEN** a Settlement or new Farmland is placed on a tile that an unbounded
  field already works
- **THEN** the placement succeeds and that tile leaves the old farm's field
  (structures take priority so the unbounded field never blocks placement)
