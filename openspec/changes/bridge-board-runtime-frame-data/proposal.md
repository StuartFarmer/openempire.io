## Why

The alternative sandbox currently repaints a canvas directly from `BoardMap`, so it has no OpenFront-shaped game tick or render upload boundary. A small bridge from `BoardRuntime` to `FrameData` lets alternative mechanics feed the existing renderer pipeline incrementally without forcing them through `GameImpl`.

## What Changes

- Add a client-side `BoardRuntime` frame bridge that tracks tile state changes across ticks.
- Produce OpenFront-shaped frame data with `tileState`, `changedTiles`, empty trail/unit/player/event collections, and tick count.
- Let the alternative sandbox advance on a small clock after expansion starts instead of doing all expansion only inside click handlers.
- Keep the full WebGL `MapRenderer` mount out of this change; the bridge is the reusable boundary for that next step.

## Capabilities

### New Capabilities

- `board-runtime-frame-data`: Converts `BoardRuntime` state changes into renderer-compatible frame data.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/client/render/frame`, `src/client/AlternativeSandboxPage.ts`, focused tests.
- APIs: adds a client-side bridge helper; no changes to core game engine or server.
- Dependencies: no new dependencies.
