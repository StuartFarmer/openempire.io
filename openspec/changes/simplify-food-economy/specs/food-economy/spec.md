# Spec: food-economy

The simplified national food economy: one pool, one logistic population,
food as build currency. Replaces the district/requisition/demographics
model of rework-settlement-ecology and its ancestors. See design.md D3/D4.

## ADDED Requirements

### Requirement: One national food pool

Each player SHALL have exactly one food stock. Per tick, in order: farm production is added; `population × idleConsumptionMilli` is subtracted, draining the pool to (but never below) zero on shortfall; the pool is capped at `granaryBase + granaryPerFarm × completedFarms`, discarding overflow. Structure purchases with `costResource: food` draw from the same pool. There SHALL be no district or regional stocks, no requisition, no storage decay, and no per-cohort feeding — deployed troops consume nothing beyond the normal population rate.

#### Scenario: The granary is the famine buffer

- **WHEN** a player's population exceeds what production feeds while the pool holds food
- **THEN** the pool drains to cover the shortfall and the population does not shrink until the pool is empty

#### Scenario: War costs people, expansion costs food

- **WHEN** a player attacks and simultaneously buys a Farmland
- **THEN** the attack consumes troops only (per-tile combat losses) and the purchase consumes food only — neither draws on the other currency

### Requirement: Population follows one logistic toward min(food, housing)

Population SHALL move toward `target = min(productionMilli / idleConsumptionMilli, housing)` where `housing = housingBase + housingPerSettlement × completedSettlements`. Below target it SHALL grow by `popGrowthRate × pop × (1 − pop/target)` per tick; above target with an empty pool it SHALL decline by `popDeclineRate × (pop − target)` per tick, with `popDeclineRate > popGrowthRate`. Fractional flows SHALL accumulate in a single deterministic integer milli-population credit per player. Troops remain the population (`maxTroops = housing`); vanilla gold-driven troop regeneration stays disabled. A player whose population reaches zero dies as today.

#### Scenario: Growth approaches the ceiling and holds

- **WHEN** a fed player idles with housing above food capacity
- **THEN** population rises along an S-curve to food capacity and stays there without overshoot-and-crash oscillation

#### Scenario: Famine bites faster than recovery

- **WHEN** a player loses half their farms with an empty granary
- **THEN** population falls toward the new target at a visibly faster rate than it later regrows after the farms are replaced

#### Scenario: Housing binds

- **WHEN** food capacity exceeds housing
- **THEN** population stops at housing, and building a Settlement raises the ceiling immediately

## REMOVED Requirements

### Requirement: Food is local (shed districts, regions, local granaries)

**Reason**: Per-district production/stocks/fed-ratios were invisible to the player — local famine read as random shrinkage. See design.md Context.
**Migration**: One national pool (above). `FoodShed` and all district state deleted.

### Requirement: War requisition and war starvation

**Reason**: Three overlapping death channels for deployed troops (attrition, requisition shortfall, war starvation) made battle outcomes unreadable.
**Migration**: Deployed troops eat at the normal rate from the national pool; combat losses come only from vanilla per-tile attrition (see combat-terrain).

### Requirement: Credit-based demographics (births, deaths, starvation, lifespan)

**Reason**: Six knobs and four accumulators to produce "population rises when fed, falls when not" — replaced by a single legible logistic.
**Migration**: The logistic requirement above; `minViablePopulation` husk rule dropped (no birth/death equilibrium exists under a pure logistic).

### Requirement: Natural land harvest

**Reason**: Dormant knob (default 0) with no surviving role; fertility + farms are the only production path.
**Migration**: Deleted with the fertilitySum bookkeeping.
