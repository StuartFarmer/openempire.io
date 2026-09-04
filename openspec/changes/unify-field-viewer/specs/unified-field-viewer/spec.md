# unified-field-viewer

## ADDED Requirements

### Requirement: One runtime mounts a system under a chosen renderer

There SHALL be a single field-viewer runtime that mounts a `FieldDynamics` system with a chosen renderer — **blit** (full-canvas) or **camera** (`CameraRenderer`, pan/zoom/mips) — both consuming the system's out-texture identically. Switching renderer SHALL NOT require system-specific code.

#### Scenario: The same system runs under either renderer

- **WHEN** a system is mounted under the blit renderer and, separately, under the camera renderer
- **THEN** it runs identically in both, differing only in how its out-texture is presented (full-canvas vs pan/zoom camera)

### Requirement: Panels are generic, driven by the system's declarations

The viewer's panels — system picker, map picker, view/brush selectors, parameter sliders, scalar readouts, and the tile hover readout — SHALL be generic, driven by the mounted system's declared views, params, brushes, scalars, and inputs. Adding a param, view, or brush to a system SHALL surface it in the panels with no page changes.

#### Scenario: A new slider appears from a manifest change

- **WHEN** a parameter is added to a mounted system's manifest
- **THEN** a slider for it appears in the viewer's parameter panel automatically, bounded by the declared min/max/step

#### Scenario: Hover reads declared fields

- **WHEN** the cursor hovers a tile
- **THEN** the readout shows the mounted system's relevant fields/derived values (position, and the system's declared readout fields) without page-specific per-system code

### Requirement: `#lab` and `#shell` are presets of the runtime

`#lab` and `#shell` SHALL be presets of the unified runtime: the lab mounts the sim systems under the blit renderer with the brush/scalar panels; the shell mounts the `terrain` system (plus any resident sim) under the camera renderer with the hover/parameter panels. Their observable behavior SHALL be preserved.

#### Scenario: Behavior is preserved after unification

- **WHEN** a user opens `#lab` and `#shell` after unification
- **THEN** the lab still runs its systems with brushes, views, and scalar readouts, and the shell still shows derived terrain with live climate parameters, seasons, and the tile hover — the same behavior as before, on the unified runtime

### Requirement: The baked terrain fallback is preserved

When a map lacks the derivation inputs (or the derivation fails), the viewer SHALL fall back to the baked `terrain-colors.png` bitmap under the camera renderer, with a visible status — the existing shell fallback, now a viewer-level concern.

#### Scenario: Graceful fallback in the unified viewer

- **WHEN** a map without an elevation sidecar is opened in the shell preset
- **THEN** the viewer shows the baked terrain with a status note and remains functional, rather than failing

### Requirement: The hand-wired terrain path is removed

Once the `terrain` system runs under the camera with verified parity, the hand-wired terrain path SHALL be deleted: `TerrainDerivation.ts`, `WebGpuWorldEngine`'s `PASS_TABLE`/dispatch program, the shell's explicit sidecar decoding and view routing, and the CPU `MapLayerViews` colorizer (superseded by the terrain system's color view). No parallel terrain-derivation implementation SHALL remain.

#### Scenario: One terrain implementation

- **WHEN** the unification is complete
- **THEN** terrain derivation exists only as the `terrain` `FieldDynamics` system, and the previous bespoke kernel/dispatch/decode code is gone
