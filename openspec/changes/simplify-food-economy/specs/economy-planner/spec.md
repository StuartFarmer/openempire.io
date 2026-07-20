# Spec: economy-planner

Bot economy under the simplified model: two rules. See design.md D8.

## ADDED Requirements

### Requirement: Bots buy farms on the best visible footprint

When a bot can afford a Farmland and a legal site exists, it SHALL place one on the candidate site with the highest average footprint fertility among a bounded, deterministically-sampled set of owned tiles (respecting the spacing rule). The planner SHALL use only the baked fertility plane and ownership — no yield forecasting, no labor models, no population-tick calculus.

#### Scenario: Bots farm the good land

- **WHEN** a bot's territory spans high- and low-fertility regions and it can afford a farm
- **THEN** the farm lands in the high-fertility region (best sampled footprint), never on a spacing-invalid site

### Requirement: Bots invest in the binding ceiling

Population grows toward `min(foodCapacity, housing)`, so when a bot can afford to build, it SHALL buy whichever ceiling currently binds: a Settlement when housing is at or below food capacity (raising housing), a Farmland otherwise (raising capacity), falling back to the other type when the preferred one has no affordable legal site. The two purchases alternate naturally as each unbinds the other. (Refined during implementation 2026-07-20: a fixed housing-bound trigger let the logistic asymptote just under it — bots froze at one Settlement; the binder rule self-paces.)

#### Scenario: Unbinding growth

- **WHEN** a bot's food capacity exceeds its housing and a Settlement is affordable
- **THEN** it places a Settlement and its population resumes growing toward the raised ceiling

#### Scenario: Food capacity binds

- **WHEN** a bot's housing exceeds its food capacity and a Farmland is affordable
- **THEN** it places a Farmland (on the best sampled footprint) rather than a Settlement

## REMOVED Requirements

### Requirement: District-founding planner (population-ticks, pair siting, labor relief)

**Reason**: The §7/§9 planner existed to predict the farm CA + labor + shed systems for the AI; those systems are deleted, so the calculus predicts nothing.
**Migration**: The two rules above. `fieldRoomYield`, `farmDistrictScore`, `farmLaborRelief`, pair candidates, and the commitment ledger are deleted.

### Requirement: Farmers stay home (fieldStaffingNeed attack reserve)

**Reason**: Coupled attack sizing to the deleted labor-coverage system.
**Migration**: `AiAttackBehavior` keeps its vanilla-era reserve/trigger logic without food-labor coupling; the mop-up rule survives unchanged.
