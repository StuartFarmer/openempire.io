# Proposal: rework-tribal-scarcity

## Why

Playtesting the first food economy showed a surplus glut: raw land produced enough food that building was never a trade-off, so games trended toward a "build-a-thon" where the fastest builder wins. Stuart's direction: the Tribal age must be constrained by costs and pressures — production, consumption, troop pushes — with investments that relieve pressure _at a price that temporarily puts you on the back foot_.

## What Changes

- **Gold is removed on layered maps** — **BREAKING** (layered maps only): no gold income, zero starting gold, gold UI hidden, gold-costed units absent from the build menu. Gold returns as metal/oil economies in later ages. Classic maps keep gold untouched.
- **Land harvest nerfed to near-irrelevance with extreme diminishing returns**: natural production scales with the _square root_ of owned fertility. Expansion alone cannot feed a nation — Farmland is required for any real food production.
- **Food mirrors the troop model**: Farmland raises the production rate, Barns raise capacity (storage), Settlements raise the population cap; growth stays logistic and surplus-throttled.
- **Escalating food costs**: each Settlement/Farmland/Barn costs more than the last (linear ramp, vanilla-style `costWrapper` counting), so purchases are branch decisions, not a shopping list. Storage caps what you can save, making Barns a gate for later cost tiers.
- **A deliberate opening arc**: players start with a small food stock and a population above what raw land sustains — invest in farms early or starve down to the land's carrying capacity, then grow back through investment.
- Bot heuristics and the balance harness updated for the new economy; knobs re-swept.

## Capabilities

### Modified Capabilities

- `food-economy`: production model (diminishing land harvest + farm-driven rate), starting stock, gold removal on layered maps.
- `tribal-buildings`: escalating costs; gold-costed units hidden on layered maps.

## Impact

- Core: `Config.ts` (FoodConfig v2, food cost wrapper, gold gates), `FoodEconomy.ts` (production form), `PlayerImpl.ts` (starting food/gold), `PlayerExecution.ts` (no gold income on layered maps).
- Bots: `NationStructureBehavior` cost checks move to `unitInfo().cost()`.
- Client: BuildMenu shows only food-costed units on layered maps; ControlPanel hides the gold chip; Leaderboard swaps its gold column for food on layered games.
- Tests: FoodEconomy suite renumbered to the new knobs; new scenarios for gold removal, diminishing land, escalating costs. Balance harness re-sweep recorded in balance-notes.
