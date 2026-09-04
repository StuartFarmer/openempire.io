# Proposal: add-tribal-food-economy

## Why

Phase 1 of turning the lean base into a 3-age resource game (Stuart's Tribal Age spec): population should be earned through food production on good land, not granted by a logistic curve. This creates the game's core spatial decision — _where_ you expand matters because fertility varies — and establishes the stock-and-flow pattern (produce → store → consume → grow/starve) that metal and oil will reuse in later ages.

## What Changes

- **Food as a per-player resource** (integer stock): produced from owned fertile land (crop layer) and Farmland, capped by Barn storage, decaying over time, consumed by population every tick.
- **Population is food-gated** — **BREAKING** on layered maps: growth scales with food surplus; sustained deficit (after draining storage) starves population. Carrying capacity (max population) is driven by Settlements instead of the vanilla territory/City curve.
- **Three new buildings**, costed in food: Settlement (raises population cap), Farmland (raises production on/around its tile, scaled by local fertility), Barn (raises storage cap). Existing buildings and all gold costs are untouched.
- **Activity multiplies consumption**: troops in transit (attacks/boats) eat more than idle population; troops in active combat eat the most.
- **Scope gate**: the entire economy activates only on maps with layer data (`hasLayers()`, from `add-map-layer-sidecars`). Classic maps play exactly as today.
- **Bots participate**: nations gain minimal Tribal build behavior (Settlement/Farmland/Barn) so singleplayer worlds exercise the same economy.
- **Balance harness**: headless seeded-game runner with snowball metrics (leader territory share over time, Gini, starvation/death rates, time-to-elimination) to tune the knobs before UI polish.

## Capabilities

### New Capabilities

- `food-economy`: player food stock — production from fertility and Farmland, Barn-capped storage, decay, activity-scaled consumption, and food-gated population growth/starvation.
- `tribal-buildings`: Settlement/Farmland/Barn unit types — food costs, placement rules, and their effects on cap/production/storage.
- `balance-harness`: headless seeded game runs emitting balance metrics for knob tuning.

### Modified Capabilities

<!-- none — vanilla behavior on unlayered maps is unchanged; layered-map behavior is new capability, not a modified existing spec -->

## Impact

- **Core sim:** new `FoodExecution` (per-player tick pass) or extension of `PlayerExecution`; `PlayerImpl` (food stock, cap fields); `Game.ts` (UnitType additions, PlayerActions); `Config.ts` (all knobs under one `food` block); `Schemas.ts` (build intents already generic via `build_unit`); `ExecutionManager`/`ConstructionExecution` (new unit cases); stats/updates plumbing for the client.
- **Bots:** `NationStructureBehavior`/`NationExecution` minimal Tribal build logic, gated on `hasLayers()`.
- **Client:** BuildMenu entries + icons, ControlPanel food readout (stock/cap, production vs consumption), unit rendering for the three buildings (StructurePass sprites).
- **Balance:** new `tests/perf/balance/` harness built on the FullGamePerf pattern.
- **Dependencies:** requires `add-map-layer-sidecars` (crop layer in sim) and re-baked layered maps for real playtests.
