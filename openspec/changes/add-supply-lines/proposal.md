# Proposal: add-supply-lines

## Why

Distance currently costs nothing: a farm on the far frontier yields like one beside the capital, and an army campaigning a continent away eats at the same rate as one defending home. The dead-end repo's investigation identified two portable nuggets — a deterministic owned-tile distance field (its "logistics" module) and a smooth distance-decay supply formula (its troop-food sandbox) — that make *where* you build and fight matter without making food spatial.

## What Changes

- **Supply field**: per player, a multi-source integer BFS over owned land from supply nodes (completed Settlements and Barns), refreshed on a cadence. Tile supply quality = `1/(1 + (distance/supplyRadius)^supplyDecayPower)` — smooth falloff, not a hard radius. (Lives on the `supply-lines` branch so it can be dropped wholesale if playtests reject it.)
- **Farms need supply**: a farm plot's production is multiplied by its tile's supply quality — frontier farms far from any town/granary underperform until the district catches up.
- **Armies need supply lines**: a land attack's fighting consumption scales up as its front outruns supply — campaigning far from your granaries can multiply the 4× war rate further (knob-capped). Armies that overextend starve in the field (starvation already reaches deployed troops).
- **Supply overlay (client)**: a toggleable view shading owned territory by supply quality (the sandbox's legible-heatmap UX), so players see their logistics envelope before committing to a push.

## Capabilities

### Modified Capabilities

- `food-economy`: farm production and war consumption gain supply-quality terms.

### New Capabilities

- `supply-field`: the deterministic distance/quality field and its knobs.

## Impact

- Core: new `SupplyField` (execution/utils), refresh hook in PlayerExecution, terms in FoodEconomy; FoodConfig knobs (radius, decay power, refresh cadence, war penalty cap). Attack front tracking for army supply sampling.
- Client: supply overlay view mode (display-only recompute from client-side unit/territory data — no wire changes).
- Bots: TribalEconomy placement already clusters districts; no change required initially (recorded as a watch item).
- Tests: quality math, farm falloff, army overextension penalty, determinism; harness re-run.
