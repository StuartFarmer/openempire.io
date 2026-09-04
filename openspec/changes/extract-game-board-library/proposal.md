## Why

The playable board is currently usable only through the full OpenFront client app, because board bootstrap is mixed with lobby transport, auth, product UI, modals, sound, and persistence. Extracting a small board library lets other TypeScript projects embed the game board without carrying the app shell.

## What Changes

- Add a reusable board API that mounts the core simulation view and WebGL board into a caller-provided DOM container.
- Keep the deterministic simulation, worker bridge, `GameView`, `MapRenderer`, and frame upload path as the reusable core of the package.
- Move networking, AI, auth, ads, lobby, chat, store, leaderboard, and account flows behind optional adapters or leave them in the app shell.
- Remove client-to-core dependency leaks that prevent clean packaging of the deterministic game code.
- Preserve the current OpenFront app by reusing the extracted board package from the existing client entrypoint.

## Capabilities

### New Capabilities

- `game-board-library`: A TypeScript API for embedding the OpenFront game board with local turn driving by default and optional adapters for network or AI turn sources later.

### Modified Capabilities

## Impact

- Affected code: `src/core`, `src/core/worker`, `src/client/view`, `src/client/render`, `src/client/WebGLFrameBuilder.ts`, `src/client/InputHandler.ts`, `src/client/ClientGameRunner.ts`, and app-shell imports in `src/client/Main.ts`.
- API impact: adds a narrow public board mounting API and package entrypoints; current app behavior should remain compatible.
- Dependency impact: no new runtime dependency expected.
- Packaging impact: requires explicit public exports and build boundaries so consumers do not import server, auth, lobby, ads, or full HUD code.
