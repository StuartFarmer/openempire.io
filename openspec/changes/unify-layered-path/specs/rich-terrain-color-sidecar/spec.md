# Spec: rich-terrain-color-sidecar (delta)

## ADDED Requirements

### Requirement: derive-layers bakes terrain colors for engine-less maps

`map-generator/derive-layers.ts` SHALL emit a `terrain-colors.png` alongside `layers.bin`, produced by the world engine's real color pipeline (`generateWorldEngineBiome` + `buildWorldEngineTerrainColors`) over the climate fields it reconstructs from the baked `image.png`. Output SHALL be deterministic for a given image and seed.

#### Scenario: Retrofit a legacy map

- **WHEN** derive-layers runs against a map source folder containing only `image.png` and `info.json`
- **THEN** the folder gains both `layers.bin` and a full-resolution `terrain-colors.png`, identical across repeat runs with the same seed

### Requirement: Runtime tile mutation uses the procedural encoder

The renderer SHALL retain a procedural per-tile color encoder (`encodeTerrainTile`, with its terrain palette in render settings) whose sole contract is coloring tiles whose terrain mutates at runtime (water nukes today; future land-modification features). The static sidecar SHALL remain the base texture; deltas SHALL be encoded procedurally on top of it.

#### Scenario: Water nuke recolors tiles

- **WHEN** a water nuke converts land tiles to water on a sidecar-shaded map
- **THEN** the affected tiles are recolored via the procedural encoder while all unmutated tiles keep their baked sidecar colors

## MODIFIED Requirements

### Requirement: Map generator preserves optional sidecar

The map-generator SHALL copy the source `terrain-colors.png` into the generated map resource folder and set `"terrain_colors": true` in the manifest. A map source folder without `terrain-colors.png` SHALL fail the bake with an error naming the map.

#### Scenario: Source sidecar exists

- **WHEN** `map-generator/assets/maps/<map_name>/terrain-colors.png` exists and the map-generator runs
- **THEN** `resources/maps/<map_name>/terrain-colors.png` exists after generation and the manifest has `"terrain_colors": true`

#### Scenario: Source sidecar absent fails the bake

- **WHEN** `map-generator/assets/maps/<map_name>/terrain-colors.png` is absent and the map-generator runs
- **THEN** the bake exits with an error identifying the map

### Requirement: Runtime loads optional rich colors

The runtime map loader SHALL load rich terrain colors for every map from `terrain-colors.png` at the map's full resolution. A missing, undecodable, or dimension-mismatched sidecar SHALL fail the map load with a descriptive error.

#### Scenario: Rich color sidecar loads

- **WHEN** a selected map is loaded
- **THEN** the runtime provides RGBA terrain colors matching the loaded map dimensions

#### Scenario: Rich color sidecar missing

- **WHEN** a selected map has no `terrain-colors.png` or its dimensions do not match the map
- **THEN** the load fails with an error naming the map and the sidecar problem

### Requirement: Renderer uses sidecar as base terrain colors

The renderer SHALL use the loaded rich terrain colors as the base terrain texture for every map. The full-map procedural terrain bake (deriving base colors from terrain magnitude) SHALL be removed; procedural encoding survives only as the per-tile mutation path (see "Runtime tile mutation uses the procedural encoder").

#### Scenario: Render map with rich colors

- **WHEN** any map is rendered
- **THEN** the base terrain texture is the sidecar RGBA, and no full-map procedural color bake occurs

#### Scenario: User terrain color settings

- **WHEN** the user changes terrain palette settings
- **THEN** only procedurally-encoded mutated tiles are affected; the baked base texture is unchanged
