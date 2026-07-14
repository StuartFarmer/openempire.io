## 1. EconomyModel — the pure math

- [x] 1.1 Create `src/core/execution/utils/EconomyModel.ts`: derived horizon (`4 / farmGrowthRate`), food→population-ticks conversion, exact Gompertz `rampTicks` from `farmSeedMilli`/`farmGrowthRate`, and `farmScore(mg, player, tile)` = ramp-discounted steady-state yield minus cost (reusing `climateSuitability` from FarmGrowth)
- [x] 1.2 Add settlement scoring: `roomTiles` (owned, urban-suitable, non-farm tiles inside the current supply field), `roomDeficit` vs `capacity / popPerDensity`, and `settlementScore(site)` from new room brought into supply reach
- [x] 1.3 Add barn scoring: buffer target `pop × idleConsumptionMilli × avgLifespanTicks` vs current cap, gated on stock accruing near cap (named `STOCK_ACCRUAL_FRACTION` constant, documented)
- [x] 1.4 Unit tests `tests/EconomyModel.test.ts`: closed-form ramp matches iterated `farmTick` within tolerance; farm score ordering follows suitability/fertility/adjacency; knob overrides move scores (farmYieldMilli cut flips a marginal tile negative); zero-score on barren tiles

## 2. Greedy policy in TribalEconomy

- [x] 2.1 Rewrite `TribalEconomy.tryBuildOne`: sample farm/settlement candidates with the existing seeded-PRNG anchors, score all candidates + barn via EconomyModel, execute the argmax strictly-positive affordable action; delete `FARMS_PER_SEED`, `MIN_FARM_CROP`, `BARN_AT_STOCK_FRACTION`
- [x] 2.2 Settlement candidate sampling: anchor near farm clusters outside every existing nucleus's food-shed and near the border; keep `canBuild` checks and cost handling as today
- [x] 2.3 Update `tests/UrbanGrowth.test.ts` / any test pinned to old heuristics (farms-per-seed counts, barn stock-fraction timing) to assert planner-driven behavior; determinism test: same seed + state ⇒ same builds

## 3. Validation

- [x] 3.1 Pinning test: in a live small-map game, build the model's top-ranked farm, run to maturity, assert realized per-tick yield matches the model's steady-state prediction within rounding
- [x] 3.2 Balance A/B: `BalanceRun.ts` on verdantia, fixed seeds, before/after — record population/urban-area deltas and leader-share (snowball) in `balance-notes.md`
- [x] 3.3 `npm test` green (excluding the known-failing baseline), `npm run lint`, `npm run format`
