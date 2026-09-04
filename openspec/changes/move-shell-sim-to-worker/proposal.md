# Move the OpenFront-live sim into a Web Worker

## Why

OpenFront-live runs the real `src/core` sim **in-process on the main thread**.
After the upload optimization, the per-tick cost is essentially just the sim
(~26ms/tick on EarthXL, 8.4M tiles) — but it still blocks the render thread, so
huge maps stutter (a dropped frame every sim tick). Huge maps are now a
first-class goal, so the sim must move off the main thread. The GPU terrain
`season` derive also runs every tick (~20ms on EarthXL); throttle it too.

The catch: the shell's whole OpenFront-live path reads the live `Game` object
_synchronously_ (HUD stats, input validation, fronts, hover, plot/unit diff). A
worker removes that access, so those reads must cross the boundary as a small,
purpose-built payload — NOT the classic client's full `GameView` rebuild.

## What Changes

- **A dedicated sim worker** (`ShellSim.worker.ts`, `?worker&inline`). It runs
  `createGameRunner` (asset globals set first, cdnBase/manifest via `init`),
  self-ticks at the game rate (yielding so a slow tick never starves messaging),
  and OWNS every `Game` read. It computes the render conduits and small
  summaries and posts them each tick with the packed buffers **transferred**.
- **The worker↔main protocol** (minimal, purpose-built):
  - main→worker: `init`, `running`, `spawn(tile)`, `act(tile, ratio)` (the
    worker resolves attack-vs-boat + troop count), `build(unit, tile)`,
    `foodShare(share)`.
  - worker→main per tick: conduit deltas (owner/plot/density/damage/field/front
    as transferable typed arrays), a packed player-stats table (+ names for
    newly-seen players), the human's `myStats`, front-label positions+deltas,
    `nameAnchors`, `inSpawn`, `tick`, and a one-shot `spawnAnchor`.
- **The main thread becomes a pure client.** It applies conduit deltas to the
  GPU buffers (the existing run-merged partial upload), renders, and drives the
  HUD/hover/labels from the shipped summaries + its own maintained per-tile
  buffers. It no longer holds `Game`; input posts semantic actions to the worker.
- **Decoupled render.** The view re-renders on each worker frame (~10/s); the
  camera blits every rAF (60/s) for smooth pan/zoom. The `season` derive is
  throttled to a few times per second instead of every tick.

Result: the ~26ms sim no longer blocks the render thread — huge maps stay smooth
(the game degrades to slightly-below-real-time under extreme load instead of
freezing the UI). No behaviour/visual change; the default map is unaffected.

## Capabilities

### New Capabilities

- `shell-sim-worker`: OpenFront-live runs the sim in a Web Worker and drives the
  client entirely from a small per-tick payload, keeping the render thread free
  on huge maps.

## Impact

- New `src/client/webgpu/ShellSim.worker.ts` (+ a message-types module) — the
  worker: runs the sim, computes conduits + summaries, posts transferables.
- `src/client/GameShellPage.ts` — replace the in-process `createGameRunner` /
  `stepSim` / `onSimUpdate` / `uploadConduits` / `computeFront` / direct `Game`
  reads with worker creation, a `frame` message handler, shipped-summary HUD/
  hover/labels, and action-posting input. Throttle the season derive.
- `tests/FieldDynamics.test.ts` — unaffected (conduits unchanged). No `src/core`
  changes.
