# Design: add-map-layer-sidecars

## Context

The world engine (`src/games/alternative/world/WorldEngineElevation.ts`) already computes crop/basin/oil/metal resource maps plus temperature and humidity as Float32 fields during generation, but only the 1-byte terrain packing and the RGBA `terrain-colors.png` leave the browser. The terrain-colors sidecar (added on this branch) established the exact pattern this change reuses: optional per-map file → Go baker copies it verbatim + sets a manifest flag → loaders resolve it on opt-in → consumer reads it. The sim must stay deterministic: all clients must see identical layer values with zero runtime float math.

## Goals / Non-Goals

**Goals**

- Five Uint8 planes (crop, metal, oil, temperature, humidity) readable per-tile inside the sim via a stable accessor executions can rely on for the Tribal/Middle/Modern age mechanics.
- Zero behavior change for existing maps and for compact map size.

**Non-Goals**

- No runtime world generation (future change; the accessor API is designed so it can slot in later without touching consumers).
- No derived-layer fallback for hand-drawn maps.
- No gameplay consumption of layers (that's `add-tribal-food-economy`).
- No 4x/16x downscaled layer variants.

## Decisions

1. **Raw concatenated planes, no header.** `layers.bin` = 5 planes × width × height bytes, fixed plane order. Alternative considered: a self-describing container (header with plane names/count). Rejected for now — the manifest already carries dimensions, the plane set is a compile-time constant shared by exporter/loader (`LAYER_NAMES` in one core module), and a header adds parsing/validation surface. If the plane set ever grows, bump to `layers2.bin` or add a manifest `layerNames` array then.
2. **Uint8 quantization at export time** (`round(clamp01(v) × 255)`). The sim only ever sees integers — determinism by construction. Mechanics needing thresholds (e.g. "fertile ≥ 128") operate on bytes.
3. **Plane constants live in core** (`src/core/game/MapLayers.ts`: `LAYER_NAMES`, offsets, decode/validate). The client exporter imports from core, so exporter and sim can't drift. The Go baker never parses the file (copy + size sanity only), so Go needs no format knowledge beyond `5 × w × h`.
4. **Accessor shape: `hasLayers(): boolean` + `layer(name: LayerName, tile: TileRef): number`** on `GameMap` (surfaced through `Game`/`GameView`). Storage is a single `Uint8Array` with plane offsets — no per-plane copies. `layer()` on an unlayered map throws in dev; callers gate on `hasLayers()`. Alternative — returning 0 on unlayered maps — rejected: silently-zero fertility would make balance bugs invisible.
5. **Worker fetch path.** The sim runs in the worker; `FetchGameMapLoader` fetches `maps/<name>/layers.bin` exactly as it does `map.bin`, gated on `manifest.layers === true` and `GameMapSize.Normal`. `TerrainMapLoader.loadTerrainMap` attaches the decoded planes to `TerrainMapData` and into `GameMapImpl` construction.
6. **Manifest flag `layers: true`** mirrors `terrain_colors: true` (`MapManifest` in `TerrainMapLoader.ts`); `MapConsistency.test.ts` gets `layers.bin` added to the optional-files list for both source and output folders.

## Risks / Trade-offs

- [Sidecar drifts from map.bin after a re-bake with changed source image] → the size check (5 × w × h vs manifest dims) catches dimension drift; content drift is the mapmaker's responsibility, same as terrain-colors today. gen-maps re-copies both from the same source folder, so the normal workflow can't drift.
- [Memory: +5 bytes/tile at Normal size] → a 2000×1000 map adds ~10 MB in the worker; acceptable for singleplayer, and compact sizes opt out entirely.
- [Plane-order mistakes between exporter and reader] → single source of truth in core (`MapLayers.ts`) imported by the exporter; round-trip test asserts byte equality per named plane.
- [Fixture availability: pangea002 was baked before this change] → the round-trip test generates a small world in-test via the world engine (deterministic seed), exports, decodes — no committed fixture needed. Re-baking pangea002's layers.bin is a follow-up authoring step via the generator page, not a code task.

## Migration Plan

Purely additive: ship code, then re-export + re-bake the generated maps (pangea001/pangea002/majormenor) through the generator page when their layers are wanted. No rollback concerns — maps without the file behave exactly as today.

## Open Questions

- None blocking. (`basin` is deliberately excluded — it's an intermediate input to oil suitability; revisit if the Modern-age spec needs it.)
