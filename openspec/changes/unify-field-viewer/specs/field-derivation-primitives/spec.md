# field-derivation-primitives

## ADDED Requirements

### Requirement: A system can declare an on-demand derivation stage

`FieldDynamics` SHALL support a derivation stage — an ordered pipeline of passes run ON DEMAND (at map load, and re-run when a derivation parameter changes), distinct from the per-tick `update` loop — that produces derived fields readable by per-tick layers and views. A system MAY declare a derivation, a per-tick simulation (`init`/`update` layers), or both.

#### Scenario: Derivation runs at load, not per tick

- **WHEN** a system with a derivation stage is mounted on a map
- **THEN** the derivation pipeline runs once at load to produce its derived fields, and the per-tick loop (if any) advances without re-running the full derivation each tick

#### Scenario: Derivation re-runs on parameter change

- **WHEN** a derivation parameter is changed at runtime
- **THEN** the affected derivation steps re-run (cheap steps for a light change, the full pipeline for a structural one) without reloading the map, and the derived fields update

### Requirement: A derivation step can iterate to convergence

A derivation step SHALL support `iterate: N` (N a constant or a function of grid size), repeating the pass N times with ping-pong so each iteration reads the previous — sufficient to express flood fill, depression fill, and flow routing that converge over many passes.

#### Scenario: An iterated flood reaches the map interior

- **WHEN** an `iterate` flood/fill step runs with N scaled to the map dimension
- **THEN** the result propagates across the whole map (not just a fixed local frontier), matching a converged solution

### Requirement: A reduction can feed a global back into the GPU program

A derivation SHALL support reduce-to-uniform: a global value computed from a field by a reduction (an atomic accumulation followed by a single-dispatch scan — e.g. a histogram scanned into a quantile threshold, or an atomic max) that subsequent passes read as a uniform. This is distinct from the CPU-readout `scalars`: the value feeds back into later GPU passes within the same derivation.

#### Scenario: A quantile threshold drives a downstream pass

- **WHEN** a derivation declares a global (e.g. a mountain-elevation quantile) computed by a histogram + single-dispatch scan
- **THEN** a later pass in the same derivation reads that global as a uniform and produces output that depends on it, with no CPU round-trip

### Requirement: A pass can be single-dispatch

A derivation step SHALL support `kind: "single"` — dispatched once (one workgroup) rather than per tile — for serial scans and small reductions.

#### Scenario: A serial scan runs once

- **WHEN** a single-dispatch step scans a fixed-size accumulator (e.g. 256 histogram bins)
- **THEN** it executes as one dispatch, not one per tile, and produces the scanned result

### Requirement: Derivations have scratch fields

A derivation SHALL declare scratch fields — intermediate buffers that exist for the pipeline, ping-ponged where a step advances them — separate from the system's persistent simulation layers.

#### Scenario: Scratch does not pollute the layer namespace

- **WHEN** a derivation uses intermediate buffers (ocean, fill, water, flow direction, histogram)
- **THEN** those are scratch fields scoped to the derivation, and the persistent-layer namespace holds only the actual simulation state

### Requirement: The worldgen is expressible as a derivation

The worldgen terrain derivation (ocean flood, climate, depression fill, flow routing, lakes, irrigation, biome, terrain color — with its existing `.wesl` pass bodies) SHALL be expressible entirely as a `FieldDynamics` derivation on these primitives, with no hand-wired dispatch program outside the DSL.

#### Scenario: Terrain becomes a system

- **WHEN** the worldgen is re-expressed as a `terrain` system's derivation
- **THEN** it produces the same derived ocean/climate/water/biome/color fields as the previous hand-wired `TerrainDerivation`, and no bespoke terrain dispatch program remains
