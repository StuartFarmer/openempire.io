## Overview

Port the parallel foundation world-engine generator as a local alternative-game domain module, then expose a small adapter that returns a `BoardMap`. The direct port keeps the generator and colorizer behavior aligned with the parallel implementation while avoiding a broader engine abstraction pass.

## Design

### Generator Port

Copy the pure domain pieces needed by the parallel implementation:

- tile-map support for generated terrain/state/elevation buffers
- foundation terrain byte helpers
- world-engine elevation, climate, hydrology, biome, resource, and colorizer functions

These remain under `src/games/alternative/world` so the code is isolated from the base OpenFront game.

### BoardMap Adapter

Add `createAlternativeWorldEngineMap(config)` as the stable integration point. It will:

- call the ported world-engine generator
- expose `terrain` as the OpenFront-compatible `Uint8Array`
- expose `state` as a `Uint16Array`
- attach named layers such as `elevation`, `ocean`, `temperature`, `precipitation`, `watermap`, `humidity`, `biome`, and resource layers
- attach a `colorizer` that returns the generated world-engine terrain RGBA array

`createAlternativeMap()` should delegate to this adapter so the existing sandbox route immediately uses the richer generator.

### Sandbox Reset

The sandbox currently mutates the existing map on reset. A generated colorizer can close over its generated color buffer, so reset should replace the map object instead of copying only selected buffers.

## Non-Goals

- No combat, building, AI, networking, or save format changes.
- No shared plugin registry for game modes yet.
- No attempt to compress all layers into a single terrain integer.
- No visual redesign beyond showing the generated map through the existing sandbox.

## Risks

- A direct port may duplicate code from the parallel repo. That is acceptable for this step because it preserves parity and gives us a working migration target.
- Exact visual parity depends on keeping the colorizer math unchanged. Tests should verify the `BoardMap` colorizer path returns the generated terrain colors unchanged.
