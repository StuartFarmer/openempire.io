# Design — Human player in the #shell OpenFront-live mode

## Context

`bridge-core-sim-to-shell` already runs the real sim in-process
(`GameShellPage` holds a `GameRunner`, ticks it in `advance`, uploads
`tileStateBuffer() & 0xfff` to the GPU `owner` field). This change adds human
agency + a lean HUD on top. The sim is the authority; the shell reads `gr.game`
directly and writes stamped intents into the turn queue.

## Key decisions

### Read the live `Game`, do not rebuild a `GameView`

The classic client marshals `GameUpdates` across a worker boundary into a
`GameView`/`PlayerView` read-model, and its HUD binds to that. In-process we
already have `gr.game`. So the shell HUD reads `Player` methods directly
(`troops()`, `gold()`, `numTilesOwned()`, `borderTiles()`, `isAlive()`,
`canAttack()`, `buildableUnits()`, `canBuild()`, `bestTransportShipSpawn()`) and
we do NOT reuse the old Lit HUD elements. This is the big simplification — no
`Transport`, `LocalServer`, `EventBus`, or serialization.

### Intent queue drained into each turn

`FieldViewerBase` already has a per-player intent channel for cellular games, but
that writes a GPU buffer. OpenFront-live needs `src/core` intents instead. Add a
small `pendingIntents: Intent[]` on the shell; a gesture pushes a plain intent;
`stepSim(ticks)` drains it into the FIRST turn of the batch:
`gr.addTurn({turnNumber, intents: pending.map(i => ({...i, clientID}))})`, then
empty turns for the remaining ticks. Stamping with the human `clientID` is the
only identity link the Executor needs (`playerByClientID`).

### Spawn: `randomSpawn:false`, human clicks

`GameRunner.init()` adds `spawnPlayers()` (random-spawns ALL players) only when
`isRandomSpawn()`. With `randomSpawn:false`, bots still spawn via
`spawnTribes(bots)`, and the human spawns by `spawn` intent. In singleplayer
`SpawnExecution` calls `endSpawnPhase()` on the human's placement, so one click
starts the game. (The observer-only mode from the bridge change used
`randomSpawn:true`; a "spectate" toggle can keep that.)

### Gesture routing

`FieldViewerBase.onTileGesture` currently stamps brushes / cellular intents. For
OpenFront-live the shell overrides tile handling: spawn-phase click → spawn;
else compute attack vs boat vs build-placement from `myPlayer` + the active build
selection. The pan/brush tool select stays; "brush" becomes the game-action tool
(pan still drags). Build mode is a transient selection, not a persistent brush.

### Attack targeting

`attack` needs `targetID` (owner PlayerID or null) and `troops` (absolute). Owner
of the clicked tile: `game.playerBySmallID(game.ownerID(tile))` → its `id()` (or
null for TerraNullius). `troops = round(myPlayer.troops() * attackRatio)`,
`sourceTiles = null` (let the sim pick the border segment — simpler than the
classic segment picker; can refine later). Water target → `boat` intent via
`bestTransportShipSpawn`.

### Labels as a DOM overlay

No WebGPU text pass. The sim ships `placeName`/`placeSpawnName` anchors, but
in-process we can compute them cheaply too; simplest is to read the
`playerNameViewData` the `GameRunner` callback already produces (capture it in
the createGameRunner callback instead of discarding it). Each frame, for each
living player with a name anchor, project `(x,y)` tile → framebuffer → CSS px via
the same camera math as hover, and position an absolutely-placed `<div>` (name +
troops). Cull off-screen. The human's label/territory is accented.

## Phasing (implementation order)

1. **Identity + spawn + expand + stats** — `randomSpawn:false`, myClientID,
   intent queue, spawn-by-click, attack/boat-by-click, stats HUD + ratio slider.
2. **Labels** — capture `playerNameViewData`, project + render the DOM overlay,
   my-territory accent, hover owner readout.
3. **Build + food** — build panel (buildableUnits/canBuild → build_unit) and the
   food-allocation slider.

Each phase is independently verifiable in the headless shell.

## Risks / open points

- `troops()` scaling: the classic UI stores `attackRatio` oddly (raw multiplier
  vs percent). The shell owns its own slider (0..1) and multiplies `troops()`
  directly — no compatibility constraint.
- Perf: reading `borderTiles()`/labels each frame over a big map. Cap label work
  to living, on-screen players; the sim already tick-limits name recompute.
- Population/stat method names verified during Phase 1 (population vs workers).
