## ADDED Requirements

### Requirement: Generator page route

The system SHALL expose a `#generator` page for generating OpenFront-compatible map source files.

#### Scenario: Navigate to generator

- **WHEN** the browser hash is changed to `#generator`
- **THEN** the generator page is displayed without starting an OpenFront game session

### Requirement: Seeded map preview

The generator page SHALL generate and preview a map from user-editable supported generator settings.

#### Scenario: Regenerate from seed

- **WHEN** the user changes the seed and regenerates the map
- **THEN** the preview updates to a deterministic map for that seed and current settings

#### Scenario: Preview uses generated terrain colors

- **WHEN** a map preview is rendered
- **THEN** the preview uses the generated terrain color output rather than the default OpenFront palette

### Requirement: Map metadata input

The generator page SHALL collect the map metadata required by the existing OpenFront map-generator `info.json` format.

#### Scenario: Enter map identity

- **WHEN** the user enters a map id and display name
- **THEN** the exported `info.json` contains compatible `id`, `name`, `translation_key`, `categories`, and `nations` fields

### Requirement: Source file export

The generator page SHALL export source files compatible with `map-generator/assets/maps/<map_name>`.

#### Scenario: Export map source files

- **WHEN** the user exports the generated map
- **THEN** the browser downloads `image.png` and `info.json` files for the generated map

#### Scenario: Exported image is generator input

- **WHEN** the exported `image.png` is copied to `map-generator/assets/maps/<map_name>/image.png`
- **THEN** the existing Go map-generator can read it as map terrain input

### Requirement: Existing compile path compatibility

The exported source files SHALL become a selectable playable OpenFront map through the existing map generation command.

#### Scenario: Compile generated map

- **WHEN** the exported files are placed under `map-generator/assets/maps/<map_name>` and `npm run gen-maps` is run
- **THEN** the normal generated outputs include `resources/maps/<map_name>/map.bin`, `map4x.bin`, `map16x.bin`, `manifest.json`, `thumbnail.webp`, and an updated `Maps.gen.ts`

#### Scenario: Play generated map

- **WHEN** the generated outputs exist after running `npm run gen-maps`
- **THEN** the map appears in the normal map picker and can be launched through the original OpenFront game loop
