# runtime-terrain-derivation

## ADDED Requirements

### Requirement: The shell derives world layers from the primary field at map load

When a map loads in the game shell, the system SHALL derive ocean, temperature, precipitation, drainage/watermap, lakes, irrigation, humidity, and biome layers on the GPU from the map's `elevation.bin` and manifest render config, using the existing worldgen derivation passes (headless, on the shell's shared device). Derivation SHALL be a one-time load step (re-run only when derivation-affecting parameters change), not per-tick work.

#### Scenario: Load-time derivation completes and feeds the sim

- **WHEN** a map with an elevation sidecar loads in the shell
- **THEN** the derived layers exist as GPU buffers readable by the resident field system, without any CPU readback of intermediate fields

#### Scenario: Derivation is reproducible

- **WHEN** the same map loads twice with the same render config
- **THEN** the derived layers are identical on that device

### Requirement: Live terrain colors render from derived layers

The shell's terrain view SHALL render via the worldgen color pass over the derived layers (not the baked `terrain-colors.png`), producing terrain visually equivalent to the baked colors when using the manifest's render config — including depth-ramped ocean from true elevation rather than shore-distance artifacts.

#### Scenario: Default config matches the baked look

- **WHEN** the shell renders the live terrain with the manifest's render config, unmodified
- **THEN** oceans show smooth depth ramps and land shows the generator's biome/altitude/coast/contour coloring, with no shore-distance halos or magnitude-quantization artifacts

### Requirement: Water classification is 100% faithful to the shipped map

Derived water flags SHALL come from the shipped map, never from sea-level or lake thresholds: water tiles are map.bin's non-land tiles, classified per connected body as SEA (the map's ocean bit anywhere in the body, or genuinely deep bathymetry in elevation.bin — enclosed seas like the Mediterranean and Caspian that the baker's largest-body-only ocean rule misses) or LAKE (shallow bodies — the Great Lakes). No ocean flood and no threshold lake detection runs at load; land is never reclassified as water or vice versa.

Real inland lakes that are LAND in map.bin (the coastline mask carries no lake holes — the Great Lakes, the Great Salt Lake, Baikal, Victoria) SHALL flag as lakes from the dedicated `lake` plane of the `hydro.bin` sidecar (the shipped standing-water mask), NOT from a threshold on a merged freshwater plane. Lakes and rivers SHALL be distinguishable in the shipped data (separate `hydro.bin` planes) so the renderer never mistakes a saturated river corridor for a lake.

#### Scenario: Enclosed seas and real lakes render as themselves

- **WHEN** EarthXL derives
- **THEN** the Mediterranean/Black/Caspian render with the sea depth ramp, the Great Lakes and Great Salt Lake render as lakes (from the hydro lake mask), rivers render as rivers (from the hydro river plane, gated by the river thresholds), and no water appears where the map has none

### Requirement: The real climate planes are the base — nothing synthetic

By default the derived climate SHALL come entirely from the map's baked planes (layers.bin — real measurements on earth maps, the engine's own derivation on generated ones): land temperature = temperature plane + seasonal swing, and moisture (humidity, biome classification, river seeding, color texture) = humidity plane, with no synthetic noise anywhere in the real path. Open-water temperature uses the smooth synthetic latitude model (the measured plane is land-extrapolated over water). The synthetic model SHALL remain available as an explicit toggle, where `latitudeEffect`/`elevationCooling`/`rainNoise`/`warmthRainfall` apply.

#### Scenario: Faithful climate by default

- **WHEN** EarthXL derives with the real base enabled (default)
- **THEN** the Sahara classifies dry (sand) and the Congo wet (rainforest) from measured moisture, land temperature matches the baked plane at year phase zero and swings with the seasons, and toggling the base off switches to the tunable synthetic model without reloading

### Requirement: Permanent ice classifies and renders with a snow gradient

Land colder than a runtime `iceThreshold` (default −8 °C in the plane's linear encoding — the baked earth pipeline's `iceTempC` rule) SHALL classify as the palette's Ice biome and render as clean ice (relief shading, no vegetation tinting, no rivers). Above the threshold, snow cover SHALL fade over a runtime `snowBand` temperature width (full pack at the ice line → bare ground at `iceThreshold + snowBand`), so the winter line reads as a gradient rather than a hard cut, and the whole band moves with the seasonal temperature.

#### Scenario: Ice follows the live temperature

- **WHEN** the year phase advances with a nonzero tilt
- **THEN** the ice boundary and its snow fringe advance and retreat hemisphere-appropriately, and setting `iceThreshold` to zero disables both

### Requirement: Climate knobs are runtime scalars

Climate and rendering parameters — at minimum `latitudeEffect`, `elevationCooling`, `rainNoise`, `warmthRainfall`, the river thresholds, the seasonal parameters, `iceThreshold`, `snowBand`, and `biomeBlend` — SHALL be adjustable at runtime in the shell, re-deriving the affected layers and colors without reloading the map. Water classification (sea/lake/land) is NOT a knob — it comes from the shipped map and the hydro lake mask.

#### Scenario: Latitude effect responds live

- **WHEN** the user adjusts `latitudeEffect` in the shell (synthetic model mode for temperature; always for precipitation)
- **THEN** the affected coloring updates without a page or map reload

### Requirement: Real continentality when seasonal data ships

When a map ships the optional `season.bin` sidecar (a per-tile first-harmonic fit — amplitude + phase — of real monthly temperature), the derived seasonal swing SHALL come from it: `T = mean + amplitude·cos(2π·(yearPhase − phase))·seasonStrength`, so tiles at the same latitude with different continentality swing differently. Maps without the sidecar SHALL fall back to the latitude×tilt model. Ocean (no measured data) keeps the synthetic model.

#### Scenario: Maritime vs continental at equal latitude

- **WHEN** EarthXL sweeps a year with `season.bin` present
- **THEN** a maritime tile (Ireland) swings far less than a continental tile (Siberia) at the same latitude, and both peak in their hemisphere's summer — behavior the latitude model cannot produce

### Requirement: The seasonal model drives derived temperature

The live temperature used for coloring SHALL be the derived temperature field modulated by the resident sim's seasonal model (axial tilt, latitude, year phase), replacing the interim baked-mean approximation, so seasonal and climate parameters compose in one temperature signal.

#### Scenario: Seasons act on derived climate

- **WHEN** the year phase advances with a nonzero tilt
- **THEN** snowlines and sea ice shift hemisphere-appropriately over the derived temperature field, and setting tilt to zero freezes the seasonal variation while leaving the derived climate intact

### Requirement: The baked path remains the fallback

`terrain-colors.png` SHALL remain the in-game renderer's base texture and the shell's terrain fallback when derivation is unavailable (missing sidecar during migration, or derivation failure). Runtime derivation failures SHALL surface as a visible status and fall back rather than rendering a broken view.

#### Scenario: Graceful fallback

- **WHEN** derivation cannot run for a map
- **THEN** the shell shows the baked terrain view and a status message, and the rest of the shell remains functional
