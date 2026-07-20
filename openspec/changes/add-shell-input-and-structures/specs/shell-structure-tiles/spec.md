# shell-structure-tiles

## ADDED Requirements

### Requirement: Structures render as per-tile fills over the terrain

OpenFront-live SHALL draw the tribal structures on their tiles, mirroring the
WebGL PlotPass/DensityPass as per-tile fills (not sprites). The shell SHALL
maintain two CPU-written per-tile GPU fields, uploaded each tick like `owner`:

- `plot`: `0` none, `1` Settlement, `2` Farmland, `3` Barn — rebuilt from
  `game.units(Settlement, Farmland, Barn)` (each a single-tile plot) plus claimed
  farm-CA tiles (maturity ≥ `food().fieldClaimMilli`, from packed field deltas).
- `density`: `0..255` urban density — maintained from the sim's packed density
  deltas (`round(density/1000·255)`).

The openfront overlay SHALL composite these over the terrain tint: a
density-graded urban wash, a flat Settlement fill, and a cultivated Farmland
tint derived from the tile's terrain colour.

#### Scenario: A built settlement appears on its tile

- **WHEN** the human builds a Settlement and the sim places it
- **THEN** that tile renders with the settlement fill over the terrain

#### Scenario: Farmland and city read distinctly

- **WHEN** a player's farmland spreads and its city core grows
- **THEN** claimed farm tiles render with the farmland tint and urban tiles
  render with a density-graded wash, distinct from plain owned territory

#### Scenario: Structure fields are CPU-written conduits

- **WHEN** OpenFront-live is running
- **THEN** the `plot` and `density` fields are overwritten from the sim each
  tick and are never GPU-ticked (render conduits, like `owner`)
