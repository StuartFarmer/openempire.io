## Context

The alternative sandbox already has a `BoardRuntime`, an OpenFront-style expansion system, and a timer loop. Expansion currently claims wilderness without a resource cap. The next playable step is a small economy loop where food is global energy, produced every tick, and spent by expansion.

## Goals / Non-Goals

**Goals:**

- Milestone 1: make `#alternative` playable with initial settlement placement, food production, food spend, and food-limited expansion.
- Use settlement distance as the first logistics friction: farther tiles cost more food.
- Show food stock, food production, and expansion state in the sandbox.
- Keep storage unlimited.

**Non-Goals:**

- Milestone 2 farm building and additional settlement building are planned but not implemented here.
- No magnet hold, drag campaigns, local food storage, delivery routing, combat, AI, networking, or base OpenFront engine changes.

## Decisions

- Store food in `BoardRuntime.globals` by owner id. This is enough for one-player sandbox play and avoids a player model.
- Store settlements as `BoardEntity` records with `type: "settlement"` and `tileRef`. The first placement creates the initial settlement.
- Add a derived `settlement.distance` layer to the alternative runtime. Recompute it from settlement entities when ownership changes; the map is small enough for a simple breadth-first fill.
- Spend food inside the alternative expansion system before claiming a tile. If food cannot pay for the full tick, expansion claims fewer tiles and waits for later production.
- Keep current OpenFront-style frontier priority. The only behavior change is the food gate.
- Surface economy numbers through lightweight helper functions used by the sandbox UI and tests.

## Milestone Plans

### Milestone 1: Food-Constrained Expansion

- Initial settlement produces base food per tick.
- Expansion claims neutral land only when food can pay the settlement-distance cost.
- Sandbox HUD shows food, production, owned tiles, and settlement count.
- Manual and timer expansion both use the same food gate.

### Milestone 2: Farms And Additional Settlements

- Add build controls for farms and settlements.
- Farms add food production.
- Additional settlements reduce distance costs nearby.
- Building costs food and uses the same settlement-distance multiplier.

Milestone 2 is deferred from this change.

## Risks / Trade-offs

- Global food is not real logistics yet. Mitigation: all spending routes through the same food/cost helpers so local storage can replace the backing implementation later.
- Recomputing settlement distance by scanning the map is O(tile count). Mitigation: acceptable for the sandbox; cache/dirty refs can come later if needed.
- Food balance numbers are first-pass. Mitigation: keep them constants in one alternative economy module.
