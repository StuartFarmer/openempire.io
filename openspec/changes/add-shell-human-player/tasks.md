# Tasks — Human player in the #shell OpenFront-live mode

## 1. Identity, spawn, expand, stats

- [x] 1.1 OpenFront-live starts with `randomSpawn:false` and tracks the human
      `clientID`; resolve `myPlayer()` via `game.playerByClientID(clientID)` (may be
      null until spawned). Keep an optional spectate path (`randomSpawn:true`).
- [x] 1.2 Intent queue: `pendingIntents: Intent[]` on the shell; `stepSim(ticks)`
      drains it into the first `addTurn` of the batch, stamped with `clientID`, then
      empty turns for the rest. Empty queue still advances.
- [x] 1.3 Spawn by click: while `inSpawnPhase()`, a tile gesture on spawnable
      land queues a `spawn` intent; on placement, camera goes to the spawn; show a
      "click land to spawn" prompt until placed.
- [x] 1.4 Expand by click: outside spawn, if `myPlayer.canAttack(tile)` queue an
      `attack` (`troops = round(troops()·ratio)`, `targetID` = owner id or null);
      else if `bestTransportShipSpawn(tile)` is valid queue a `boat`; else no-op.
- [x] 1.5 Stats HUD: live troops / gold / population / tiles-owned from
      `myPlayer` + an attack-ratio slider (0..1). Dead state when `!isAlive()`.
- [x] 1.6 Verify (headless): spawn by click ends the spawn phase; clicking a
      neighbor expands the human's territory (owned-tile count rises); stats track;
      no page errors.

## 2. Names & labels (DOM overlay)

- [x] 2.1 Capture `playerNameViewData` from the `createGameRunner` callback
      (instead of discarding it) into a per-player anchor map.
- [x] 2.2 Project each living player's anchor tile → framebuffer → CSS px via the
      shell camera; render absolutely-positioned `<div>` labels (name + troops) that
      track pan/zoom; cull off-screen; accent the human's label.
- [x] 2.3 Hover readout names the tile's owner (via `ownerID`/`playerBySmallID`).
- [x] 2.4 Verify (headless): labels appear over territories, track pan/zoom, and
      the human's is accented; hover reports owner.

## 3. Build & food allocation

- [x] 3.1 Build panel: list `myPlayer.buildableUnits(tile)` for the age's types
      (Settlement/Farmland/Barn) with live cost + buildability; selecting one enters
      a placement mode.
- [x] 3.2 Placement: clicking a tile where `canBuild(type, tile)` is valid queues
      a `build_unit` intent; reject unaffordable/invalid before issuing.
- [x] 3.3 Food allocation slider issues `food_allocation` (populationShare 0..1),
      reflecting current allocation.
- [x] 3.4 Verify (headless): building a Settlement on a valid tile creates the
      structure; the food slider changes allocation; no errors.

## 4. Wrap-up

- [x] 4.1 tsc + lint clean; add a focused test where practical (intent
      construction / label projection as pure helpers).
- [x] 4.2 Full headless playthrough: spawn → expand a few tiles → build a
      settlement → survive several hundred ticks; screenshot shows the human's
      labeled, accented territory over the terrain with the stats HUD populated.
