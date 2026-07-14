# Spec: map-layer-sidecars (delta)

## MODIFIED Requirements

### Requirement: Baker publishes the sidecar

The Go baker SHALL copy `layers.bin` into every map's output folder at full resolution and set `"layers": true` in the generated manifest. A map source folder without `layers.bin` SHALL fail the bake with an error naming the map, so no shipped map can lack layers.

#### Scenario: Map with layers

- **WHEN** `map-generator/assets/maps/<name>/` contains layers.bin and gen-maps runs
- **THEN** `resources/maps/<name>/layers.bin` exists and the manifest has `"layers": true`

#### Scenario: Map without layers fails the bake

- **WHEN** a map source folder has no layers.bin
- **THEN** gen-maps exits with an error identifying the map instead of baking an unlayered map

### Requirement: Sim exposes read-only per-tile layer access

The game SHALL expose a read-only accessor `layer(name, tile) → 0..255` for the layer planes on the game/map interface available to executions and to the client view. Layers SHALL be guaranteed present when a playable map is loaded (the loader fails otherwise), so callers need no runtime gate and no `hasLayers()` predicate exists.

#### Scenario: Execution reads fertility

- **WHEN** an execution calls `game.layer("crop", tile)` on any map
- **THEN** it receives the exact baked byte for that tile, identically on every client

#### Scenario: Load-time guarantee

- **WHEN** a playable map is loaded without a decodable layers sidecar
- **THEN** the load fails with an error; only the pathfinding minimap may be constructed without layers, and asking it for layer data throws

## REMOVED Requirements

### Requirement: Loaders expose the sidecar on opt-in

**Reason**: The sidecar is no longer opt-in and map sizes no longer exist — every map loads `layers.bin` at full resolution, and a missing/undecodable sidecar fails the load (see `unified-layered-mode`: "Map loading requires both sidecars", "Full-resolution maps only").
**Migration**: Remove `manifest.layers` conditionals and the `GameMapSize.Normal` guard from loaders; treat the sidecar fetch/decode as mandatory.
