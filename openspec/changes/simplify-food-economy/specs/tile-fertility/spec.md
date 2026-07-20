# Spec: tile-fertility

The baked per-tile fertility field — the single terrain-quality number the
whole simplified economy reads. See design.md D1.

## ADDED Requirements

### Requirement: Fertility is one baked 0..1 number per tile

The sim SHALL compute a per-tile fertility value in [0, 1] exactly once at map load, from the existing layer bytes: `fertility = (cropN + moistureN + tempFit) / 3`, where `moistureN = (humidityN + waterN) / 2` and `tempFit = max(0, 1 − |temperatureN − fertilityTempOptN| / fertilityTempWidthN)`. Water and impassable tiles SHALL have fertility 0. The plane SHALL be stored as one byte per tile and all runtime reads SHALL be plain lookups — no per-tick recomputation, no additional formulas between terrain and production other than the `fertilityBonus` multiplier applied at the point of farm production.

#### Scenario: Average land scores 0.5

- **WHEN** a tile's crop, humidity, water, and temperature bytes all sit at the middle of their ranges (128), with default `fertilityTempOptN`/`fertilityTempWidthN`
- **THEN** its fertility is 0.5 (±1 quantization step)

#### Scenario: One number, baked once

- **WHEN** the same map is loaded twice (any client, any session)
- **THEN** the fertility planes are byte-identical, and changing a tuning knob other than the fertility-formula knobs never changes the plane

### Requirement: Fertility is visible before it matters

The client SHALL offer a fertility overlay rendering the exact baked plane, so a player can read the quality of land before planting or invading. The overlay SHALL be the same data the sim uses — never a separate approximation.

#### Scenario: Reading the land

- **WHEN** the player enables the fertility overlay
- **THEN** every land tile is tinted by its baked fertility, and a hovered tile's readout shows the numeric value the sim will use
