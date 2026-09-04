## Why

We need a safe place to develop an alternative OpenFront-style game without
touching the current production game loop. A local sandbox page lets the base
game remain the regression target while the new mechanics evolve beside it.

## What Changes

- Add a separate alternative-game sandbox page reachable from the current app.
- Add a minimal `src/games/alternative` module with generated board-map data.
- Use the shared board-map/layer/colorizer contract for an 8-bit pixel board.
- Implement a local-only expansion loop with simple ownership changes.
- Keep networking, AI, matchmaking, account features, and full HUD out of scope.
- Preserve the current OpenFront page and existing game-start flow.

## Capabilities

### New Capabilities

- `alternative-game-sandbox`: Local-only development page for a parallel game
  mode using the shared board-map surface.

### Modified Capabilities

None.

## Impact

- Affects client routing/page registration and new `src/games/alternative`
  modules.
- Adds focused tests for generated map data and expansion behavior.
- Does not change server protocol, multiplayer transport, existing OpenFront
  rules, or map binaries.
