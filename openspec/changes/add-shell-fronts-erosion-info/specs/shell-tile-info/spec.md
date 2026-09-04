# shell-tile-info

## ADDED Requirements

### Requirement: The tile info box combines sim and terrain state

The OpenFront-live hover readout SHALL report, for the hovered tile: ownership
and the owner's troops; the structure/urban-density/farm-growth state; soil
fertility; combat damage (when present); and the terrain detail from the
derivation — elevation, surface, temperature, humidity, and biome.

#### Scenario: Hovering a developed tile

- **WHEN** the human hovers an owned tile with a settlement or farmland
- **THEN** the readout names the owner and troops, the structure/urban/farm
  state, the fertility, any battle damage, and the terrain (elevation, surface,
  temp, humidity, biome)

#### Scenario: Hovering wild land or sea

- **WHEN** the human hovers unclaimed land or sea
- **THEN** the readout still shows the terrain detail (and "unclaimed"/sea)
