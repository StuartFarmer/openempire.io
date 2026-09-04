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

Each build pulse the planner SHALL generate candidate placements for its
banked seeds (revised by rework-settlement-ecology §7: lone Farmland sites,
lone Settlement sites, and — when a founding pair is banked — JOINT
town-plus-field candidates), score every candidate with the model in
population-ticks, and execute the highest-scoring action whose score is
strictly positive. Farm candidates SHALL be priced as the field the nucleus
can grow, capped by the labor in reach (the coverage gate); Settlement
candidates SHALL be priced as urban-room relief plus the labor they unlock
at labor-capped fields; every seed site SHALL be discounted by proximity to
rival territory. When no candidate scores positive, the planner SHALL build
nothing and keep the seeds banked. Candidate sampling MUST use the
caller-provided seeded PRNG so runs stay deterministic.

#### Scenario: Barren land is left unfarmed

- **WHEN** every sampled Farmland candidate's field room is dead ground
  (no claim-viable spreadable tiles)
- **THEN** no farm is built that pulse — without any fixed fertility-floor
  constant

#### Scenario: An unstaffable frontier is left unfarmed

- **WHEN** a fertile Farmland candidate has no housed people within labor
  reach and no paired Settlement to staff it
- **THEN** its labor-capped score is zero and the farm seed stays banked
  for a site a town can serve

#### Scenario: A banked pair founds a district under seed pressure

- **WHEN** a player banks both a Settlement seed and a farm seed and owns
  ground where a joint site scores positive
- **THEN** the pair is placed together that pulse — town and field in
  standoff reach of each other — without waiting for urban-room starvation

#### Scenario: Settlements relieve room starvation and labor starvation

- **WHEN** the food-supported city size exceeds the placeable room inside
  the supply field, OR an existing field is capped below its room by the
  labor coverage gate
- **THEN** a Settlement candidate that brings new suitable room into supply
  reach (or staffs the starved field from within its food-shed) scores
  positive and is founded there

#### Scenario: Seeds avoid the contested frontier

- **WHEN** two otherwise-identical seed sites differ only in distance to a
  rival player's territory
- **THEN** the site near the rival border scores strictly lower (conquest
  hard-resets tenure and maturity — a frontier seed is a wasted seed)

#### Scenario: One labor pool is never counted twice

- **WHEN** a candidate site lies within labor reach of an existing worked
  field
- **THEN** the staffing that field already commits is subtracted from the
  candidate's resident count — a "new district" one cell over, whose only
  labor would be the old district's people, scores near zero

#### Scenario: Farmers stay home

- **WHEN** the AI sizes an outgoing attack while its fields are worked and
  no attack is incoming
- **THEN** the troops kept in reserve are at least the tilled set's
  staffing (`tilled × farmersPerFieldTile`) — expansion spends the spare
  hands, never the harvest; a player under attack fights unreserved

#### Scenario: Determinism

- **WHEN** the same game state and PRNG seed run the planner twice
- **THEN** the same actions are chosen
