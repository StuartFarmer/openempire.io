# Make the #shell OpenFront-live match human-playable

## Why

`bridge-core-sim-to-shell` runs the real `src/core` simulation in-process in the
`#shell` and renders per-tile ownership over the GPU terrain — but the human is a
passive "Observer" that random-spawns and does nothing. Everything the shell is
missing to be _playable_ is client-side: turning gestures into intents, and
reading the live `game` object into a HUD. The sim already validates every
action (spawn, attack, boat, build, food allocation) — no core rules change.

Because the sim runs **in-process**, the shell holds the live `game: Game`
directly. It does NOT need the worker, `LocalServer`, `Transport`, `EventBus`, or
the `GameView`/`GameUpdates` read-model the classic WebGL client rebuilds. So we
do NOT port the ~30 Lit HUD elements (they bind to `GameView`). Instead a lean
shell HUD **reads** state off `gr.game.playerByClientID(myClientID)` and
**writes** by stamping the human's `clientID` onto plain intents pushed into the
turn queue (`gr.addTurn({turnNumber, intents:[…]})`).

## What Changes

Scope (agreed): spawn → expand → build → survive, with a stats HUD and map
labels. Leaderboard, events log, win modal, and diplomacy are explicitly OUT.

- **Local player identity.** Stop random-spawning the human (`randomSpawn:false`
  keeps bots spawning via `spawnTribes`; the human spawns by click, and in
  singleplayer `SpawnExecution` ends the spawn phase on that click). Track the
  human `clientID`; resolve `myPlayer = game.playerByClientID(clientID)`.
- **Gesture → intent bridge.** A turn-queue channel: each frame the shell
  drains queued human intents into `gr.addTurn({turnNumber, intents})` (stamped
  with `clientID`) before `executeNextTick`.
- **Spawn by click.** During the spawn phase, click land → `spawn` intent;
  camera goes to the spawn; a "click land to spawn" prompt shows until placed.
- **Attack / expand by click.** Left-click a tile → if `myPlayer.canAttack(tile)`
  an `attack` intent (`troops = myPlayer.troops()·attackRatio`, `targetID` = the
  clicked tile's owner or null for TerraNullius); if the target needs water,
  `myPlayer.bestTransportShipSpawn(tile)` → a `boat` intent instead.
- **Build.** A build panel of the age's buildables (`myPlayer.buildableUnits` —
  Settlement / Farmland / Barn) with live food cost; select → click a valid tile
  (`canBuild`) → `build_unit` intent.
- **Food allocation.** A slider issuing the `food_allocation` intent
  (populationShare 0..1).
- **Stats HUD.** Live troops / gold / population / tiles-owned read from
  `myPlayer`, plus the attack-ratio slider (client-side multiplier).
- **Names & labels (DOM overlay).** Project each player's `placeName` anchor to
  screen via the shell camera and render `<div>` labels (nation/player name +
  troop count). The human's own territory is highlighted; hovering a tile shows
  its owner (player-info readout).

## Capabilities

### New Capabilities

- `shell-human-player`: a human can spawn, expand by attack/boat, build the age's
  structures, and tune food allocation in the `#shell` OpenFront-live mode, with
  a live stats HUD and on-map name/troop labels — driving the in-process sim by
  stamped intents and reading its live state directly.

## Impact

- `src/client/GameShellPage.ts` — OpenFront-live gains a human: `randomSpawn:false`,
  track `myClientID`, a queued-intent channel drained into each turn, click →
  spawn/attack/boat, a build panel + food slider, a stats HUD, and a DOM label
  overlay. Reuses the existing FieldViewerBase camera/hover.
- New small helper module(s) under `src/client/shell/` for intent construction
  and label projection (kept out of the LitElement for testability).
- Imports the intent shapes from `src/core/Schemas` and reads `Player`/`Game`
  directly. No `src/core` changes.
- Out of scope (later changes): leaderboard, events log, attacks strip, win/lose
  modal, alliances/donate/embargo/emoji, radial menu.
