# SimpleFront: painted tiles and global resources

Date: 6 September 2026. Status: design draft for review; no gameplay implementation in this change.

## 1. Intent and decision status

Replace SimpleFront's inherited agricultural simulation with explicit tile painting and two global player resources: food and troops. Preserve the existing territorial movement and combat systems, except for removing logistics losses and adding an upfront food charge for dispatch.

The user has specified or explicitly agreed to:

- The opening kit remains one city tile and one farm tile.
- Players paint every subsequent city/farm tile; neither spreads automatically.
- Farm count increases global food capacity; city count increases global troop capacity.
- Capacity is linear initially, with the calculation isolated so another curve can replace it later.
- Replenishment follows an S-shaped/sigmoid curve.
- Food is action currency. People never eat it, and it is never distributed across tiles.
- No workers, local stores, or logistics. All people are troops.
- Food is charged when dispatching troops, rather than continuously while they travel or fight.
- Deployed troops count toward troop capacity.
- Baseline food generation allows basic actions and reconstruction without farms.
- AI changes are designed now but implemented later.

The rest of this document supplies recommended details for review, not claims of additional explicit user decisions. In particular: recruitment can restart from zero while a city remains; food overflow is discarded when capacity falls; existing troops survive a reduced capacity; prices initially stay fixed; old-age mortality is removed; and painting is restricted to owned land. Numerical values in section 5 are a proposed test preset, not approved balance.

Baseline reference: [OpenFront Live rules](../../OpenFrontLiveRules.md). Implementation must remain inside the independent `simplefront/` application. Root OpenFront Live and its reference document remain unchanged.

## 2. Player-facing model

```text
paint farms → larger food capacity → replenish food → pay for actions
paint cities → larger troop capacity → recruit troops → fight for territory
```

A tile is empty, a farm, or a city for economic purposes. Farms and cities are complete when painted. They have no economic maturity, age, workforce, local population, or local inventory. They do not upgrade or stack levels in the first version.

The simulation still needs a distinction between idle troops and troops committed to attacks or boats because the existing combat code uses those locations. Those are deployments of the same resource, not separate kinds of person. Idle troops do not work on farms, and deploying them does not reduce farm output except indirectly through spending global food.

The initial interface offers Attack, Paint Farm, and Paint City. Existing transport dispatch remains part of the attack interaction. Painting does not claim neutral territory: conquest still does that. Other inherited unit definitions are not deleted or newly activated by this work; their legacy gold prices are not silently converted into food prices.

## 3. Global state and capacities

For each living, spawned player:

```text
F = global food balance
I = idle troops
D = all committed/deployed troops
P = I + D
Nf = number of owned farm tiles
Nc = number of owned city tiles

Kf = baselineFoodCapacity + Nf × foodCapacityPerFarm
Kp = Nc × troopCapacityPerCity
```

`D` includes outgoing land attacks, transport passengers, and any committed passengers awaiting their boat-to-land-attack handoff. It excludes enemy incoming troops. A committed soldier counts exactly once, including during retreat, attack merging, and landing transitions.

Capacity is a ceiling on replenishment, not a grant of resources. Building or capturing a farm does not add food. Building or capturing a city does not add troops. Recruitment adds new troops to `I` only, after considering total `P`.

Use one capacity function per resource and separate functions for replenishment and action prices. Initially these are small ordinary functions, not a generic configurable curve engine. A later logarithmic capacity function or escalating purchase-price function must not change replenishment merely because it shares a parameter name.

Counting rules:

- Count one per owned, active economic tile. The starting city/farm count normally.
- Use explicit plots as authority, not visual density, farm maturity, lifetime construction counts, or inherited unit levels.
- An economic tile's ownership follows tile ownership immediately for capacity accounting; do not wait for the old per-player structure reconciliation pass.
- Update counts on creation, deletion, capture, relinquishment, and death. Do not add a full-map scan to every tick.
- Keep development-only recomputation checks to catch count drift.

The existing `Settlement` and `Farmland` types can represent city/farm plots with level fixed at one. The legacy gold-priced `City` type is not the new painted city. The starting core may remain as a marker if another retained system needs it, but grants no additional capacity or supply.

## 4. Sigmoid replenishment

### Formula

Use the same shape for each global resource, with separate rates:

```text
growth(X, K, b, r) = (b + r × X) × (1 − X / K), for 0 ≤ X < K
growth = 0, for K ≤ 0 or X ≥ K
```

For food, `X=F`, `K=Kf`, `b=baselineFoodRate`, and `r=foodGrowthRate`.

For troops, `X=P`, `K=Kp`, `b=recruitmentBootstrapRate`, and `r=troopGrowthRate`. Add the resulting whole recruits to idle troops.

This is a logistic-style rate with a positive bootstrap term. Ordinary `r × X × (1 − X/K)` cannot escape zero. The bootstrap avoids needing a new farm/city to gift an arbitrary starting stock, or a hidden timer that resets whenever the player spends resources.

The rate increases until:

```text
Xpeak = (K − b/r) / 2
```

It then decreases toward zero at capacity. For an accelerating initial phase, require `r > 0` and `b < r × K`. Validate that condition at the smallest positive capacity for the normal preset. Otherwise a large baseline would turn the intended S-curve into fast-from-empty replenishment.

This is not a pure time-based sigmoid evaluated from a match-start timestamp. Growth depends on the current balance and current capacity, so spending and captures change the next tick's rate without resetting a growth clock. A refill starting above the inflection point sees only the slowing upper portion of the curve.

### Time, precision, and reaching the ceiling

Rates below are per 100 ms simulation tick. Turbo changes wall time, not the number of resource updates per game tick.

Store food in the existing integer milli-food convention. Accumulate sub-milli food gains and sub-person recruitment gains in deterministic fractional credits, rather than flooring each tick's small gain away. Keep credits on the player, not in client-side plot records. Spending does not reset fractional credit. At capacity, discard excess credit instead of banking a future refill.

Clamp each update to available headroom. When positive growth is within one resource quantum of the ceiling, snap to capacity: one milli-food for food, one troop for population. Otherwise asymptotic growth can make an action priced at the full baseline capacity permanently unaffordable.

If capacity shrinks to or below the balance, clear the relevant refill credit. If there are no cities, clear recruitment credit and produce no recruits. Over-capacity troops never produce negative recruitment.

### Baseline food and reconstruction

Baseline food capacity and a positive baseline food rate remain while the player owns territory, even with zero farms and zero troops. At zero food, the rate is `baselineFoodRate`; like the rest of this capped refill, its contribution tapers near a full store.

Baseline capacity must be large enough to afford a replacement farm and a replacement city individually. The proposed preset also permits buying both from a full baseline store. Reconstruction requires remaining legal land; baseline generation is not resurrection after territorial elimination and does not override impassable terrain or a temporary painting damage lock.

At zero troops with at least one city, the recruitment bootstrap eventually creates new idle troops. Remove the inherited food-tick rule that neutralizes all territory at zero population. A cityless player can retain existing troops, but receives no replacements until it builds or captures a city. Territorial elimination and existing combat collapse rules still apply.

## 5. Proposed initial test preset

These numbers make the design executable as a future test specification. They are deliberately exposed together for review and later playtesting, not presented as proven balance.

| Parameter                  |      Proposed value | Meaning                                        |
| -------------------------- | ------------------: | ---------------------------------------------- |
| Baseline food capacity     |          5,000 food | Storage available without farms                |
| Food capacity per farm     |          5,000 food | Linear addition per tile                       |
| Troop capacity per city    |       10,000 troops | Linear addition per tile                       |
| Starting food              |          4,000 food | Preserve the current opening balance           |
| Starting troops            |        2,000 troops | Preserve the current opening balance           |
| Baseline food rate         |         2 food/tick | Empty-stock recovery                           |
| Food growth rate           |          0.003/tick | Sigmoid coefficient                            |
| Recruitment bootstrap rate |        1 troop/tick | Empty-army recovery while city capacity exists |
| Troop growth rate          |          0.003/tick | Sigmoid coefficient                            |
| Farm tile price            |          2,000 food | Fixed initially                                |
| City tile price            |          3,000 food | Fixed initially                                |
| Land dispatch price        | 40 milli-food/troop | 0.04 food per committed troop                  |
| Transport dispatch price   | 40 milli-food/troop | Separate setting, initially equal              |

The free kit therefore starts at food capacity 10,000 and troop capacity 10,000. It is one completed city plot and one completed farm plot, not the old combination of a density-only city and a ripe spreading nucleus. Initial food/troops are clamped to the opening capacities if a future preset changes them.

Keep the existing spawn footprint calculation, but require enough legal footprint cells for both kit plots before accepting a spawn. Place the city at the chosen legal core tile and the farm on a distinct legal owned tile, using deterministic placement order without climate scoring. An impossible two-plot spawn is rejected before clearing an earlier permitted spawn or charging/granting anything; never silently omit half the kit.

Examples using this preset, before integer quantization:

- With no farms: food at 0/1,250/2,500/3,750/5,000 produces 2/4.3125/4.75/3.3125/0 food per tick.
- With one city: total troops at 0/2,500/5,000/7,500/10,000 produces 1/6.375/8/5.875/0 troops per tick.
- Sending 500 troops costs 20 food. Moving those troops from idle to deployed does not create recruitment headroom.
- Painting a farm for 2,000 food adds 5,000 food capacity but no food balance.
- Losing the last farm restores the capacity to 5,000, not zero. A full baseline store can fund one farm and one city, with no extra starting-stock grants.

Lower food reserves mean slower early recovery, and larger capacity changes where the same balance lies on the curve. These are intended consequences of the requested sigmoid, worth evaluating in playtests rather than mistaking for implementation bugs.

Validate preset values as finite and in supported numeric ranges. Capacities and starting troop counts are nonnegative integers; prices use nonnegative integer milli-food; baseline food capacity and recovery rates are positive in ordinary play. Keep rate coefficients small enough for a stable per-tick update. Invalid settings must fail clearly rather than introduce division by zero, negative prices, or nonfinite balances. Tests may explicitly disable replenishment with zero rates to isolate combat.

## 6. Painting and construction

### Legal tiles and charges

A paint action must target an owned, passable land tile without an existing structure. Farms and cities cannot overlap. Painting the same kind again is a no-op with no charge; painting the other kind on an occupied tile is rejected. There are no upgrades or automatic conversions in this first version.

The proposed version retains the existing combat-damage construction lock: a damaged tile must heal before a new plot is painted. Remove maturity, supply reach, crop suitability, population milestones, seed banks, and worker requirements from placement. Ordinary passable land has the same capacity value regardless of its climate layers.

For each tile, validate ownership, legality, duplicate state, and current food at the point of mutation. Deduct the price and create the plot atomically. Failed validation produces neither a debit nor a new plot. A completed plot contributes capacity immediately, but refill still happens only once per normal resource tick.

### Brush behavior

Begin with a one-tile-wide continuous drag stroke. Fill skipped cells between pointer samples with an integer grid-line traversal; the browser's pointer-event frequency must not determine whether the painted line has holes. Deduplicate cells within a stroke, send tiles in deterministic traversal order, and retain authoritative duplicate checks in the core.

Painting is a sequence of per-tile purchases, not an all-or-nothing purchase of an entire drag. Invalid/occupied cells are skipped with feedback. The first unaffordable purchase ends that stroke's placement; do not queue unpaid cells to be built automatically when food later refills. Starting a fresh stroke is a new explicit action.

Show the selected brush, valid/invalid target, cost per tile, available food, and resulting capacity. Remove seed counts, maturity previews, ecological suitability advice, and autonomous-growth hints.

No new demolition/refund mechanic is part of the initial painting interface. If an existing deletion intent is used through a retained route, preserve its timer and give no food refund or seed reward; when deletion completes, update the capacity count. Demolition/conversion can be designed separately without blocking this model.

## 7. Military food charges and preservation boundary

After all dispatch validation, clip the requested troop count to the available idle pool as the current game does and quantize the actual commitment to an integer `T`:

```text
dispatchCostMilli = T × configuredMilliFoodPerTroop
```

Require enough food for that actual commitment. Do not silently send a smaller army merely because food is short. An invalid or unaffordable order must not debit food, remove troops, create an attack/boat, or trigger hostile-order diplomacy side effects.

Charge exactly once for a newly funded land attack, including neutral expansion, or a newly dispatched transport. Reinforcing via another funded order pays only for its new commitment, not troops absorbed from an existing attack. A boat landing, front rebuild, merge, or retreat is not a new paid dispatch.

Debit immediately before committing the validated deployment in the authoritative execution. Successful dispatch charges are not refunded when the player later retreats, the target becomes friendly, or travel subsequently fails; existing troop-refund behavior remains unchanged. Failure discovered before commitment costs nothing. This keeps the fee an order cost, not an ongoing maintenance bill.

Preserve existing targeting, immunity, border-segment selection, front-force distribution, seep, collisions, terrain casualty/work formulas, marching cadence, transport routing, first-beachhead behavior, retreat delays/penalties, pocket capture, and collapse cleanup. Keep their execution order. Remove only the food/supply-derived losses and the old economic support requirements, then add the new action charge.

Food reaching zero after dispatch never freezes an army, causes starvation, or changes its combat strength. Troops can still die in combat and through existing retreat losses. Territorial expansion continues to spend troops according to current neutral-tile combat costs.

## 8. Capture, damage, and defeat

Captured farms and cities transfer intact as economic plots, each worth one capacity contribution. Capturing a city does not recruit the former owner's troops; capturing a farm does not loot a tile inventory, because no tile inventory exists.

Apply economic ownership/count changes atomically with territorial capture. Do not briefly delete and recreate a plot in a way that produces false zero capacity or awards resources. Current capture code that clears density, resets maturity, or reinstates field seedlings must no longer destroy the economic meaning of the captured tile.

- If food exceeds the reduced capacity, discard the excess immediately. The captor does not receive it.
- If total troops exceed the reduced capacity, preserve those troops and suspend recruitment until population falls below capacity or capacity increases.
- Existing plots continue to provide capacity even while their tiles are damaged. Damage retains its visual/healing behavior and blocks new painting; it does not invoke maturity, repairs, or food logistics.
- Relinquished economic plots cease contributing to the former owner. Neutral plots follow existing structure cleanup and give no ghost capacity.
- Losing all territory is still defeat. A defeated player does not keep generating baseline food or recruit back into the match.

These choices deliberately separate economic capacity loss from immediate troop casualties. Compare them against the old free collapse/encirclement captures during testing; keeping those combat rules can still cause sudden large capacity changes.

## 9. Implementation architecture

### Recommended approach

Replace the inherited economy at the core tick boundary with a small SimpleFront-only global resource module. Keep the CPU simulation authoritative so browser and headless tests run the same rules. The renderer observes balances and explicit plots; it must not reconcile or redistribute resources.

Alternatives considered:

1. Turn old configuration values to zero: rejected because seed gates, per-tile stocks, workforce assumptions, and AI dependencies remain.
2. Reuse the copied LeanFront Simple economy wholesale: rejected because it owns per-plot stocks, levels, and client-runtime reconciliation. Its mere presence does not make it the desired global model.
3. Replace the economy in SimpleFront's independent core: recommended. A narrow set of global rules can use existing units, ownership, combat, and input infrastructure without an extra economy abstraction layer.

### Responsibilities

| Area                   | Responsibility / expected change                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Configuration          | Small named set of capacities, starting balances, sigmoid rates, and action prices; separate from obsolete food knobs |
| Player state           | Global food, resource credits, city/farm counts, and exact deployed accounting; no local food ledgers                 |
| Resource update        | One replenishment pass per game tick for living, spawned players outside spawn phase                                  |
| Ownership/build/delete | Maintain plot counts and reconcile changed capacities atomically                                                      |
| Spawn                  | Create an explicit city and farm, apply starting balances once, clear stale state on a permitted reroll               |
| Dispatch executions    | Validate and charge new commitments exactly once; preserve downstream movement/combat                                 |
| Worker and UI          | Publish food/capacity/refill and idle/deployed/total/capacity, accept painting, remove obsolete displays              |
| AI                     | Separate later adaptation; no compatibility claims for the inherited planner                                          |

Run the new resource pass after the existing executions and pending initialization for the tick, before player snapshots are published. Capture and spending therefore affect that tick's refill. Leave combat execution ordering alone. Resource credits are updated once, never once per browser frame or separately for every front/plot. Skip this pass while in spawn phase; using the same tick duration preserves normal/turbo simulation equivalence.

Capacity reductions must also be reconciled at ownership/deletion mutations so the next order cannot spend overflow food before the resource pass. Track resources through boat landing and other queued handoffs: a passenger remains deployed until either returned to idle, lost, or represented by the resulting attack. A queued execution is not a gap in the troop ledger.

Extend state hashing and any applicable serialization with the new food/credit/plot accounting state. The copied player hash currently does not cover all of those values. Deterministic tests should compare resource state directly as well as the simulation hash.

### Existing integration points

- [PlayerExecution](../../../simplefront/src/core/execution/PlayerExecution.ts): stop invoking the inherited urban/food sequence; retain structure reconciliation, diplomacy expiry, and cluster behavior.
- [GameImpl](../../../simplefront/src/core/game/GameImpl.ts): resource-pass placement, ownership/count changes, snapshots, and hashing.
- [PlayerImpl](../../../simplefront/src/core/game/PlayerImpl.ts): seed/build gates, food accessors, capacity reporting, deployment transitions, and state.
- [SpawnExecution](../../../simplefront/src/core/execution/SpawnExecution.ts): replace density-and-farm-nucleus setup with two explicit finished plots.
- [AttackExecution](../../../simplefront/src/core/execution/AttackExecution.ts) and [TransportShipExecution](../../../simplefront/src/core/execution/TransportShipExecution.ts): upfront food charges and transaction boundaries.
- [GameShellPage](../../../simplefront/src/client/GameShellPage.ts) and [ShellSim.worker](../../../simplefront/src/client/webgpu/ShellSim.worker.ts): painting and resource readouts.
- [FoodEconomy](../../../simplefront/src/core/execution/utils/FoodEconomy.ts), [FarmGrowth](../../../simplefront/src/core/execution/utils/FarmGrowth.ts), [UrbanGrowth](../../../simplefront/src/core/execution/utils/UrbanGrowth.ts), [FoodShed](../../../simplefront/src/core/execution/utils/FoodShed.ts), [SupplyField](../../../simplefront/src/core/execution/utils/SupplyField.ts), [TileTenure](../../../simplefront/src/core/execution/utils/TileTenure.ts), and [SeedAwards](../../../simplefront/src/core/execution/utils/SeedAwards.ts): no longer active SimpleFront economy paths. Remove remaining runtime callers, including overlays/observers, rather than leaving hidden periodic work running.

Obsolete source files can remain temporarily if other copied, inactive variants still import them. This change is not permission for a repository-wide deletion. Independence means no new imports from root OpenFront; preserve separate assets, settings, and launch routing.

## 10. AI design, implementation deferred

The eventual AI consumes the same counts, capacities, prices, balances, and deployment validator as the human. It receives no workers, ecological scores, special seed grants, free food, or free dispatch.

Proposed economic decision order:

1. Rebuild a farm if none remains and a legal tile is affordable.
2. Rebuild a city if none remains.
3. Keep an explicit food budget for its next intended military order.
4. Add farms when food spending repeatedly constrains its chosen actions.
5. Add cities when total troops approach capacity and additional troops fit its strategy.
6. Otherwise wait or make a legal military decision using existing targeting concepts.

The AI paints through the same per-tile purchase rules. Basic siting can prefer safe owned interior land and keep cities/farms from overlapping; no crop/climate/supply optimization is needed. Military budgeting uses total deployed troops and upfront food cost, not civilian staffing, meal runway, starvation targets, or the old food-supported population estimate.

Remove the inherited tribe behavior that schedules its own structures for deletion. Rewrite readiness and deployment heuristics against the new troop capacity; do not reuse a calculation that secretly calls food-shed or labor code. Existing diplomacy and target-selection ideas can be retained where their inputs still exist. Difficulty should initially change decision cadence/choice quality, not grant hidden capacity multipliers.

No new AI implementation is included in the first economy/painting delivery. The proposed validation mode is human sandbox plus explicitly passive opponents/test fixtures. Passive opponents receive the same economy and normal defense/capture handling but issue no autonomous construction or dispatch orders. Do not silently run the old planner and present it as adapted AI. Normal active-AI matches remain a separate deliverable, with a clear UI indication during any interim sandbox release.

## 11. Verification requirements for implementation

### Resource and capacity tests

- Zero farms still permit food recovery; baseline storage can finance reconstruction.
- Zero troops with a city recover; zero cities produce no troops; zero territory produces neither resource.
- Growth rises through the lower portion of the curve and falls through its upper portion at constant capacity; separate tests cover changing capacity and spending.
- Food/troops never overfill through replenishment. Quantization does not strand the final affordable unit of capacity.
- A new plot increases capacity without gifting stock. An occupied/duplicate/invalid paint action spends nothing.
- Captures/deletions update both players' capacities without stale or double counts. Food clamps on capacity loss; troop loss does not occur merely because capacity falls.
- Deployed, retreating, merged, and landing troops count exactly once. A handoff or dispatch cannot create recruitment headroom.
- Fractional credits, resets at capacity, and custom-configuration validation are deterministic.

### Action and combat tests

- A valid dispatch pays the exact price of the actual integer commitment once.
- Rejected orders have no food/troop/diplomacy mutation. Two competing orders cannot spend the same food.
- Boat landing and front merging never charge existing troops again.
- Post-dispatch retreat/path failure follows the chosen no-food-refund rule while retaining existing troop refunds.
- Running out of food does not stop or weaken an already deployed army.
- With replenishment disabled in a fixture and enough food supplied, paired old/new combat scenarios preserve movement, casualty, work-budget, frontage, landing, retreat, pocket, and collapse outcomes except for deliberately removed supply/starvation effects.
- Painting strokes fill gaps, deduplicate, process predictable partial purchases, and stop when unaffordable without a deferred auto-build queue.

### Integration and isolation tests

- No spontaneous farm/city tile changes over a long no-input run.
- Opening plots, baseline regeneration, capacity displays, and attack costs agree between core state and UI.
- Normal and turbo execution produce equal state for equal seeds and tick-stamped inputs.
- Reset/spawn rerolls do not preserve old credits, plots, or count caches or award the kit twice.
- Root OpenFront source is unchanged. SimpleFront's import/asset/settings isolation tests continue to pass; revise copied tests that intentionally pin the old economy or obsolete supply-layer list.
- The first delivery clearly identifies AI as deferred; passive test opponents never execute the old economy planner.

## 12. Delivery and review boundary

This document specifies the proposed behavior and identifies the integration work. It does not implement the economy, change defaults, disable bots, or modify the launch picker.

After design approval, create a scoped OpenSpec change for SimpleFront's painted global economy and turn these acceptance requirements into implementation tasks. The existing root changes concerning LeanFront Simple or food-gated expansion are context, not authorization to repurpose them. Deliver the core economy, painting, dispatch charging, and sandbox validation together; implement the redesigned AI as a later change.

Review priorities: the proposed numerical preset; recruitment from zero with a city; fixed initial painting costs and no upgrades; intact capture with food overflow loss but no troop deletion; damage blocking new painting without disabling existing capacity; and the passive-opponent boundary until AI is adapted.
