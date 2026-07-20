# Bridge the core sim into the #shell terrain

## Why

Games are simulated on the CPU and rendered on the GPU — the standard, and
already how OpenFront works (the deterministic `src/core` sim + a renderer).
The cellular "games" (empire/conquest) can only _approximate_ the real rules,
because discrete actors (units, nukes, structures) don't fit a per-tile field.
So instead of re-deriving the game on the GPU, run the **real sim** as the
authority and render it over the GPU-derived terrain **world**: CPU simulates,
GPU renders, the terrain field is the map it plays on.

The survey confirmed this is clean: the sim is pure CPU behind
`createGameRunner`, needs no worker/DOM, and exposes a dense per-tile owner
buffer (`GameMap.tileStateBuffer()`, `owner = state[i] & 0xfff`) whose
`TileRef === y*width+x` matches the GPU terrain indexing exactly.

## What Changes

- **Run the real sim in-process in the shell.** A new `#shell` entry (OpenFront
  live) creates a `GameRunner` via `createGameRunner` on the selected map
  (singleplayer, N bots, random spawn), driven a tick at a time from the shell
  loop (`gr.addTurn` + `gr.executeNextTick()`) — no worker, no LocalServer, no
  HUD.
- **Render the sim's ownership over the terrain.** Each tick the shell reads the
  sim's per-tile owner (`tileStateBuffer()` → `& 0xfff`), uploads it to a GPU
  `owner` buffer, and an overlay view composites the players' colors over the
  rendered terrain (`layers::tint`). The terrain still derives on the GPU (the
  world); the sim owns the game state (the play).
- **A thin `openfront` viewer system.** A FieldDynamics system with one
  CPU-written `owner` field (an init-only layer the shell overwrites each tick,
  never GPU-ticked) and an `openfront` overlay view; composed on terrain like
  the other games. This reuses the terrain base, camera, hover, and overlay
  machinery unchanged.
- **The cellular games are reframed as ecology studies**, not "the game" — the
  real game is the CPU sim; conquest/empire/settlement stay as field experiments.

## Capabilities

### New Capabilities

- `core-sim-shell-bridge`: run the real `src/core` simulation in-process from
  the `#shell` and render its per-tile ownership over the GPU-derived terrain —
  CPU authority, GPU render, shared terrain world.

## Impact

- `src/client/GameShellPage.ts` — an OpenFront-live mode: hold a `GameRunner`,
  create it on mount, tick it each frame, upload owner to the `owner` buffer,
  render the overlay; destroy it on switch/disconnect. A smallID→color palette.
- New `src/client/lab/systems/openfront/` — the thin viewer system (owner field
  - overlay view).
- Imports `createGameRunner`/`FetchGameMapLoader`/enums from `src/core` (client
  → core is allowed). No `src/core` changes — reads the sim, does not modify it.
- Perf note: the sim ticks on the main thread (not the worker); large maps
  (EarthXL) may tick slowly — the mode defaults to a moderate map.
