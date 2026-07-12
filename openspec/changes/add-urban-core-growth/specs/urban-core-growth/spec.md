# Spec: urban-core-growth

## ADDED Requirements

### Requirement: Found a capital

On layered maps, spawning SHALL place a single urban Core at the chosen tile instead of the starter-kit plots, seeding the density field there. A player has one Core; re-spawning re-founds it. The Core is the origin of the supply field and the first growth nucleus.

#### Scenario: Founding

- **WHEN** a player spawns on a layered map
- **THEN** exactly one Core exists at the spawn tile, that tile's density is non-zero, and no painted plots are created

### Requirement: Per-tile urban density field

Each owned land tile SHALL carry an urban density in `[0,1]` (integer milliunits internally). The density field replaces discrete plots: food production, consumption, and the population cap are computed from `density × fertility`, not from plot counts. Deterministic across clients.

#### Scenario: Density feeds people

- **WHEN** a tile's density rises
- **THEN** its contribution to production, consumption, and the population cap rises accordingly, with no plot object involved

### Requirement: Logistic area dynamics

Per player per tick, total built area SHALL advance by `ΔA = r · A · (1 − A/K)`, where `A` is summed density, `K` is the summed suitability of reachable owned land, and `r` is a base rate scaled by the food surplus fraction. Growth is fast when `A ≪ K`, saturates as `A → K`, and reverses (deurbanization) when the city is underfed. This reproduces the empirical S-curve.

#### Scenario: S-curve

- **WHEN** a well-fed city grows from founding
- **THEN** its area accelerates while small, decelerates approaching `K`, and plateaus near `K`

#### Scenario: Starvation deurbanizes

- **WHEN** production cannot feed the population and storage is empty
- **THEN** `ΔA ≤ 0` and density recedes rather than growing

### Requirement: Suitability-driven spatial growth

The per-tick area budget SHALL be deposited on frontier tiles with probability proportional to `s⁺(x) = max(0, w_food·crop + w_water·(freshwater + w_shore·shore) + w_logi·supplyQuality(x→core) + infra − w_cong·localDensity)`. The congestion term saturates the interior and pushes deposition outward. Tiles the Core cannot reach through owned land (supply quality ≈ 0) do not urbanize.

#### Scenario: Emergent density gradient

- **WHEN** a city grows under the suitability rule with congestion
- **THEN** density decays approximately exponentially from the Core and the built radius scales roughly as √(area), without either being hand-coded

#### Scenario: Water and coast draw growth

- **WHEN** freshwater or shoreline tiles are within reach
- **THEN** the city preferentially expands toward them over dry interior land of equal fertility

### Requirement: Satellites and coalescence

A fraction of the growth budget SHALL seed satellite settlements beyond the frontier (chosen by suitability), which grow as independent nuclei and merge into the main city when their density fields meet.

#### Scenario: Polycentric growth

- **WHEN** growth is sustained over many ticks
- **THEN** detached settlements appear near high-suitability land and later connect to the main built area

### Requirement: Field-shaping infrastructure

The layered-map buildable set SHALL be infrastructure that reshapes the suitability field rather than city fabric: at minimum an Aqueduct (raises the water term along a corridor), a Road (extends supply reach / logistics), and a Granary (raises local carrying capacity). Each costs food. Placing infrastructure biases where the self-organizing city grows; it does not directly place density.

#### Scenario: Steering growth

- **WHEN** a player builds a Road toward distant fertile land
- **THEN** supply reach extends along it and the city subsequently grows in that direction

### Requirement: Razing sets the city back on its curve

Capturing territory SHALL remove its density (razing), dropping the loser's area below `K`; the logistic dynamics then regrow the survivor's captured land over subsequent ticks.

#### Scenario: Rebuilding ruins

- **WHEN** a district is captured and razed
- **THEN** its density resets low and regrows over time under the captor's growth dynamics
