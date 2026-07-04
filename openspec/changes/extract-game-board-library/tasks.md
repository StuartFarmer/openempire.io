## 1. Core Boundary Cleanup

- [x] 1.1 Move name placement helpers used by `GameRunner` from client HUD into a core-safe module.
- [x] 1.2 Replace `src/core` imports of `client/Utils` with core-local formatting helpers or neutral utilities.
- [x] 1.3 Remove `PlayerView` and `UnitView` imports from core types by introducing core-owned structural interfaces where needed.
- [x] 1.4 Move render-facing shared types imported by core into neutral core/shared modules.
- [x] 1.5 Add a dependency check that fails if `src/core` imports from `src/client`, `src/server`, HUD, renderer, or app-shell paths.

## 2. Board Host Extraction

- [x] 2.1 Extract WebGL canvas creation and renderer construction from `ClientGameRunner.ts` into a reusable board module.
- [x] 2.2 Extract WebGL frame-loop mounting and disposal into the board module.
- [x] 2.3 Create a public board API that accepts a container element, game start info, player identity, map loader options, and optional adapter callbacks.
- [x] 2.4 Make the board API return a lifecycle handle with access to the game view, intent submission, and dispose.
- [x] 2.5 Ensure board-owned DOM nodes are attached to the provided container rather than `document.body`.

## 3. Input And Intent Boundary

- [x] 3.1 Split board input events from transport-specific intent sending.
- [x] 3.2 Add a typed turn/intent adapter boundary with a local default implementation.
- [x] 3.3 Route spawn, attack, boat, build, alliance, target, emoji, donation, embargo, pause, and unit movement intents through the adapter boundary.
- [x] 3.4 Keep WebSocket, auth token, reconnect, hash reporting, and server message parsing outside the board module.

## 4. HUD And App Shell Separation

- [x] 4.1 Change renderer layer setup so reusable board startup does not require global `document.querySelector` HUD elements.
- [x] 4.2 Keep current HUD layer registration in the OpenFront app shell.
- [x] 4.3 Leave account, lobby, matchmaking, ads, store, clan, chat, leaderboard, moderation, and deployment modules out of public board exports.

## 5. Existing App Migration

- [x] 5.1 Update `ClientGameRunner.ts` to use the extracted board host for board lifecycle work.
- [x] 5.2 Keep existing multiplayer transport and local replay behavior in app-shell code.
- [x] 5.3 Preserve current error handling, settings, sound, and persistence behavior outside the board library.
- [x] 5.4 Remove duplicated board bootstrap code after the app path uses the board host.

## 6. Public Exports And Packaging

- [x] 6.1 Add explicit package entrypoints for board API, core schemas/types, and WebGL render types.
- [x] 6.2 Verify importing the board entrypoint does not pull server or product-shell modules.
- [x] 6.3 Document the minimum consumer setup for Vite worker and asset loading support.

## 7. Verification

- [x] 7.1 Run typecheck.
- [x] 7.2 Run focused tests for core dependency purity.
- [x] 7.3 Add a board lifecycle test that mounts and disposes without leaking owned DOM nodes.
- [x] 7.4 Smoke test the current OpenFront app single-player start path.
- [x] 7.5 Smoke test the reusable board entrypoint in a minimal TypeScript/Vite consumer fixture.
