## Context

`GameView` currently owns the production path from game updates to `FrameData`, and `uploadFrameData()` is the renderer-facing boundary. `BoardRuntime` is intentionally independent from `GameImpl`, so alternative game modes need a small adapter that produces the same upload shape without pretending to be a full OpenFront game.

## Goals / Non-Goals

**Goals:**

- Track `BoardRuntime.map.state` changes between ticks.
- Produce renderer-compatible frame data for tile uploads.
- Add a real sandbox tick loop so alternative expansion can progress over time.

**Non-Goals:**

- No full `MapRenderer` mount in this change.
- No HUD/attack display port.
- No `GameImpl`, worker, or transport integration.
- No unit/name/relation simulation beyond empty frame collections.

## Decisions

- Put the adapter in `src/client/render/frame`. It depends on renderer frame types and should not make `src/core/game` import client code.
- Use a small bridge class with a previous tile-state snapshot. First frame returns `changedTiles: null` for full upload; later frames return only changed tile refs.
- Reuse `tickBoardRuntime()` rather than adding another system runner.
- Keep empty maps/arrays for FrameData fields the sandbox does not simulate yet. That lets future `MapRenderer` integration use `uploadFrameData()` without requiring fake units or players.

## Risks / Trade-offs

- This does not immediately show WebGL borders/HUD. Mitigation: it creates the exact frame boundary those features need.
- Diffing the full tile state each tick is O(tile count). Mitigation: acceptable for the sandbox; systems can later report dirty refs if profiling says this matters.
