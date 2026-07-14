## Why

The shared bot economy brain (`TribalEconomy`) decides with hand-tuned magic
numbers — `FARMS_PER_SEED = 12`, `MIN_FARM_CROP = 30`,
`BARN_AT_STOCK_FRACTION = 0.85` — that silently go stale every time a
`Config.food()` knob is re-tuned in the balance sweep. But the food economy is
closed-form: production milli/tick → supported population
(`capacity = production / idleConsumptionMilli`) → city size
(`population / popPerDensity`) → pop cap. The AI can therefore _derive_ the
optimal action from the live config instead of assuming it, and it retunes
itself automatically whenever the knobs change — making optimal bot play a
balance instrument rather than a maintenance liability.

## What Changes

- New pure, deterministic `EconomyModel` module
  (`src/core/execution/utils/EconomyModel.ts`): marginal-value formulas for
  each candidate action, derived from `Config.food()` and layer data —
  - farm at tile t: steady yield = climateSuitability × cropN × district ×
    farmYieldMilli, ΔPop = yield / idleConsumptionMilli, discounted by the
    Gompertz maturation ramp and gated by food-shed reach;
  - settlement at tile s: value of the new food-shed it unlocks (best
    farm sites within `foodShedRadius` not already covered by an existing
    nucleus's shed);
  - barn: expected deficit-buffering value vs. current storage cap;
  - all scores in one currency: population-ticks over a fixed horizon, minus
    cost converted at the same rate.
- `TribalEconomy.tryBuildOne` re-implemented as a greedy policy over model
  scores: generate candidates, score, execute the best affordable action;
  build nothing when every score ≤ 0 (replaces `MIN_FARM_CROP`). The three
  magic-number heuristics are deleted. Entry point (`tryBuild(budget)`) and
  callers (`NationExecution`, `TribeExecution`) are unchanged.
- Climate suitability is computed by the same function the sim uses
  (`FarmGrowth`), exported rather than duplicated, so the planner can never
  disagree with the simulation.
- Attack/conquest ROI is **out of scope** — this change covers economy
  actions (farm/settlement/barn) only.

## Capabilities

### New Capabilities

- `economy-planner`: config-derived marginal-value model and greedy action
  policy for the bot economy — scoring formulas, common currency, candidate
  generation, and the no-positive-score stop rule.

### Modified Capabilities

- `tribal-buildings`: the "Bots build Tribal structures" requirement changes
  from fixed heuristic triggers (farms-per-seed quota, stock-fraction barn
  trigger, minimum-fertility cutoff) to model-scored greedy selection; bot
  build behavior now tracks `Config.food()` re-tuning without code changes.

## Impact

- `src/core/execution/utils/EconomyModel.ts` (new), `TribalEconomy.ts`
  (rewritten policy), `FarmGrowth.ts` (export climate suitability).
- Behavior: bots on layered maps place farms/settlements/barns at
  model-optimal sites; classic (unlayered) maps untouched — `TribalEconomy`
  only runs behind `tribalEconomyActive()` which requires `hasLayers()`.
- Determinism: model is pure integer/float math over config + layers; the
  policy keeps the existing seeded-PRNG candidate sampling. No new deps.
- Tests: new `EconomyModel` unit tests pin model predictions to realized sim
  yield in a real game; existing `TribalEconomy`-dependent tests may need
  updating where they assert heuristic-specific behavior. Balance A/B via
  `tests/perf/balance/BalanceRun.ts` (verdantia, fixed seeds).
