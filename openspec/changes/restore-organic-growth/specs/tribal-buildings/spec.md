# Spec: tribal-buildings

Seed-gated placement replaces food purchase (design.md D2); housing moves
to city-growth.

## MODIFIED Requirements

### Requirement: Settlement and Farmland are purchased with food

(Replaced.) Settlement and Farmland SHALL have zero cost and SHALL be gated by banked seeds (seed-ladder spec): `canBuild` fails without a seed of the type; placement consumes one. The spawn kit (one Settlement + one Farmland + `startingFood`) is pair zero and stays identical for every player type. Food is purely the famine buffer — nothing is purchased with it.

#### Scenario: Placing a seed

- **WHEN** a player with a banked farm seed places a Farmland on a valid site
- **THEN** the seed is consumed, no food is charged, and the structure begins its field

## REMOVED Requirements

### Requirement: Settlements provide housing

**Reason**: Per-settlement housing coupons caused settlement spam; housing now comes from the grown city footprint (city-growth spec). Settlements matter as city NUCLEI.
**Migration**: `housingPerSettlement` deleted (slot → `fieldGrowthRate`); housing = `housingBase + cityTiles × popPerDensity`.
