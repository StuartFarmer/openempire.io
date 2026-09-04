# Spec delta: food-economy (rework-tribal-scarcity)

## MODIFIED Requirements

### Requirement: Production comes from fertile owned land and Farmland

Farmland SHALL be the primary food source: each Farmland contributes production proportional to its tile's crop byte (and level). Natural land harvest SHALL be marginal and sublinear — proportional to `fertilitySum^exponent` with exponent < 1 (default 0.5) — so expansion has extreme diminishing returns and cannot by itself sustain a meaningful population. A tile's fertility contribution SHALL still move to the conqueror when territory changes hands (it prices where farms are worth building).

#### Scenario: Land alone cannot feed a nation

- **WHEN** a player owns a large territory with no Farmland
- **THEN** natural production sustains only a small fraction of the population cap, and quadrupling territory at most doubles natural production

#### Scenario: Farms are the production engine

- **WHEN** a player builds Farmland on fertile tiles
- **THEN** production rises linearly with farms (scaled by tile fertility), dwarfing the land harvest

#### Scenario: Conquest transfers land harvest

- **WHEN** player A captures fertile tiles from player B
- **THEN** A's fertility sum rises and B's falls by the same amount

## ADDED Requirements

### Requirement: Gold is removed on layered maps

On layered maps there SHALL be no gold: zero starting gold, no per-tick gold income, no gold display in the HUD, and no gold-costed units offered in the build menu. Classic (unlayered) maps SHALL keep gold behavior byte-identical to vanilla.

#### Scenario: No gold accrues

- **WHEN** a game runs on a layered map
- **THEN** every player's gold is 0 at start and no per-tick gold income is added

#### Scenario: Classic maps unchanged

- **WHEN** a game runs on an unlayered map
- **THEN** starting gold and gold income match vanilla exactly

### Requirement: Players start with a survival stake

On layered maps each player SHALL start with a configured food stock — enough to buy early Farmland but not enough to avoid hard choices. A population above what raw land sustains SHALL shrink toward the land's carrying capacity unless production investments are made.

#### Scenario: Invest or starve

- **WHEN** a player spends nothing after spawning
- **THEN** the stock drains, then population starves down toward the land-sustainable level

### Requirement: Ghost starting infrastructure

Every player SHALL start with one "ghost" Settlement and one "ghost" Farmland — baseline population cap equal to one built Settlement and baseline production equal to one decent built Farmland — without physical buildings on the map. Built structures add on top.

#### Scenario: Ghost baseline

- **WHEN** a player has no buildings
- **THEN** their population cap equals one Settlement's worth and their production includes one Farmland's worth

### Requirement: Starvation applies to deployed troops

Starvation deaths SHALL be distributed proportionally across the whole population — the idle pool, troops committed to attacks, and troops on boats. Deployment MUST NOT shelter an army from famine (armies eat more while fighting, so overextended pushes shrink).

#### Scenario: No famine shelter

- **WHEN** two equally provisioned players face the same deficit and one commits its army to an attack
- **THEN** the attacker's total population (idle + deployed) ends no better off than the idle player's

### Requirement: Uniform, sustainable start population

On layered maps every player type SHALL start with the same population (`startPopulation`), sized to what the ghost infrastructure plus a modest spawn's land harvest can feed — an idle player at spawn SHALL neither starve nor grow (stasis; only storage decay pressures the stake). Classic maps keep vanilla startManpower.

#### Scenario: Idle spawn is stable

- **WHEN** a player spawns and takes no actions for hundreds of ticks
- **THEN** their population holds at the start level with zero starvation
