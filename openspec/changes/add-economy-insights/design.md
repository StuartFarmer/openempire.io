# Design: add-economy-insights

## Decisions

1. **One economy brain, two drivers.** `TribalEconomy` (execution/utils) owns triggers + placement scoring (fertility floor, adjacency, near-plot sampling — moved from NationStructureBehavior). `tryBuild(budget)` places up to `budget` plots per call, re-evaluating triggers between placements. NationStructureBehavior delegates with budget 3 at its existing cadence; TribeExecution pulses budget 1 every ~25 ticks (tribes stay modest, nations industrialize).
2. **Maximizing farm trigger.** Old: `production < 1.5 × current consumption` (stops at subsistence). New: farm while `productionMilli < capConsumptionMilli × farmTargetFactor`, where capConsumption = maxTroops × idleConsumptionMilli — feed the *cap*; settlements then raise the cap, farms chase it, population grows into it. `farmTargetFactor` ~1.2 gives growth surplus. Settlement trigger at 0.75 × cap (ahead of demand); barn at 0.85 × storage ceiling with the settlements+2 bound.
3. **Panel data is all client-side already**: PlayerViews carry food/production/consumption; storage capacity approximated as `baseStorage + barnLevels × storagePerBarn` (adjacency omitted client-side — a ≤40% underestimate acceptable for a scale). Sampling every 5 ticks into a fixed ring buffer (~360 samples ≈ 3 min window); canvas redraw per tick is cheap at that size.
4. **Chart component** `ResourceChart` (Lit, canvas): inputs = {series(), capacity(), maxCapacityAllPlayers(), rank(), palette}. EconPanel composes it for food. HUD styling: dark panel like the leaderboard; stock line in the food amber, own-capacity as a dashed line, y-max label = leader capacity; rank badge "#N/alive".

## Risks

- [Bots overspend on farms and never save for settlements] → per-pulse budget re-checks triggers; settlement trigger precedes farm in priority when both fire.
- [Panel perf] → ring buffer + single canvas, redraw throttled to sample cadence.
