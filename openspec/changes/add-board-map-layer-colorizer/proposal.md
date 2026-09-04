## Why

The reusable game board still assumes an OpenFront-style terrain byte is enough
to describe and color a map. The next game mode needs to keep that compatibility
path while adding optional per-tile data channels and custom terrain coloring.

## What Changes

- Add a shared board-map contract with required `terrain` and `state` buffers.
- Add flexible typed tile layers keyed by string identifiers.
- Add validation for board-map buffer dimensions.
- Add a terrain colorizer hook so the default OpenFront coloring remains the
  fallback and alternative game modes can build terrain RGBA from layers.
- Keep the current OpenFront map format and terrain byte behavior unchanged.

## Capabilities

### New Capabilities

- `board-map-layers`: Shared board-map data contract with optional typed tile
  layers and pluggable terrain colorization.

### Modified Capabilities

None.

## Impact

- Affects board/core map types, WebGL terrain texture setup, and focused tests.
- Does not add a procedural generator, resource system, UI layer browser, or
  network protocol changes.
