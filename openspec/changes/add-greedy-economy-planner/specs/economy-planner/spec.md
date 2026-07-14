# Spec: economy-planner (add-greedy-economy-planner)

The config-derived marginal-value model and greedy action policy for the bot
economy. See `../../design.md` for formulas and rationale.

## ADDED Requirements

### Requirement: Marginal values derive from live config and sim functions

The system SHALL provide a pure, deterministic economy model
(`EconomyModel`) whose scores are computed from `Config.food()` knobs, map
layers, and player state at call time — with no policy constants of its own
beyond a documented storage-accrual threshold. The model MUST reuse the
simulation's own functions (`climateSuitability`, food-shed decay, the
supply field) rather than re-implementing their formulas, and MUST express
every score in one currency: population-ticks over a horizon derived from
`farmGrowthRate`.

#### Scenario: Farm value equals realized sim yield

- **WHEN** the model predicts the steady-state yield of a farm at tile t
  (`climateSuitability(t) × cropN(t) × district(t) × farmYieldMilli`) and
  that farm is built and allowed to mature in a live game
- **THEN** the realized per-tick yield converges to the prediction within
  integer rounding

#### Scenario: Knob re-tune moves the optimum without code changes

- **WHEN** a food knob that enters a score (e.g. `farmYieldMilli`,
  `idleConsumptionMilli`, `farmlandCost`) is overridden
- **THEN** model scores reflect the new value immediately — a candidate that
  was unprofitable at old knobs can become the top pick, with no change to
  planner code

#### Scenario: Ramp discount is closed-form

- **WHEN** the model scores a farm candidate whose climate suitability is
  below another candidate's but whose yield is equal
- **THEN** the slower-ripening candidate scores lower via the exact Gompertz
  time-to-maturity (`ln(ln m₀ / ln M_target) / farmGrowthRate`), computed
  without simulating ticks

### Requirement: Greedy policy picks the best strictly-positive action

Each build pulse the planner SHALL generate candidate actions (Farmland
sites, Settlement sites, Barn), score every candidate with the model, and
execute the highest-scoring action whose score is strictly positive and
whose food cost is affordable. When no candidate scores positive, the
planner SHALL build nothing and bank the pulse. Candidate sampling MUST use
the caller-provided seeded PRNG so runs stay deterministic.

#### Scenario: Barren land is left unfarmed

- **WHEN** every sampled Farmland candidate's lifetime population value is
  below its food cost (barren soil or hostile climate)
- **THEN** no farm is built that pulse — without any fixed fertility-floor
  constant

#### Scenario: Settlements relieve room starvation

- **WHEN** the food-supported city size (`capacity / popPerDensity`)
  exceeds the owned, urban-suitable tiles reachable inside the current
  supply field
- **THEN** a Settlement candidate that brings new suitable room into supply
  reach outscores additional farms and is founded near uncovered farm
  clusters or the border

#### Scenario: Barns are insurance, never growth

- **WHEN** storage capacity is below one generation of full population
  consumption (`pop × idleConsumptionMilli × avgLifespanTicks`) and the
  stock is actually accruing near the cap
- **THEN** a Barn scores positive — but never above a positive farm or
  settlement score of equal cost

#### Scenario: Determinism

- **WHEN** the same game state and PRNG seed run the planner twice
- **THEN** the same actions are chosen
