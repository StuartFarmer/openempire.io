# Spec delta: food-economy (rework-settlement-ecology)

See `design.md` §4. Local food + labor; storage grows from stable farmland.

## MODIFIED Requirements

### Requirement: Farms are tended by local farmers

A Farmland's output SHALL be scaled by the labor available in its food-shed neighborhood: `output × min(1, localPopulation / farmersPerFarm)` where `localPopulation` is the population (per-tile density) within the farm's food-shed reach and `farmersPerFarm` is a configured need. The factor is a soft multiplier — an under-tended farm produces proportionally less, never zero from labor alone.

#### Scenario: An unpeopled breadbasket underproduces

- **WHEN** mature Farmland sits far from any populated city tiles
- **THEN** its effective yield is scaled down by the missing labor, regardless of climate or maturity

#### Scenario: Labor degradation is graceful

- **WHEN** half the farmers of a district die in a famine
- **THEN** its farms produce roughly half output — reduced, not collapsed to zero

### Requirement: Food feeds the farm's neighborhood

Farm output SHALL be distributed locally through the food-shed rather than pooled globally: each neighborhood's fed-ratio is computed from the food available there (local production plus local storage) against the consumption of the people living there. Births and deaths from feeding SHALL be applied through the density field of the neighborhood that ate or starved. A shortfall in one region SHALL NOT be silently covered by production in a distant one.

#### Scenario: A regional famine is regional

- **WHEN** one metro's farms are razed while another metro across the map is well-fed
- **THEN** the razed metro's population starves and its city recedes while the other thrives — visible on the map as one region receding

### Requirement: Storage is local and grown by stability

Barn-based storage SHALL be removed. Each Farmland SHALL carry local storage capacity that rises with its tenure (per tile-stability) from zero; local surplus banks into the district's capacity and local shortfall draws it down first. Spoilage/decay applies to local stocks as it did to the global stock. Captured or newly planted farmland starts with zero capacity and zero stock.

#### Scenario: Old districts weather famine

- **WHEN** a district of long-stable farms and a freshly planted district both lose a season of production
- **THEN** the old district feeds its people from deep local reserves while the young one starves quickly

#### Scenario: Conquest captures no pantry

- **WHEN** a player conquers an enemy's mature farm district
- **THEN** the tiles' tenure resets, so the captured farms hold no reserves and their storage capacity restarts from zero

### Requirement: Starvation acts faster than farm senescence

The demographic starvation time constants SHALL be faster than farm senescence and tenure decay, so a famine kills people before it kills farms — leaving hungry survivors with intact-ish infrastructure (a recoverable state), not dead farms (an unrecoverable spiral).

#### Scenario: Recovery after famine

- **WHEN** a famine ends (food production resumes) after part of the population died
- **THEN** the surviving farms are still near their pre-famine maturity and the population regrows — the death spiral has a floor
