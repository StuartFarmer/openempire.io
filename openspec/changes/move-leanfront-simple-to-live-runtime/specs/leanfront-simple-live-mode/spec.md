## ADDED Requirements

### Requirement: LeanFront Simple uses the Live simulation runtime

The system SHALL register `leanfront-simple` as a worker-backed Live ruleset and SHALL advance it through the existing `GameRunner`. It SHALL use the existing core attack, retreat, ownership, neutral expansion, disconnected-cluster, nation, and tick-order implementations without a LeanFront-Simple-specific combat or ownership implementation.

#### Scenario: Accepted attack executes through Live combat

- **WHEN** OpenFront and LeanFront Simple start from identical deterministic core states with abundant food, both economy ticks are frozen, and both receive the same attack intent
- **THEN** each tick has identical ownership, idle people, active-attack people, attack target, and retreat state

#### Scenario: Neutral expansion uses Live rules

- **WHEN** a LeanFront Simple player attacks neutral territory
- **THEN** the attack uses the same four-neighbor frontier, tile priority, neutral defense, casualty, seep, and conquest logic as OpenFront Live

#### Scenario: No field combat remains active

- **WHEN** LeanFront Simple is selected as a playable game
- **THEN** the shell starts its worker runtime and does not run the former GPU pressure, diffusion, incursion, or ownership passes

### Requirement: Map nations are independent of ruleset

LeanFront Simple SHALL create the same manifest-defined nations at the same literal spawn centers as OpenFront on the same map. Nation names, colors, flags, diplomacy, attack behavior, and combat SHALL use the shared Live paths.

#### Scenario: Verdantia nation parity

- **WHEN** OpenFront and LeanFront Simple load Verdantia from the same manifest
- **THEN** both modes expose the same nation count and each nation has the same literal manifest spawn center, including no water relocation introduced by the ruleset

#### Scenario: SPQR nation parity

- **WHEN** OpenFront and LeanFront Simple load SPQR from the same manifest
- **THEN** both modes expose exactly the same manifest nations and spawn centers

### Requirement: Cities and farms are manual single-tile plots

LeanFront Simple SHALL represent a city with `UnitType.Settlement` and a farm with `UnitType.Farmland`. A valid action on an empty owned passable tile SHALL create only the selected level-one plot; a same-type action on that exact tile SHALL increase its level by one; an opposite-type action SHALL reject until the existing plot is razed. No economy tick SHALL create or spread a plot.

#### Scenario: City placement does not spread

- **WHEN** a player places a city on a valid empty tile and time advances
- **THEN** exactly that tile contains the city and no adjacent tile becomes a city without another action

#### Scenario: Same-type action upgrades

- **WHEN** a player applies a farm action to an owned level-two farm tile and can afford the action
- **THEN** that same farm becomes level three and no other tile changes plot type

#### Scenario: Opposite plot rejects

- **WHEN** a player applies a city action to a tile containing a farm
- **THEN** the action is rejected without changing food, plot type, level, or ownership

### Requirement: Plot levels stack capacity linearly

Each city level SHALL add 20,000 people of capacity and each farm level SHALL add 20,000 food of capacity. Upgrading SHALL preserve existing stock and add empty capacity without granting another seed.

#### Scenario: Level-two capacity

- **WHEN** a city or farm is upgraded from level one to level two
- **THEN** its capacity becomes 40,000 and its pre-upgrade stock is unchanged

### Requirement: Plot stocks grow as whole integers

Each plot SHALL independently apply `capacity = 20000 * level`, `rawGrowth = rate * stock * ln(capacity / stock)`, `growth = stock < capacity ? max(1, floor(rawGrowth)) : 0`, and `next = min(capacity, stock + growth)`. City rate SHALL be 0.03 and farm rate SHALL be 0.06. New plots SHALL start at `floor(0.10 * 20000) = 2000`. Stored stock, growth, aggregates, costs, and displayed values SHALL be integers.

#### Scenario: Seeded plot grows

- **WHEN** a level-one city or farm is created
- **THEN** it starts with exactly 2,000 units and its next growth step is the specified integer Gompertz result

#### Scenario: Near-capacity plot reaches capacity

- **WHEN** a plot has positive stock below capacity and the floored raw growth is zero
- **THEN** it gains one unit without exceeding capacity

#### Scenario: Full plot stops growing

- **WHEN** a plot stock equals or exceeds its capacity
- **THEN** the economy adds no stock and does not delete overflow stock

### Requirement: People are troops and do not eat

The sum of idle people stored in a player's city plots SHALL be the player's available troop balance used by the existing combat implementation. Active-attack people SHALL remain in `AttackImpl`. No idle or active people SHALL consume food through the rich food, supply, or starvation systems.

#### Scenario: Idle population has no upkeep

- **WHEN** a player takes no action for multiple ticks
- **THEN** food changes only through farm growth and never decreases because people exist

#### Scenario: Combat commits the people resource

- **WHEN** a player starts an affordable attack with 1,200 people
- **THEN** `AttackExecution` removes those same 1,200 people from the available troop balance and `AttackImpl` owns the committed force

#### Scenario: Survivors return to cities

- **WHEN** an attack ends with survivors
- **THEN** the existing core return changes the troop balance and the next economy reconciliation distributes the exact whole-person increase across owned cities deterministically

### Requirement: Food is globally available action energy

The sum of all owned farm stocks SHALL be globally spendable by that player. A city level SHALL cost 4,000 food, a farm level SHALL cost 3,000 food, and razing SHALL cost 1,000 food, independent of current level or number of plots. Accepted spending SHALL be removed proportionally from all owned farm stocks with integer remainders assigned by ascending unit id. An unaffordable discrete action SHALL reject without mutation.

#### Scenario: Global farms fund a build

- **WHEN** several owned farms collectively hold enough food for a city but no single farm does
- **THEN** the city action succeeds and the exact 4,000-food debit is distributed across all owned farms

#### Scenario: Flat upgrade cost

- **WHEN** the player upgrades a level-one city and later upgrades the same level-two city
- **THEN** each upgrade costs exactly 4,000 food

#### Scenario: Unaffordable raze rejects

- **WHEN** the player owns the selected plot but has fewer than 1,000 food
- **THEN** razing is rejected and the plot and all farm stocks are unchanged

### Requirement: Active attacks consume food energy

Starting and maintaining an attack SHALL cost `ceil(activePeople * 40 / 1000)` whole food per active combat tick. The unchanged `AttackExecution` SHALL create a new attack normally; before its first combat tick, the runtime SHALL cap its commitment to `floor(availableFood * 1000 / 40)` whole people and return excess people. If a later full charge is unaffordable, the attack SHALL end and return survivors without the voluntary-retreat casualty malus.

#### Scenario: Initial attack is food-capped

- **WHEN** a player requests more attacking people than their current food can fund for one tick
- **THEN** the existing `AttackExecution` creates the attack and the runtime caps it before its first combat tick, returns excess people, and leaves food non-negative

#### Scenario: Ongoing attack runs out of energy

- **WHEN** an active attack cannot pay its next full whole-food charge
- **THEN** it stops before another combat tick, returns its survivors, applies no voluntary-retreat casualty malus, and leaves food non-negative

#### Scenario: Abundant food does not alter combat

- **WHEN** the player can pay every active attack charge
- **THEN** food gating does not alter the attack's Live frontier, casualties, conquest, or retreat behavior

### Requirement: Capture and raze reconcile plot stocks

Conquest SHALL preserve a Settlement or Farmland unit's type and level. A captured city SHALL have zero idle people, and a captured farm SHALL discard its old stock and restart at 2,000 food. Razing SHALL delete the selected owned plot stock but SHALL NOT change tile ownership.

#### Scenario: Captured farm restarts

- **WHEN** combat transfers a level-three farm to another player
- **THEN** it remains a level-three farm owned by the conqueror with exactly 2,000 food before subsequent growth

#### Scenario: Raze removes only the plot

- **WHEN** an affordable raze targets an owned city
- **THEN** the Settlement and its stored people are removed while the terrain tile remains owned

### Requirement: GPU growth has an equivalent CPU fallback

The CPU SHALL provide the normative compact integer plot-growth calculation. When WebGPU is available, LeanFront Simple SHALL run only that compact growth calculation on the GPU and SHALL return the same integer stocks as the CPU for identical inputs. GPU initialization or dispatch failure SHALL select the CPU path for the remainder of the match without changing combat state.

#### Scenario: CPU and GPU boundary parity

- **WHEN** CPU and GPU calculators receive empty, seeded, near-capacity, upgraded, captured, and large integer plot records
- **THEN** they return exactly equal integer stocks and aggregates

#### Scenario: GPU unavailable

- **WHEN** WebGPU initialization fails before or during a LeanFront Simple match
- **THEN** subsequent ticks use the CPU calculator and the match remains playable through the same Live core simulation

### Requirement: LeanFront Simple uses the shared Live presentation

LeanFront Simple SHALL use the same automatic simulation startup, spawn prompt, click-to-place flow, spawn-to-camera timing and target, mask transition, ownership colors, city/farm sprites, deploy highlight, tile/attack feedback, pause, turbo, restart, statistics/history, and defeat presentation as OpenFront Live. Its HUD SHALL show whole people and food plus city, farm, and raze actions.

#### Scenario: Spawn presentation parity

- **WHEN** the same accepted spawn is processed in OpenFront and LeanFront Simple
- **THEN** both modes begin the camera flight and mask transition from the same worker frame and fly to the accepted spawn tile

#### Scenario: Shared combat presentation

- **WHEN** the LeanFront Simple player aims and starts an attack
- **THEN** the target feedback, border-segment highlight, ownership colors, fronts, and troop slider use the shared Live data and rendering paths

#### Scenario: Integer HUD

- **WHEN** LeanFront Simple renders player or hovered-plot resources
- **THEN** every people, food, growth, stock, and capacity value is displayed without a fractional amount

### Requirement: Existing modes remain intact

The `openfront` and original `leanfront` rulesets SHALL remain separately selectable and SHALL retain their existing config and runtime behavior.

#### Scenario: OpenFront regression identity

- **WHEN** the existing deterministic OpenFront reference tests run after this change
- **THEN** their hashes and expected state remain unchanged

#### Scenario: Original LeanFront survives

- **WHEN** the game registry is inspected after migration
- **THEN** `openfront`, `leanfront`, and `leanfront-simple` are three worker-backed Live entries and original `leanfront` still creates its existing GPU economy runtime
