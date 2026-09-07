## ADDED Requirements

### Requirement: Capacity-scaled global sigmoid refill

The selected SimpleFront SHALL grant `(a*K+r*x)*(1-x/K)` per 100 ms tick when
`0 <= x < K`, using food coefficients .001/.004 and troop coefficients
.0001/.003 in the initial preset. It SHALL use global food and total idle,
deployed and pending-landing troops, share the calculation with HUD projections,
and preserve integer credit accounting. It SHALL grant zero when capacity is
zero or stock is at/above capacity and validate `0<a<r`, `a+r<=1`, with explicit
zero-rate test fixtures permitted.

#### Scenario: Extra capacity benefits empty stock

- **WHEN** food is zero and capacity increases from 10000 to 15000
- **THEN** the initial food gain increases from 10 to 15 food per tick
- **AND** changing capacity itself grants no food stock

#### Scenario: Deployed troops consume capacity

- **WHEN** idle troops plus attacks, passengers and queued landings reach capacity
- **THEN** recruitment is zero without deleting existing troops

### Requirement: Meaningful paid-action preset

SimpleFront SHALL initially retain a free complete city/farm kit, 4000 food,
2000 troops, food capacity `5000+5000*farms`, and troop capacity `10000*cities`.
It SHALL charge 1500 food per farm, 2000 per city, and 200 milli-food per newly
committed land/transport troop, using exact debits and existing rejection,
retreat, landing and no-food-refund rules.

#### Scenario: Opening investment leaves expedition funds

- **WHEN** a player buys one additional farm and city from 4000 food without intervening refill
- **THEN** exactly 500 food remains
- **AND** the player can fund a 1000-troop dispatch for 200 food if otherwise legal

### Requirement: Baseline recovery and capture protections

SimpleFront SHALL generate baseline food while territory remains even with no
farms, recruit from zero while a city remains, and grant no recovery without
territory. It SHALL transfer captured capacity intact without stocks, clamp
food overflow immediately, and preserve excess troops with recruitment paused.

#### Scenario: Farm recovery without farms

- **WHEN** an alive spawned player has territory, no farms and zero food
- **THEN** the initial preset reaches 1500 food in approximately 23 simulation seconds without spending
- **AND** a legal new farm remains a paid purchase
