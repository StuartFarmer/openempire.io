# Spec: food-allocation

## ADDED Requirements

### Requirement: Per-player food allocation share

Each player SHALL have a food allocation share in [0, 1] — the fraction of each tick's production offered to the population; the remainder banks into storage. It defaults to `defaultPopulationShare` (knob) and is set deterministically via a `food_allocation` intent (clamped to [0, 1]). Bots use the default.

#### Scenario: Setting the share

- **WHEN** a player sends a food_allocation intent with share 0.4
- **THEN** from the next tick, 40% of production feeds the population and 60% banks

### Requirement: Allocation HUD slider

On layered maps the client SHALL show an allocation slider beside the troop/food HUD (population ↔ storage), which sends the intent on change and reflects the sim's value.

#### Scenario: Banking while growing

- **WHEN** the player drags the slider toward storage
- **THEN** the stock climbs tick over tick while population growth slows — visible in the food chip's net rate

## MODIFIED Requirements (food-economy)

### Requirement: Tick order with allocation

The food tick SHALL run: production → allocation split → storage share banks (cap clamps) → storage overflow rebates to the population's share → population eats; surplus over consumption throttles growth (as today) and is NOT banked; a deficit draws from the stock first and starves only when the stock is empty.

#### Scenario: Growth no longer devours the bank

- **WHEN** a growing player produces more than the population eats with share < 1
- **THEN** the storage share accumulates every tick regardless of population growth

#### Scenario: Overflow feeds people, not the ground

- **WHEN** the stock is at capacity and the storage share would overflow
- **THEN** the overflow is added to the population's share that tick (extra growth), and the stock stays at the cap

#### Scenario: All-storage austerity

- **WHEN** share is 0 and production covers consumption
- **THEN** the population is fed from the pass-through storage draw but never grows, and the stock climbs at production − consumption; if total production + stock cannot cover consumption, starvation proceeds as usual
