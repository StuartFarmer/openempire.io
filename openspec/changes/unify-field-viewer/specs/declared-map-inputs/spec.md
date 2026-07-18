# declared-map-inputs

## ADDED Requirements

### Requirement: Systems declare the map inputs they consume

A system manifest SHALL declare the primary map fields it consumes, each by sidecar and plane (e.g. `elevation` from `elevation.bin`; `lake`/`river` from `hydro.bin`; `amplitude`/`phase` from `season.bin`; named planes from `layers.bin`). A generic loader SHALL decode those sidecars via the core format modules (`ElevationMap`, `HydroMap`, `SeasonMap`, `MapLayers`) and upload them as read-only input fields the system's derivation, layers, and views can read. No system-specific decode/plane-slicing code SHALL be required.

#### Scenario: Inputs come from a declaration, not procedural code

- **WHEN** a system declares it consumes elevation, the hydro lake/river planes, and the layers temperature/humidity planes
- **THEN** the loader decodes and uploads exactly those, and the system reads them as named inputs — with no hand-written sidecar decoding in the page or system

#### Scenario: A missing input is handled, not crashed

- **WHEN** a system declares an optional input (e.g. `season`) that a given map does not ship
- **THEN** the loader reports it absent and the system runs its declared fallback (e.g. the latitude seasonal model), rather than failing

### Requirement: CPU input preparation is a declared hook

Inputs that require CPU preparation before upload — specifically the sea/lake `waterMask` connected-components classification, which is a graph algorithm over map.bin rather than a field op — SHALL be a declared prep hook that runs on the CPU at load and produces an input field. Such preparation SHALL be isolated to the hook, not scattered across the page.

#### Scenario: The water mask is one declared prep step

- **WHEN** a system needs the sea/lake classification
- **THEN** it declares a CPU prep hook that computes the `waterMask` from map.bin + elevation once at load, and the result is an input field like any other

### Requirement: The generic loader replaces the shell's procedural plumbing

The shell's hand-written sidecar decoding, plane extraction, and `waterMask` construction (`GameShellPage.deriveTerrain` and related) SHALL be replaced by the declared-input loader; the same fields reach the terrain derivation, with the decoding logic living in one generic place.

#### Scenario: No bespoke decode remains in the viewer

- **WHEN** the terrain system loads on a map
- **THEN** its inputs are provided by the generic loader, and the viewer page contains no map-specific `decodeElevation`/`decodeHydro`/plane-slicing/`buildWaterMask` calls
