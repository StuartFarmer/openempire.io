## Why

Alternative game mechanics need somewhere to put dynamic tile data such as troop mass, frontier progress, buildings, roads, or supply without hard-coding each mechanic into `BoardMap` or renderer event unions. The existing `BoardMap` layer idea is the right storage model; this change adds the minimal runtime/system contract around it.

## What Changes

- Add a `BoardRuntime` contract that combines a `BoardMap`, named typed-array tile layers, globals, entities, and systems.
- Add a polymorphic `BoardSystem` contract for mechanics classes to handle commands, tick runtime state, and optionally expose overlays.
- Add small runtime helpers to create/validate runtime layers and execute systems in order.
- Keep OpenFront-compatible `terrain` and `state` behavior unchanged.
- Avoid closed unions for movement effects; systems can expose arbitrary overlay objects or use named layers.

## Capabilities

### New Capabilities

- `board-runtime-systems`: Defines generic board runtime storage and system contracts for alternative mechanics.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/core/game`, `src/core/index.ts`, and focused tests.
- APIs: adds exported runtime/system types and helpers; does not replace existing game runtime.
- Dependencies: no new dependencies.
