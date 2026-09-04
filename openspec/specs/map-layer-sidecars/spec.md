# map-layer-sidecars Specification

## Purpose
TBD - created by archiving change add-map-layer-sidecars. Update Purpose after archive.
## Requirements
### Requirement: Layer sidecar binary format

The layer sidecar SHALL encode the five per-tile data planes `crop`, `metal`, `oil`, `temperature`, `humidity` — in that fixed order — as consecutive row-major Uint8 planes (one byte per tile, 0–255), each plane exactly `width × height` bytes matching the map's full-resolution dimensions. The file SHALL contain nothing else (size = 5 × width × height bytes), so any reader can index plane `i` at offset `i × width × height`.

#### Scenario: Well-formed sidecar

- **WHEN** a layers.bin exists for a 256×256 map
- **THEN** its size is exactly 5 × 256 × 256 bytes and byte `(planeIndex × 65536) + (y × 256) + x` is the value of that plane at tile (x, y)

#### Scenario: Size mismatch is rejected

- **WHEN** a layers.bin's size does not equal 5 × width × height for the manifest's full-resolution dimensions
- **THEN** the loader rejects the sidecar and the map loads with no layers (an error is logged; the game does not crash)

### Requirement: Generator exports layers.bin

The generator page SHALL offer a `layers.bin` export alongside `image.png`, `terrain-colors.png`, and `info.json`, serialized from the world engine's already-computed fields. Fields stored as normalized floats SHALL be quantized to Uint8 by `round(value × 255)` after clamping to [0, 1].

#### Scenario: Export round-trips engine values

- **WHEN** a world is generated with a given seed/config and layers.bin is exported
- **THEN** for every tile, each plane byte equals the quantized engine value for that field

### Requirement: Baker publishes the sidecar

The Go baker SHALL copy `layers.bin` (when present in a map's source folder) into the map's output folder at full resolution only — no 4x/16x variants — and set `"layers": true` in the generated manifest. Maps without the file SHALL bake exactly as before with no `layers` manifest key.

#### Scenario: Map with layers

- **WHEN** `map-generator/assets/maps/<name>/` contains layers.bin and gen-maps runs
- **THEN** `resources/maps/<name>/layers.bin` exists and the manifest has `"layers": true`

#### Scenario: Map without layers

- **WHEN** a map source folder has no layers.bin
- **THEN** the baked output has no layers.bin and no `layers` manifest key

### Requirement: Loaders expose the sidecar on opt-in

Map loaders SHALL resolve a `layersPath` (and fetch its bytes) only when the manifest sets `layers: true` and the game map size is full resolution (Normal). Compact map sizes SHALL load with no layers even when the manifest opts in.

#### Scenario: Opt-in at Normal size

- **WHEN** a map whose manifest has `layers: true` is loaded at Normal size
- **THEN** the loaded terrain map data includes the decoded layer planes

#### Scenario: Compact size

- **WHEN** the same map is loaded at a compact size
- **THEN** it loads successfully with no layers

### Requirement: Sim exposes read-only per-tile layer access

The game SHALL expose a read-only accessor `layer(name, tile) → 0..255` for the five layer names, plus `hasLayers() → boolean`, on the game/map interface available to executions and to the client view. Calling `layer` on a map without layers SHALL be an error surfaced in development (assert/throw), so mechanics are forced to gate on `hasLayers()`.

#### Scenario: Execution reads fertility

- **WHEN** an execution calls `game.layer("crop", tile)` on a layered map
- **THEN** it receives the exact baked byte for that tile, identically on every client

#### Scenario: Gating on unlayered maps

- **WHEN** code checks `game.hasLayers()` on a classic map without a sidecar
- **THEN** it returns false and no layer-dependent mechanic activates

### Requirement: Determinism is preserved

Layer data SHALL come only from the baked sidecar bytes — never computed at runtime — so every client of a game observes identical values. No floating-point processing of layer bytes SHALL occur inside the sim.

#### Scenario: Round-trip integrity

- **WHEN** a fixture map's layers are exported by the generator, baked, and read back through the sim accessor
- **THEN** the bytes are identical at every stage
