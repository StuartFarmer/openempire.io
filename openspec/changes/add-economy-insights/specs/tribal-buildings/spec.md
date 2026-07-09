# Spec delta: tribal-buildings (add-economy-insights)

## MODIFIED Requirements

### Requirement: Bots build Tribal structures

All AI players SHALL run the tribal economy — nations *and* plain tribe bots (previously build-less). The shared policy SHALL maximize food and troops rather than merely survive:

- **Farmland**: build (fertility-floored, adjacency-scored) while projected production is below what the current population **cap** consumes, with margin — feeding potential, not just present mouths.
- **Settlement**: build when population approaches the cap, growing capacity ahead of demand.
- **Barn**: build when the stock nears the storage ceiling.
- Multiple plots MAY be placed per AI pulse (budgeted), so economies scale into the dozens-of-plots regime the plot economics assume. Tribes use a smaller budget/cadence than nations.

#### Scenario: Nations industrialize

- **WHEN** a seeded nation game runs at default knobs
- **THEN** nations build farms substantially beyond break-even (production approaching cap consumption) and raise settlements/barns accordingly

#### Scenario: Tribes farm too

- **WHEN** a plain tribe bot survives several hundred ticks on a layered map
- **THEN** it has painted farms beyond its starter kit
