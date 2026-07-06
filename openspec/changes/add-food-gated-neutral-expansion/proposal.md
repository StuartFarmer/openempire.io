## Why

Neutral expansion currently burns troops directly, which makes early growth feel like uncontrolled troop pressure. We want a playable first step toward an energy/food economy without replacing the OpenFront attack engine or adding farms/resources all at once.

## What Changes

- Add a player food/energy resource for the original game loop.
- Produce food from owned tile count as the first playable income model.
- Spend food when an attack conquers neutral wilderness tiles.
- Keep player-vs-player combat troop-based for this change.
- Keep existing OpenFront attack UX, frontier behavior, overlays, and solo-game flow.
- Expose the new food values in the in-game HUD so a solo game can be started and tested immediately.
- Defer farms, crop-rich modifiers, storage caps, metal, ore, and new troop movement controls.

## Capabilities

### New Capabilities

- `food-gated-neutral-expansion`: Players produce food from owned land and must spend food to expand into Terra Nullius.

### Modified Capabilities

- None.

## Impact

- Affected simulation code: player resource state, per-tick resource production, neutral `AttackExecution` tile capture cost.
- Affected configuration code: constants/formulas for food production and neutral expansion cost.
- Affected client/HUD code: display food amount, income, and starvation/stalled expansion state.
- Affected tests: focused simulation tests for production, spending, insufficient-food stalling, and player-combat fallback.
- No map binary, rich terrain sidecar, networking, AI, or map-generator format changes.
