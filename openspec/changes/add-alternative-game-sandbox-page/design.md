## Context

The current app hosts the production OpenFront flow in a single Vite entry. The
new board-map and colorizer contract gives us enough shared surface to render a
parallel game, but the alternative mechanics should not be abstracted into the
existing OpenFront simulation yet.

## Goals / Non-Goals

**Goals:**

- Add a reachable local sandbox page for alternative game development.
- Keep the alternative game under `src/games/alternative`.
- Use `BoardMap` with simple typed layers and a custom colorizer.
- Provide a tiny local simulation for ownership expansion so the page is
  interactive enough to develop against.
- Keep existing OpenFront routing and game-start behavior as the regression
  target.

**Non-Goals:**

- No multiplayer, WebSocket, server, auth, matchmaking, or lobby integration.
- No AI.
- No full OpenFront HUD reuse.
- No universal game-engine abstraction.
- No procedural world generator beyond a deterministic small board source.

## Decisions

1. Add the sandbox as a page inside the existing app.

   This avoids a second build and keeps regression verification simple:
   `npm run build-dev` still covers the production entry. The page can be
   reached by route/hash/navigation without changing the OpenFront start flow.

   Alternative considered: separate website/build. Rejected for now because it
   adds build and asset plumbing before the alternative mechanics exist.

2. Keep alternative simulation separate from OpenFront.

   The sandbox will use small local modules for map creation and territory
   expansion. Shared abstractions stop at `BoardMap`, colorization, and simple
   board data.

   Alternative considered: create a universal game engine now. Rejected because
   only one production game and one toy sandbox exist; shared simulation
   contracts should wait for repeated needs.

3. Use deterministic byte layers.

   The initial sandbox map uses `terrain`, `state`, `elevation`, and `moisture`
   as byte buffers. Temperature, biome, crops, resources, and water behavior can
   be derived later.

## Risks / Trade-offs

- Sandbox UI may look rough -> acceptable; this is a mechanics workbench, not a
  shipped page.
- Local simulation may diverge from eventual mechanics -> keep it tiny so it is
  cheap to replace.
- App shell imports may pull production UI into the sandbox -> keep sandbox
  modules self-contained and avoid OpenFront game-runner dependencies.
