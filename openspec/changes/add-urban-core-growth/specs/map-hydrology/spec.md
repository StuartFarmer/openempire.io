# Spec: map-hydrology

## ADDED Requirements

### Requirement: Freshwater layer plane

`layers.bin` SHALL carry a `water` plane (freshwater proximity, `0..255`) appended to the layer set, baked by the generator from its river/lake/irrigation fields. The sim reads it as `game.layer("water", tile)`. Shoreline and ocean-shore remain read directly from the terrain bitmask (no plane needed). Adding the plane is a format bump: every layered map's `layers.bin` is re-baked.

#### Scenario: Freshwater is available to the sim

- **WHEN** a layered map is loaded
- **THEN** `game.layer("water", tile)` returns high values near rivers and lakes and low values in dry interior land

#### Scenario: Coast is free

- **WHEN** the growth model reads shore suitability
- **THEN** it uses `isShoreline`/`isOceanShore` from the terrain byte, not a baked plane
