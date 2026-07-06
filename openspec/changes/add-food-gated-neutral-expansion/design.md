## Context

OpenFront neutral expansion currently uses the normal attack execution. A land attack creates an `Attack` with committed troops, removes those troops from the player, expands across the frontier, and reduces the attack's troop count by terrain cost as tiles are conquered.

For Terra Nullius, the current cost is simple:

- Plains: `80 / 5 = 16` troop loss per tile for human/nation attackers.
- Highland: `100 / 5 = 20` troop loss per tile.
- Mountain: `120 / 5 = 24` troop loss per tile.
- Bots use half that loss through the existing `mag / 10` branch.

The first food mechanic should preserve the existing click/attack UX and frontier loop. It should not introduce farms, crop modifiers, storage, ore, metal, new movement controls, or a parallel game engine.

## Goals / Non-Goals

**Goals:**

- Add a food/energy resource visible in the normal solo-game HUD.
- Produce food from owned tile count.
- Spend food when conquering neutral wilderness tiles.
- Keep current OpenFront expansion path, map rendering, attack overlays, and solo-game startup.
- Keep player-vs-player attacks troop-based.
- Leave tuning constants in configuration so we can quickly playtest pacing.

**Non-Goals:**

- No farms or crop-rich tile modifiers yet.
- No food storage cap yet.
- No metal, ore, or production chains.
- No per-tile troop storage.
- No replacement of player-vs-player combat.
- No new alternative-game engine path.

## Decisions

1. Add food to player state, not to map tiles.

   Food is player-owned resource state like gold/troops. This keeps the first slice integrated with the existing game loop and avoids creating a tile economy layer before we know the mechanic feels good.

2. Produce food from owned tile count.

   Initial formula:

   ```text
   foodProducedPerTick = numOwnedTiles * foodPerOwnedTilePerTick
   ```

   `foodPerOwnedTilePerTick` should start as a config constant. Exact 1:1 parity with current OpenFront is not possible with this formula because current troop growth is nonlinear and capped. The cost side can be 1:1; the income side should be tuned until early expansion feels close.

3. Charge neutral expansion food using the current neutral troop-loss formula.

   Initial formula:

   ```text
   neutralFoodCost = currentNeutralAttackerTroopLoss * neutralFoodCostScale
   ```

   With `neutralFoodCostScale = 1`, default human/nation costs are:

   ```text
   Plains   = 16 food
   Highland = 20 food
   Mountain = 24 food
   ```

   This is the nearest 1:1 mapping because it reuses the same terrain costs that currently burn attack troops.

4. Keep attack pressure for speed, but stop burning troops on neutral captures.

   For this first slice, neutral attacks keep an internal attack amount as the speed/pressure input for `attackTilesPerTick()` and `attackLogic()`. Neutral tile conquest spends food instead of subtracting troop loss from the player's troop pool. Player-vs-player attacks continue to use current troop behavior.

5. Stop neutral expansion when food is insufficient.

   If the next neutral tile cost cannot be paid, the attack ends instead of waiting and auto-resuming. This keeps clicks meaningful and prevents one attack from becoming permanent growth fed by future income.

6. Show food in the existing HUD.

   The player must be able to start a normal solo game and see current food plus food income. No separate sandbox page is enough for this requirement.

## Risks / Trade-offs

- Exact parity is impossible with tile-count food income -> use current neutral terrain costs for 1:1 cost and keep income tunable.
- Existing attack UI is troop-oriented -> first implementation may keep attack ratio as expansion pressure; relabel wilderness attack controls only if the current text is confusing in playtest.
- Food can snowball because expansion increases owned tiles -> start with conservative income and no storage cap; add storage/logistics only when the base loop feels good.
- Bot behavior may change if bots use food gating -> either give bots the same food production or initially scope food gating to human/nation neutral expansion behind config.

## Milestone Direction

1. Rich generated maps in the original game.

   Complete enough for now: generated maps can carry rich visual colors through `terrain-colors.png`.

2. Food-gated neutral expansion.

   This change. Add food, tile-count food production, neutral expansion spending, HUD display, and tests. No farms.

3. Crop-rich land value.

   Later. Change production from `ownedTiles * rate` to `sum(tileCropValue) * rate`, using the generated resource/crop layer when available.

4. Farms and storage.

   Later. Farms multiply or unlock crop production. Storage caps prevent idle hoarding.

5. Materials and production.

   Later. Add metal/ore and building/unit production costs after food expansion works.
