## ADDED Requirements

### Requirement: Explicit complete opening kit

Every accepted spawn SHALL create one city and one farm on distinct legal owned cells, with initial balances of 4000 food and 2000 troops clamped to capacity. A city SHALL use the Settlement plot type, not the legacy gold City. Kit plots SHALL be level one, fully functional, and free. Impossible kit placement SHALL reject before mutation; permitted rerolls SHALL clear old plots, counts, credits, and handoff state before granting the new kit once.

#### Scenario: Standard opening

- **WHEN** a legal spawn is accepted
- **THEN** the player owns one city plot and one farm plot with food/troop capacities of 10000 each and no awarded-seed requirement

### Requirement: Explicit per-tile food purchases

Painting SHALL purchase complete level-one plots on owned, passable, undamaged, unoccupied land. Initial farm/city prices SHALL be 2000/3000 food. Purchases SHALL atomically validate, debit, create, and update capacity. Same-kind duplicates SHALL cost nothing; other occupied/invalid cells SHALL be rejected. Placement SHALL NOT use workers, maturity, climate, supply, seeds, or population milestones.

#### Scenario: Invalid painting does not spend

- **WHEN** a stroke visits an already painted, foreign, impassable, or damaged tile
- **THEN** that tile creates no plot and deducts no food

### Requirement: Bounded deterministic stroke transactions

The client SHALL interpolate a one-tile-wide integer grid line across pointer samples, deduplicate it, preview during dragging, and commit on release. The core SHALL accept ordered paint intents of at most 4096 tiles and independently deduplicate and validate them. It SHALL skip invalid cells and stop at the first unaffordable valid purchase without queuing the remainder for later refill. Cancellation SHALL discard the preview.

#### Scenario: Partial affordable stroke

- **WHEN** a player with 4000 food commits three distinct legal farm tiles
- **THEN** exactly two are painted for 4000 food, the third ends processing as unaffordable, and later refill does not paint it

#### Scenario: Fast pointer movement has no holes

- **WHEN** a horizontal drag jumps from grid coordinate (1,1) to (4,1)
- **THEN** its ordered preview/intent includes (1,1), (2,1), (3,1), and (4,1) once each

### Requirement: No autonomous economic tile growth

Farms/cities SHALL remain exactly where painted or captured until explicit deletion or territorial lifecycle changes. No food/population change SHALL create, spread, mature, age, shrink, or upgrade an economic plot. Density/maturity rendering, if retained as conduits, SHALL be a projection rather than economic authority.

#### Scenario: No-input landscape stays fixed

- **WHEN** a spawned player receives no building or conquest actions for 1000 ticks
- **THEN** city/farm tile locations and levels remain unchanged while global resources replenish

### Requirement: Authoritative painting and resource UI

The interface SHALL offer Attack, Paint Farm, and Paint City; show costs, legality, stroke results, food/capacity/refill, and idle/deployed/total troop capacity; and omit seed, worker, maturity, starvation, food-allocation, and supply advice for SimpleFront. The client SHALL NOT debit resources optimistically as authoritative state. New strings SHALL use SimpleFront's translation resources.

#### Scenario: Core rejects optimistic preview

- **WHEN** ownership or food changes between preview and execution
- **THEN** the result reflects the actual core purchases and the UI shows rejection/partial completion without invented stock or plots
