## Context

The board extraction introduced a reusable board host, but the map data still
comes from OpenFront's existing `GameMap`: a terrain byte buffer plus a mutable
tile-state buffer. That is enough for the current game, but the alternative game
mode needs extra per-tile channels such as elevation or moisture and a way to
color terrain from those channels.

The existing terrain byte is hot-path compatibility data. It should remain the
base map channel instead of becoming an arbitrary packed schema.

## Goals / Non-Goals

**Goals:**

- Define a small board-map contract shared by OpenFront and alternative game
  modes.
- Support arbitrary named typed layers with one value per tile.
- Validate buffer sizes before a board renderer consumes a map.
- Allow custom terrain RGBA generation while keeping the current OpenFront
  terrain-byte colorizer as the default.

**Non-Goals:**

- No procedural world generator.
- No Foundation game port.
- No resource system or layer browser UI.
- No network protocol or map binary format migration.
- No universal packed `Uint32` tile schema.

## Decisions

1. Keep `terrain: Uint8Array` required.

   The current game already depends on this byte layout for terrain type,
   shoreline, ocean, magnitude, and impassable handling. Keeping it required
   preserves compatibility and avoids widening existing hot paths.

   Alternative considered: replace it with `Uint32Array`. Rejected for now
   because packed schemas become migration-prone and still cannot hold rich
   values like multiple continuous world channels.

2. Add `layers?: Record<string, TileLayerData>`.

   Layers are keyed by caller-owned identifiers such as `elevation`,
   `moisture`, or `metal`. Supported data types are typed arrays with one entry
   per tile.

   Alternative considered: fixed fields for known layers. Rejected because the
   alternative mode is still evolving and fixed fields would force churn.

3. Add a terrain colorizer hook that returns full RGBA terrain pixels.

   OpenFront keeps the current terrain-byte colorizer. Alternative modes can
   supply a colorizer that reads layers and generation config. The renderer only
   needs the resulting `Uint8Array(width * height * 4)`.

   Alternative considered: teach the renderer about each possible layer.
   Rejected because it couples rendering to game-specific map semantics.

## Risks / Trade-offs

- Layer identifiers can drift across modes -> keep this as a low-level contract
  and add descriptors later only when debug UI needs them.
- Full terrain RGBA rebuilds cost memory and CPU -> acceptable for initial map
  load; add color deltas or packed render caches only after profiling.
- Custom colorizers can be expensive -> keep the hook explicit and test the
  minimal contract first.
