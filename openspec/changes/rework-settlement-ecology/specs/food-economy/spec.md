# Spec delta: food-economy (rework-settlement-ecology)

See `design.md` §4. Local food + labor; storage grows from stable farmland.
Revised 2026-07-15: labor's application point moved to the farm-growth
coverage gate (see `specs/farm-growth/spec.md`) — this spec owns the POOL,
farm-growth owns the gate.

## MODIFIED Requirements

### Requirement: Fields draw labor from a local pool

Each field's labor pool SHALL be computed locally at food-shed refresh: the city-dweller population of the field's nearest-farm Voronoi cell of the shed, with surplus beyond the field's need spilling to under-covered fields of the same shed network, PLUS an equal split of the rural population (people not housed in city tiles — the bootstrap floor). The pool SHALL be consumed by the farm-growth coverage gate (`farmersPerFieldTile` per tilled tile); no separate labor multiplier SHALL apply to yield. An unpeopled region therefore underproduces because its fields cannot be tilled at their claimed extent — not because of a yield discount.

#### Scenario: An unpeopled breadbasket underproduces

- **WHEN** a large mature field sits far from any populated city tiles
- **THEN** the rural-floor pool tills only a fraction of its tiles and the rest lie fallow — output tracks the labor, regardless of climate or maturity

#### Scenario: Labor degradation is graceful in output

- **WHEN** half the farmers of a district die in a famine
- **THEN** roughly half the district's tiles stay tilled (the most mature half), so output roughly halves — reduced from the margins, not collapsed to zero

### Requirement: Food feeds the farm's region

Farm output SHALL be distributed locally rather than pooled globally. The feeding REGION is the connected component of the food-shed (cells whose floods touch share food — the shed CUTOFF, not the Voronoi seam, is the locality bound): each region's fed-ratio is computed from its own production and granaries against the people living there, with cell headcounts scaled from housing to the live population (density is housing, not headcount). People beyond every shed form the CAMP cohort, fed only by the aspatial camp stock (`baseStorage` — the spawn stake); deployed troops form the WAR cohort, fed by requisition (a production tax, then the camp, then the granaries). Starvation SHALL be computed per cohort, and urban recession SHALL prefer razing tiles of the worst-fed regions. A shortfall in one region SHALL NOT be covered by production in a disconnected or out-of-reach one.

#### Scenario: A regional famine is regional

- **WHEN** one metro's farms are razed while another metro across the map is well-fed
- **THEN** the razed metro's population starves and its city recedes while the other thrives — visible on the map as one region receding

#### Scenario: A metro eats from every farm within reach

- **WHEN** a dense city sits inside a belt of many farms whose shed floods touch
- **THEN** the whole belt feeds it as one region — the Voronoi seams between farms are labor boundaries, not dinner tables

### Requirement: Storage is local and grown by stability

Barn-based storage SHALL be removed. Each FIELD TILE SHALL carry local storage capacity that rises with its tenure (per tile-stability) from zero — a field's granary emerges from its old core tiles; local surplus banks into the district's capacity and local shortfall draws it down first. Spoilage/decay applies to local stocks as it did to the global stock. Captured or newly claimed field tiles start with zero capacity and zero stock.

#### Scenario: Old districts weather famine

- **WHEN** a district of long-stable fields and a freshly planted district both lose a season of production
- **THEN** the old district feeds its people from deep local reserves while the young one starves quickly

#### Scenario: Conquest captures no pantry

- **WHEN** a player conquers an enemy's mature farm district
- **THEN** the tiles' tenure resets, so the captured farms hold no reserves and their storage capacity restarts from zero

### Requirement: Starvation acts faster than farm senescence

The demographic starvation time constants SHALL be faster than farm senescence and tenure decay, so a famine kills people before it kills farms — leaving hungry survivors with intact-ish infrastructure (a recoverable state), not dead farms (an unrecoverable spiral).

#### Scenario: Recovery after famine

- **WHEN** a famine ends (food production resumes) after part of the population died
- **THEN** the surviving farms are still near their pre-famine maturity and the population regrows — the death spiral has a floor
