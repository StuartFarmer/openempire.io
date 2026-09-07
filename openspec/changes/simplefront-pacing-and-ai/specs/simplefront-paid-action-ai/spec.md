## ADDED Requirements

### Requirement: One deterministic selected controller per opponent

SimpleFront SHALL attach one shared controller to each successfully spawned
bot/nation, use stable seeded staggering, and stop its decisions during spawn,
on defeat and at match completion. Medium SHALL initially evaluate every 20
ticks, Easy 30, Hard 15, Impossible 10, with at most one new paid order per
evaluation. Reroll/reset SHALL not duplicate controllers or retain stale
campaigns; decision-affecting state SHALL be verified deterministically.

#### Scenario: Repeated attachment

- **WHEN** a spawned opponent's attachment path is visited more than once
- **THEN** it retains exactly one active decision schedule
- **AND** no old tribe/nation economic planner executes in the selected ruleset

### Requirement: Paid development with shared rules

AI SHALL rebuild missing farms/cities, use total troop headroom for city demand,
budget one intended expedition before discretionary building, and consider farm
investment against finite projected spending/refill. It SHALL use bounded legal
site searches and the human purchase validator, without free units/resources,
local food logistics, ecology, or automatic structure deletion.

#### Scenario: Missing both essential plots

- **WHEN** an opponent has territory but no farm/city and initially lacks food
- **THEN** it waits for baseline resources, purchases a legal farm, then a legal city
- **AND** it does not require a military reserve for troops it cannot yet support

#### Scenario: No legal paint site

- **WHEN** inspected owned sites are occupied or damaged
- **THEN** it advances its bounded search or considers legal expansion
- **AND** it does not retry indefinitely in the same decision or bypass placement rules

### Requirement: Resource-constrained expansion and campaigns

AI SHALL evaluate actual legal fronts and combat inputs, retain defensive
reserves, expand into neutral territory, and pursue at most one primary enemy
campaign. It SHALL account for existing deployments, respect friendliness and
immunity, pay exact dispatch costs, reinforce progress and stop feeding stalled
attacks. The initial policy SHALL use 30–40% reserve variation, 15% idle neutral
orders, 30% enemy orders, and two stalled 10-second samples before retreat.

#### Scenario: Budget cannot fund desired troops

- **WHEN** the AI's desired expedition exceeds its available food budget
- **THEN** it chooses a smaller valid order before submission or waits
- **AND** the authoritative execution does not resize an already submitted order for food

#### Scenario: Stalled war

- **WHEN** an active campaign fails to progress for two sampling intervals
- **THEN** the AI stops reinforcement and uses the existing retreat path where available
- **AND** committed food fees are not refunded

### Requirement: Bounded transport decisions

AI SHALL consider affordable legal transports when useful land routes are
unavailable, bound route candidate work, avoid duplicate pending destinations,
and retain existing boat limits, routing, landing and retreat mechanics.

#### Scenario: Landing transfer

- **WHEN** a paid AI transport lands
- **THEN** its existing troops transfer through normal landing accounting without a new fee or capacity gap

#### Scenario: No usable route

- **WHEN** no examined coast has a usable legal route
- **THEN** the decision terminates within its search budget and waits or examines alternatives on later pulses
- **AND** it grants no free boat and does not loop indefinitely
