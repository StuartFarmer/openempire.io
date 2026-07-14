# Spec delta: tribal-buildings (add-greedy-economy-planner)

## MODIFIED Requirements

### Requirement: Bots build Tribal structures

All AI players SHALL run the tribal economy — nations _and_ plain tribe bots. The shared policy SHALL be the greedy economy planner (see `economy-planner`): each pulse it scores candidate actions in population-ticks derived from the live `Config.food()` knobs and executes the best strictly-positive, affordable one — replacing the former fixed heuristics (farms-per-seed quota, minimum-fertility floor, stock-fraction barn trigger):

- **Farmland**: sited by model score (climate suitability × fertility × district adjacency, ramp-discounted); built while marginal farms repay their cost in supported population within the horizon.
- **Settlement**: founded when the food-supported city size outgrows the placeable urban room inside the supply field, sited to bring new suitable room and uncovered farm clusters into reach.
- **Barn**: built as insurance when storage falls below one generation of full population consumption and the banked share is actually accruing.
- Multiple plots MAY be placed per AI pulse (budgeted), so economies scale into the dozens-of-plots regime the plot economics assume. Tribes use a smaller budget/cadence than nations.
- Bot build behavior SHALL track knob re-tunes automatically: changing a `Config.food()` value SHALL change bot decisions with no planner code changes.

#### Scenario: Nations industrialize

- **WHEN** a seeded nation game runs at default knobs
- **THEN** nations build farms substantially beyond break-even (production approaching cap consumption) and raise settlements/barns accordingly

#### Scenario: Tribes farm too

- **WHEN** a plain tribe bot survives several hundred ticks on a layered map
- **THEN** it has painted farms beyond its starter kit

#### Scenario: Bots follow the knobs

- **WHEN** `farmYieldMilli` is cut so marginal-soil farms no longer repay their cost
- **THEN** bots stop farming those tiles in the same build (no heuristic constant needs re-tuning)
