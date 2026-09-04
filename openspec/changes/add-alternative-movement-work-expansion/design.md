## Context

The alternative sandbox now has global food production/spending and settlement-distance logistics. Expansion still behaves like a claim gate. The next step is to make expansion speed emerge from movement work: food supplies energy, troops provide throughput, and terrain/logistics determine how much work a move requires.

## Goals / Non-Goals

**Goals:**

- Convert frontier expansion from instant claim to multi-tick movement jobs.
- Treat capture as the result of moving troops into a neutral tile.
- Spend food into movement work each tick.
- Use command `troops` as temporary throughput until real per-tile troop mass exists.
- Show enough movement-work state in the sandbox to playtest progress.

**Non-Goals:**

- No real per-tile troop storage.
- No magnet hold, drag campaigns, local food delivery, combat, enemy troop resistance, networking, or AI.
- No redesign of the base OpenFront game engine.

## Decisions

- Represent active frontier work as `MovementJob` state inside the alternative expansion system:
  - `from`: owned source tile
  - `to`: neutral destination tile
  - `ownerId`
  - `troopAmount`
  - `workRemaining`
- Compute work once when the job is created:
  - `baseMoveWork * troopLoadCost(troopAmount) * terrainCost(to) * slopeCost(from, to) * logisticsCost(to)`
- Apply work every tick:
  - `workCapacity = troopAmount * troopWorkPerTick`
  - `spent = min(food, workCapacity, workRemaining)`
  - food decreases by `spent`
  - `workRemaining` decreases by `spent`
- Claim the destination tile only when `workRemaining <= 0`.
- Keep the current frontier priority logic. The best frontier tile creates or advances one movement job at a time.
- If food is zero, the job remains active with unchanged work. This models low-energy slowdown without deleting the player's order.
- Use the existing elevation layer when present for slope cost; otherwise slope cost is `1`.

## Risks / Trade-offs

- Using command `troops` as throughput is not true troop simulation. Mitigation: this is the smallest bridge until a `troop.mass` layer exists.
- One active job is less expressive than many simultaneous fronts. Mitigation: enough for click-to-expand playtesting; drag campaigns can add multiple jobs later.
- Existing balance constants will be rough. Mitigation: keep constants local to the alternative movement-work code.
