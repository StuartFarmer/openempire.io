# Spec delta: generator-map-export

## ADDED Requirements

### Requirement: Layers export button
The generator page SHALL provide a `layers.bin` download alongside the existing `image.png`, `terrain-colors.png`, and `info.json` exports, producing the sidecar defined by the `map-layer-sidecars` capability for the currently generated world. The page's usage instructions SHALL tell the user to drop all four files into the map's source folder before running gen-maps.

#### Scenario: Exporting a generated world
- **WHEN** the user generates a world and clicks the layers export
- **THEN** a layers.bin download is produced whose planes match the previewed world's crop/metal/oil/temperature/humidity fields
