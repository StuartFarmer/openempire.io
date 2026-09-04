## Context

The generated world engine already produces a final RGBA terrain color image from elevation, ocean, temperature, precipitation, sea depth, watermap, humidity, biome, and lake layers. The OpenFront map pipeline currently compiles only terrain bytes into `map.bin`, so that rich visual result is discarded.

The renderer already has a `BoardMap.colorizer` hook. The smallest useful change is to preserve the generated RGBA colors as an optional sidecar file and plug that sidecar into the existing hook.

## Goals / Non-Goals

**Goals:**

- Let generated maps render with their baked world-engine terrain colors in the original OpenFront game.
- Keep `map.bin`, gameplay terrain bytes, and simulation behavior unchanged.
- Keep existing maps compatible without regeneration.
- Avoid adding runtime layer loading until gameplay needs it.

**Non-Goals:**

- No new map binary format.
- No biome/humidity/resource gameplay behavior.
- No requirement to regenerate existing maps.
- No custom runtime map registry.

## Decisions

1. Use `terrain-colors.png` as the sidecar.

   PNG is already available in browser canvas export and Go can copy it as an opaque asset. It is easy to inspect manually and avoids new binary parsing.

2. Load sidecar colors only when the file exists.

   Existing maps do not ship the file, so they keep the current terrain-byte palette. Generated maps opt in by placing the sidecar next to `image.png` and `info.json`.

3. Attach the sidecar through `BoardMap.colorizer`.

   `TerrainPass` already calls `buildBoardMapTerrainRGBA()`, which prefers `map.colorizer`. This avoids rewriting terrain shaders or gameplay map structures.

4. Keep terrain deltas terrain-byte based.

   Existing dynamic terrain updates, such as water nuke land-to-water changes, can keep using the current byte-based `encodeTerrainTile()` path. The rich sidecar is a base visual layer, not a full dynamic recoloring model yet.

## Risks / Trade-offs

- Sidecar colors may not reflect terrain changes after nukes -> keep current delta behavior for changed tiles; add layer-aware recoloring only when needed.
- Sidecar dimensions can mismatch map dimensions -> validate dimensions before installing the colorizer and fall back to byte colors on mismatch.
- Optional fetch can add noisy 404s -> implement sidecar loading as an optional fetch path that treats missing files as normal.
- Existing maps remain byte-colored -> acceptable lazy fallback until we decide to regenerate or author sidecars for them.
