# elevation-sidecar

## ADDED Requirements

### Requirement: elevation.bin format is owned by one shared module

The `elevation.bin` sidecar SHALL store the map's full-precision elevation as a single row-major plane of unsigned 16-bit little-endian values (2 bytes per tile, `width × height` entries, no header), quantized from the world engine's normalized `0..1` elevation via `round(clamp01(v) * 65535)`. One shared module (analogous to `MapLayers.ts` for `layers.bin`) SHALL own the format: encoder, decoder, and expected-size validation MUST all import it so producer and consumers cannot drift.

#### Scenario: Round-trip through the shared module

- **WHEN** a normalized elevation field is encoded with the shared module and decoded again
- **THEN** every tile's value is recovered within 1/65535 of the original, and the decoded plane has exactly `width × height` entries

#### Scenario: Size mismatch is rejected loudly

- **WHEN** an `elevation.bin` blob whose byte length is not `width × height × 2` is decoded
- **THEN** decoding throws an error naming the actual and expected sizes rather than returning truncated data

### Requirement: The generator exports elevation.bin with every map

The generator export path (`GeneratorMapExport`) SHALL produce `elevation.bin` from the engine's float elevation field alongside `image.png`, `terrain-colors.png`, `layers.bin`, and `info.json`, and the generator page SHALL offer it for download with the other artifacts.

#### Scenario: Exported set includes the elevation sidecar

- **WHEN** a world is exported from the generator page or `gen-world.ts`
- **THEN** the export includes an `elevation.bin` whose decoded values match the engine's elevation field for every tile

### Requirement: The manifest records the render config

The baked map manifest SHALL include the world-engine render config used at generation time — at minimum `seed`, `seaLevel`, `continentScale`, `mountainStrength`, `latitudeEffect`, `elevationCooling`, `rainNoise`, `warmthRainfall`, `riverFlowRetention`, `lakeWaterThreshold`, `lakeElevationRange`, `riverWeakThreshold`, and `riverStrongThreshold` — so runtime derivation reproduces the generation-time climate by default. Retrofitted maps SHALL record the config produced by their retrofit derivation.

#### Scenario: Config travels with the map

- **WHEN** a baked map's manifest is loaded
- **THEN** it contains a render-config block sufficient to run the worldgen derivation passes without out-of-band knowledge

### Requirement: The baker passes elevation.bin through untouched

The Go baker SHALL copy `elevation.bin` from the map source folder into the baked output with a size check against the manifest dimensions (`width × height × 2` bytes) and SHALL fail the bake loudly when the sidecar is missing or mis-sized. The baker MUST NOT parse or transform the plane.

#### Scenario: Missing sidecar fails the bake

- **WHEN** `gen-maps` processes a map folder without `elevation.bin`
- **THEN** the bake fails with an error naming the map and the missing sidecar

#### Scenario: Mis-sized sidecar fails the bake

- **WHEN** a map folder's `elevation.bin` does not match `width × height × 2` bytes
- **THEN** the bake fails naming actual and expected sizes

### Requirement: Image-only maps are retrofitted

`derive-layers.ts` SHALL write `elevation.bin` for maps whose engine state is gone (earth, earthxl, earthmini, spqr, world, majormenor), using the same elevation field it already reconstructs for its climate/resource derivation, so every map in `resources/maps/` ships the sidecar.

#### Scenario: Retrofit produces a consistent trio

- **WHEN** `derive-layers.ts` runs for an image-only map
- **THEN** the folder afterward contains `terrain-colors.png`, `layers.bin`, and `elevation.bin`, all dimensionally consistent with the manifest

### Requirement: Loaders expose the sidecar and tests enforce it

`MapData` SHALL expose `elevationBin()` alongside `layersBin()`, and map consistency tests SHALL fail when any map under `resources/maps/` lacks `elevation.bin` or ships one whose size disagrees with the manifest.

#### Scenario: Every shipped map has the sidecar

- **WHEN** the map consistency suite runs
- **THEN** it verifies `elevation.bin` exists and is `width × height × 2` bytes for every map folder
