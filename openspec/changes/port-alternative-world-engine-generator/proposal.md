## Why

The alternative game needs a concrete path from the experimental foundation map generator into this repo so map iteration happens against the real terrain detail, not the current placeholder noise map. This also proves that `BoardMap` layers and colorizers can support a richer game mode while keeping OpenFront compatibility.

## What Changes

- Add an alternative world-engine map generator path based on the parallel foundation map generator.
- Adapt the generated terrain, state, named layers, resource maps, and terrain colors into `BoardMap`.
- Make the alternative sandbox use the world-engine map by default.
- Preserve troop expansion behavior as a simple sandbox action on top of the generated land/water terrain.
- Keep the port local to the alternative game mode; no AI, networking, combat, building, or base OpenFront runtime changes.

## Capabilities

### New Capabilities

- `alternative-world-engine-generator`: Generates a rich alternative `BoardMap` with foundation-equivalent terrain coloring and named per-tile data layers.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/games/alternative`, `src/client/AlternativeSandboxPage.ts`, focused tests under `tests/games/alternative` and `tests/client`.
- APIs: adds an alternative generator entry point while keeping `createAlternativeMap()` as the sandbox default.
- Dependencies: no new runtime dependency expected.
