# Design: add-food-allocation

## Decisions

1. **Share lives on the sim player, set by intent.** Unlike the attack-ratio bar (pure client state read at attack time), the allocation changes sim behavior every tick, so it must be deterministic: `food_allocation` intent → `FoodAllocationExecution` (one-shot: init sets the clamped share, deactivates) → `PlayerImpl._foodPopulationShare`. Included in player updates on layered games so the HUD slider reflects sim truth.
2. **Loop order** (foodTick): produce → `popMilli = floor(production × share)`, `storeMilli = production − popMilli` → `stock += storeMilli`, clamp to cap, overflow added to `popMilli` (rebate, spec step 5) → consumption computed as today (idle/boats/war with supply penalty) → `net = popMilli − consumption`: surplus throttles growth exactly as before but measured against the population's share, and is NOT banked; deficit draws from stock, then starves (existing proportional starvation). Decay last, as today.
3. **Surplus is not banked.** This is the point of the change: at share 1.0 a growing population consumes everything (status quo made explicit); banking happens only through the storage share. Keeps the slider meaningful at both ends.
4. **Default 0.7** (`defaultPopulationShare`): populations still grow briskly while 30% banks — close to the old feel, but a war chest actually accumulates. Bots keep the default (their build thresholds read the stock, which now fills steadily). Adaptive bot allocation is a recorded watch item.
5. **Overflow rebate applies to any overflow** (including direct grants beyond cap) — "surplus above the cap is lost" becomes "surplus above the cap feeds the population."

## Risks

- [Bots' stock accrual profile changes] → harness re-run; TribalEconomy thresholds unchanged.
- [Kit spawn now runs a mild share-scaled deficit] → stake buffers it (verified by the existing 200-tick idle test); revisit defaultPopulationShare if the opening dips too hard.
