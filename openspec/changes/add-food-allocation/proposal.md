# Proposal: add-food-allocation

## Why

A growing population eats every unit of food produced: growth raises consumption until it meets production, so the stock plateaus and the player can never bank food while growing (the growth homeostat, again). There is no lever to choose between growing the population and building a war chest / construction budget — the two most interesting spends in the game.

## What Changes

- **Allocation slider** (like the troop bar): the player sets what share of each tick's production feeds the population; the rest flows straight into storage.
- **Reordered food loop** per tick: (1) produce → (2) split by allocation → (3) storage share banks first (cap applies) → (4) storage overflow is rebated to the population instead of rotting on the ground → (5) the population eats its share; surplus over consumption drives growth (throttled as today) and is _not_ banked — banking is what the storage share is for.
- Deficit (population share < consumption) still draws from the stock — barns remain the famine/war buffer — and starves only when the stock runs dry.
- Deterministic: the share lives on the sim player, set via a new `food_allocation` intent; bots and defaults use a `defaultPopulationShare` knob (0.7).

## Capabilities

### Modified Capabilities

- `food-economy`: the tick loop gains the allocation split, overflow rebate, and surplus-not-banked rule.

### New Capabilities

- `food-allocation`: the intent, the per-player share, and the HUD slider.

## Impact

- Core: FoodConfig knob; `PlayerImpl.foodPopulationShare` + intent → `FoodAllocationExecution`; `FoodEconomy.foodTick` restructure; `foodPopulationShare` in player updates (layered games only).
- Client: allocation slider in ControlPanel (layered maps), `SendFoodAllocationIntentEvent` → Transport.
- Bots: keep the default share (banking 30% steadily) — watch item, not adaptive yet.
- Classic maps: untouched (foodTick is layered-only; the intent is additive).
