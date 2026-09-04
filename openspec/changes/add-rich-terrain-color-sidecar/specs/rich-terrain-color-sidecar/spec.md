## ADDED Requirements

### Requirement: Generator exports rich terrain colors

The generator page SHALL export a `terrain-colors.png` file containing the generated world-engine terrain colors at full map resolution.

#### Scenario: Export rich color sidecar

- **WHEN** the user exports terrain colors from the generator page
- **THEN** the browser downloads `terrain-colors.png` whose dimensions match the generated map dimensions

### Requirement: Map generator preserves optional sidecar

The map-generator SHALL copy an optional source `terrain-colors.png` into the generated map resource folder.

#### Scenario: Source sidecar exists

- **WHEN** `map-generator/assets/maps/<map_name>/terrain-colors.png` exists and the map-generator runs
- **THEN** `resources/maps/<map_name>/terrain-colors.png` exists after generation

#### Scenario: Source sidecar absent

- **WHEN** `map-generator/assets/maps/<map_name>/terrain-colors.png` is absent and the map-generator runs
- **THEN** map generation succeeds without requiring a sidecar

### Requirement: Runtime loads optional rich colors

The runtime map loader SHALL expose optional rich terrain colors for maps that provide `terrain-colors.png`.

#### Scenario: Rich color sidecar loads

- **WHEN** a selected map has `resources/maps/<map_name>/terrain-colors.png`
- **THEN** the runtime can provide RGBA terrain colors matching the loaded map dimensions

#### Scenario: Rich color sidecar missing

- **WHEN** a selected map has no `terrain-colors.png`
- **THEN** the runtime uses the existing terrain-byte color rendering path

### Requirement: Renderer uses sidecar as base terrain colors

The renderer SHALL use the loaded rich terrain colors as the base terrain texture when available.

#### Scenario: Render generated map with rich colors

- **WHEN** a map has valid loaded rich terrain colors
- **THEN** terrain rendering uses those colors instead of deriving base colors from terrain magnitude

#### Scenario: Existing map fallback

- **WHEN** a map has no valid rich terrain colors
- **THEN** terrain rendering remains visually equivalent to the existing OpenFront terrain-byte palette
