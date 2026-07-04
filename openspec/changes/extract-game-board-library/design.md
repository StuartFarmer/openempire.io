## Context

The current architecture already has the right core pieces: deterministic simulation in `src/core`, worker execution in `src/core/worker`, view projection in `src/client/view/GameView.ts`, WebGL rendering behind `src/client/render/gl/MapRenderer.ts`, and per-tick upload in `src/client/WebGLFrameBuilder.ts`.

The problem is the board host is tangled into the full client app. `ClientGameRunner.ts` owns board setup, lobby transport, reconnects, local replay, persistence, sound, settings listeners, error modals, and intent routing. `GameRenderer.ts` also assumes a pre-existing global DOM HUD through `document.querySelector`. `src/core` has a few imports from client/view/render helpers, which blocks clean library packaging.

## Goals / Non-Goals

**Goals:**

- Provide one reusable TypeScript board entrypoint that mounts into a caller-provided element.
- Reuse the existing deterministic simulation, worker bridge, `GameView`, `MapRenderer`, and `WebGLFrameBuilder`.
- Make local/single-player turn driving the default.
- Keep networking and AI as future adapters by exposing typed turn and intent boundaries.
- Preserve the existing OpenFront app by making it use the extracted board host.
- Remove core-to-client imports needed for packaging.

**Non-Goals:**

- No AI player implementation.
- No multiplayer networking implementation in the library.
- No new renderer, framework, package manager, or runtime dependency.
- No extraction of account, lobby, store, ads, chat, leaderboard, clan, or moderation UI.
- No redesign of gameplay rules.

## Decisions

1. Extract a small board host instead of a full platform package.
   - Decision: create a board module that owns mount/start/stop, input overlay, worker updates, WebGL frame loop, and disposal.
   - Alternative considered: package the whole client. Rejected because it drags auth, lobby, ads, modals, and server assumptions into every consumer.

2. Keep simulation and rendering separate.
   - Decision: `src/core` remains deterministic and renderer-free; rendering remains a data sink through `MapRenderer` and `WebGLFrameBuilder`.
   - Alternative considered: make `GameView` or renderer drive simulation directly. Rejected because the existing worker tick boundary is the cleanest determinism boundary.

3. Use typed adapters only at the turn/intent edge.
   - Decision: expose a minimal adapter shape for start, incoming turns, outgoing intents, and disposal. Implement only local/default driving now.
   - Alternative considered: add AI and network adapters immediately. Rejected as speculative; the public edge is enough to add them later.

4. Replace global DOM HUD assumptions with optional layer registration.
   - Decision: the reusable board must not require `document.querySelector` HUD elements. The existing app can keep full HUD wiring outside the library.
   - Alternative considered: ship all HUD elements as part of the library. Rejected because most embedded consumers need the board, not OpenFront's product shell.

5. Publish explicit entrypoints.
   - Decision: expose only stable modules such as board API, core schemas/types, and WebGL render types. Keep server/app shell private.
   - Alternative considered: rely on deep imports. Rejected because deep imports freeze internal file layout.

## Risks / Trade-offs

- Core imports client helpers today -> move shared helpers/types into core or neutral modules before packaging.
- `WorkerClient` uses Vite worker syntax -> keep Vite support first; document that non-Vite consumers need their bundler to support worker imports before adding extra build targets.
- Some HUD controllers mix board interactions with app UI -> start with no-HUD/default board plus optional app-side registration.
- Existing app behavior could regress -> migrate the app last and compare single-player smoke behavior before removing old paths.

## Migration Plan

1. Clean `src/core` imports so core no longer imports from `src/client`.
2. Extract board setup from `ClientGameRunner.ts` into a reusable board host.
3. Make the OpenFront app call the board host while keeping its current transport and HUD outside the library boundary.
4. Add explicit public exports and package/build checks.
5. Run typecheck plus focused tests around core purity, board lifecycle, and app startup.

Rollback is straightforward while the old app path remains available: keep the extraction behind imports first, then remove old code only after parity checks pass.

## Open Questions

- Should the first public package be internal-only through repo exports, or published as an npm package immediately?
- Which HUD layers, if any, are part of the minimum embedded board experience?
