## ADDED Requirements

### Requirement: Global linear resource capacities

SimpleFront SHALL maintain one global food balance and a total troop population consisting of idle plus all deployed/committed troops. Food capacity SHALL equal 5000 plus 5000 per owned farm tile; troop capacity SHALL equal 10000 per owned city tile in the initial preset. Building and capturing SHALL increase capacity without granting resource balances. Capacity calculations SHALL be separate from replenishment and prices.

#### Scenario: Building adds capacity only

- **WHEN** a player with one farm and 4000 food paints a second farm for 2000 food
- **THEN** its food balance is 2000 before that tick's refill and its capacity is 15000

#### Scenario: Deployment preserves population

- **WHEN** a player moves 500 of its 2000 idle troops into an attack
- **THEN** total troop population remains 2000 and recruitment headroom is unchanged

### Requirement: Bootstrapped sigmoid replenishment

The selected ruleset SHALL replenish each resource by `(b+rX)*(1-X/K)` for `0 <= X < K` and zero otherwise. Initial food baseline SHALL be 2 food/tick, recruitment bootstrap 1 troop/tick, and both growth rates 0.003/tick. Recruitment SHALL use total troops for X and add recruits only to idle troops. Updates SHALL occur once per 100 ms simulation tick after executions and initialization, before publication, outside spawn phase.

#### Scenario: Food has an accelerating and slowing portion

- **WHEN** food capacity is 5000 and balances are 0, 1250, 2500, 3750, and 5000
- **THEN** unquantized per-tick gains are respectively 2, 4.3125, 4.75, 3.3125, and 0

#### Scenario: Zero troops can recover

- **WHEN** a living, spawned player with one city has zero total troops
- **THEN** the bootstrap produces recruitment without spending food or requiring workers

### Requirement: Precision and configuration safety

The system SHALL retain fractional refill credit, clamp refill to headroom, snap the last positive resource quantum to capacity, and discard excess credit at capacity. Food SHALL use integer milli-food storage. Invalid nonfinite/negative settings SHALL be rejected; normal recovery presets SHALL have positive baseline capacity and rates and an accelerating lower curve. Tests SHALL be able to disable refill explicitly.

#### Scenario: Full capacity is reachable

- **WHEN** a positive-rate refill is within one milli-food or one troop of its capacity
- **THEN** the balance reaches that capacity and excess fractional credit is discarded

### Requirement: Baseline recovery and territorial survival

Baseline food capacity/generation SHALL operate without farms while the player remains alive and spawned. Recruitment SHALL stop without cities but SHALL recover from zero with a city. Zero troops alone SHALL NOT relinquish territory. A player without territory SHALL receive neither refill nor resurrection. The baseline food capacity SHALL fund replacement farms/cities at the initial prices.

#### Scenario: Rebuild after losing all economic plots

- **WHEN** a player retains legal territory but has no farms, cities, food, or troops
- **THEN** food recovers toward 5000, a farm/city can be purchased, and recruitment begins only after a city exists

### Requirement: Immediate ownership and capacity reconciliation

Each economic tile SHALL contribute to its current territorial owner's capacity exactly once. Capture SHALL preserve the complete plot without transferring food or troops. Capacity reductions SHALL clamp food immediately and clear refill credit at/above capacity; excess troops SHALL survive with recruitment suspended. Deletion/relinquishment SHALL remove the former owner's contribution without a refund. Damage SHALL NOT disable an existing plot's capacity.

#### Scenario: City loss preserves soldiers

- **WHEN** a player with two cities and 15000 total troops loses one city
- **THEN** its capacity becomes 10000, all 15000 troops remain, and recruitment stops

#### Scenario: Farm loss cannot fund an intervening order with overflow

- **WHEN** capture reduces a player's food capacity from 10000 to 5000 while it holds 8000 food
- **THEN** food becomes 5000 before any subsequent order can spend it and the captor receives no food

### Requirement: Deterministic authoritative resource state

Food, credits, counts, and committed handoff troops SHALL be core-owned and included in selected-ruleset hash/reset behavior. Turbo SHALL NOT alter resource math. Resource readouts SHALL reflect this state, not client-side stores.

#### Scenario: Equal inputs reproduce state

- **WHEN** equal seeds and tick-stamped actions run for equal tick counts at normal and turbo scheduling
- **THEN** resource balances, credits, counts, deployment accounting, and hashes match
